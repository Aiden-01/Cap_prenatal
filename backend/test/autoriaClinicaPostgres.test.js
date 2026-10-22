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
const { applyMigration, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const { getJwtConfig } = require('../src/config/env');
const { csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const CLINICAL_CODES = [
  'notas_evolucion.ver', 'notas_evolucion.registrar', 'notas_evolucion.finalizar_captura',
  'notas_enfermeria.ver', 'notas_enfermeria.registrar', 'notas_enfermeria.finalizar_captura',
  'ordenes_medicas.ver', 'ordenes_medicas.transcribir', 'ordenes_medicas.finalizar_captura',
  'ordenes_medicas.emitir',
];

test('CPREN-117: permisos, autoría y directorio en PostgreSQL temporal propio', {
  skip: process.env.RUN_AUTORIA_TEMP_POSTGRES !== '1', timeout: 120000,
}, async t => {
  // El único destino es este initdb; no acepta DATABASE_URL, PGHOST ni .env.
  const bin = process.env.AUTORIA_POSTGRES_BIN;
  assert.ok(bin, 'Falta AUTORIA_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-autoria-'));
  const dataDir = path.join(root, 'data');
  const port = 55477;
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { stdio: 'ignore', windowsHide: true, timeout: 30000 });
  const config = { host: '127.0.0.1', port, user: 'autoria_test', password: '', ssl: false,
    database: 'postgres', max: 8, connectionTimeoutMillis: 3000 };
  const envKeys = ['JWT_SECRET', 'NODE_ENV', 'ACCESS_TOKEN_TTL_MINUTES', 'SESSION_IDLE_TIMEOUT_MINUTES',
    'SESSION_WARNING_MINUTES', 'SESSION_ABSOLUTE_HOURS', 'SESSION_ACTIVITY_UPDATE_SECONDS'];
  const previous = { query: appPool.query, connect: appPool.connect, dotenv: dotenv.config,
    env: Object.fromEntries(envKeys.map(key => [key, process.env[key]])) };
  let db, server, started = false;
  try {
    run('initdb', ['-D', dataDir, '-U', 'autoria_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    appPool.query = db.query.bind(db); appPool.connect = db.connect.bind(db);
    // Los getters de autenticación conservan su validación y reciben solamente configuración sintética.
    dotenv.config = () => ({ parsed: {} });
    Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'synthetic-autoria-test-only-secret-2026-117',
      ACCESS_TOKEN_TTL_MINUTES: '10', SESSION_IDLE_TIMEOUT_MINUTES: '15', SESSION_WARNING_MINUTES: '13',
      SESSION_ABSOLUTE_HOURS: '8', SESSION_ACTIVITY_UPDATE_SECONDS: '60' });
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; clúster propio 127.0.0.1:${port}; .env deshabilitado`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    const boundary = schema.indexOf('-- CPREN-117:');
    assert.ok(boundary > 0, 'schema.sql debe conservar el límite aditivo CPREN-117');
    await db.query(schema.slice(0, boundary));
    await db.query(`INSERT INTO roles(id,nombre) VALUES (1,'director'),(2,'admin'),(3,'personal_salud');
      INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id) VALUES
      (1,'Director sintético','director_autoria','synthetic-no-login',1),
      (2,'Admin sintético','admin_autoria','synthetic-no-login',2),
      (3,'Digitador sintético','digitador_autoria','synthetic-no-login',3);
      INSERT INTO permisos(codigo,descripcion,categoria) VALUES
      ('pacientes.ver','Sintético','pacientes'),('controles.ver_vih','Sintético','controles');
      INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT 1,id FROM permisos;
      INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT 3,id FROM permisos WHERE codigo='pacientes.ver'`);
    await t.test('025 aditiva, idempotente y sin modificar usuarios, roles ni concesiones existentes', async () => {
      const snapshot = async () => ({
        usuarios: (await db.query('SELECT * FROM usuarios ORDER BY id')).rows,
        roles: (await db.query('SELECT * FROM roles ORDER BY id')).rows,
        permisos: (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows,
      });
      const before = await snapshot();
      const filename = fs.readdirSync(path.join(__dirname, '../src/db/migrations')).find(name => name.startsWith('025_'));
      assert.ok(filename, 'Existe migración incremental 025');
      const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
      const client = await db.connect();
      try {
        assert.equal(await applyMigration({ db: client, filename, sql }), true);
        assert.equal(await applyMigration({ db: client, filename, sql }), false);
        await client.query(sql); // La repetición del SQL tampoco duplica permisos.
      } finally { client.release(); }
      const after = await snapshot();
      assert.deepEqual(after.usuarios, before.usuarios);
      assert.deepEqual(after.roles, before.roles);
      assert.deepEqual(after.permisos.filter(row => before.permisos.some(old => old.id === row.id)), before.permisos);
      const added = (await db.query(`SELECT up.usuario_id,p.codigo FROM usuario_permisos up JOIN permisos p ON p.id=up.permiso_id
        WHERE up.id<>ALL($1::integer[]) ORDER BY up.usuario_id`, [before.permisos.map(row => row.id)])).rows;
      assert.deepEqual(added, [{ usuario_id: 1, codigo: 'catalogos_profesionales.gestionar' },
        { usuario_id: 2, codigo: 'catalogos_profesionales.gestionar' }]);
      const catalogo = (await db.query('SELECT codigo FROM permisos')).rows.map(row => row.codigo);
      for (const code of [...CLINICAL_CODES, 'catalogos_profesionales.gestionar']) assert.ok(catalogo.includes(code), code);
      assert.equal(new Set(catalogo).size, catalogo.length);
      assert.ok((await db.query('SELECT clasificacion_profesional FROM cargos_personal')).rows
        .every(row => row.clasificacion_profesional === 'sin_clasificar'));
      await assert.rejects(db.query("UPDATE cargos_personal SET clasificacion_profesional='medico_inventado' WHERE id=(SELECT min(id) FROM cargos_personal)"), { code: '23514' });
    });

    const cargos = {};
    for (const [key, nombre, clasificacion] of [
      ['medico', 'Atención médica sintética', 'medico'], ['ae', 'AE sintético', 'enfermeria_ae'],
      ['ep', 'EP sintético', 'enfermeria_ep'], ['captura', 'Captura sintética', 'no_clinico'],
    ]) {
      cargos[key] = (await db.query(`INSERT INTO cargos_personal(nombre,clasificacion_profesional)
        VALUES($1,$2) RETURNING id`, [nombre, clasificacion])).rows[0].id;
    }
    const especialidad = (await db.query("INSERT INTO especialidades_personal(nombre) VALUES('Especialidad sintética') RETURNING id")).rows[0].id;
    await db.query('UPDATE usuarios SET cargo_id=$1 WHERE id IN (1,2,3)', [cargos.captura]);
    for (const [id, nombre, rolId, cargo, activo = true] of [
      [4, 'Médico sintético A', 3, cargos.medico], [5, 'AE sintética', 3, cargos.ae],
      [6, 'EP sintética', 3, cargos.ep], [7, 'Médico inactivo', 3, cargos.medico, false],
      [8, 'Director médico reservado', 1, cargos.medico], [9, 'Cambio rol sintético', 3, cargos.captura],
      [10, 'Médico sesión revocada', 3, cargos.medico], [11, 'Médico sintético B', 3, cargos.medico],
    ]) {
      await db.query(`INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id,cargo_id,especialidad_id,activo)
        VALUES($1,$2,$3,'synthetic-no-login',$4,$5,$6,$7)`,
      [id, nombre, `autoria_fixture_${id}`, rolId, cargo, especialidad, activo]);
    }
    await db.query("SELECT setval(pg_get_serial_sequence('usuarios','id'), (SELECT max(id) FROM usuarios))");
    const permisosRepo = require('../src/repositories/permisosRepository');
    const grant = async (id, codes) => db.query(`INSERT INTO usuario_permisos(usuario_id,permiso_id,otorgado_por)
      SELECT $1,id,1 FROM permisos WHERE codigo=ANY($2::text[]) ON CONFLICT DO NOTHING`, [id, codes]);
    const codigos = id => permisosRepo.listarCodigosPorUsuario(id);
    const tokens = {}, sessions = {};
    const jwtConfig = getJwtConfig();
    const login = async id => {
      const sid = crypto.randomUUID();
      await db.query(`INSERT INTO auth_sessions(id,usuario_id,refresh_token_hash,absolute_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')`, [sid, id, crypto.randomBytes(32).toString('hex')]);
      sessions[id] = sid;
      tokens[id] = jwt.sign({ sid }, jwtConfig.secret, { algorithm: jwtConfig.algorithm,
        issuer: jwtConfig.issuer, audience: jwtConfig.audience, subject: String(id), jwtid: crypto.randomUUID(), expiresIn: '5m' });
    };
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await login(id);
    const reqFor = async id => ({
      usuario: (await db.query(`SELECT u.id,u.nombre_completo,u.activo,r.nombre AS rol
        FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1`, [id])).rows[0],
      authSession: { id: sessions[id], usuario_id: id },
    });
    const app = express(); app.use(express.json()); app.use('/api', csrfMiddleware);
    app.use('/api/usuarios', require('../src/routes/usuarios'));
    app.use('/api/profesionales', require('../src/routes/profesionales').createProfesionalesRouter());
    app.use('/api/catalogos', require('../src/routes/catalogos').createCatalogosRouter());
    app.use(errorHandler); server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const send = (url, method = 'GET', body, actor = 1, csrf = true) => {
      const headers = { 'content-type': 'application/json' };
      if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
      if (csrf) { headers.cookie = 'cap_prenatal_csrf=test'; headers['x-csrf-token'] = 'test'; }
      return fetch(`http://127.0.0.1:${server.address().port}/api/${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    const { prepararAutoriaClinica } = require('../src/services/autoriaClinicaService');

    await t.test('altas de director y personal no reciben permisos clínicos; preservar administración de catálogos', async () => {
      for (const [username, rol] of [['alta_director_sintetica', 'director'], ['alta_personal_sintetica', 'personal_salud']]) {
        const response = await send('usuarios', 'POST', { nombre_completo: 'Alta sintética', username,
          password: 'synthetic-test-only-password', rol, cargo_id: cargos.captura });
        assert.equal(response.status, 201);
        const row = await response.json();
        const granted = await codigos(row.id);
        assert.equal(granted.some(code => CLINICAL_CODES.includes(code)), false);
        if (rol === 'director') assert.ok(granted.includes('catalogos_profesionales.gestionar'));
      }
    });
    await t.test('clasificación del cargo audita enum anterior/nuevo y revierte si falla auditoría obligatoria', async () => {
      const response = await send('catalogos/cargos', 'POST', { nombre: 'Clasificación privada sintética' });
      assert.equal(response.status, 201);
      const cargo = await response.json();
      assert.equal(cargo.clasificacion_profesional, 'sin_clasificar');
      const changed = await send(`catalogos/cargos/${cargo.id}`, 'PUT', {
        nombre: 'Clasificación privada sintética', clasificacion_profesional: 'medico',
      });
      assert.equal(changed.status, 200);
      assert.equal((await changed.json()).clasificacion_profesional, 'medico');
      const events = (await db.query(`SELECT * FROM auditoria_eventos
        WHERE tabla='cargos_personal' AND registro_id=$1 AND descripcion='actualizar'`, [String(cargo.id)])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].datos_anteriores, null);
      assert.deepEqual(events[0].datos_nuevos.cambios.clasificacion_profesional,
        { anterior: 'sin_clasificar', nuevo: 'medico' });
      assert.equal(JSON.stringify(events).includes('Clasificación privada sintética'), false);
      const { createCatalogosService } = require('../src/services/catalogosService');
      const failing = createCatalogosService('cargos', { audit: async () => { throw new Error('synthetic classification audit unavailable'); } });
      await assert.rejects(failing.actualizar(cargo.id, { nombre: cargo.nombre, codigo: null,
        descripcion: null, clasificacion_profesional: 'enfermeria_ep' }, await reqFor(1)), /synthetic classification audit unavailable/);
      assert.equal((await db.query('SELECT clasificacion_profesional FROM cargos_personal WHERE id=$1', [cargo.id])).rows[0].clasificacion_profesional, 'medico');
    });
    await t.test('directorio exige sesión y permiso funcional, admite búsqueda y limita campos/paginación', async () => {
      assert.equal((await send('profesionales', 'GET', undefined, null)).status, 401);
      assert.equal((await send('profesionales', 'GET', undefined, 3)).status, 403);
      await grant(3, ['ordenes_medicas.ver']);
      assert.equal((await send('profesionales', 'GET', undefined, 3)).status, 403, 'consultar documentos no habilita selección de responsables');
      await grant(3, ['ordenes_medicas.transcribir']);
      const response = await send('profesionales?limite=2&pagina=1', 'GET', undefined, 3);
      assert.equal(response.status, 200);
      const first = await response.json();
      assert.equal(first.data.length, 2); assert.equal(first.limite, 2); assert.equal(first.pagina, 1);
      const second = await (await send('profesionales?limite=2&pagina=2', 'GET', undefined, 3)).json();
      assert.equal(first.total, second.total); assert.ok(first.total >= 5);
      assert.equal(first.data.some(a => second.data.some(b => a.id === b.id)), false);
      const all = await (await send('profesionales?limite=50', 'GET', undefined, 3)).json();
      assert.equal(all.data.some(row => [1, 2, 3, 7, 8].includes(row.id)), false);
      for (const row of all.data) {
        assert.ok(row.nombre_completo); assert.ok(row.cargo_nombre);
        assert.equal(Object.keys(row).some(key => /username|password|hash|sesion|session|permiso|rol|created_by|updated_by/.test(key)), false);
      }
      const text = JSON.stringify(all);
      for (const forbidden of ['synthetic-no-login', 'autoria_fixture_', 'refresh_token', 'Director médico reservado']) assert.equal(text.includes(forbidden), false);
      const byName = await (await send('profesionales?buscar=M%C3%A9dico%20sint%C3%A9tico', 'GET', undefined, 3)).json();
      assert.deepEqual(byName.data.map(row => row.id).sort((a, b) => a - b), [4, 11]);
      const bySpecialty = await (await send('profesionales?buscar=Especialidad', 'GET', undefined, 3)).json();
      assert.ok(bySpecialty.total >= 5);
      const nurses = await (await send('profesionales?clasificacion_profesional=enfermeria_ae', 'GET', undefined, 3)).json();
      assert.deepEqual(nurses.data.map(row => row.id), [5]);
      assert.equal((await send('profesionales?limite=1000', 'GET', undefined, 3)).status, 400);
      await grant(2, ['notas_evolucion.registrar']);
      const adminRows = await (await send('profesionales', 'GET', undefined, 2)).json();
      assert.equal(adminRows.data.some(row => row.id === 8), false);
      await grant(1, ['notas_evolucion.registrar']);
      const directorRows = await (await send('profesionales', 'GET', undefined, 1)).json();
      assert.equal(directorRows.data.some(row => row.id === 8), true);
    });
    await t.test('transcribir separa responsable y capturista; no hereda permiso del médico seleccionado', async () => {
      await grant(4, ['ordenes_medicas.emitir']);
      const before = await codigos(3);
      const result = await prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'orden_medica',
        accion: 'transcribir', responsable: { tipo: 'usuario', usuario_id: 4 } });
      assert.equal(result.responsable.usuario_id, 4); assert.equal(result.capturista_usuario_id, 3);
      assert.equal(result.responsable.clasificacion_profesional, 'medico');
      assert.equal(result.firma, 'manuscrita'); assert.equal(result.validacion_clinica, false);
      assert.equal(Object.hasOwn(result, 'emisor_usuario_id'), false);
      assert.equal(Object.hasOwn(result, 'finalizador_usuario_id'), false);
      assert.deepEqual(await codigos(3), before);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'usuario', usuario_id: 4 } }), error => error.statusCode === 403);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'orden_medica',
        accion: 'transcribir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 403 || error.statusCode === 400);
    });
    await t.test('responsable externo conserva instantánea sin cuenta ni atribución de emisión', async () => {
      const external = { tipo: 'externo', nombre_completo: 'Profesional externo sintético', cargo: 'Médico externo sintético',
        especialidad: 'Formación declarada', clasificacion_profesional: 'medico' };
      const count = (await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n;
      const result = await prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'orden_medica', accion: 'transcribir', responsable: external });
      assert.equal(result.responsable.tipo, 'externo'); assert.equal(result.responsable.usuario_id, null);
      assert.equal(result.responsable.nombre_completo, external.nombre_completo);
      assert.equal(result.responsable.especialidad_nombre, external.especialidad);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n, count);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(4), tipoDocumento: 'orden_medica', accion: 'emitir', responsable: external }), error => error.statusCode === 403);
    });
    await t.test('médico emite solo con permiso propio y responsable propio; AE/EP/administración no lo suplantan', async () => {
      const result = await prepararAutoriaClinica({ req: await reqFor(4), tipoDocumento: 'orden_medica', accion: 'emitir', responsable: { tipo: 'autenticado' } });
      assert.equal(result.responsable.usuario_id, 4); assert.equal(result.emisor_usuario_id, 4);
      assert.equal(Object.hasOwn(result, 'capturista_usuario_id'), false);
      for (const id of [1, 2, 3, 5, 6]) {
        await grant(id, ['ordenes_medicas.emitir']);
        await assert.rejects(prepararAutoriaClinica({ req: await reqFor(id), tipoDocumento: 'orden_medica',
          accion: 'emitir', responsable: { tipo: 'usuario', usuario_id: 4 } }), error => error.statusCode === 403);
        await assert.rejects(prepararAutoriaClinica({ req: await reqFor(id), tipoDocumento: 'orden_medica',
          accion: 'emitir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 403 || error.statusCode === 400);
      }
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(4), tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'usuario', usuario_id: 11 } }), error => error.statusCode === 403);
    });
    await t.test('notas comprueban clasificación estable y rechazan identidad/autoría enviada libremente', async () => {
      await grant(3, ['notas_enfermeria.registrar', 'notas_evolucion.registrar']);
      for (const id of [5, 6]) {
        const result = await prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'nota_enfermeria',
          accion: 'registrar', responsable: { tipo: 'usuario', usuario_id: id } });
        assert.equal(result.responsable.usuario_id, id); assert.equal(result.capturista_usuario_id, 3);
        await assert.rejects(prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'nota_evolucion',
          accion: 'registrar', responsable: { tipo: 'usuario', usuario_id: id } }), error => error.statusCode === 403 || error.statusCode === 400);
      }
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'nota_enfermeria',
        accion: 'registrar', responsable: { tipo: 'usuario', usuario_id: 4 } }), error => error.statusCode === 403 || error.statusCode === 400);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(3), tipoDocumento: 'nota_evolucion',
        accion: 'registrar', responsable: { tipo: 'usuario', usuario_id: 4, capturista_usuario_id: 4 } }));
      const forged = await reqFor(11); forged.usuario.permisos = ['ordenes_medicas.emitir'];
      await login(11); forged.authSession = { id: sessions[11], usuario_id: 11 };
      await assert.rejects(prepararAutoriaClinica({ req: forged, tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 403);
      const missingSession = await reqFor(4); delete missingSession.authSession;
      await assert.rejects(prepararAutoriaClinica({ req: missingSession, tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 401);
    });
    await t.test('finalizar captura identifica solo al finalizador sin alterar responsable ni validar clínicamente', async () => {
      await grant(2, ['ordenes_medicas.finalizar_captura']);
      const result = await prepararAutoriaClinica({ req: await reqFor(2), tipoDocumento: 'orden_medica', accion: 'finalizar_captura' });
      assert.equal(result.finalizador_usuario_id, 2); assert.equal(result.validacion_clinica, false);
      for (const field of ['responsable', 'capturista_usuario_id', 'emisor_usuario_id']) assert.equal(Object.hasOwn(result, field), false);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(2), tipoDocumento: 'orden_medica',
        accion: 'finalizar_captura', responsable: { tipo: 'usuario', usuario_id: 4 } }));
    });
    await t.test('solo director concede; CSRF, auditoría privada y revocación de sesiones en cambio de permisos', async () => {
      const granted = ['ordenes_medicas.transcribir', 'ordenes_medicas.finalizar_captura'];
      assert.equal((await send('usuarios/3/permisos', 'PUT', { permisos: granted }, 2)).status, 403);
      assert.equal((await send('usuarios/3/permisos', 'PUT', { permisos: granted }, 1, false)).status, 403);
      const response = await send('usuarios/3/permisos', 'PUT', { permisos: granted });
      assert.equal(response.status, 200);
      assert.deepEqual(await codigos(3), granted.sort());
      assert.equal((await send('profesionales', 'GET', undefined, 3)).status, 401, 'token anterior revocado');
      await login(3); assert.equal((await send('profesionales', 'GET', undefined, 3)).status, 200);
      const events = (await db.query("SELECT * FROM auditoria_eventos WHERE registro_id='3' AND descripcion='permisos_reemplazados'")).rows;
      assert.ok(events.length >= 1);
      const text = JSON.stringify(events);
      assert.ok(events.at(-1).datos_nuevos.cambios.permisos_agregados.includes('ordenes_medicas.finalizar_captura'));
      assert.ok(events.at(-1).datos_nuevos.cambios.permisos_retirados.includes('ordenes_medicas.emitir'));
      for (const sensitive of ['Digitador sintético', 'refresh_token_hash', 'synthetic-no-login', tokens[3]]) assert.equal(text.includes(sensitive), false);
      assert.ok(events.every(row => row.ip === null && row.user_agent === null));
      const forged = await reqFor(3); forged.usuario.permisos = ['ordenes_medicas.emitir'];
      await assert.rejects(prepararAutoriaClinica({ req: forged, tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'usuario', usuario_id: 4 } }), error => error.statusCode === 403);
    });
    await t.test('cambio de rol reemplaza permisos con defaults restrictivos y revoca sesiones auditadas', async () => {
      await grant(9, ['ordenes_medicas.emitir', 'controles.ver_vih']);
      const response = await send('usuarios/9', 'PUT', { rol: 'director' });
      assert.equal(response.status, 200);
      const granted = await codigos(9);
      assert.equal(granted.some(code => CLINICAL_CODES.includes(code)), false);
      assert.ok(granted.includes('pacientes.ver')); assert.ok(granted.includes('controles.ver_vih'));
      assert.ok(granted.includes('catalogos_profesionales.gestionar'));
      assert.equal((await send('profesionales', 'GET', undefined, 9)).status, 401);
      const events = (await db.query("SELECT descripcion FROM auditoria_eventos WHERE registro_id='9'")).rows.map(row => row.descripcion);
      assert.ok(events.includes('cambio_rol')); assert.ok(events.includes('permisos_reemplazados'));
      assert.ok(events.includes('sesiones_revocadas'));
    });
    await t.test('auditoría obligatoria fallida revierte permisos y revocaciones; sin identidades clínicas persistidas', async () => {
      const snapshot = async () => ({
        permisos: await codigos(3), sesiones: (await db.query('SELECT * FROM auth_sessions WHERE usuario_id=3 ORDER BY id')).rows,
      });
      const before = await snapshot();
      const service = require('../src/services/permisosService');
      await assert.rejects(service.reemplazarPermisosUsuario({ usuarioId: 3, codigos: ['ordenes_medicas.ver'], req: await reqFor(1),
        dependencies: { registrarEventoPrivado: async () => { throw new Error('synthetic audit unavailable'); } } }), /synthetic audit unavailable/);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query("SELECT to_regclass('notas_clinicas') AS notas,to_regclass('ordenes_medicas') AS ordenes")).rows[0].notas, null);
      assert.equal((await db.query("SELECT to_regclass('ordenes_medicas') AS ordenes")).rows[0].ordenes, null);
    });
    await t.test('usuarios inactivos, sesiones revocadas y cargo inactivo no pueden operar ni atribuirse autoría', async () => {
      await grant(7, ['ordenes_medicas.emitir']); await grant(10, ['ordenes_medicas.emitir']);
      assert.equal((await send('profesionales', 'GET', undefined, 7)).status, 401);
      await db.query("UPDATE auth_sessions SET revoked_at=NOW(),revoked_reason='synthetic_test' WHERE id=$1", [sessions[10]]);
      assert.equal((await send('profesionales', 'GET', undefined, 10)).status, 401);
      for (const id of [7, 10]) await assert.rejects(prepararAutoriaClinica({ req: await reqFor(id), tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 401);
      await db.query('UPDATE cargos_personal SET activo=FALSE WHERE id=$1', [cargos.medico]);
      await assert.rejects(prepararAutoriaClinica({ req: await reqFor(4), tipoDocumento: 'orden_medica',
        accion: 'emitir', responsable: { tipo: 'autenticado' } }), error => error.statusCode === 404);
      const remaining = await (await send('profesionales', 'GET', undefined, 3)).json();
      assert.equal(remaining.data.some(row => row.clasificacion_profesional === 'medico'), false);
    });
    await t.test('bootstrap oficial vacío y segunda ejecución verifican compatibilidad de 025', async () => {
      await db.query('CREATE DATABASE autoria_bootstrap');
      for (let i = 0; i < 2; i++) {
        const result = await migrate({ db: new Pool({ ...config, database: 'autoria_bootstrap' }),
          logger: { log() {}, error() {} }, setExitCode() {} });
        assert.equal(result.ok, true, result.error?.message);
      }
      const fresh = new Pool({ ...config, database: 'autoria_bootstrap' });
      try { await assertSchemaCompatible(fresh); } finally { await fresh.end(); }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    appPool.query = previous.query; appPool.connect = previous.connect; dotenv.config = previous.dotenv;
    for (const key of envKeys) {
      if (previous.env[key] === undefined) delete process.env[key]; else process.env[key] = previous.env[key];
    }
    if (db) await db.end();
    if (started || fs.existsSync(path.join(dataDir, 'postmaster.pid'))) {
      run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    }
    // Validar el destino generado antes de borrarlo recursivamente.
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('cap-autoria-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
