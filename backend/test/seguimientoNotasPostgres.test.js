const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { Pool } = require('pg');
const express = require('express');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const appPool = require('../src/db/pool');
const { migrate, applyMigration } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const { getJwtConfig } = require('../src/config/env');
const { csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const service = require('../src/services/seguimientoNotasService');

test('CPREN-119: seguimiento, controles y notas en PostgreSQL temporal propio', {
  skip: process.env.RUN_SEGUIMIENTO_TEMP_POSTGRES !== '1', timeout: 180000,
}, async t => {
  const bin = process.env.SEGUIMIENTO_POSTGRES_BIN;
  assert.ok(bin, 'Falta SEGUIMIENTO_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-seguimiento-'));
  const dataDir = path.join(root, 'data');
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  const config = { host: '127.0.0.1', port: 55479, user: 'seguimiento_test', password: '',
    database: 'postgres', ssl: false, max: 10, connectionTimeoutMillis: 3000 };
  const envKeys = ['JWT_SECRET', 'NODE_ENV', 'ACCESS_TOKEN_TTL_MINUTES', 'SESSION_IDLE_TIMEOUT_MINUTES',
    'SESSION_WARNING_MINUTES', 'SESSION_ABSOLUTE_HOURS', 'SESSION_ACTIVITY_UPDATE_SECONDS'];
  const previous = { query: appPool.query, connect: appPool.connect, dotenv: dotenv.config,
    env: Object.fromEntries(envKeys.map(key => [key, process.env[key]])) };
  let db, server, started = false;
  try {
    run('initdb', ['-D', dataDir, '-U', 'seguimiento_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55479', '-w', 'start']);
    started = true; db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    appPool.query = db.query.bind(db); appPool.connect = db.connect.bind(db);
    dotenv.config = () => ({ parsed: {} });
    Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      ACCESS_TOKEN_TTL_MINUTES: '10', SESSION_IDLE_TIMEOUT_MINUTES: '15', SESSION_WARNING_MINUTES: '13',
      SESSION_ABSOLUTE_HOURS: '8', SESSION_ACTIVITY_UPDATE_SECONDS: '60' });
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; clúster propio 127.0.0.1:55479; .env deshabilitado`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    const boundary = schema.indexOf('-- CPREN-119:');
    assert.ok(boundary > 0);
    await db.query(schema.slice(0, boundary));
    await db.query(`INSERT INTO roles(id,nombre) VALUES(1,'director'),(2,'admin'),(3,'personal_salud');
      INSERT INTO cargos_personal(id,nombre,clasificacion_profesional) VALUES
      (101,'Médico sintético','medico'),(102,'AE sintética','enfermeria_ae'),(103,'EP sintética','enfermeria_ep'),
      (104,'Cargo histórico sin clasificar','sin_clasificar');
      INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id,cargo_id) VALUES
      (1,'Capturista sintético','seg_cap','synthetic-no-login',3,104),
      (2,'Médico sintético','seg_med','synthetic-no-login',3,101),
      (3,'AE sintética','seg_ae','synthetic-no-login',3,102),
      (4,'EP sintética','seg_ep','synthetic-no-login',3,103),
      (5,'Lectura médica sintética','seg_reader','synthetic-no-login',3,104),
      (6,'Lectura enfermería sintética','seg_nurse','synthetic-no-login',3,104);
      INSERT INTO pacientes(id,no_expediente,nombres,apellidos) VALUES
      (1,'SYN-SEG-1','Paciente sintética','Seguimiento uno'),(2,'SYN-SEG-2','Paciente sintética','Seguimiento dos');
      INSERT INTO embarazos(id,paciente_id,numero_embarazo,estado) VALUES (11,1,1,'activo'),(12,1,2,'cerrado'),(21,2,1,'activo');
      INSERT INTO controles_prenatales(id,paciente_id,embarazo_id,numero_control,fecha,nombre_cargo_atiende)
      VALUES (101,1,11,1,CURRENT_DATE,'Doctor sin identidad confirmada');
      INSERT INTO permisos(codigo,descripcion,categoria) VALUES ('pacientes.ver','Sintético','pacientes'),
      ('controles.crear','Sintético','controles'),('controles.editar','Sintético','controles') ON CONFLICT DO NOTHING;
      INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT u.id,p.id FROM usuarios u CROSS JOIN permisos p
      WHERE p.codigo='pacientes.ver' OR (u.id=1 AND (p.codigo LIKE 'notas_%' OR p.codigo IN ('controles.crear','controles.editar')))
        OR (u.id=5 AND p.codigo='notas_evolucion.ver') OR (u.id=6 AND p.codigo='notas_enfermeria.ver');
      SELECT setval(pg_get_serial_sequence('controles_prenatales','id'),101);`);
    const filename = '027_seguimiento_notas_controles.sql';
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
    const snapshot = async () => (await db.query(`SELECT row_to_json(c) AS data FROM controles_prenatales c ORDER BY id`)).rows;
    await t.test('027 incremental idempotente no activa históricos ni altera controles, roles y permisos', async () => {
      const before = await snapshot();
      const grants = (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows;
      const client = await db.connect();
      try {
        assert.equal(await applyMigration({ db: client, filename, sql }), true);
        assert.equal(await applyMigration({ db: client, filename, sql }), false);
        await client.query(sql);
      } finally { client.release(); }
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual((await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows, grants);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM controles_seguimiento_notas')).rows[0].n, 0);
    });
    for (const filename of fs.readdirSync(path.join(__dirname, '../src/db/migrations')).filter(name => /^(028|029|030)_/.test(name)).sort()) {
      await db.query(fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8'));
    }
    await db.query("UPDATE cargos_personal SET codigo=NULL WHERE codigo IN ('MED','AE','EP'); UPDATE cargos_personal SET codigo=CASE id WHEN 101 THEN 'MED' WHEN 102 THEN 'AE' WHEN 103 THEN 'EP' ELSE codigo END WHERE id IN (101,102,103)");
    const tokens = {}, sessions = {};
    for (let id = 1; id <= 6; id++) {
      const sid = crypto.randomUUID(); sessions[id] = sid;
      await db.query(`INSERT INTO auth_sessions(id,usuario_id,refresh_token_hash,absolute_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')`, [sid, id, crypto.randomBytes(32).toString('hex')]);
      const jwtConfig = getJwtConfig();
      tokens[id] = jwt.sign({ sid }, jwtConfig.secret, { algorithm: jwtConfig.algorithm, issuer: jwtConfig.issuer,
        audience: jwtConfig.audience, subject: String(id), jwtid: crypto.randomUUID(), expiresIn: '5m' });
    }
    const reqFor = id => ({ usuario: { id }, authSession: { id: sessions[id], usuario_id: id } });
    const app = express(); app.use(express.json()); app.use('/api', csrfMiddleware);
    app.use('/api/auth', require('../src/routes/auth'));
    app.use('/api/profesionales', require('../src/routes/profesionales').createProfesionalesRouter());
    app.use('/api/pacientes', require('../src/routes/pacientes')); app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const send = async (url, method = 'GET', body, actor = 1, csrf = true) => {
      const headers = { 'content-type': 'application/json' };
      if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
      if (csrf) { headers.cookie = 'cap_prenatal_csrf=synthetic'; headers['x-csrf-token'] = 'synthetic'; }
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/pacientes/${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const route = id => `1/controles/${id}/seguimiento-notas`;
    const query = (ids, actor = 1, paciente = 1, embarazo = 11) => send(`${paciente}/controles/seguimiento-notas?embarazo_id=${embarazo}&controles_ids=${ids}`, 'GET', undefined, actor);
    const confirmBody = (changes = {}) => ({ embarazo_id: 11, version: 1, tipo: 'nota_evolucion', responsable: { tipo: 'usuario', usuario_id: 2 }, ...changes });
    await t.test('CHECKPOINT-10: directorio HTTP demuestra clasificación, estado, filtros, permisos y privacidad', async () => {
      const directory = async (query = '', actor = 1) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/profesionales${query}`, {
          headers: actor ? { authorization: `Bearer ${tokens[actor]}` } : {},
        });
        return { status: response.status, body: await response.json() };
      };
      for (const [clase, id] of [['MED', 2], ['AE', 3], ['EP', 4]]) {
        const result = await directory(`?cargo_codigo=${clase}`);
        assert.equal(result.status, 200); assert.deepEqual(result.body.data.map(row => row.id), [id]);
        for (const row of result.body.data) for (const field of ['email', 'username', 'password_hash', 'permisos', 'rol']) {
          assert.equal(Object.hasOwn(row, field), false, `Directorio no expone ${field}`);
        }
      }
      const before = (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows;
      try {
        await db.query("UPDATE cargos_personal SET codigo=NULL WHERE id=101");
        const empty = await directory('?cargo_codigo=MED');
        assert.equal(empty.status, 200); assert.deepEqual(empty.body.data, []);
        // El nombre Médico y el rol permanecen idénticos: solo la clasificación explícita cambia elegibilidad.
        await db.query("UPDATE cargos_personal SET codigo='MED',activo=FALSE WHERE id=101");
        assert.deepEqual((await directory('?cargo_codigo=MED')).body.data, []);
        await db.query('UPDATE cargos_personal SET activo=TRUE WHERE id=101');
        await db.query('UPDATE usuarios SET activo=FALSE WHERE id=2');
        assert.deepEqual((await directory('?cargo_codigo=MED')).body.data, []);
      } finally {
        await db.query("UPDATE cargos_personal SET codigo='MED',activo=TRUE WHERE id=101");
        await db.query('UPDATE usuarios SET activo=TRUE WHERE id=2');
      }
      assert.deepEqual((await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows, before);
      assert.deepEqual((await directory('?buscar=no-existe-sintetico')).body.data, []);
      assert.equal((await directory('?cargo_codigo=invalida')).status, 400);
      assert.equal((await directory('', 5)).status, 403);
      assert.equal((await directory('', null)).status, 401);
      assert.equal((await db.query("SELECT to_regclass('especialidades_personal') AS tabla")).rows[0].tabla, null);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='usuarios' AND column_name='especialidad_id'")).rows[0].n, 0);
    });
    let controlId, nursingUnknownSnapshot;
    await t.test('POST control conserva contrato, ID, campo libre, cita siguiente; activa sin crear nota', async () => {
      const result = await send('1/controles?embarazo_id=11', 'POST', { numero_control: 2, fecha: '2026-10-20',
        cita_siguiente: '2026-11-20', nombre_cargo_atiende: 'Enfermera escrito libremente' });
      assert.equal(result.status, 201, JSON.stringify(result.body)); controlId = result.body.id;
      assert.ok(Number.isInteger(controlId));
      assert.equal(result.body.nombre_cargo_atiende, 'Enfermera escrito libremente');
      const stored = (await db.query('SELECT cita_siguiente::text FROM controles_prenatales WHERE id=$1', [controlId])).rows[0];
      assert.equal(stored.cita_siguiente, '2026-11-20');
      const cita = (await db.query('SELECT estado,fecha_programada::text FROM citas_prenatales WHERE control_origen_id=$1', [controlId])).rows[0];
      assert.equal(cita.fecha_programada, '2026-11-20'); assert.equal(cita.estado, 'programada');
      const resultSeg = await query(controlId); assert.equal(resultSeg.status, 200);
      assert.equal(resultSeg.body.data[0].elegible, true); assert.deepEqual(resultSeg.body.data[0].documentos, []);
      nursingUnknownSnapshot = (await query(controlId, 6)).body;
      assert.equal((await db.query('SELECT count(*)::int AS n FROM notas_clinicas')).rows[0].n, 0);
    });
    await t.test('histórico no activa pendientes al consultar, editar o repetir POST; confirmar responde 409', async () => {
      const historical = await query(101); assert.equal(historical.body.data[0].elegible, false);
      assert.equal((await send(route(101), 'POST', confirmBody())).status, 409);
      assert.equal((await send('1/controles/101?embarazo_id=11', 'PUT', { motivo_consulta: 'Consulta sintética' })).status, 200);
      const repeated = await send('1/controles?embarazo_id=11', 'POST', { numero_control: 1, fecha: '2026-10-01' });
      assert.equal(repeated.status, 201, JSON.stringify(repeated.body));
      assert.equal((await query(101)).body.data[0].elegible, false);
    });
    await t.test('clasificación explícita: capturista sin clasificar no equivale a responsable médico', async () => {
      const result = await send(route(controlId), 'POST', confirmBody({ responsable: { tipo: 'autenticado' } }));
      assert.equal(result.status, 403);
      assert.deepEqual((await query(controlId)).body.data[0].documentos, []);
      const wrong = await send(route(controlId), 'POST', confirmBody({ responsable: { tipo: 'usuario', usuario_id: 3 } }));
      assert.equal(wrong.status, 403);
    });
    await t.test('médico confirmado y reintentos concurrentes no duplican ni sobrescriben', async () => {
      const results = await Promise.all([send(route(controlId), 'POST', confirmBody()), send(route(controlId), 'POST', confirmBody())]);
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      assert.equal(results.filter(result => result.body.reutilizada).length, 1);
      const row = (await db.query('SELECT * FROM controles_notas_requeridas WHERE control_prenatal_id=$1', [controlId])).rows[0];
      assert.equal(row.confirmado_por, 1); assert.equal(row.responsable_snapshot.usuario_id, 2);
      assert.equal((await query(controlId)).body.data[0].documentos[0].estado, 'pendiente');
      const changed = await send(route(controlId), 'POST', confirmBody({ responsable: { tipo: 'externo', nombre_completo: 'Otro sintético', cargo_codigo: 'MED' } }));
      assert.equal(changed.status, 409);
    });
    await t.test('enfermería coexiste y versiones no revelan decisiones médicas ocultas', async () => {
      const before = (await query(controlId, 6)).body;
      assert.deepEqual(before, nursingUnknownSnapshot, 'Una confirmación médica no cambia la respuesta autorizada de enfermería');
      assert.deepEqual(before.data[0].documentos, []); assert.equal('version' in before.data[0], false);
      assert.equal((await send(route(controlId), 'POST', confirmBody({ tipo: 'nota_enfermeria', responsable: { tipo: 'usuario', usuario_id: 3 } }))).status, 200);
      assert.equal((await query(controlId)).body.data[0].documentos.length, 2);
      for (const [id, tipo] of [[5, 'nota_evolucion'], [6, 'nota_enfermeria']]) {
        const result = await query(controlId, id);
        assert.deepEqual(result.body.data[0].documentos.map(item => item.tipo), [tipo]);
        assert.equal(JSON.stringify(result.body).includes('contenido'), false);
      }
    });
    await t.test('integridad paciente/embarazo, límite de lote, lectura y CSRF', async () => {
      assert.equal((await query(controlId, 1, 2, 21)).status, 404);
      assert.equal((await query(controlId, 1, 1, 12)).status, 404);
      assert.equal((await query(controlId, 1, 2, 11)).status, 404);
      assert.equal((await query(Array.from({ length: 101 }, (_, index) => index + 1).join(','))).status, 400);
      assert.equal((await send(route(controlId), 'POST', confirmBody(), 5)).status, 403);
      assert.equal((await send(route(controlId), 'POST', confirmBody(), 1, false)).status, 403);
      assert.equal((await query(controlId, null)).status, 401);
      assert.equal((await send(route(controlId), 'POST', { ...confirmBody(), confirmado_por: 2 })).status, 400);
    });
    let rollbackControl;
    await t.test('EP, externo y conflicto de versión', async () => {
      const created = await db.query(`INSERT INTO controles_prenatales(paciente_id,embarazo_id,numero_control,fecha)
        VALUES(1,11,3,CURRENT_DATE) RETURNING id`); rollbackControl = created.rows[0].id;
      assert.equal((await send(route(rollbackControl), 'POST', confirmBody({ version: 2 }))).status, 409);
      assert.equal((await send(route(rollbackControl), 'POST', confirmBody({ tipo: 'nota_enfermeria', responsable: { tipo: 'usuario', usuario_id: 4 } }))).status, 200);
      assert.equal((await send(route(rollbackControl), 'POST', confirmBody({ responsable: { tipo: 'externo', nombre_completo: 'Médico externo sintético', cargo_codigo: 'MED' } }))).status, 200);
      const beforeRetry = (await db.query('SELECT * FROM controles_notas_requeridas WHERE control_prenatal_id=$1 ORDER BY tipo', [rollbackControl])).rows;
      const retry = await send(route(rollbackControl), 'POST', confirmBody({ responsable: { tipo: 'externo', nombre_completo: 'Médico externo sintético', cargo_codigo: 'MED' } }));
      assert.equal(retry.status, 200, 'La misma identidad externa reutiliza la confirmación');
      assert.equal(retry.body.reutilizada, true);
      assert.deepEqual((await db.query('SELECT * FROM controles_notas_requeridas WHERE control_prenatal_id=$1 ORDER BY tipo', [rollbackControl])).rows, beforeRetry);
    });
    await t.test('auditoría privada sin nombres; fallo revierte decisión y versión, sin tocar control/cita', async () => {
      const created = (await db.query(`INSERT INTO controles_prenatales(paciente_id,embarazo_id,numero_control,fecha)
        VALUES(1,11,4,CURRENT_DATE) RETURNING id`)).rows[0].id;
      const before = await snapshot();
      await assert.rejects(service.confirmar({ pacienteId: 1, controlId: created, body: confirmBody(), req: reqFor(1),
        dependencies: { audit: async () => { throw new Error('synthetic audit failure'); } } }), /synthetic audit failure/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM controles_notas_requeridas WHERE control_prenatal_id=$1', [created])).rows[0].n, 0);
      assert.equal((await db.query('SELECT version FROM controles_seguimiento_notas WHERE control_prenatal_id=$1', [created])).rows[0].version, 1);
      assert.deepEqual(await snapshot(), before);
      const audits = (await db.query("SELECT datos_nuevos FROM auditoria_eventos WHERE descripcion='seguimiento_nota_confirmado'")).rows;
      assert.ok(audits.length > 0); const text = JSON.stringify(audits);
      assert.equal(text.includes('sintético'), false); assert.equal(text.includes('nota_evolucion'), true);
    });
    await t.test('desactivación profesional conserva decisión histórica e idempotencia', async () => {
      await db.query("UPDATE usuarios SET activo=false,nombre_completo='Nombre cambiado sintético' WHERE id=2");
      assert.equal((await send(route(controlId), 'POST', confirmBody())).status, 200);
      const doc = (await query(controlId)).body.data[0].documentos.find(item => item.tipo === 'nota_evolucion');
      assert.equal(doc.responsable_previsto.nombre_completo, 'Médico sintético');
      await db.query('UPDATE usuarios SET activo=true WHERE id=2');
    });
    await t.test('borrador/finalización derivan de notas reales; cita y control permanecen intactos', async () => {
      const before = await snapshot();
      const created = await send('1/notas-clinicas', 'POST', { tipo: 'nota_evolucion', control_prenatal_id: controlId,
        embarazo_id: 11, contenido: 'Narrativa sintética reservada', fecha_atencion: '2026-10-20', hora_atencion: '10:00',
        responsable: { tipo: 'usuario', usuario_id: 2 }, clave_idempotencia: crypto.randomUUID() });
      assert.equal(created.status, 201, JSON.stringify(created.body)); const id = created.body.id;
      assert.equal((await query(controlId)).body.data[0].documentos.find(item => item.tipo === 'nota_evolucion').estado, 'borrador');
      assert.equal((await send(`1/notas-clinicas/${id}/finalizar`, 'POST', { version: 1 })).status, 200);
      const result = await query(controlId);
      assert.equal(result.body.data[0].documentos.find(item => item.tipo === 'nota_evolucion').estado, 'captura_finalizada');
      assert.equal(JSON.stringify(result.body).includes('Narrativa'), false);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query('SELECT estado FROM citas_prenatales WHERE control_origen_id=$1', [controlId])).rows[0].estado, 'programada');
    });
    await t.test('principal de enfermería coexiste con médica y adicionales no alteran seguimiento', async () => {
      const created = await send('1/notas-clinicas', 'POST', { tipo: 'nota_enfermeria', control_prenatal_id: controlId,
        embarazo_id: 11, responsable: { tipo: 'usuario', usuario_id: 3 }, clave_idempotencia: crypto.randomUUID() });
      assert.equal(created.status, 201);
      const before = (await query(controlId)).body;
      assert.deepEqual(before.data[0].documentos.map(item => item.estado).sort(), ['borrador', 'captura_finalizada']);
      const extra = await send('1/notas-clinicas', 'POST', { tipo: 'nota_evolucion', control_prenatal_id: controlId,
        embarazo_id: 11, es_principal: false, responsable: { tipo: 'usuario', usuario_id: 2 }, clave_idempotencia: crypto.randomUUID() });
      assert.equal(extra.status, 201); assert.deepEqual((await query(controlId)).body, before);
    });
    await t.test('dos sesiones con decisiones distintas: un éxito y un 409 sin sobrescritura', async () => {
      await db.query(`INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT 2,id FROM permisos
        WHERE codigo IN ('notas_evolucion.ver','notas_evolucion.registrar') ON CONFLICT DO NOTHING`);
      const id = (await db.query(`INSERT INTO controles_prenatales(paciente_id,embarazo_id,numero_control,fecha)
        VALUES(1,11,5,CURRENT_DATE) RETURNING id`)).rows[0].id;
      const payload = name => confirmBody({ responsable: { tipo: 'externo', nombre_completo: name, cargo_codigo: 'MED' } });
      const results = await Promise.all([send(route(id), 'POST', payload('Uno sintético'), 1), send(route(id), 'POST', payload('Dos sintético'), 2)]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM controles_notas_requeridas WHERE control_prenatal_id=$1', [id])).rows[0].n, 1);
    });
    await t.test('revocación e inactividad se comprueban de nuevo en servicio con sesión anterior', async () => {
      await db.query(`DELETE FROM usuario_permisos WHERE usuario_id=5 AND permiso_id=(SELECT id FROM permisos WHERE codigo='notas_evolucion.ver')`);
      await assert.rejects(service.listar({ pacienteId: 1, query: { embarazo_id: 11, controles_ids: String(controlId) }, req: reqFor(5) }), { code: 'PERMISO_REQUERIDO' });
      await db.query('UPDATE usuarios SET activo=false WHERE id=6');
      await assert.rejects(service.listar({ pacienteId: 1, query: { embarazo_id: 11, controles_ids: String(controlId) }, req: reqFor(6) }), { code: 'AUTHENTICATION_REQUIRED' });
    });
    await t.test('embarazo cerrado consulta seguimiento, no permite nuevas confirmaciones', async () => {
      await db.query("UPDATE embarazos SET estado='cerrado' WHERE id=11");
      assert.equal((await query(controlId)).status, 200);
      assert.equal((await send(route(rollbackControl), 'POST', confirmBody())).status, 409);
      await db.query("UPDATE embarazos SET estado='activo' WHERE id=11");
    });
    await t.test('Chrome real: control/seguimiento y editor CPREN-120 médico, AE y EP', {
      skip: process.env.RUN_SEGUIMIENTO_BROWSER !== '1',
    }, async () => {
      const count = (await db.query('SELECT count(*)::int AS n FROM notas_clinicas')).rows[0].n;
      await require('./helpers/seguimientoNotasBrowser').verificarSeguimientoBrowser({ apiPort: server.address().port, token: tokens[1], t });
      assert.equal((await db.query('SELECT count(*)::int AS n FROM notas_clinicas')).rows[0].n, count + 3,
        'Solo tres notas creadas explícitamente; navegar y recuperar principal no duplican');
    });
    await t.test('CHECKPOINT-09/10: rediseño, borrador real recargado, autoría y errores desde expediente', {
      skip: process.env.RUN_NOTAS_09_BROWSER !== '1' && process.env.RUN_NOTAS_10_BROWSER !== '1' && process.env.RUN_NOTAS_11_BROWSER !== '1', timeout: 180000,
    }, async () => {
      await db.query("INSERT INTO pacientes(id,no_expediente,nombres,apellidos) VALUES(3,'SYN-09-SIN-EMB','Paciente sintética','Sin embarazo')");
      await db.query(`INSERT INTO usuario_permisos(usuario_id,permiso_id)
        SELECT u.id,p.id FROM usuarios u CROSS JOIN permisos p WHERE
        (u.id=2 AND p.codigo LIKE 'notas_evolucion.%') OR (u.id IN (3,4) AND p.codigo LIKE 'notas_enfermeria.%') ON CONFLICT DO NOTHING`);
      const jwtConfig = getJwtConfig();
      tokens.expired = jwt.sign({ sid: sessions[1] }, jwtConfig.secret, { algorithm: jwtConfig.algorithm, issuer: jwtConfig.issuer,
        audience: jwtConfig.audience, subject: '1', jwtid: crypto.randomUUID(), expiresIn: -60 });
      const setMedicalRegistration = async enabled => enabled
        ? db.query("INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT 1,id FROM permisos WHERE codigo='notas_evolucion.registrar' ON CONFLICT DO NOTHING")
        : db.query("DELETE FROM usuario_permisos WHERE usuario_id=1 AND permiso_id=(SELECT id FROM permisos WHERE codigo='notas_evolucion.registrar')");
      const setPregnancyState = estado => db.query('UPDATE embarazos SET estado=$1 WHERE id=11', [estado]);
      const count = (await db.query('SELECT count(*)::int AS n FROM notas_clinicas')).rows[0].n;
      const ids = await require('./helpers/notasCheckpoint09Browser').verificarNotas09({ apiPort: server.address().port, tokens, setMedicalRegistration, setPregnancyState, t,
        outputDirectory: process.env.CPREN_CHECKPOINT12 === '1' ? 'checkpoint12' : process.env.RUN_NOTAS_11_BROWSER === '1' ? 'checkpoint11' : process.env.RUN_NOTAS_10_BROWSER === '1' ? 'checkpoint10' : 'checkpoint09' });
      assert.equal(ids.length, 7); assert.equal((await db.query('SELECT count(*)::int AS n FROM notas_clinicas')).rows[0].n, count + 7);
    });
    await t.test('instalación nueva y bootstrap oficial incluyen 027 y checksums', async () => {
      await db.query('CREATE DATABASE seguimiento_bootstrap');
      for (let index = 0; index < 2; index++) {
        const result = await migrate({ db: new Pool({ ...config, database: 'seguimiento_bootstrap' }),
          logger: { log() {}, error() {} }, setExitCode() {} });
        assert.equal(result.ok, true, result.error?.message);
      }
      const fresh = new Pool({ ...config, database: 'seguimiento_bootstrap' });
      try { await assertSchemaCompatible(fresh); } finally { await fresh.end(); }
      await db.query('CREATE DATABASE seguimiento_schema');
      const empty = new Pool({ ...config, database: 'seguimiento_schema' });
      try {
        await empty.query(schema);
        assert.equal((await empty.query("SELECT to_regclass('controles_seguimiento_notas') AS relation")).rows[0].relation, 'controles_seguimiento_notas');
      } finally { await empty.end(); }
    });
  } finally {
    await require('../src/services/puppeteerBrowserManager').puppeteerBrowserManager.close();
    if (server) await new Promise(resolve => server.close(resolve));
    appPool.query = previous.query; appPool.connect = previous.connect; dotenv.config = previous.dotenv;
    for (const key of envKeys) { if (previous.env[key] === undefined) delete process.env[key]; else process.env[key] = previous.env[key]; }
    if (db) await db.end();
    if (started || fs.existsSync(path.join(dataDir, 'postmaster.pid'))) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('cap-seguimiento-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
