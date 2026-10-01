const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { createAuditHistoryRepository } = require('../src/repositories/auditHistoryRepository');
const { createAuditHistoryService } = require('../src/services/auditHistoryService');

// No acepta DATABASE_URL: siempre crea su propio cluster local desechable.
test('Historial en PostgreSQL temporal: migracion, filtros, cursor y presentacion segura', {
  skip: process.env.RUN_AUDITORIA_TEMP_POSTGRES !== '1', timeout: 60000,
}, async (t) => {
  const bin = process.env.AUDITORIA_POSTGRES_BIN;
  assert.ok(bin, 'Falta AUDITORIA_POSTGRES_BIN');
  const executable = (name) => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-auditoria-test-'));
  const data = path.join(root, 'data');
  const port = 55483;
  // En Windows postgres hereda handles de pg_ctl; pipes mantienen spawnSync abierto.
  const run = (name, args) => execFileSync(executable(name), args, { stdio: 'ignore', timeout: 30000 });
  run('initdb', ['-D', data, '-U', 'audit_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  let started = false;
  let client;
  try {
    started = true;
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    client = new Client({ host: '127.0.0.1', port, user: 'audit_test', database: 'postgres' });
    await client.connect();
    t.diagnostic(`PostgreSQL ${(await client.query('SHOW server_version')).rows[0].server_version}`);
    await client.query(`CREATE TABLE roles (id integer PRIMARY KEY, nombre text);
      CREATE TABLE usuarios (id integer PRIMARY KEY, rol_id integer, username text, nombre_completo text);
      CREATE TABLE permisos (id serial PRIMARY KEY, codigo text UNIQUE, descripcion text, categoria text);
      CREATE TABLE usuario_permisos (usuario_id integer, permiso_id integer, otorgado_por integer, UNIQUE(usuario_id, permiso_id));
      CREATE TABLE auth_sessions (usuario_id integer, revoked_at timestamptz, revoked_reason text, updated_at timestamptz);
      CREATE TABLE auditoria_eventos (id bigint PRIMARY KEY, accion text, modulo text,
        entidad_afectada text, usuario_id integer, fecha_hora timestamptz, created_at timestamptz,
        descripcion text, tabla text, id_entidad text, registro_id text, datos_nuevos jsonb);
      INSERT INTO roles VALUES (1, 'director'), (2, 'admin'), (3, 'personal_salud');
      INSERT INTO usuarios VALUES (1,1,'director','Director'), (2,2,'admin','Administrador'), (3,3,'salud','Personal');`);
    const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/018_auditoria_historial.sql'), 'utf8');
    await client.query(migration);
    await client.query(migration);
    const permissions = await client.query('SELECT usuario_id FROM usuario_permisos ORDER BY usuario_id');
    assert.deepEqual(permissions.rows, [{ usuario_id: 1 }]);
    await client.query(`INSERT INTO usuarios VALUES (4,2,'admin_manual','Admin manual');
      INSERT INTO usuario_permisos SELECT u.id, p.id, CASE WHEN u.id = 2 THEN NULL ELSE 1 END
        FROM usuarios u CROSS JOIN permisos p WHERE u.id IN (2,3,4) AND p.codigo = 'auditoria.ver';
      INSERT INTO auth_sessions (usuario_id) SELECT generate_series(1,4);`);
    const policy = fs.readFileSync(path.join(__dirname, '../src/db/migrations/019_auditoria_politica_roles.sql'), 'utf8');
    await client.query(policy);
    await client.query(policy);
    assert.deepEqual((await client.query('SELECT usuario_id FROM usuario_permisos ORDER BY usuario_id')).rows,
      [{ usuario_id: 1 }, { usuario_id: 4 }]);
    assert.deepEqual((await client.query('SELECT usuario_id FROM auth_sessions WHERE revoked_at IS NOT NULL ORDER BY usuario_id')).rows,
      [{ usuario_id: 2 }, { usuario_id: 3 }]);
    assert.ok((await client.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_auditoria_cursor'"))
      .rows[0].indexdef.includes('COALESCE(fecha_hora, created_at)'));
    await client.query(`INSERT INTO auditoria_eventos
      (id, accion, modulo, entidad_afectada, usuario_id, fecha_hora, created_at)
      SELECT n, 'crear', 'pacientes', 'paciente', 2,
        CASE WHEN n = 30 THEN NULL ELSE '2026-09-27T06:00:00.123456Z'::timestamptz END,
        '2026-09-27T06:00:00.123456Z'::timestamptz FROM generate_series(1, 30) n;
      INSERT INTO auditoria_eventos
        (id, accion, modulo, entidad_afectada, usuario_id, fecha_hora, created_at) VALUES
        (31, 'exportar', 'reportes', 'reporte', 1, '2026-09-27T05:59:59.999999Z', NULL),
        (32, 'crear', 'pacientes', 'paciente', 3, '2026-09-28T06:00:00Z', NULL),
        (33, 'crear', 'pacientes', 'paciente', NULL, NULL, NULL);`);
    const service = createAuditHistoryService({ repository: createAuditHistoryRepository({ db: client }) });
    const filters = { desde: '2026-09-27', hasta: '2026-09-27', tipo: 'crear',
      modulo: 'pacientes', usuario_id: '2', q: 'admin' };
    const first = await service.listar(filters);
    assert.equal(first.items.length, 25);
    assert.equal(first.items[0].id, '30');
    assert.equal(first.items[0].fecha, '2026-09-27T06:00:00.123456Z');
    const second = await service.listar({ ...filters, cursor: first.next_cursor });
    assert.deepEqual(second.items.map((item) => item.id), ['5', '4', '3', '2', '1']);
    assert.equal(second.has_more, false);
    assert.equal(second.next_cursor, null);
    assert.equal((await service.listar({ desde: '2026-09-26', hasta: '2026-09-26' })).items[0].id, '31');
    assert.equal((await service.listar({ q: '%' })).items.length, 0);
    assert.equal((await service.listar({ q: "' OR TRUE --" })).items.length, 0);
    const all = await service.listar({});
    const tail = await service.listar({ cursor: all.next_cursor });
    assert.equal(tail.items.at(-1).id, '33');
    assert.equal(tail.items.at(-1).fecha, null);
    assert.equal(tail.items.at(-1).usuario, null);
    // También valida el cursor que ya se encuentra en el segmento sin fechas.
    const nullCursor = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(all.next_cursor, 'base64url')), fecha: null, id: '33',
    })).toString('base64url');
    assert.equal((await service.listar({ cursor: nullCursor })).items.length, 0);

    await t.test('SQL y servicio priorizan eventos concretos y rechazan descripciones libres', async () => {
      const access = { categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones', resultado: 'completado' };
      const changes = { categoria: 'Cambios de información', resultado: 'completado' };
      const freeText = 'logout: dato_clinico_prueba 192.0.2.1 {"token":"secreto_prueba"}';
      const cases = [
        { id: 101, accion: 'login', modulo: 'autenticacion', entidad: 'usuario', descripcion: 'login_exitoso',
          evento: 'login_exitoso', presentacion: { ...access, titulo: 'Inició sesión' } },
        { id: 102, accion: 'logout', modulo: 'autenticacion', entidad: 'usuario', descripcion: 'logout',
          evento: 'logout', presentacion: { ...access, titulo: 'Cerró sesión' } },
        { id: 103, accion: 'estado', modulo: 'autenticacion', entidad: 'usuario', descripcion: 'logout',
          evento: 'logout', presentacion: { ...access, titulo: 'Cerró sesión' } },
        { id: 104, accion: 'estado', modulo: 'autenticacion', entidad: 'sesion', descripcion: 'sesion_revocada',
          evento: 'sesion_revocada', presentacion: { ...access, titulo: 'Revocó una sesión' } },
        { id: 105, accion: 'estado', modulo: 'pacientes', entidad: 'embarazo', descripcion: 'cambiar_estado',
          evento: null, presentacion: { ...changes, titulo: 'Cambió el estado de un embarazo',
            modulo: 'Embarazos', resultado: 'registrado' } },
        { id: 106, accion: 'actualizar', modulo: 'usuarios', entidad: 'usuario', descripcion: 'usuario_desactivado',
          evento: 'usuario_desactivado', presentacion: { ...access, titulo: 'Desactivó una cuenta de usuario', modulo: 'Usuarios' } },
        { id: 107, accion: 'actualizar', modulo: 'pacientes', entidad: 'cita_prenatal', descripcion: 'materializar_inasistencia',
          evento: 'materializar_inasistencia', presentacion: { ...changes, titulo: 'Registró una inasistencia', modulo: 'Citas prenatales' } },
        { id: 108, accion: 'estado', modulo: 'general', entidad: 'registro_ajeno', descripcion: freeText,
          evento: null, presentacion: { ...changes, titulo: 'Cambió un estado', modulo: 'General', resultado: 'registrado' } },
        { id: 109, accion: 'estado', modulo: 'autenticacion', entidad: 'usuario', descripcion: freeText,
          evento: null, presentacion: { ...changes, titulo: 'Cambió un estado', modulo: 'Acceso y sesiones', resultado: 'registrado' } },
        { id: 110, accion: 'estado', modulo: 'autenticacion', entidad: 'sesion', descripcion: 'login_exitoso',
          evento: 'login_exitoso', presentacion: { ...access, titulo: 'Inició sesión' } },
      ];
      for (const entry of cases) {
        await client.query(`INSERT INTO auditoria_eventos
          (id, accion, modulo, entidad_afectada, usuario_id, fecha_hora, descripcion)
          VALUES ($1, $2, $3, $4, 4, '2026-09-29T06:00:00Z', $5)`,
        [entry.id, entry.accion, entry.modulo, entry.entidad, entry.descripcion]);
      }
      const repository = createAuditHistoryRepository({ db: client });
      const query = { usuario_id: '4' };
      const rows = await repository.listar(query);
      assert.equal(rows.length, cases.length);
      for (const entry of cases) {
        const row = rows.find(({ id }) => id === String(entry.id));
        assert.equal(row.evento_codigo, entry.evento, `codigo SQL del evento ${entry.id}`);
        assert.equal(Object.hasOwn(row, 'descripcion'), false);
      }
      const response = await service.listar(query);
      assert.equal(response.has_more, false);
      assert.equal(response.items.length, cases.length);
      for (const entry of cases) {
        const item = response.items.find(({ id }) => id === String(entry.id));
        assert.deepEqual(item.presentacion, entry.presentacion, `presentacion del evento ${entry.id}`);
        assert.equal(Object.hasOwn(item, 'evento_codigo'), false);
        assert.equal(Object.hasOwn(item, 'descripcion'), false);
      }
      for (const serialized of [JSON.stringify(rows), JSON.stringify(response)]) {
        assert.doesNotMatch(serialized, /dato_clinico_prueba|192\.0\.2\.1|secreto_prueba/);
      }
    });

    await t.test('objetivo seguro: asignacion/revocacion, inactivo, legacy y IDs ambiguos', async () => {
      await client.query(`ALTER TABLE usuarios ADD COLUMN activo boolean DEFAULT true;
        UPDATE usuarios SET activo = false WHERE id = 4;`);
      const cases = [
        [201, '4', '4', 'permisos_reemplazados', 'usuario_permisos', 4],
        [202, '4', null, 'permisos_reemplazados', 'usuario_permisos', 4],
        [203, null, '4', 'permisos_reemplazados', 'usuario_permisos', 4],
        [204, '2', '2', 'permisos_reemplazados', 'usuario_permisos', 2],
        [205, null, null, 'permisos_reemplazados', 'usuario_permisos', null],
        [206, '9999', '9999', 'permisos_reemplazados', 'usuario_permisos', null],
        [207, '4', '4', 'actualizar', 'usuario_permisos', null],
        [208, '4', '2', 'permisos_reemplazados', 'usuario_permisos', null],
        [209, 'texto-no-identificable', null, 'permisos_reemplazados', 'usuario_permisos', null],
        [210, '9999999999999999999999999999999999', null, 'permisos_reemplazados', 'usuario_permisos', null],
        [211, '4', '4', 'permisos_reemplazados', 'permisos', null],
      ];
      for (const [id, idEntidad, registroId, evento, tabla] of cases) {
        await client.query(`INSERT INTO auditoria_eventos (id, accion, modulo, entidad_afectada,
          usuario_id, fecha_hora, descripcion, tabla, id_entidad, registro_id)
          VALUES ($1, 'actualizar', 'permisos', 'usuario_permisos', 2, NOW(), $2, $3, $4, $5)`,
        [id, evento, tabla, idEntidad, registroId]);
      }
      const service = createAuditHistoryService({ repository: createAuditHistoryRepository({ db: client }) });
      const result = await service.listar({ modulo: 'permisos' });
      assert.equal(result.items.length, cases.length);
      for (const [id, , , , , expectedId] of cases) {
        const item = result.items.find((entry) => entry.id === String(id));
        assert.equal(item.usuario.id, 2);
        assert.deepEqual(item.usuario_objetivo, expectedId == null ? null : {
          id: expectedId, username: expectedId === 4 ? 'admin_manual' : 'admin',
          nombre_completo: expectedId === 4 ? 'Admin manual' : 'Administrador',
        });
      }
      assert.doesNotMatch(JSON.stringify(result), /id_entidad|registro_id|activo|datos_nuevos|datos_anteriores/);
      // Si el destinatario deja de existir, el evento sigue visible con null.
      await client.query('DELETE FROM usuarios WHERE id = 4');
      const deleted = await service.listar({ modulo: 'permisos' });
      assert.equal(deleted.items.length, cases.length);
      assert.equal(deleted.items.find((entry) => entry.id === '201').usuario_objetivo, null);
    });
    await t.test('CPREN-56: SELECT y DTO reales con esquema versionado y deltas sintéticos', async () => {
      await client.query('CREATE SCHEMA cpren56; SET search_path TO cpren56, public');
      await client.query(fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8'));
      await client.query(`INSERT INTO roles (id,nombre) VALUES (101,'director'),(102,'admin');
        INSERT INTO usuarios (id,rol_id,username,nombre_completo,password_hash) VALUES
        (101,101,'actor_sintetico','Director sintético','CANARIO_HASH'),
        (102,102,'target_sintetico','Admin sintético','CANARIO_HASH');
        INSERT INTO permisos (codigo,descripcion,categoria) VALUES
        ('reportes.ver','Sintético','reportes'),('pacientes.editar','Sintético','pacientes')
        ON CONFLICT (codigo) DO NOTHING;`);
      const type = await client.query(`SELECT data_type FROM information_schema.columns
        WHERE table_schema='cpren56' AND table_name='auditoria_eventos' AND column_name='datos_nuevos'`);
      assert.equal(type.rows[0].data_type, 'jsonb');
      const change = (codigo, anterior, nuevo) => ({ codigo, anterior, nuevo });
      const cases = [
        ['grant', { permisos_agregados: ['auditoria.ver'] }, [change('auditoria.ver',false,true)]],
        ['revoke', { permisos_retirados: ['auditoria.ver'] }, [change('auditoria.ver',true,false)]],
        ['multi', { permisos_agregados: ['reportes.ver'], permisos_retirados: ['pacientes.editar'] },
          [change('pacientes.editar',true,false),change('reportes.ver',false,true)]],
        ['legacy NULL', null, []], ['cambios string', 'CANARIO', []],
        ['no-array', { permisos_agregados: 'CANARIO' }, []],
        ['unknown', { permisos_agregados: ['desconocido.ver'] }, []],
        ['duplicate', { permisos_agregados: ['auditoria.ver','auditoria.ver'] }, []],
        ['conflict', { permisos_agregados: ['auditoria.ver'], permisos_retirados: ['auditoria.ver'] }, []],
        ['wrong producer', { permisos_agregados: ['auditoria.ver'] }, [], 'actualizar'],
        ['wrong table', { permisos_agregados: ['auditoria.ver'] }, [], 'permisos_reemplazados', 'permisos'],
        ['wrong version', { permisos_agregados: ['auditoria.ver'] }, [], 'permisos_reemplazados', 'usuario_permisos', 2],
      ];
      const repository = createAuditHistoryRepository({ db: client });
      const realService = createAuditHistoryService({ repository });
      for (let index=0; index<cases.length; index++) {
        const [label, cambios, expected, producer='permisos_reemplazados', table='usuario_permisos', version=1] = cases[index];
        const id = String(1001+index);
        const metadata = cambios === null ? null : { politica_version:version,cambios,
          password_hash:'CANARIO',token:'CANARIO',cookies:'CANARIO',jwt:'CANARIO',csrf:'CANARIO',
          diagnostico:'CANARIO',permisos:['CANARIO'],arbitrario:'CANARIO' };
        await client.query(`INSERT INTO auditoria_eventos
          (id,usuario_id,accion,modulo,entidad_afectada,tabla,id_entidad,registro_id,descripcion,
           datos_anteriores,datos_nuevos,ip,user_agent)
          VALUES ($1,101,'actualizar','permisos','usuario_permisos',$2,'102','102',$3,
            '{"password_hash":"CANARIO"}',$4,'192.0.2.1','CANARIO')`, [id,table,producer,metadata]);
        const rows = await repository.listar({modulo:'permisos'});
        const row = rows.find(entry=>entry.id===id);
        assert.ok(row, label);
        assert.equal(row.usuario_id,101);
        assert.ok(Object.hasOwn(row,'permisos_agregados'));
        assert.ok(Object.hasOwn(row,'permisos_retirados'));
        assert.equal(Object.hasOwn(row,'datos_nuevos'),false);
        const response = await realService.listar({modulo:'permisos'});
        const item = response.items.find(entry=>entry.id===id);
        assert.deepEqual(item.detalle_permisos,expected,label);
        assert.equal(item.usuario.id,101);
        assert.equal(item.usuario_objetivo?.id, ['wrong producer','wrong table'].includes(label) ? undefined : 102);
        assert.doesNotMatch(JSON.stringify(response), /CANARIO|192\.0\.2\.1|datos_nuevos|datos_anteriores|password_hash|token|cookies|jwt|csrf|diagnostico|arbitrario|catalogo_permisos/);
        assert.deepEqual(Object.keys(item).sort(), ['detalle_permisos','entidad','fecha','id','modulo','presentacion','tipo','usuario','usuario_objetivo']);
        t.diagnostic(`${label}: PASS`);
      }
    });
  } finally {
    if (client) await client.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    const resolved = fs.realpathSync(root);
    const temp = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(resolved), temp, 'Cleanup solo del cluster temporal creado');
    assert.ok(path.basename(resolved).startsWith('cap-auditoria-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
