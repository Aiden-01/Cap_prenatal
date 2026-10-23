const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const express = require('express');
const { once } = require('node:events');
const { migrate, applyMigration } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const { createCatalogosRepository } = require('../src/repositories/catalogosRepository');
const { createCatalogosService } = require('../src/services/catalogosService');
const { createCatalogosRouter } = require('../src/routes/catalogos');
const { errorHandler } = require('../src/middleware/errorHandler');

test('CPREN-115: migración, HTTP, integridad, auditoría y concurrencia en clúster desechable', {
  skip: process.env.RUN_CATALOGOS_TEMP_POSTGRES !== '1', timeout: 120000,
}, async (t) => {
  // Nunca lee .env, PGHOST ni DATABASE_URL; initdb crea el único destino permitido.
  const bin = process.env.CATALOGOS_POSTGRES_BIN;
  assert.ok(bin, 'Falta CATALOGOS_POSTGRES_BIN');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-catalogos-'));
  const data = path.join(root, 'data');
  const port = 55475;
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')),
    args, { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  const config = { host: '127.0.0.1', port, user: 'catalogos_test', database: 'postgres',
    password: '', ssl: false, connectionTimeoutMillis: 3000, max: 8 };
  let started = false;
  let db;
  let server;
  try {
    run('initdb', ['-D', data, '-U', 'catalogos_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    db = new Pool(config);
    const actualDir = (await db.query('SHOW data_directory')).rows[0].data_directory;
    assert.equal(path.resolve(actualDir), path.resolve(data));
    t.diagnostic(`PostgreSQL ${(await db.query('SHOW server_version')).rows[0].server_version}; clúster temporal propio, puerto ${port}`);
    const filename = '023_catalogos_profesionales.sql';
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
    const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
    const oldSchema = schema.slice(0, schema.indexOf('-- CPREN-115:'));

    await t.test('upgrade sobre esquema anterior sin cambiar usuarios, roles ni migraciones publicadas', async () => {
      await db.query(oldSchema);
      await db.query(`INSERT INTO roles (nombre) VALUES ('director'), ('admin'), ('personal_salud');
        INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
        SELECT 'Sintético', 'catalogos_test', 'no-login', id FROM roles WHERE nombre='director'`);
      const before = (await db.query('SELECT * FROM usuarios')).rows;
      const roles = (await db.query('SELECT * FROM roles ORDER BY id')).rows;
      assert.equal(await applyMigration({ db, filename, sql }), true);
      assert.equal(await applyMigration({ db, filename, sql }), false);
      assert.deepEqual((await db.query('SELECT * FROM usuarios')).rows, before);
      assert.deepEqual((await db.query('SELECT * FROM roles ORDER BY id')).rows, roles);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM cargos_personal')).rows[0].n, 8);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM especialidades_personal')).rows[0].n, 0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='usuarios' AND column_name IN ('cargo_id','especialidad_id')")).rows[0].n, 0);
    });

    // La regresión 023 anterior se comprueba antes; la API actual requiere 024/025.
    for (const posterior of ['024_usuarios_perfiles_profesionales.sql', '025_permisos_autoria_clinica.sql',
      '026_notas_clinicas.sql', '027_seguimiento_notas_controles.sql',
      '028_retirar_especialidades.sql', '029_usuarios_email.sql', '030_cargos_autoria_estable.sql']) {
      await applyMigration({ db, filename: posterior,
        sql: fs.readFileSync(path.join(__dirname, '../src/db/migrations', posterior), 'utf8') });
    }

    assert.equal((await db.query("SELECT to_regclass('public.especialidades_personal') tabla")).rows[0].tabla, null);
    // API real con servicios/repositorios/auditoría reales; identidad sintética.
    const services = Object.fromEntries(['cargos'].map(tipo => [tipo,
      createCatalogosService(tipo, { repository: createCatalogosRepository(tipo, db) })]));
    const app = express();
    app.use(express.json());
    app.use('/api/catalogos', createCatalogosRouter({ services, authenticate: (req, _res, next) => {
      req.usuario = { id: 1, rol: 'director' }; next();
    }, loadPermissions: async (req, _res, next) => {
      try {
        const result = await db.query(`SELECT p.codigo FROM usuario_permisos up
          JOIN permisos p ON p.id=up.permiso_id WHERE up.usuario_id=$1`, [req.usuario.id]);
        req.usuario.permisos = result.rows.map(row => row.codigo); next();
      } catch (error) { next(error); }
    } }));
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const send = (url, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}/api/catalogos/${url}`, {
      method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });

    await t.test('Especialidades retirada: todos sus endpoints devuelven 404', async () => {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH']) {
        assert.equal((await send('especialidades', method, method === 'GET' ? undefined : {})).status, 404);
      }
    });
    for (const tipo of ['cargos']) {
      const tabla = `${tipo}_personal`;
      await t.test(`${tipo}: CRUD lógico HTTP, filtros, fechas, privacidad e integridad SQL`, async () => {
        const created = await send(tipo, 'POST', { nombre: '  Título  Sintético  ', codigo: ' ÁB  01 ', descripcion: 'Narrativa privada' });
        assert.equal(created.status, 201);
        const row = await created.json();
        assert.equal(row.nombre, 'Título Sintético');
        assert.equal(row.activo, true);
        const other = await (await send(tipo, 'POST', { nombre: 'Reservado', codigo: 'OTRO' })).json();
        assert.equal((await send(`${tipo}/${row.id}`, 'PUT', { nombre: ' reservado ' })).status, 409);
        assert.equal((await send(`${tipo}/${row.id}`, 'PUT', { nombre: 'Diferente', codigo: 'otro' })).status, 409);
        assert.equal((await send(`${tipo}/${other.id}`)).status, 200);
        assert.equal((await send(`${tipo}/${row.id}`)).status, 200);
        assert.equal((await send(`${tipo}/2147483647`)).status, 404);
        for (const body of [{ nombre: 'ti\u0301tulo  sinte\u0301tico' }, { nombre: 'Otro', codigo: 'ab 01' }]) {
          const duplicate = await send(tipo, 'POST', body);
          assert.equal(duplicate.status, 409);
          assert.equal((await duplicate.json()).code, 'CATALOGO_DUPLICADO');
        }
        const edited = await send(`${tipo}/${row.id}`, 'PUT', { nombre: 'Título revisado', codigo: 'ÁB 01' });
        assert.equal(edited.status, 200);
        const after = await edited.json();
        assert.equal(after.created_at, row.created_at);
        assert.ok(Date.parse(after.updated_at) >= Date.parse(row.updated_at));
        assert.equal(after.descripcion, null);
        assert.equal((await send(`${tipo}/${row.id}/desactivar`, 'PATCH')).status, 200);
        const active = await (await send(tipo)).json();
        assert.equal(active.data.some(x => x.id === row.id), false);
        const inactive = await (await send(tipo + '?estado=inactivos')).json();
        assert.equal(inactive.data.some(x => x.id === row.id), true);
        const all = await (await send(tipo + '?estado=todos')).json();
        assert.equal(all.total, active.total + inactive.total);
        assert.equal((await send(tipo, 'POST', { nombre: 'titulo revisado' })).status, 409);
        assert.equal((await send(`${tipo}/${row.id}/reactivar`, 'PATCH')).status, 200);
        assert.equal((await send(`${tipo}/${row.id}`, 'DELETE')).status, 404);
        await assert.rejects(db.query(`INSERT INTO ${tabla} (nombre) VALUES ('  ')`), { code: '23514' });
        await assert.rejects(db.query(`INSERT INTO ${tabla} (nombre) VALUES (NULL)`), { code: '23502' });
        await assert.rejects(db.query(`INSERT INTO ${tabla} (nombre, codigo) VALUES ('Válido', ' ')`), { code: '23514' });
        await assert.rejects(db.query(`INSERT INTO ${tabla} (nombre, activo) VALUES ('Válido', NULL)`), { code: '23502' });
        const audit = (await db.query('SELECT * FROM auditoria_eventos WHERE tabla=$1', [tabla])).rows;
        assert.equal(audit.length, 5);
        assert.equal(JSON.stringify(audit).includes('Narrativa privada'), false);
        assert.equal(JSON.stringify(audit).includes('Título'), false);
        assert.ok(audit.every(x => x.ip === null && x.user_agent === null));
        assert.ok(JSON.stringify(audit).includes('activo'));
      });
      await t.test(`${tipo}: duplicados simultáneos de nombre y código devuelven un único éxito`, async () => {
        for (const bodies of [
          [{ nombre: 'Concurréncia' }, { nombre: ' concurrencia ' }],
          [{ nombre: 'Distinto A', codigo: 'ÚNICO' }, { nombre: 'Distinto B', codigo: 'unico' }],
        ]) {
          const results = await Promise.all(bodies.map(body => send(tipo, 'POST', body)));
          assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
        }
      });
      await t.test(`${tipo}: auditoría fallida revierte la escritura`, async () => {
        const failing = createCatalogosService(tipo, { repository: createCatalogosRepository(tipo, db),
          audit: async () => { throw new Error('audit unavailable'); } });
        await assert.rejects(failing.crear({ nombre: 'Debe revertirse', codigo: null, descripcion: null }, {}), /audit unavailable/);
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE nombre='Debe revertirse'`)).rows[0].n, 0);
      });
    }
    await t.test('instalación vacía: schema.sql + todas las migraciones + reejecución oficial', async () => {
      await db.query('CREATE DATABASE catalogos_bootstrap');
      const result = await migrate({ db: new Pool({ ...config, database: 'catalogos_bootstrap' }),
        logger: { log() {}, error() {} }, setExitCode() {} });
      assert.equal(result.ok, true, result.error?.message);
      const fresh = new Pool({ ...config, database: 'catalogos_bootstrap' });
      try {
        await assertSchemaCompatible(fresh);
        assert.equal((await fresh.query('SELECT count(*)::int AS n FROM cargos_personal')).rows[0].n, 8);
      } finally { await fresh.end(); }
      const again = await migrate({ db: new Pool({ ...config, database: 'catalogos_bootstrap' }),
        logger: { log() {}, error() {} }, setExitCode() {} });
      assert.equal(again.ok, true, again.error?.message);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.end();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    // Directorio generado por mkdtemp, nunca un destino configurable.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
