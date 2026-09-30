const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const test = require('node:test');
const Module = require('node:module');
const { Client, Pool } = require('pg');
const { migrate, applyMigration, discoverMigrationFiles, classifyDatabase,
  DATABASE_STATES, MIGRATIONS_LOCK_NAME, checksum } = require('../src/db/migrate');
const { assertSchemaCompatible, REQUIRED_MIGRATIONS } = require('../src/db/schemaCompatibility');

const enabled = process.env.RUN_POSTGRES_SAFE_MIGRATOR === '1';
const pgTest = enabled ? test : test.skip;
const backend = path.resolve(__dirname, '..');
const files = discoverMigrationFiles();
const clinical = ['vacunas_paciente', 'controles_prenatales', 'morbilidad_embarazo',
  'controles_puerperio', 'planes_parto', 'fichas_riesgo_obstetrico'];
const silent = { log() {}, error() {} };

function baseUrl() {
  assert.equal(process.env.SAFE_MIGRATOR_TEMP_CLUSTER, '1');
  const url = new URL(process.env.SAFE_MIGRATOR_TEST_DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  return url;
}

async function isolated(callback) {
  const name = `cap_safe_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const admin = new Client({ connectionString: baseUrl().toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = baseUrl(); url.pathname = `/${name}`;
  const db = new Client({ connectionString: url.toString() });
  try {
    await db.connect();
    await callback(db, url.toString());
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

function npmMigrate(urlString, applicationName = 'cpren53_test') {
  const url = new URL(urlString);
  url.password = 'synthetic-only-test';
  url.searchParams.set('application_name', applicationName);
  const npmCli = process.env.npm_execpath
    || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const processChild = spawn(process.execPath, [npmCli, 'run', 'db:migrate'], {
    cwd: backend, windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), DB_SSL: 'false' },
  });
  let stdout = '', stderr = '';
  processChild.stdout.on('data', chunk => { stdout += chunk; });
  processChild.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    processChild.once('error', reject);
    processChild.once('close', code => resolve({ code, stdout, stderr }));
  });
  return { processChild, done };
}

async function run(url, expectedPending) {
  const result = await npmMigrate(url).done;
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(`Migracion completada: ${expectedPending} aplicada(s), ${files.length - expectedPending} omitida(s)`));
  return result;
}

async function preVersion(db, version) {
  const baseline = execFileSync('git', ['show',
    'a921871a403100a7fad086fc562c7f09a804969e:backend/src/db/schema.sql'],
  { cwd: path.resolve(backend, '..'), encoding: 'utf8', windowsHide: true });
  await db.query('BEGIN'); await db.query(baseline); await db.query('COMMIT');
  for (const file of files.filter(f => Number(f.filename.slice(0, 3)) <= version)) {
    await applyMigration({ db, filename: file.filename, sql: fs.readFileSync(file.path, 'utf8') });
  }
}

async function fixtures(db, version) {
  await db.query(`INSERT INTO roles(id,nombre) VALUES(1,'director');
    INSERT INTO usuarios(id,nombre_completo,username,password_hash,rol_id)
      VALUES(1,'Usuario sintetico','synthetic53','synthetic-hash',1);
    UPDATE comunidades SET territorio=4,sector='B',lat=1.2345678,lng=-2.3456789 WHERE nombre='El Quetzal';
    UPDATE permisos SET descripcion='Personalizacion valida' WHERE codigo='auditoria.ver';
    INSERT INTO pacientes(id,no_expediente,nombres,apellidos,fur,fpp)
      VALUES(10,'SYN53A','Sintetica','A','2026-01-01',NULL),(20,'SYN53B','Sintetica','B',NULL,NULL);
    INSERT INTO embarazos(id,paciente_id,numero_embarazo,estado) VALUES(80,10,1,'activo'),(90,20,1,'cerrado')`);
  for (const table of clinical) {
    const extra = table === 'vacunas_paciente' ? ',tipo_vacuna,momento,fecha_dosis' : ',fecha';
    const values = table === 'vacunas_paciente'
      ? ",'influenza','previo_embarazo','2025-01-01'" : ",'2025-01-01'";
    const number = table === 'controles_prenatales' ? ',numero_control'
      : table === 'controles_puerperio' ? ',numero_atencion' : '';
    await db.query(`INSERT INTO ${table}(paciente_id,embarazo_id${extra}${number})
      VALUES(10,NULL${values}${number ? ',1' : ''})`);
  }
  // Ambos NULL son legales incluso con el índice único vigente y 021 aplicada.
  await db.query(`INSERT INTO planes_parto(paciente_id,embarazo_id,fecha,nombre_conyuge)
    VALUES(10,NULL,'2024-01-01','Plan sintetico historico distinto')`);
  if (version < 20) await db.query(`INSERT INTO permisos(codigo,descripcion,categoria)
    VALUES('pacientes.eliminar','Sintetico','pacientes');
    INSERT INTO usuario_permisos(usuario_id,permiso_id)
      SELECT 1,id FROM permisos WHERE codigo='pacientes.eliminar'`);
}

async function snapshot(db) {
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const data = {};
  for (const { tablename: table } of tables) {
    data[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t
      ORDER BY to_jsonb(t)::text`)).rows.map(r => r.row);
  }
  const constraints = (await db.query(`SELECT conrelid::regclass::text AS tabla,conname,
    convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE connamespace='public'::regnamespace ORDER BY 1,2`)).rows;
  const indexes = (await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes
    WHERE schemaname='public' ORDER BY 1,2`)).rows;
  return { data, constraints, indexes };
}

async function auditWrites(db) {
  await db.query(`CREATE SCHEMA audit53; CREATE TABLE audit53.events(tabla text,op text);
    CREATE FUNCTION audit53.capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO audit53.events VALUES(TG_TABLE_NAME,TG_OP); RETURN NULL; END $$`);
  const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'")).rows;
  for (const { tablename: table } of tables) await db.query(`CREATE TRIGGER audit53_rows
    AFTER INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit53.capture()`);
}

async function writes(db) {
  return (await db.query('SELECT tabla,op,count(*)::int AS filas FROM audit53.events GROUP BY tabla,op ORDER BY tabla,op')).rows;
}

async function assertReleased(db) {
  const acquired = await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [MIGRATIONS_LOCK_NAME]);
  assert.equal(acquired.rows[0].acquired, true);
  await db.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATIONS_LOCK_NAME]);
}

async function assertCurrent(db) {
  await assertSchemaCompatible(db);
  assert.equal((await db.query("SELECT 1 FROM permisos WHERE codigo='pacientes.eliminar'")).rowCount, 0);
  const constraints = (await db.query("SELECT convalidated FROM pg_constraint WHERE conname LIKE '%_embarazo_paciente_fkey'")).rows;
  assert.equal(constraints.length, clinical.length);
  assert.ok(constraints.every(r => r.convalidated));
  const registry = (await db.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
  assert.deepEqual(registry, files.map(f => ({ filename: f.filename, checksum: checksum(fs.readFileSync(f.path, 'utf8')) })));
}

pgTest('CPREN-53 nueva: npm bootstrap real, compatibilidad y segunda corrida con cero DML', async t => {
  await isolated(async (db, url) => {
    assert.equal(await classifyDatabase(db), DATABASE_STATES.FRESH);
    await run(url, files.length);
    await assertCurrent(db);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM comunidades')).rows[0].n, 41);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM comunidades_aliases')).rows[0].n, 18);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n, 0);
    await auditWrites(db);
    const before = await snapshot(db);
    await run(url, 0);
    assert.deepEqual(await snapshot(db), before);
    assert.deepEqual(await writes(db), []);
    await assertReleased(db);
    t.diagnostic('nueva: segunda corrida INSERT=0 UPDATE=0 DELETE=0');
  });
});

for (const version of [19, 20, 21]) pgTest(`CPREN-53 hasta ${version}: solo numeradas, preserva catálogo/NULL/planes`, async t => {
  await isolated(async (db, url) => {
    await preVersion(db, version); await fixtures(db, version); await auditWrites(db);
    const before = await snapshot(db);
    const pending = files.filter(f => Number(f.filename.slice(0, 3)) > version).length;
    await run(url, pending); await assertCurrent(db);
    const after = await snapshot(db);
    for (const [table, rows] of Object.entries(before.data)) {
      if (table === 'schema_migrations') continue;
      const expected = version < 20 && table === 'permisos'
        ? rows.filter(r => r.codigo !== 'pacientes.eliminar')
        : version < 20 && table === 'usuario_permisos' ? [] : rows;
      assert.deepEqual(after.data[table], expected, table);
    }
    const expectedWrites = version < 20 ? [
      { tabla: 'permisos', op: 'DELETE', filas: 1 },
      { tabla: 'usuario_permisos', op: 'DELETE', filas: 1 },
    ] : [];
    assert.deepEqual(await writes(db), expectedWrites);
    t.diagnostic(`hasta ${version}: ` + JSON.stringify(expectedWrites));
    await db.query('TRUNCATE audit53.events');
    for (let i = 0; i < 2; i++) {
      await run(url, 0); assert.deepEqual(await snapshot(db), after);
      assert.deepEqual(await writes(db), []);
    }
    // Regresión: una vacuna previa nueva tras 021 debe permanecer NULL.
    await db.query(`INSERT INTO vacunas_paciente(paciente_id,embarazo_id,tipo_vacuna,momento,fecha_dosis)
      VALUES(10,NULL,'influenza','previo_embarazo','2024-01-01'); TRUNCATE audit53.events`);
    const withNewNull = await snapshot(db);
    await run(url, 0); assert.deepEqual(await snapshot(db), withNewNull);
    assert.deepEqual(await writes(db), []); await assertReleased(db);
  });
});

for (const version of [19, 20]) pgTest(`CPREN-53 mismatch hasta ${version}: 021 falla, rollback, sin schema y lock libre`, async () => {
  await isolated(async (db, url) => {
    await preVersion(db, version); await fixtures(db, version);
    await db.query('UPDATE morbilidad_embarazo SET embarazo_id=90 WHERE paciente_id=10');
    const before = await snapshot(db);
    const result = await npmMigrate(url).done;
    assert.equal(result.code, 1); assert.match(result.stderr, /23503/);
    const after = await snapshot(db);
    assert.deepEqual(after.constraints, before.constraints);
    assert.deepEqual(after.indexes, before.indexes);
    for (const table of [...clinical, 'pacientes', 'embarazos', 'comunidades']) {
      assert.deepEqual(after.data[table], before.data[table], table);
    }
    assert.equal(after.data.schema_migrations.some(r => r.filename.startsWith('021_')), false);
    assert.equal(after.data.schema_migrations.some(r => r.filename.startsWith('020_')), true);
    assert.equal(after.data.permisos.some(r => r.codigo === 'pacientes.eliminar'), false);
    await assert.rejects(assertSchemaCompatible(db), { code: 'SCHEMA_MIGRATION_REQUIRED' });
    await assertReleased(db);
  });
});

for (const partial of ['pacientes', 'usuarios', 'embarazos', 'schema_migrations', 'subset']) {
  pgTest(`CPREN-53 parcial ${partial}: fail closed sin bootstrap y lock libre`, async () => {
    await isolated(async (db, url) => {
      await db.query(partial === 'subset' ? 'CREATE TABLE pacientes(id int); CREATE TABLE usuarios(id int)'
        : `CREATE TABLE ${partial}(id int)`);
      const before = await snapshot(db);
      const result = await migrate({ db: new Pool({ connectionString: url }), logger: silent,
        readSchema() { assert.fail('No bootstrap parcial'); }, setExitCode() {} });
      assert.equal(result.ok, false); assert.equal(result.error.code, 'MIGRATION_DATABASE_PARTIAL');
      assert.match(result.error.message, /inspeccion manual/);
      assert.deepEqual(await snapshot(db), before); await assertReleased(db);
    });
  });
}

pgTest('CPREN-53 excepción bootstrap revierte todo y libera lock', async () => {
  await isolated(async (db, url) => {
    const result = await migrate({ db: new Pool({ connectionString: url }), logger: silent,
      readSchema: () => 'CREATE TABLE pacientes(id int); SELECT 1/0;', setExitCode() {} });
    assert.equal(result.ok, false); assert.equal(result.error.code, '22012');
    assert.equal(await classifyDatabase(db), DATABASE_STATES.FRESH); await assertReleased(db);
  });
});

pgTest('CPREN-53 checksum incompatible falla sin cambiar registro ni negocio', async () => {
  await isolated(async (db, url) => {
    await run(url, files.length);
    await db.query('UPDATE schema_migrations SET checksum=$1 WHERE filename=$2', ['0'.repeat(64), REQUIRED_MIGRATIONS[0]]);
    await auditWrites(db); const before = await snapshot(db);
    const result = await npmMigrate(url).done;
    assert.equal(result.code, 1); assert.deepEqual(await snapshot(db), before);
    assert.deepEqual(await writes(db), []); await assertReleased(db);
    await assert.rejects(assertSchemaCompatible(db), { code: 'SCHEMA_MIGRATION_REQUIRED' });
  });
});

pgTest('CPREN-53 bootstrap conserva modelo y catálogo del migrador anterior real', async () => {
  const oldSource = execFileSync('git', ['show',
    '68bdf5194e43d78bb262760bdce6a6665cf4062d:backend/src/db/migrate.js'],
  { cwd: path.resolve(backend, '..'), encoding: 'utf8', windowsHide: true });
  const filename = path.join(backend, 'src/db/migrate.js');
  const oldModule = new Module(filename, module);
  oldModule.filename = filename;
  oldModule.paths = Module._nodeModulePaths(path.dirname(filename));
  oldModule._compile(oldSource, filename);
  await isolated(async (oldDb, oldUrl) => {
    const result = await oldModule.exports.migrate({ db: new Pool({ connectionString: oldUrl }),
      logger: silent, setExitCode() {} });
    assert.equal(result.ok, true, result.error?.message);
    const old = await snapshot(oldDb);
    await isolated(async (db, url) => {
      await run(url, files.length); const current = await snapshot(db);
      assert.deepEqual(current.constraints, old.constraints);
      assert.deepEqual(current.indexes, old.indexes);
      const withoutTimes = data => Object.fromEntries(Object.entries(data).map(([table, rows]) =>
        [table, rows.map(row => Object.fromEntries(Object.entries(row)
          .filter(([key]) => !['created_at', 'updated_at', 'applied_at'].includes(key))))]));
      assert.deepEqual(withoutTimes(current.data), withoutTimes(old.data));
      await assertReleased(db);
    });
  });
});

pgTest('CPREN-53 pérdida de conexión libera naturalmente el lock de sesión', { timeout: 30000 }, async () => {
  await isolated(async (db, url) => {
    await preVersion(db, 21);
    const blocker = new Client({ connectionString: url }); await blocker.connect();
    let worker;
    try {
      await blocker.query('BEGIN'); await blocker.query('LOCK TABLE schema_migrations IN ACCESS EXCLUSIVE MODE');
      worker = npmMigrate(url, 'cpren53_disconnect');
      let pid;
      await until(async () => {
        const { rows } = await db.query(`SELECT pid FROM pg_stat_activity
          WHERE application_name='cpren53_disconnect' AND wait_event='relation'`);
        pid = rows[0]?.pid; return Boolean(pid);
      });
      await db.query('SELECT pg_terminate_backend($1)', [pid]);
      assert.equal((await worker.done).code, 1);
      await blocker.query('COMMIT'); await assertReleased(db);
    } finally {
      await blocker.query('ROLLBACK'); await blocker.end();
      if (worker) { worker.processChild.kill(); await worker.done; }
    }
  });
});

async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('No se observó el bloqueo coordinado dentro del plazo');
}

pgTest('CPREN-53 concurrencia: B espera corrida A y observa registro actualizado', { timeout: 30000 }, async t => {
  await isolated(async (db, url) => {
    await preVersion(db, 19); await fixtures(db, 19); await auditWrites(db);
    const blocker = new Client({ connectionString: url }); await blocker.connect();
    let a, b;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE schema_migrations IN ACCESS EXCLUSIVE MODE');
      a = npmMigrate(url, 'cpren53_A');
      await until(async () => (await db.query(`SELECT 1 FROM pg_stat_activity
        WHERE application_name='cpren53_A' AND wait_event_type='Lock' AND wait_event='relation'`)).rowCount === 1);
      b = npmMigrate(url, 'cpren53_B');
      await until(async () => (await db.query(`SELECT 1 FROM pg_stat_activity
        WHERE application_name='cpren53_B' AND wait_event_type='Lock' AND wait_event='advisory'`)).rowCount === 1);
      assert.deepEqual(await writes(db), []);
      assert.equal((await db.query("SELECT 1 FROM permisos WHERE codigo='pacientes.eliminar'")).rowCount, 1);
      // La tabla registro está bloqueada externamente: no se consulta hasta soltarla.
      await blocker.query('COMMIT');
      const [ar, br] = await Promise.all([a.done, b.done]);
      assert.equal(ar.code, 0, ar.stderr); assert.equal(br.code, 0, br.stderr);
      assert.match(br.stdout, new RegExp(`0 aplicada\\(s\\), ${files.length} omitida\\(s\\)`));
      await assertCurrent(db); await assertReleased(db);
      assert.deepEqual(await writes(db), [
        { tabla: 'permisos', op: 'DELETE', filas: 1 },
        { tabla: 'usuario_permisos', op: 'DELETE', filas: 1 },
      ]);
      t.diagnostic('A y B serializados: B esperando advisory; solo 2 DELETE esperados de 020 en total');
    } finally {
      await blocker.query('ROLLBACK'); await blocker.end();
      if (a) { a.processChild.kill(); await a.done; }
      if (b) { b.processChild.kill(); await b.done; }
    }
  });
});
