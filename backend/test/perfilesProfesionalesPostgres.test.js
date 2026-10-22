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
const appPool = require('../src/db/pool');
const { applyMigration, migrate } = require('../src/db/migrate');
const { getJwtConfig } = require('../src/config/env');
const { csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

test('CPREN-116: migración y API con sesiones reales en PostgreSQL temporal propio', {
  skip: process.env.RUN_PERFILES_TEMP_POSTGRES !== '1', timeout: 120000,
}, async t => {
  // No lee .env ni acepta URLs/servidores configurados; crea un clúster vacío.
  const bin = process.env.PERFILES_POSTGRES_BIN;
  assert.ok(bin, 'Falta PERFILES_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-perfiles-'));
  const dataDir = path.join(root, 'data');
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { stdio: 'ignore', windowsHide: true, timeout: 30000 });
  const config = { host: '127.0.0.1', port: 55476, user: 'perfiles_test', password: '', ssl: false,
    database: 'postgres', max: 8, connectionTimeoutMillis: 3000 };
  const previous = { query: appPool.query, connect: appPool.connect, secret: process.env.JWT_SECRET, nodeEnv: process.env.NODE_ENV };
  let db, server, started = false;
  try {
    run('initdb', ['-D', dataDir, '-U', 'perfiles_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55476', '-w', 'start']);
    started = true;
    db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    appPool.query = db.query.bind(db); appPool.connect = db.connect.bind(db);
    process.env.JWT_SECRET = 'synthetic-perfiles-test-only-secret-2026-116'; process.env.NODE_ENV = 'test';
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; temporal propio 127.0.0.1:55476`);
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    await db.query(schema.slice(0, schema.indexOf('-- CPREN-116:')));
    await db.query(`INSERT INTO roles (id,nombre) VALUES (1,'director'),(2,'admin'),(3,'personal_salud');
      INSERT INTO usuarios (id,nombre_completo,username,password_hash,rol_id) VALUES
      (1,'Director sintético','dir_test','no-login',1), (2,'Admin sintético','adm_test','no-login',2),
      (3,'Personal sintético','salud_test','no-login',3);
      SELECT setval(pg_get_serial_sequence('usuarios','id'), 3);
      INSERT INTO permisos(codigo,descripcion,categoria) VALUES
      ('pacientes.ver','Prueba','pacientes'),('controles.crear','Prueba','controles'),('controles.ver_vih','Prueba','controles')`);

    await t.test('024 conserva íntegros usuarios existentes; NULL y FKs; repetición idempotente', async () => {
      const before = (await db.query('SELECT * FROM usuarios ORDER BY id')).rows;
      const client = await db.connect();
      try {
        const filename = '024_usuarios_perfiles_profesionales.sql';
        const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
        assert.equal(await applyMigration({ db: client, filename, sql }), true);
        assert.equal(await applyMigration({ db: client, filename, sql }), false);
      } finally { client.release(); }
      assert.deepEqual((await db.query('SELECT * FROM usuarios ORDER BY id')).rows,
        before.map(row => ({ ...row, cargo_id: null, especialidad_id: null })));
      await assert.rejects(db.query('UPDATE usuarios SET cargo_id=99999 WHERE id=3'), { code: '23503' });
      await assert.rejects(db.query('UPDATE usuarios SET especialidad_id=99999 WHERE id=3'), { code: '23503' });
    });
    const tokens = {};
    const jwtConfig = getJwtConfig();
    for (const id of [1, 2, 3]) {
      const sid = crypto.randomUUID();
      await db.query(`INSERT INTO auth_sessions(id,usuario_id,refresh_token_hash,absolute_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')`, [sid, id, crypto.randomBytes(32).toString('hex')]);
      tokens[id] = jwt.sign({ sid }, jwtConfig.secret, { algorithm: jwtConfig.algorithm,
        issuer: jwtConfig.issuer, audience: jwtConfig.audience, subject: String(id), jwtid: crypto.randomUUID(), expiresIn: '5m' });
    }
    const app = express(); app.use(express.json()); app.use('/api', csrfMiddleware);
    app.use('/api/auth', require('../src/routes/auth'));
    app.use('/api/usuarios', require('../src/routes/usuarios'));
    app.use('/api/catalogos', require('../src/routes/catalogos').createCatalogosRouter());
    app.use(errorHandler); server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const send = (url, method = 'GET', body, actor = 1, csrf = true) => {
      const headers = { 'content-type': 'application/json' };
      if (actor) headers.authorization = `Bearer ${tokens[actor]}`;
      if (csrf) { headers.cookie = 'cap_prenatal_csrf=test'; headers['x-csrf-token'] = 'test'; }
      return fetch(`http://127.0.0.1:${server.address().port}/api/${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    };
    const especialidad = (await db.query("INSERT INTO especialidades_personal(nombre) VALUES ('Formación sintética') RETURNING id")).rows[0].id;
    let target;
    const crearBody = { nombre_completo: 'Cuenta sintética', username: 'nueva_test', password: 'test-only-password', rol: 'personal_salud', cargo_id: 1 };
    await t.test('autenticación, CSRF, admin/director y protección de director', async () => {
      assert.equal((await send('usuarios', 'GET', undefined, null)).status, 401);
      assert.equal((await send('usuarios', 'GET', undefined, 3)).status, 403);
      assert.equal((await send('usuarios/1', 'GET', undefined, 2)).status, 404);
      assert.equal((await send('usuarios/1', 'PUT', { cargo_id: 1 }, 2)).status, 404);
      assert.equal((await send('usuarios/3', 'PUT', { cargo_id: 1 }, 3)).status, 403);
      assert.equal((await send('usuarios/3', 'PUT', { cargo_id: 1 }, 2, false)).status, 403);
      assert.equal((await send('usuarios', 'POST', { ...crearBody, rol: 'director' }, 2)).status, 403);
      assert.equal((await send('usuarios/1', 'PUT', { cargo_id: 1 })).status, 200, 'director conserva acceso a su perfil');
    });
    await t.test('crear con cargo sin especialidad y cliente anterior; respuestas con nombres y sin hash', async () => {
      const response = await send('usuarios', 'POST', crearBody, 2); assert.equal(response.status, 201);
      target = await response.json(); assert.equal(target.cargo_nombre, 'Auxiliar de Enfermería');
      assert.equal(target.especialidad_id, null); assert.equal(Object.hasOwn(target, 'password_hash'), false);
      const legacy = { ...crearBody, username: 'legacy_test' }; delete legacy.cargo_id;
      assert.equal((await send('usuarios', 'POST', legacy)).status, 201);
      assert.equal((await send('usuarios', 'POST', { ...crearBody, username: 'sin_cargo', cargo_id: 9999 })).status, 400);
      assert.equal((await send('usuarios/3', 'PUT', { cargo_id: '' })).status, 400);
    });
    const snapshot = async () => ({
      usuario: (await db.query('SELECT rol_id,password_hash,activo,nombre_completo FROM usuarios WHERE id=$1', [target.id])).rows[0],
      permisos: (await db.query('SELECT * FROM usuario_permisos WHERE usuario_id=$1 ORDER BY id', [target.id])).rows,
      sesiones: (await db.query('SELECT * FROM auth_sessions WHERE usuario_id=$1 ORDER BY id', [target.id])).rows,
    });
    await t.test('editar/quitar/omitir; perfil no cambia rol, hash, permisos, estado ni sesiones', async () => {
      await db.query(`INSERT INTO auth_sessions(id,usuario_id,refresh_token_hash,absolute_expires_at)
        VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')`, [crypto.randomUUID(), target.id, crypto.randomBytes(32).toString('hex')]);
      await db.query("INSERT INTO usuario_permisos(usuario_id,permiso_id) SELECT $1,id FROM permisos WHERE codigo='controles.ver_vih'", [target.id]);
      await db.query('UPDATE usuarios SET activo=FALSE WHERE id=$1', [target.id]);
      const before = await snapshot();
      assert.equal(before.sesiones.length, 1); assert.ok(before.permisos.length > 0);
      assert.equal((await send(`usuarios/${target.id}`, 'PUT', { cargo_id: 2, especialidad_id: especialidad })).status, 200);
      assert.deepEqual(await snapshot(), before);
      const user = await (await send(`usuarios/${target.id}`)).json();
      assert.equal(user.cargo_id, 2); assert.equal(user.especialidad_nombre, 'Formación sintética');
      assert.equal((await send(`usuarios/${target.id}`, 'PUT', { especialidad_id: null })).status, 200);
      assert.equal((await (await send(`usuarios/${target.id}`)).json()).cargo_id, 2);
      assert.equal((await send(`usuarios/${target.id}`, 'PUT', { nombre_completo: 'Cuenta sintética' })).status, 200);
      assert.equal((await (await send(`usuarios/${target.id}`)).json()).especialidad_id, null);
      assert.deepEqual(await snapshot(), before);
      const events = (await db.query("SELECT * FROM auditoria_eventos WHERE registro_id=$1 AND descripcion='perfil_profesional_actualizado'", [String(target.id)])).rows;
      assert.ok(events.length >= 3); assert.equal(JSON.stringify(events).includes('Cuenta sintética'), false);
      assert.equal(JSON.stringify(events).includes('test-only-password'), false);
    });
    await t.test('asignaciones inactivas conservadas; nuevas rechazadas; FK preserva histórico', async () => {
      await db.query('UPDATE cargos_personal SET activo=FALSE WHERE id=2');
      assert.equal((await send(`usuarios/${target.id}`, 'PUT', { cargo_id: 2 })).status, 200);
      assert.equal((await send('usuarios/3', 'PUT', { cargo_id: 2 })).status, 400);
      await db.query('UPDATE especialidades_personal SET activo=FALSE WHERE id=$1', [especialidad]);
      assert.equal((await send(`usuarios/${target.id}`, 'PUT', { especialidad_id: especialidad })).status, 400);
      await assert.rejects(db.query('DELETE FROM cargos_personal WHERE id=2'), error => ['23503', '23001'].includes(error.code));
      await db.query("INSERT INTO pacientes(no_expediente,nombres,apellidos,registrado_por) VALUES('SYN-PERFIL','Sintética','Prueba',$1)", [target.id]);
      assert.equal((await send(`usuarios/${target.id}`, 'DELETE')).status, 409, 'historial conserva protección existente');
    });
    await t.test('desactivación concurrente: asignación espera bloqueo y rechaza el estado confirmado', async () => {
      const blocker = await db.connect();
      try {
        await blocker.query('BEGIN'); await blocker.query('UPDATE cargos_personal SET activo=FALSE WHERE id=3');
        const pending = send(`usuarios/${target.id}`, 'PUT', { cargo_id: 3 });
        // Espera observable de bloqueo, no un retraso supuesto.
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          const found = await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id, activo FROM cargos_personal%' AND pid<>pg_backend_pid()");
          if (found.rowCount) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true); await blocker.query('COMMIT'); assert.equal((await pending).status, 400);
        assert.equal((await (await send(`usuarios/${target.id}`)).json()).cargo_id, 2);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    });
    await t.test('búsqueda de catálogos y paginación reales', async () => {
      const searched = await (await send('catalogos/cargos?buscar=enfermeria&estado=todos&limite=1')).json();
      assert.equal(searched.total, 1); assert.equal(searched.data[0].id, 1);
      const first = await (await send('catalogos/cargos?estado=todos&limite=2&pagina=1')).json();
      const second = await (await send('catalogos/cargos?estado=todos&limite=2&pagina=2')).json();
      assert.equal(first.total, 8); assert.equal(first.data.length, 2); assert.notDeepEqual(first.data, second.data);
    });
    await t.test('auditoría obligatoria fallida revierte creación, permisos y edición del perfil', async () => {
      const users = require('../src/services/usuariosService');
      const dependencies = { registrarEventoPrivado: async () => { throw new Error('audit unavailable'); } };
      const req = { usuario: { id: 1, rol: 'director' } };
      await assert.rejects(users.crearUsuario({ body: { ...crearBody, username: 'rollback_test', cargo_id: 4 }, req, dependencies }), /audit unavailable/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM usuarios WHERE username='rollback_test'")).rows[0].n, 0);
      const before = await snapshot();
      await assert.rejects(users.actualizarUsuario({ id: target.id, body: { cargo_id: 4 }, req, dependencies }), /audit unavailable/);
      assert.equal((await (await send(`usuarios/${target.id}`)).json()).cargo_id, 2);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('perfil concurrente conserva el rol, estado y contraseña confirmados por otro editor', async () => {
      const blocker = await db.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query("UPDATE usuarios SET rol_id=2,activo=FALSE,password_hash='synthetic-concurrent-no-login' WHERE id=$1", [target.id]);
        const pending = send(`usuarios/${target.id}`, 'PUT', { cargo_id: 4 });
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          const found = await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM usuarios WHERE id = $1 FOR UPDATE%' AND pid<>pg_backend_pid()");
          if (found.rowCount) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true); await blocker.query('COMMIT'); assert.equal((await pending).status, 200);
        const after = await snapshot();
        assert.equal(after.usuario.rol_id, 2); assert.equal(after.usuario.activo, false);
        assert.equal(after.usuario.password_hash, 'synthetic-concurrent-no-login');
        assert.ok(after.sesiones.every(row => row.revoked_at === null));
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    });
    await t.test('bootstrap oficial completo y reejecución de 024', async () => {
      await db.query('CREATE DATABASE perfiles_bootstrap');
      for (let i = 0; i < 2; i++) {
        const result = await migrate({ db: new Pool({ ...config, database: 'perfiles_bootstrap' }), logger: { log() {}, error() {} }, setExitCode() {} });
        assert.equal(result.ok, true, result.error?.message);
      }
    });
    await t.test('navegador real escritorio/móvil → API → PostgreSQL temporal', {
      skip: process.env.RUN_PERFILES_BROWSER !== '1',
    }, async () => {
      await require('./helpers/perfilesBrowser').verificarPerfilesBrowser({ apiPort: server.address().port, token: tokens[1], t });
      const row = (await db.query(`SELECT u.cargo_id, u.especialidad_id, c.nombre AS cargo, e.nombre AS especialidad
        FROM usuarios u JOIN cargos_personal c ON c.id=u.cargo_id
        JOIN especialidades_personal e ON e.id=u.especialidad_id WHERE u.username='browser_fixture'`)).rows[0];
      assert.equal(row.cargo, 'Cargo navegador'); assert.equal(row.especialidad, 'Especialidad navegador');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    appPool.query = previous.query; appPool.connect = previous.connect;
    for (const [key, value] of [['JWT_SECRET', previous.secret], ['NODE_ENV', previous.nodeEnv]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']);
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
