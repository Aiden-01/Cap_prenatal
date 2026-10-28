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
const clinicalDateTypes = require('../src/db/clinicalDateTypes');
const { applyMigration, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const { getJwtConfig } = require('../src/config/env');
const { csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

test('CPREN-118: notas clínicas, seguridad y concurrencia en PostgreSQL temporal propio', {
  skip: process.env.RUN_NOTAS_TEMP_POSTGRES !== '1', timeout: 120000,
}, async t => {
  // No acepta destinos de configuración: initdb genera el único clúster permitido.
  const bin = process.env.NOTAS_POSTGRES_BIN;
  assert.ok(bin, 'Falta NOTAS_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-notas-'));
  const dataDir = path.join(root, 'data');
  const port = 55478;
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  const config = { host: '127.0.0.1', port, user: 'notas_test', password: '', ssl: false,
    database: 'postgres', max: 10, connectionTimeoutMillis: 3000, types: clinicalDateTypes };
  const envKeys = ['JWT_SECRET', 'NODE_ENV', 'TZ', 'ACCESS_TOKEN_TTL_MINUTES', 'SESSION_IDLE_TIMEOUT_MINUTES',
    'SESSION_WARNING_MINUTES', 'SESSION_ABSOLUTE_HOURS', 'SESSION_ACTIVITY_UPDATE_SECONDS'];
  const previous = { query: appPool.query, connect: appPool.connect, dotenv: dotenv.config,
    env: Object.fromEntries(envKeys.map(key => [key, process.env[key]])) };
  let db, server, started = false;
  try {
    run('initdb', ['-D', dataDir, '-U', 'notas_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true; db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    appPool.query = db.query.bind(db); appPool.connect = db.connect.bind(db);
    dotenv.config = () => ({ parsed: {} });
    Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'synthetic-notas-test-only-secret-2026-118',
      ACCESS_TOKEN_TTL_MINUTES: '10', SESSION_IDLE_TIMEOUT_MINUTES: '15', SESSION_WARNING_MINUTES: '13',
      SESSION_ABSOLUTE_HOURS: '8', SESSION_ACTIVITY_UPDATE_SECONDS: '60' });
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; clúster propio 127.0.0.1:${port}; .env deshabilitado`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    const boundary = schema.indexOf('-- CPREN-118:');
    assert.ok(boundary > 0, 'Falta el bloque aditivo CPREN-118 en schema.sql');
    await db.query(schema.slice(0, boundary));
    await db.query(`INSERT INTO roles(id,nombre) VALUES(1,'director'),(2,'admin'),(3,'personal_salud');
      INSERT INTO cargos_personal(id,nombre,clasificacion_profesional) VALUES
      (101,'Médico sintético de notas','medico'),(102,'AE sintética de notas','enfermeria_ae'),
      (103,'EP sintética de notas','enfermeria_ep'),(104,'Captura sintética de notas','no_clinico');

      INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id,cargo_id) VALUES
      (1,'Director sintético de notas','notas_dir','synthetic-no-login',1,104),
      (2,'Capturista sintético de notas','notas_cap','synthetic-no-login',3,104),
      (3,'Médico sintético responsable','notas_med','synthetic-no-login',3,101),
      (4,'AE sintética responsable','notas_ae','synthetic-no-login',3,102),
      (5,'EP sintética responsable','notas_ep','synthetic-no-login',3,103),
      (6,'Lector médico sintético','notas_read_med','synthetic-no-login',3,104),
      (7,'Lector enfermería sintético','notas_read_nurse','synthetic-no-login',3,104),
      (8,'Finalizador sintético','notas_close','synthetic-no-login',3,104),
      (9,'Sin facultades sintético','notas_none','synthetic-no-login',3,104),
      (10,'Inactivo sintético','notas_inactive','synthetic-no-login',3,104),
      (11,'Revocado sintético','notas_revoked','synthetic-no-login',3,104),
      (12,'Expirado sintético','notas_expired','synthetic-no-login',3,104),
      (13,'Sin acceso paciente sintético','notas_no_patient','synthetic-no-login',3,104);
      INSERT INTO pacientes(id,no_expediente,nombres,apellidos) VALUES
      (1,'SYN-NOTAS-1','Paciente sintética','Prueba uno'),(2,'SYN-NOTAS-2','Paciente sintética','Prueba dos');
      INSERT INTO embarazos(id,paciente_id,numero_embarazo,estado,fur,fpp) VALUES
      (11,1,1,'activo','2026-01-01','2026-10-08'),(12,1,2,'cerrado','2024-01-01','2024-10-07'),
      (21,2,1,'activo','2026-01-01','2026-10-08');
      INSERT INTO controles_prenatales(id,paciente_id,embarazo_id,numero_control,fecha,hora) VALUES
      (111,1,11,1,'2026-06-01','08:00'),(112,1,11,2,'2026-07-01','08:00'),
      (113,1,11,3,'2026-08-01','08:00'),(114,1,11,4,'2026-09-01','08:00'),(211,2,21,1,'2026-06-01','08:00');
      INSERT INTO permisos(codigo,descripcion,categoria) VALUES('pacientes.ver','Sintético','pacientes') ON CONFLICT DO NOTHING;
      INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT u.id,p.id FROM usuarios u CROSS JOIN permisos p
      WHERE p.codigo='pacientes.ver' AND u.id<>13`);
    const contextSnapshot = async () => ({
      pacientes: (await db.query('SELECT * FROM pacientes ORDER BY id')).rows,
      embarazos: (await db.query('SELECT * FROM embarazos ORDER BY id')).rows,
      controles: (await db.query('SELECT * FROM controles_prenatales ORDER BY id')).rows,
      citas: (await db.query('SELECT * FROM citas_prenatales ORDER BY id')).rows,
    });
    await t.test('026 aditiva e idempotente conserva pacientes, embarazos, controles, permisos y roles', async () => {
      const before = { context: await contextSnapshot(), usuarios: (await db.query('SELECT * FROM usuarios ORDER BY id')).rows,
        roles: (await db.query('SELECT * FROM roles ORDER BY id')).rows, permisos: (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows };
      const filename = fs.readdirSync(path.join(__dirname, '../src/db/migrations')).find(name => name.startsWith('026_'));
      assert.ok(filename, 'Existe migración 026');
      const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
      const client = await db.connect();
      try {
        assert.equal(await applyMigration({ db: client, filename, sql }), true);
        assert.equal(await applyMigration({ db: client, filename, sql }), false);
        await client.query(sql);
      } finally { client.release(); }
      assert.deepEqual({ context: await contextSnapshot(), usuarios: (await db.query('SELECT * FROM usuarios ORDER BY id')).rows,
        roles: (await db.query('SELECT * FROM roles ORDER BY id')).rows, permisos: (await db.query('SELECT * FROM usuario_permisos ORDER BY id')).rows }, before);
      assert.equal((await db.query('SELECT count(*)::integer AS n FROM notas_clinicas')).rows[0].n, 0);
      assert.equal((await db.query("SELECT to_regclass('ordenes_medicas') AS tabla")).rows[0].tabla, null);
    });
    // Upgrade correctivo sin reescribir 023–027; todo dentro del clúster propio.
    for (const filename of fs.readdirSync(path.join(__dirname, '../src/db/migrations')).filter(name => /^(027|028|029|030)_/.test(name)).sort()) {
      const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
      await db.query(sql);
    }
    assert.equal((await db.query("SELECT to_regclass('especialidades_personal') AS tabla")).rows[0].tabla, null);
    const contextBeforeNotes = await contextSnapshot();
    const grant = async (id, codes) => db.query(`INSERT INTO usuario_permisos(usuario_id,permiso_id)
      SELECT $1,id FROM permisos WHERE codigo=ANY($2::text[]) ON CONFLICT DO NOTHING`, [id, codes]);
    const medical = ['notas_evolucion.ver', 'notas_evolucion.registrar', 'notas_evolucion.finalizar_captura'];
    const nursing = ['notas_enfermeria.ver', 'notas_enfermeria.registrar', 'notas_enfermeria.finalizar_captura'];
    for (const id of [1, 3]) await grant(id, [...medical, ...nursing]);
    await grant(2, ['notas_evolucion.registrar', 'notas_enfermeria.registrar']);
    for (const id of [4, 5]) await grant(id, nursing);
    await grant(6, ['notas_evolucion.ver']); await grant(7, ['notas_enfermeria.ver']);
    await grant(8, ['notas_evolucion.finalizar_captura', 'notas_enfermeria.finalizar_captura']);
    for (const id of [10, 11, 12, 13]) await grant(id, medical);
    await db.query("UPDATE cargos_personal SET codigo=NULL WHERE codigo IN ('MED','AE','EP'); UPDATE cargos_personal SET codigo=CASE id WHEN 101 THEN 'MED' WHEN 102 THEN 'AE' WHEN 103 THEN 'EP' ELSE codigo END WHERE id IN (101,102,103)");
    const tokens = {}, sessions = {};
    const jwtConfig = getJwtConfig();
    const login = async id => {
      const sid = crypto.randomUUID();
      await db.query(`INSERT INTO auth_sessions(id,usuario_id,refresh_token_hash,absolute_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')`, [sid, id, crypto.randomBytes(32).toString('hex')]);
      sessions[id] = sid;
      tokens[id] = jwt.sign({ sid }, jwtConfig.secret, { algorithm: jwtConfig.algorithm, issuer: jwtConfig.issuer,
        audience: jwtConfig.audience, subject: String(id), jwtid: crypto.randomUUID(), expiresIn: '5m' });
    };
    for (let id = 1; id <= 13; id++) await login(id);
    const reqFor = async id => ({ usuario: (await db.query(`SELECT u.id,u.activo,r.nombre AS rol
      FROM usuarios u JOIN roles r ON r.id=u.rol_id WHERE u.id=$1`, [id])).rows[0], authSession: { id: sessions[id], usuario_id: id } });
    const app = express(); app.use(express.json()); app.use('/api', csrfMiddleware);
    app.use('/api/pacientes', require('../src/routes/pacientes'));
    app.use(errorHandler); server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const send = async (url, method = 'GET', body, actor = 2, csrf = true) => {
      const headers = { 'content-type': 'application/json' };
      if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
      if (csrf) { headers.cookie = 'cap_prenatal_csrf=synthetic'; headers['x-csrf-token'] = 'synthetic'; }
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: response.headers.get('content-type')?.includes('application/json')
        ? await response.json() : await response.text() };
    };
    const route = (id = '', paciente = 1) => `pacientes/${paciente}/notas-clinicas${id === '' ? '' : `/${id}`}`;
    const freshBody = (changes = {}) => ({ tipo: 'nota_evolucion', fecha_atencion: '2026-06-01', hora_atencion: '08:30',
      contenido: 'Narrativa sintética privada CPREN-118', responsable: { tipo: 'usuario', usuario_id: 3 },
      clave_idempotencia: crypto.randomUUID(), ...changes });
    const create = async (changes = {}, actor = 2, paciente = 1) => {
      const result = await send(route('', paciente), 'POST', freshBody(changes), actor);
      assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body;
    };
    const read = async (id, actor = 3, paciente = 1) => {
      const result = await send(route(id, paciente), 'GET', undefined, actor);
      assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
    };
    const snapshot = async id => (await db.query('SELECT * FROM notas_clinicas WHERE id=$1', [id])).rows[0];
    const cloneRaw = async (source, overrides) => {
      const data = { ...source, clave_idempotencia: crypto.randomUUID(), ...overrides }; delete data.id;
      const columns = Object.keys(data); assert.ok(columns.every(name => /^[a-z_]+$/.test(name)));
      return db.query(`INSERT INTO notas_clinicas(${columns.join(',')}) VALUES(${columns.map((_value, i) => `$${i + 1}`).join(',')})`, Object.values(data));
    };
    const assertMetadata = result => {
      assert.ok(Number.isInteger(result.id)); assert.ok(Number.isInteger(result.version));
      for (const field of ['contenido', 'responsable_snapshot', 'solicitud_hash', 'clave_idempotencia']) assert.equal(Object.hasOwn(result, field), false, field);
    };

    await t.test('CPREN-120: PDF real médico y enfermería con autorización, logos y auditoría privada', async () => {
      const { PDFDocument } = require('pdf-lib');
      const service = require('../src/services/notasClinicasService');
      const evidence = [];
      for (const [tipo, responsableId, lector] of [['nota_evolucion', 3, 6], ['nota_enfermeria', 4, 7]]) {
        const note = await create({ tipo, embarazo_id: 11, control_prenatal_id: 114, contenido: 'NARRATIVA-PDF-PRIVADA áéíóú ñ', responsable: { tipo: 'usuario', usuario_id: responsableId } });
        const pdfUrl = `http://127.0.0.1:${server.address().port}/api/${route(note.id)}/pdf`;
        const denied = await fetch(pdfUrl, { headers: { authorization: `Bearer ${tokens[2]}` } });
        assert.equal(denied.status, 403, 'registrar no confiere lectura PDF');
        const response = await fetch(pdfUrl, { headers: { authorization: `Bearer ${tokens[lector]}` } });
        assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf');
        assert.ok(response.headers.get('cache-control').includes('no-store'));
        const bytes = Buffer.from(await response.arrayBuffer());
        const pdf = await PDFDocument.load(bytes);
        assert.equal(pdf.getPage(0).getWidth(), 612); assert.equal(pdf.getPage(0).getHeight(), 792);
        assert.equal((await send(`${route(note.id, 2)}/pdf`, 'GET', undefined, lector)).status, 404);
        const data = await service.obtenerNotaParaPdf({ pacienteId: 1, notaId: note.id, req: await reqFor(lector) });
        assert.deepEqual(data.control, { numero: 4, fecha: '2026-09-01' });
        assert.equal(Object.hasOwn(data, 'capturista_nombre_actual'), false);
        if (process.env.CPREN_CHECKPOINT13 === '1') {
          const target = path.resolve(__dirname, '../../docs/cpren120', process.env.CPREN_CHECKPOINT14 === '1' ? 'checkpoint14' : process.env.CPREN_CHECKPOINT13B === '1' ? 'checkpoint13b' : 'checkpoint13', 'endpoint'); fs.mkdirSync(target, { recursive: true });
          const file = `endpoint/${tipo}.pdf`; fs.writeFileSync(path.join(target, `${tipo}.pdf`), bytes);
          evidence.push({ file, pages: pdf.getPageCount(), data });
        }
      }
      if (process.env.CPREN_CHECKPOINT13 === '1') fs.writeFileSync(path.resolve(__dirname, '../../docs/cpren120', process.env.CPREN_CHECKPOINT14 === '1' ? 'checkpoint14' : process.env.CPREN_CHECKPOINT13B === '1' ? 'checkpoint13b' : 'checkpoint13', 'endpoint-cases.json'), JSON.stringify({ synthetic_only: true, cases: evidence }, null, 2) + '\n');
      const events = (await db.query("SELECT datos_nuevos FROM auditoria_eventos WHERE descripcion='pdf_clinico_generado'")).rows;
      assert.equal(events.length, 2); assert.ok(!JSON.stringify(events).includes('NARRATIVA-PDF-PRIVADA'));
      const repository = require('../src/repositories/notasClinicasRepository');
      for (const reference of [{ controlId: 211, embarazoId: 21 }, { controlId: 114, embarazoId: 12 }]) {
        const wrongContext = await repository.obtenerPacientePdf(1, db, reference);
        assert.equal(wrongContext.control_numero, null); assert.equal(wrongContext.control_fecha, null);
      }
      assert.deepEqual(await contextSnapshot(), contextBeforeNotes);
    });
    await t.test('permisos independientes, autenticación y CSRF sin lectura implícita por registrar/finalizar', async () => {
      assert.equal((await send(route(), 'GET', undefined, null)).status, 401);
      assert.equal((await send(route(), 'POST', freshBody(), 9)).status, 403);
      assert.equal((await send(route(), 'POST', freshBody(), 13)).status, 403, 'también requiere pacientes.ver');
      assert.equal((await send(route(), 'POST', freshBody(), 2, false)).status, 403);
      const created = await create(); assertMetadata(created);
      assert.equal((await send(route(created.id), 'GET', undefined, 2)).status, 403);
      assert.equal((await send(route(created.id), 'GET', undefined, 8)).status, 403);
      assert.equal((await send(route(created.id), 'PUT', { version: created.version, contenido: 'Cambio sintético' }, 6)).status, 403);
      assert.equal((await send(route(created.id) + '/finalizar', 'POST', { version: created.version }, 2)).status, 403);
      const full = await read(created.id); assert.equal(full.contenido, 'Narrativa sintética privada CPREN-118');
      const row = await snapshot(created.id); assert.equal(row.capturista_usuario_id, 2); assert.equal(row.responsable_usuario_id, 3);
    });
    await t.test('borrador parcial, notas independientes y contenido final obligatorio', async () => {
      const draft = await create({ contenido: '', fecha_atencion: null, hora_atencion: null });
      const full = await read(draft.id);
      assert.equal(full.estado, 'borrador'); assert.equal(full.fecha_atencion, null); assert.equal(full.hora_atencion, null);
      assert.equal(full.embarazo_id, null); assert.equal(full.control_prenatal_id, null); assert.equal(full.es_principal, false);
      assert.equal((await send(route(draft.id) + '/finalizar', 'POST', { version: draft.version }, 8)).status, 400);
      const updated = await send(route(draft.id), 'PUT', { version: draft.version, contenido: 'Solo texto sintético' }, 2);
      assert.equal(updated.status, 200); assertMetadata(updated.body);
      assert.equal((await send(route(draft.id) + '/finalizar', 'POST', { version: updated.body.version }, 8)).status, 400);
    });
    await t.test('integridad paciente/embarazo/control y derivación conservadora del embarazo', async () => {
      const note = await create({ control_prenatal_id: 111 });
      const full = await read(note.id); assert.equal(full.embarazo_id, 11); assert.equal(full.es_principal, true);
      for (const [changes, status] of [[{ embarazo_id: 21 }, 404], [{ control_prenatal_id: 211 }, 404],
        [{ control_prenatal_id: 111, embarazo_id: null }, 400], [{ control_prenatal_id: 111, embarazo_id: 12 }, 400]]) {
        assert.equal((await send(route(), 'POST', freshBody(changes))).status, status);
      }
      assert.equal((await send(route(note.id, 2), 'GET', undefined, 3)).status, 404);
      assert.equal((await send(route(note.id, 2), 'PUT', { version: 1, contenido: 'No autorizado por contexto' }, 2)).status, 404);
      assert.equal((await send(route(note.id, 2) + '/finalizar', 'POST', { version: 1 }, 8)).status, 404);
      await assert.rejects(db.query('DELETE FROM pacientes WHERE id=1'), error => ['23503', '23001'].includes(error.code));
      await assert.rejects(db.query('DELETE FROM embarazos WHERE id=11'), error => ['23503', '23001'].includes(error.code));
      await assert.rejects(db.query('DELETE FROM controles_prenatales WHERE id=111'), error => ['23503', '23001'].includes(error.code));
      const source = await snapshot(note.id);
      await assert.rejects(cloneRaw(source, { paciente_id: 2, es_principal: false }), error => ['23503', '23514'].includes(error.code));
      await assert.rejects(cloneRaw(source, { embarazo_id: 12, es_principal: false }), error => ['23503', '23514'].includes(error.code));
    });
    await t.test('SQL rechaza snapshots con NULL y no permite finalizar cambiando contenido o responsable', async () => {
      const note = await create(); const source = await snapshot(note.id);
      for (const campo of ['tipo', 'cargo_codigo', 'nombre_completo']) {
        await assert.rejects(cloneRaw(source, { responsable_snapshot: { ...source.responsable_snapshot, [campo]: null } }), { code: '23514' });
      }
      await assert.rejects(db.query(`UPDATE notas_clinicas SET estado='captura_finalizada',finalizador_usuario_id=8,
        finalizada_at=clock_timestamp(),version=version+1,contenido='Mutación simultánea prohibida' WHERE id=$1`, [note.id]), { code: '23514' });
      const externo = { tipo: 'externo', usuario_id: null, nombre_completo: 'Externo sintético SQL', cargo_id: null,
        cargo_nombre: 'Médico externo', cargo_codigo: 'MED' };
      await assert.rejects(db.query(`UPDATE notas_clinicas SET estado='captura_finalizada',finalizador_usuario_id=8,
        finalizada_at=clock_timestamp(),version=version+1,responsable_usuario_id=NULL,responsable_snapshot=$2::jsonb
        WHERE id=$1`, [note.id, JSON.stringify(externo)]), { code: '23514' });
      assert.deepEqual(await snapshot(note.id), source);
      assert.equal((await send(route(note.id) + '/finalizar', 'POST', { version: 1 }, 8)).status, 200);
      const blank = await create({ contenido: '\n\t  \n' });
      await assert.rejects(db.query(`UPDATE notas_clinicas SET estado='captura_finalizada',finalizador_usuario_id=8,
        finalizada_at=clock_timestamp(),version=version+1 WHERE id=$1`, [blank.id]), { code: '23514' });
    });
    await t.test('solo una principal por control/tipo, adicionales permitidas y carreras con resultado único', async () => {
      assert.equal((await send(route(), 'POST', freshBody({ control_prenatal_id: 111 }))).status, 409);
      const additional = await create({ control_prenatal_id: 111, es_principal: false });
      assert.equal((await read(additional.id)).es_principal, false);
      const nursingNote = await create({ tipo: 'nota_enfermeria', control_prenatal_id: 111,
        responsable: { tipo: 'usuario', usuario_id: 4 } });
      assert.equal((await read(nursingNote.id)).es_principal, true);
      const results = await Promise.all([2, 3].map(actor => send(route(), 'POST', freshBody({ control_prenatal_id: 112 }), actor)));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.equal((await db.query("SELECT count(*)::integer AS n FROM notas_clinicas WHERE control_prenatal_id=112 AND tipo='nota_evolucion' AND es_principal")).rows[0].n, 1);
    });
    await t.test('POST idempotente secuencial/concurrente, payload distinto rechazado y clave limitada al actor', async () => {
      const body = freshBody();
      const first = await send(route(), 'POST', body); assert.equal(first.status, 201); assertMetadata(first.body);
      const again = await send(route(), 'POST', body); assert.equal(again.status, 200); assert.deepEqual(again.body, first.body);
      assert.equal((await send(route(), 'POST', { ...body, contenido: 'Otra narrativa sintética' })).status, 409);
      const raceBody = freshBody();
      const race = await Promise.all([send(route(), 'POST', raceBody), send(route(), 'POST', raceBody)]);
      assert.deepEqual(race.map(result => result.status).sort(), [200, 201]); assert.equal(race[0].body.id, race[1].body.id);
      const otherActor = await send(route(), 'POST', body, 3); assert.equal(otherActor.status, 201);
      assert.notEqual(otherActor.body.id, first.body.id);
      assert.equal((await db.query('SELECT count(*)::integer AS n FROM notas_clinicas WHERE capturista_usuario_id=2 AND clave_idempotencia=$1', [body.clave_idempotencia])).rows[0].n, 1);
    });
    await t.test('puerperio permite captura; embarazo cerrado conserva lectura y replay sin nuevas escrituras', async () => {
      await db.query("UPDATE embarazos SET estado='puerperio' WHERE id=11");
      try {
        const body = freshBody({ embarazo_id: 11 });
        const first = await send(route(), 'POST', body); assert.equal(first.status, 201);
        const editable = await create({ embarazo_id: 11 });
        const finalized = await send(route(first.body.id) + '/finalizar', 'POST', { version: 1 }, 8);
        assert.equal(finalized.status, 200);
        await db.query("UPDATE embarazos SET estado='cerrado' WHERE id=11");
        assert.equal((await send(route(first.body.id), 'GET', undefined, 6)).status, 200);
        const replay = await send(route(), 'POST', body); assert.equal(replay.status, 200); assert.equal(replay.body.id, first.body.id);
        assert.equal((await send(route(), 'POST', freshBody({ embarazo_id: 11 }))).status, 409);
        assert.equal((await send(route(), 'POST', freshBody({ embarazo_id: 12 }))).status, 409);
        assert.equal((await send(route(editable.id), 'PUT', { version: 1, contenido: 'Embarazo cerrado' }, 2)).status, 409);
        assert.equal((await send(route(editable.id) + '/finalizar', 'POST', { version: 1 }, 8)).status, 409);
      } finally { await db.query("UPDATE embarazos SET estado='activo' WHERE id=11"); }
    });
    await t.test('separación de tipos, listados sin narrativa y sin IDOR mediante query o cuerpo', async () => {
      const med = await create(); const nurse = await create({ tipo: 'nota_enfermeria', responsable: { tipo: 'usuario', usuario_id: 5 } });
      assert.equal((await send(route(nurse.id), 'GET', undefined, 6)).status, 403);
      assert.equal((await send(route(med.id), 'GET', undefined, 7)).status, 403);
      assert.equal((await send(route(nurse.id) + '?tipo=nota_evolucion', 'GET', undefined, 6)).status >= 400, true);
      assert.equal((await send(route() + '?tipo=nota_enfermeria', 'GET', undefined, 6)).status, 403);
      const listed = await send(route() + '?limite=2&pagina=1', 'GET', undefined, 6); assert.equal(listed.status, 200);
      assert.ok(listed.body.data.length <= 2); assert.ok(listed.body.data.every(row => row.tipo === 'nota_evolucion'));
      for (const row of listed.body.data) {
        assert.equal(Object.hasOwn(row, 'contenido'), false); assert.equal(Object.hasOwn(row, 'solicitud_hash'), false);
        assert.equal(Object.hasOwn(row, 'clave_idempotencia'), false);
      }
      assert.equal(JSON.stringify(listed.body).includes('Narrativa sintética privada'), false);
      assert.equal((await send(route(med.id), 'PUT', { version: 1, tipo: 'nota_enfermeria' }, 2)).status, 400);
    });
    await t.test('CPREN-117 real: médicos y AE/EP, terceros/externos y capturista nunca tomado del cliente', async () => {
      const beforePermissions = (await db.query('SELECT * FROM usuario_permisos WHERE usuario_id=2 ORDER BY id')).rows;
      for (const user of [4, 5]) {
        const result = await create({ tipo: 'nota_enfermeria', responsable: { tipo: 'usuario', usuario_id: user } });
        const row = await snapshot(result.id); assert.equal(row.responsable_usuario_id, user); assert.equal(row.capturista_usuario_id, 2);
      }
      assert.equal((await send(route(), 'POST', freshBody({ responsable: { tipo: 'usuario', usuario_id: 4 } }))).status, 403);
      assert.equal((await send(route(), 'POST', freshBody({ responsable: { tipo: 'autenticado' } }))).status, 403);
      assert.equal((await send(route(), 'POST', freshBody({ capturista_usuario_id: 3 }))).status, 400);
      assert.equal((await send(route(), 'POST', freshBody({ finalizador_usuario_id: 3 }))).status, 400);
      const external = { tipo: 'externo', nombre_completo: 'Médico externo sintético de notas', cargo_codigo: 'MED' };
      const note = await create({ responsable: external }); const row = await snapshot(note.id);
      assert.equal(row.responsable_usuario_id, null); assert.equal(row.responsable_snapshot.tipo, 'externo');
      assert.equal(row.responsable_snapshot.nombre_completo, external.nombre_completo);
      assert.deepEqual((await db.query('SELECT * FROM usuario_permisos WHERE usuario_id=2 ORDER BY id')).rows, beforePermissions);
    });
    await t.test('CAS de versión rechaza edición obsoleta y carreras entre editores', async () => {
      const note = await create();
      const first = await send(route(note.id), 'PUT', { version: 1, contenido: 'Edición sintética ganadora' }, 2);
      assert.equal(first.status, 200); assert.equal(first.body.version, 2); assertMetadata(first.body);
      const before = await snapshot(note.id);
      assert.equal((await send(route(note.id), 'PUT', { version: 1, contenido: 'Edición obsoleta' }, 3)).status, 409);
      assert.deepEqual(await snapshot(note.id), before);
      const race = await Promise.all([2, 3].map(actor => send(route(note.id), 'PUT', { version: 2, contenido: `Edición concurrente ${actor}` }, actor)));
      assert.deepEqual(race.map(result => result.status).sort(), [200, 409]); assert.equal((await snapshot(note.id)).version, 3);
      for (const field of ['paciente_id', 'embarazo_id', 'control_prenatal_id', 'tipo', 'es_principal', 'estado', 'clave_idempotencia']) {
        assert.equal((await send(route(note.id), 'PUT', { version: 3, [field]: before[field] }, 2)).status, 400, field);
      }
    });
    await t.test('editar responsable explícitamente genera nuevo snapshot sin cambiar el capturista original', async () => {
      const note = await create(); const before = await snapshot(note.id);
      const responsable = { tipo: 'externo', nombre_completo: 'Nuevo responsable externo sintético', cargo_codigo: 'MED' };
      const result = await send(route(note.id), 'PUT', { version: 1, responsable }, 3);
      assert.equal(result.status, 200); assertMetadata(result.body);
      const row = await snapshot(note.id); assert.equal(row.capturista_usuario_id, before.capturista_usuario_id);
      assert.equal(row.responsable_usuario_id, null); assert.equal(row.responsable_snapshot.nombre_completo, responsable.nombre_completo);
      assert.equal(row.finalizador_usuario_id, null); assert.equal(row.version, 2);
    });
    await t.test('finalización concurrente identifica finalizador sin cambiar capturista ni responsable', async () => {
      const note = await create(); const before = await snapshot(note.id);
      const race = await Promise.all([8, 3].map(actor => send(route(note.id) + '/finalizar', 'POST', { version: 1 }, actor)));
      assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
      const row = await snapshot(note.id); assert.equal(row.estado, 'captura_finalizada'); assert.equal(row.version, 2);
      assert.ok([8, 3].includes(row.finalizador_usuario_id)); assert.ok(row.finalizada_at instanceof Date);
      assert.equal(row.capturista_usuario_id, 2); assert.deepEqual(row.responsable_snapshot, before.responsable_snapshot);
      assert.equal((await send(route(note.id) + '/finalizar', 'POST', { version: 2, responsable: { tipo: 'autenticado' } }, 8)).status, 400);
    });
    await t.test('carrera editar/finalizar conserva transición atómica y nota finalizada inmutable por API y SQL', async () => {
      const note = await create();
      const race = await Promise.all([
        send(route(note.id), 'PUT', { version: 1, contenido: 'Edición frente a cierre' }, 2),
        send(route(note.id) + '/finalizar', 'POST', { version: 1 }, 8),
      ]);
      assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
      let row = await snapshot(note.id); assert.equal(row.version, 2);
      if (row.estado === 'borrador') {
        assert.equal((await send(route(note.id) + '/finalizar', 'POST', { version: 2 }, 8)).status, 200);
        row = await snapshot(note.id);
      }
      const before = row;
      assert.equal((await send(route(note.id), 'PUT', { version: row.version, contenido: 'No debe persistir' }, 2)).status, 409);
      assert.equal((await send(route(note.id), 'DELETE', undefined, 3)).status >= 400, true);
      await assert.rejects(db.query('UPDATE notas_clinicas SET contenido=$1 WHERE id=$2', ['No debe persistir SQL', note.id]));
      await assert.rejects(db.query('DELETE FROM notas_clinicas WHERE id=$1', [note.id]));
      assert.deepEqual(await snapshot(note.id), before);
    });
    await t.test('snapshot histórico permanece tras renombrar/inactivar responsable y editar solo contenido/finalizar', async () => {
      const note = await create(); const before = await snapshot(note.id);
      await db.query("UPDATE usuarios SET nombre_completo='Nombre posterior sintético',activo=FALSE WHERE id=3");
      await db.query("UPDATE cargos_personal SET nombre='Cargo posterior sintético',activo=FALSE WHERE id=101");
      const changed = await send(route(note.id), 'PUT', { version: 1, contenido: 'Edición sin cambiar identidad histórica' }, 2);
      assert.equal(changed.status, 200); assert.deepEqual((await snapshot(note.id)).responsable_snapshot, before.responsable_snapshot);
      assert.equal((await send(route(note.id) + '/finalizar', 'POST', { version: changed.body.version }, 8)).status, 200);
      const historical = (await send(route(note.id), 'GET', undefined, 6)).body;
      assert.deepEqual(historical.responsable_snapshot, before.responsable_snapshot);
      assert.equal((await send(route(), 'POST', freshBody())).status, 404, 'no permite nuevas atribuciones al responsable inactivo');
      await db.query("UPDATE usuarios SET nombre_completo='Médico sintético responsable',activo=TRUE WHERE id=3");
      await db.query("UPDATE cargos_personal SET nombre='Médico sintético de notas',activo=TRUE WHERE id=101");
      await login(3);
    });
    await t.test('auditoría privada obligatoria sin narrativa ni nombres; fallos revierten crear/editar/finalizar', async () => {
      const service = require('../src/services/notasClinicasService');
      const failing = { registrarEventoPrivado: async () => { throw new Error('synthetic notas audit unavailable'); } };
      const body = freshBody();
      const initialCount = (await db.query('SELECT count(*)::integer AS n FROM notas_clinicas')).rows[0].n;
      await assert.rejects(service.crearBorrador({ pacienteId: 1, body, req: await reqFor(2), dependencies: failing }), /synthetic notas audit unavailable/);
      assert.equal((await db.query('SELECT count(*)::integer AS n FROM notas_clinicas')).rows[0].n, initialCount);
      const note = await create(); const before = await snapshot(note.id);
      await assert.rejects(service.actualizarBorrador({ pacienteId: 1, notaId: note.id, body: { version: 1, contenido: 'Texto fallido privado' }, req: await reqFor(2), dependencies: failing }), /synthetic notas audit unavailable/);
      assert.deepEqual(await snapshot(note.id), before);
      await assert.rejects(service.finalizarCaptura({ pacienteId: 1, notaId: note.id, body: { version: 1 }, req: await reqFor(8), dependencies: failing }), /synthetic notas audit unavailable/);
      assert.deepEqual(await snapshot(note.id), before);
      const events = (await db.query("SELECT * FROM auditoria_eventos WHERE tabla='notas_clinicas'")).rows;
      assert.ok(events.length > 0);
      const json = JSON.stringify(events);
      for (const forbidden of ['Narrativa sintética privada', 'Edición sintética', 'Paciente sintética', 'Médico sintético responsable', 'synthetic-no-login', 'Texto fallido privado']) assert.equal(json.includes(forbidden), false, forbidden);
      assert.ok(events.every(row => row.ip === null && row.user_agent === null && row.datos_anteriores === null));
    });
    await t.test('revocación, expiración e inactividad impiden operaciones aunque el permiso siga en DB', async () => {
      await db.query('UPDATE usuarios SET activo=FALSE WHERE id=10');
      await db.query("UPDATE auth_sessions SET revoked_at=NOW(),revoked_reason='synthetic_test' WHERE id=$1", [sessions[11]]);
      await db.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '2 hours',absolute_expires_at=NOW()-INTERVAL '1 hour' WHERE id=$1", [sessions[12]]);
      for (const actor of [10, 11, 12]) {
        assert.equal((await send(route(), 'GET', undefined, actor)).status, 401);
        assert.equal((await send(route(), 'POST', freshBody(), actor)).status, 401);
      }
      const note = await create();
      await db.query(`DELETE FROM usuario_permisos WHERE usuario_id=2 AND permiso_id=(SELECT id FROM permisos WHERE codigo='notas_evolucion.registrar')`);
      assert.equal((await send(route(note.id), 'PUT', { version: 1, contenido: 'Permiso retirado' }, 2)).status, 403);
      await grant(2, ['notas_evolucion.registrar']);
    });
    await t.test('DATE/TIME civiles conservados en zonas horarias distintas y sin modificar controles/calendario', async () => {
      for (const timezone of ['UTC', 'America/Guatemala', 'Asia/Tokyo']) {
        process.env.TZ = timezone;
        const scoped = new Pool({ ...config, options: `-c TimeZone=${timezone}` });
        appPool.query = scoped.query.bind(scoped); appPool.connect = scoped.connect.bind(scoped);
        try {
          const note = await create({ fecha_atencion: '2024-02-29', hora_atencion: '23:59' });
          const full = await read(note.id, 6);
          assert.equal(full.fecha_atencion, '2024-02-29'); assert.match(full.hora_atencion, /^23:59(?::00)?$/);
          assert.match(full.created_at, /T\d{2}:\d{2}:\d{2}/);
          const sql = (await scoped.query('SELECT fecha_atencion,hora_atencion,current_setting(\'TimeZone\') AS timezone FROM notas_clinicas WHERE id=$1', [note.id])).rows[0];
          assert.equal(sql.fecha_atencion, '2024-02-29'); assert.equal(sql.timezone, timezone);
          const client = await scoped.connect();
          try {
            const repository = require('../src/repositories/notasClinicasRepository');
            for (const style of ['SQL, DMY', 'German, DMY']) {
              await client.query('SELECT set_config(\'DateStyle\',$1,false)', [style]);
              const formatted = await repository.obtenerPorId(note.id, client);
              assert.equal(formatted.fecha_atencion, '2024-02-29', `${timezone}: ${style}`);
              const control = await repository.obtenerControl(111, client);
              assert.equal(control.fecha, '2026-06-01', `${timezone}: control ${style}`);
            }
          } finally {
            await client.query('RESET DateStyle'); client.release();
          }
        } finally {
          appPool.query = db.query.bind(db); appPool.connect = db.connect.bind(db); await scoped.end();
        }
      }
      assert.deepEqual(await contextSnapshot(), contextBeforeNotes);
    });
    await t.test('bootstrap oficial vacío y segunda ejecución incluyen 026 y compatibilidad completa', async () => {
      await db.query('CREATE DATABASE notas_bootstrap');
      for (let i = 0; i < 2; i++) {
        const result = await migrate({ db: new Pool({ ...config, database: 'notas_bootstrap' }), logger: { log() {}, error() {} }, setExitCode() {} });
        assert.equal(result.ok, true, result.error?.message);
      }
      const fresh = new Pool({ ...config, database: 'notas_bootstrap' });
      try { await assertSchemaCompatible(fresh); } finally { await fresh.end(); }
    });
  } finally {
    await require('../src/services/puppeteerBrowserManager').puppeteerBrowserManager.close();
    if (server) await new Promise(resolve => server.close(resolve));
    appPool.query = previous.query; appPool.connect = previous.connect; dotenv.config = previous.dotenv;
    for (const key of envKeys) {
      if (previous.env[key] === undefined) delete process.env[key]; else process.env[key] = previous.env[key];
    }
    if (db) await db.end();
    if (started || fs.existsSync(path.join(dataDir, 'postmaster.pid'))) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('cap-notas-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
