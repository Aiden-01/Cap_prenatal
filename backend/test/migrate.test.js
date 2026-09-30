const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');

const {
  checksum,
  discoverMigrationFiles,
  classifyDatabase,
  APPLICATION_CORE_TABLES,
  DATABASE_STATES,
  migrate,
} = require('../src/db/migrate');
const {
  calculateMigrationChecksum,
  normalizeLineEndings,
} = require('../src/db/migrationChecksum');

function legacyChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}
const identityColumns = ['id', 'nombre', 'rol_id', 'codigo', 'usuario_id',
  'permiso_id', 'no_expediente', 'paciente_id', 'numero_embarazo', 'embarazo_id'];

function createHarness({ query = null, closeError = null, schemaInitialized = false, relations = null } = {}) {
  const calls = { query: [], end: 0 };
  const entries = { log: [], error: [] };
  const codes = [];
  return {
    verifyCompatibility: async () => {},
    calls,
    codes,
    entries,
    db: {
      async query(sql, params) {
        calls.query.push({ sql, params });
        if (sql.includes('FROM pg_catalog.pg_class c')) {
          return { rows: relations || (schemaInitialized ? APPLICATION_CORE_TABLES.map(name => ({
            schema_name: 'public', name, kind: 'r', columns: identityColumns,
          })) : []) };
        }
        if (sql.startsWith('SELECT pg_advisory_unlock')) {
          return { rows: [{ unlocked: true }] };
        }
        if (query) return query(sql, params);
        return { rows: [], rowCount: 0 };
      },
      async end() {
        calls.end += 1;
        if (closeError) throw closeError;
      },
    },
    logger: {
      log: (...args) => entries.log.push(args),
      error: (...args) => entries.error.push(args),
    },
    setExitCode: (code) => codes.push(code),
  };
}

test('descubre migraciones versionadas en orden e incluye 007 a 016', () => {
  const files = discoverMigrationFiles({
    migrationsDir: 'migrations-test',
    readDirectory: () => [
      '007_auth_sessions.sql',
      'README.md',
      '005_bi_views.sql',
      '006_usuarios_updated_by.sql',
      '004_permissions_audit.sql',
      '008-NO-VALIDA.sql',
    ],
  });
  assert.deepEqual(files.map(({ filename }) => filename), [
    '004_permissions_audit.sql',
    '005_bi_views.sql',
    '006_usuarios_updated_by.sql',
    '007_auth_sessions.sql',
  ]);
  assert.equal(files.at(-1).path, path.join('migrations-test', '007_auth_sessions.sql'));
  assert.equal(
    discoverMigrationFiles().some(({ filename }) => filename === '007_auth_sessions.sql'),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '008_retirar_referencias_efectuadas.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '009_vax2_reglas_vacunas.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '010_vax31_historias_parciales.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '011_vax4_influenza_aplicaciones_independientes.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '012_vax5_correccion_final.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '013_plan_parto_horas_decimales.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '014_citas_prenatales.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '015_automatizacion_despachos.sql'
    ),
    true
  );
  assert.equal(
    discoverMigrationFiles().some(
      ({ filename }) => filename === '016_riesgo_tiempo_horas_decimales.sql'
    ),
    true
  );
});

test('DB nueva aplica schema antes de registrar y ejecutar migraciones', async () => {
  const harness = createHarness();
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => 'CREATE TABLE IF NOT EXISTS auth_sessions (id UUID);',
    migrationsDir: 'migrations-test',
  });

  assert.equal(result.ok, true);
  assert.equal(harness.calls.end, 1);
  assert.deepEqual(harness.codes, []);
  const querySql = harness.calls.query.map(({ sql }) => sql);
  assert.equal(querySql[0], 'SELECT pg_advisory_lock(hashtext($1))');
  assert.match(querySql[1], /FROM pg_catalog.pg_class c/);
  assert.deepEqual(querySql.slice(2, 5), [
    'BEGIN',
    'SELECT schema_base;',
    'COMMIT',
  ]);
  assert.match(harness.calls.query[5].sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.deepEqual(querySql.slice(6), [
    'BEGIN',
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    'SELECT checksum FROM schema_migrations WHERE filename = $1',
    'CREATE TABLE IF NOT EXISTS auth_sessions (id UUID);',
    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
    'COMMIT',
    'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
  ]);
  const insert = harness.calls.query.find(({ sql }) => sql.startsWith('INSERT INTO schema_migrations'));
  assert.equal(insert.params[0], '007_auth_sessions.sql');
  assert.equal(insert.params[1].length, 64);
});

test('clasifica vacío, núcleo completo y parciales sin depender solo de pacientes', async () => {
  const classify = rows => classifyDatabase({ query: async () => ({ rows }) });
  const core = APPLICATION_CORE_TABLES.map(name => ({ schema_name: 'public', name, kind: 'r', columns: identityColumns }));
  assert.equal(await classify([]), DATABASE_STATES.FRESH);
  assert.equal(await classify(core), DATABASE_STATES.EXISTING);
  for (const name of ['pacientes', 'schema_migrations', 'usuarios', 'embarazos', 'otra_tabla']) {
    assert.equal(await classify([{ schema_name: 'public', name, kind: 'r' }]), DATABASE_STATES.PARTIAL);
  }
  assert.equal(await classify(core.slice(1)), DATABASE_STATES.PARTIAL);
  assert.equal(await classify(core.map(r => ({ ...r, columns: ['id'] }))), DATABASE_STATES.PARTIAL);
  assert.equal(await classify(core.map(r => r.name === 'pacientes' ? { ...r, kind: 'v' } : r)), DATABASE_STATES.PARTIAL);
  assert.equal(await classify([...core, { schema_name: 'otra', name: 'pacientes', kind: 'r' }]), DATABASE_STATES.PARTIAL);
  assert.equal(await classify([...core, { schema_name: 'public', name: 'schema_migrations', kind: 'v' }]), DATABASE_STATES.PARTIAL);
});

test('DB existente ejecuta migraciones sin leer ni ejecutar schema', async () => {
  const harness = createHarness({ schemaInitialized: true });
  const migrationSql = 'SELECT migration_017;';
  const result = await migrate({
    ...harness,
    readSchema: () => { throw new Error('Existing nunca debe leer schema'); },
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => migrationSql,
  });

  assert.equal(result.ok, true);
  const sql = harness.calls.query.map((call) => call.sql);
  assert.ok(sql.includes(migrationSql));
  assert.equal(sql.includes('SELECT schema_base;'), false);
  assert.match(sql[2], /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.equal(sql.at(-1), 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked');
});

test('DB existente omite migración aplicada sin DML ni schema', async () => {
  const migrationSql = 'SELECT migration_017;';
  const harness = createHarness({
    schemaInitialized: true,
    query: async (sql) => sql.startsWith('SELECT checksum FROM schema_migrations')
      ? { rows: [{ checksum: checksum(migrationSql) }] }
      : { rows: [] },
  });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => migrationSql,
  });

  assert.equal(result.ok, true);
  assert.equal(harness.calls.query.some(({ sql }) => sql === migrationSql), false);
  assert.equal(harness.calls.query.some(({ sql }) => sql === 'SELECT schema_base;'), false);
  assert.equal(harness.calls.query.some(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
});

test('DB existente no ejecuta schema posterior si una migración falla', async () => {
  const migrationError = new Error('017 falló');
  const harness = createHarness({
    schemaInitialized: true,
    query: async (sql) => {
      if (sql === 'SELECT migration_017;') throw migrationError;
      return { rows: [] };
    },
  });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => 'SELECT migration_017;',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, migrationError);
  assert.equal(harness.calls.query.some(({ sql }) => sql === 'SELECT schema_base;'), false);
});

test('fallo de compatibilidad conserva migración confirmada y libera lock', async () => {
  const schemaError = new Error('schema posterior falló');
  const harness = createHarness({
    schemaInitialized: true,
    query: async (sql) => {
      if (sql === 'SELECT schema_base;') throw schemaError;
      return { rows: [] };
    },
  });
  const result = await migrate({
    ...harness,
    verifyCompatibility: async () => { throw schemaError; },
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => 'SELECT migration_017;',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, schemaError);
  const sql = harness.calls.query.map((call) => call.sql);
  const insertIndex = sql.findIndex((value) => value.startsWith('INSERT INTO schema_migrations'));
  assert.equal(sql[insertIndex + 1], 'COMMIT');
  assert.equal(sql.at(-1), 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked');
});

test('omite una migracion ya registrada con el mismo checksum', async () => {
  const migrationSql = 'SELECT migration_007;';
  const harness = createHarness({
    query: async (sql) => sql.startsWith('SELECT checksum FROM schema_migrations')
      ? { rows: [{ checksum: checksum(migrationSql) }] }
      : { rows: [] },
  });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => migrationSql,
  });

  assert.equal(result.ok, true);
  assert.equal(harness.calls.query.some(({ sql }) => sql === migrationSql), false);
  assert.equal(harness.calls.query.some(({ sql }) => sql.startsWith('INSERT INTO schema_migrations')), false);
  assert.match(harness.entries.log[0].join(' '), /0 aplicada\(s\), 1 omitida\(s\)/);
});

test('acepta un checksum historico CRLF cuando el archivo actual usa LF', async () => {
  const currentSql = 'CREATE TABLE ejemplo (id INTEGER);\nSELECT 1;\n';
  const historicalSql = currentSql.replace(/\n/g, '\r\n');
  const harness = createHarness({
    query: async (sql) => sql.startsWith('SELECT checksum FROM schema_migrations')
      ? { rows: [{ checksum: legacyChecksum(historicalSql) }] }
      : { rows: [] },
  });

  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => currentSql,
  });

  assert.equal(result.ok, true);
  assert.equal(harness.calls.query.some(({ sql }) => sql === currentSql), false);
  assert.equal(harness.calls.query.some(({ sql }) => sql.startsWith('INSERT INTO schema_migrations')), false);
});

test('acepta un checksum historico LF cuando el archivo actual usa CRLF', async () => {
  const historicalSql = 'CREATE TABLE ejemplo (id INTEGER);\nSELECT 1;\n';
  const currentSql = historicalSql.replace(/\n/g, '\r\n');
  const harness = createHarness({
    query: async (sql) => sql.startsWith('SELECT checksum FROM schema_migrations')
      ? { rows: [{ checksum: legacyChecksum(historicalSql) }] }
      : { rows: [] },
  });

  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => currentSql,
  });

  assert.equal(result.ok, true);
  assert.equal(harness.calls.query.some(({ sql }) => sql === currentSql), false);
  assert.equal(harness.calls.query.some(({ sql }) => sql.startsWith('INSERT INTO schema_migrations')), false);
});

test('registra migraciones nuevas con checksum canonico LF', async () => {
  const migrationSql = 'CREATE TABLE ejemplo (id INTEGER);\r\nSELECT 1;\r';
  const harness = createHarness();

  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => migrationSql,
  });

  assert.equal(result.ok, true);
  const insert = harness.calls.query.find(({ sql }) => sql.startsWith('INSERT INTO schema_migrations'));
  assert.equal(insert.params[1], calculateMigrationChecksum(migrationSql));
  assert.equal(insert.params[1], legacyChecksum('CREATE TABLE ejemplo (id INTEGER);\nSELECT 1;\n'));
  assert.notEqual(insert.params[1], legacyChecksum(migrationSql));
});

test('normaliza solo CRLF y CR aislado sin alterar el resto del SQL', () => {
  const sql = 'SELECT  1;\r\n\t-- comentario con espacios  \rSELECT 2;\n';
  assert.equal(
    normalizeLineEndings(sql),
    'SELECT  1;\n\t-- comentario con espacios  \nSELECT 2;\n'
  );
});

test('rechaza una migracion aplicada cuyo archivo fue modificado y revierte', async () => {
  const previousSql = 'SELECT version_anterior;\r\n';
  const harness = createHarness({
    query: async (sql) => sql.startsWith('SELECT checksum FROM schema_migrations')
      ? { rows: [{ checksum: legacyChecksum(previousSql) }] }
      : { rows: [] },
  });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['007_auth_sessions.sql'],
    readMigration: () => 'SELECT version_nueva;',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(harness.codes, [1]);
  assert.equal(harness.calls.query.at(-2).sql, 'ROLLBACK');
  assert.equal(harness.calls.query.at(-1).sql, 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked');
  assert.match(result.error.message, /fue modificada: 007_auth_sessions\.sql/);
});

test('un error SQL revierte, cierra el pool y marca codigo 1', async () => {
  const sqlError = new Error('SELECT ficticio con password=secret-example y CUI 1234567890101');
  sqlError.code = '23505';
  sqlError.stack = 'Error: SQL ficticio\n at synthetic/internal/file.js:10:2';
  const harness = createHarness({
    query: async (sql) => {
      if (sql === 'SQL INVALIDO;') throw sqlError;
      return { rows: [] };
    },
  });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SQL INVALIDO;',
    readDirectory: () => [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, sqlError);
  assert.match(harness.calls.query[1].sql, /FROM pg_catalog.pg_class c/);
  assert.deepEqual(harness.calls.query.map(({ sql }) => sql).filter(sql => !sql.includes('FROM pg_catalog.pg_class c')), [
    'SELECT pg_advisory_lock(hashtext($1))',
    'BEGIN',
    'SQL INVALIDO;',
    'ROLLBACK',
    'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
  ]);
  assert.equal(harness.calls.end, 1);
  assert.match(harness.entries.error[0].join(' '), /Error en migracion: 23505/);
  assert.doesNotMatch(JSON.stringify(harness.entries.error), /secret-example|1234567890101|SELECT ficticio|synthetic\/internal/);
  assert.deepEqual(harness.codes, [1]);
});

test('un error leyendo schema libera lock y siempre cierra el pool', async () => {
  const readError = new Error('No se pudo leer schema.sql');
  const harness = createHarness();
  const result = await migrate({
    ...harness,
    readSchema: () => { throw readError; },
  });

  assert.equal(result.error, readError);
  assert.equal(harness.calls.query[0].sql, 'SELECT pg_advisory_lock(hashtext($1))');
  assert.equal(harness.calls.query.at(-1).sql, 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked');
  assert.equal(harness.calls.query.some(({ sql }) => sql === 'BEGIN'), false);
  assert.equal(harness.calls.end, 1);
  assert.deepEqual(harness.codes, [1]);
});

test('un error cerrando el pool despues del exito marca fallo', async () => {
  const closeError = new Error('Fallo cerrando pool');
  const harness = createHarness({ closeError });
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, closeError);
  assert.equal(harness.calls.end, 1);
  assert.deepEqual(harness.codes, [1]);
});

test('parcial falla antes de leer archivos o crear registro y libera lock', async () => {
  const harness = createHarness({ relations: [{ schema_name: 'public', name: 'pacientes', kind: 'r', columns: ['id'] }] });
  const result = await migrate({ ...harness,
    readSchema() { assert.fail('No leer schema parcial'); },
    readDirectory() { assert.fail('No descubrir archivos parcial'); } });
  assert.equal(result.error.code, 'MIGRATION_DATABASE_PARTIAL');
  assert.match(harness.entries.error.flat().join(' '), /requiere inspeccion manual/);
  assert.equal(harness.calls.query.length, 3);
  assert.equal(harness.calls.query.at(-1).sql, 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked');
  assert.equal(harness.calls.end, 1);
});

test('misma conexión cubre lock/detección/compatibilidad y unlock antes de release/end', async () => {
  const harness = createHarness({ schemaInitialized: true });
  const order = [];
  const client = { query: async (...args) => { order.push(args[0]); return harness.db.query(...args); },
    release: () => order.push('release') };
  const db = { connect: async () => client, end: async () => order.push('end') };
  const result = await migrate({ ...harness, db, readDirectory: () => [],
    readSchema() { assert.fail('Existing'); },
    verifyCompatibility: async received => { assert.equal(received, client); order.push('verify'); } });
  assert.equal(result.ok, true);
  assert.equal(order[0], 'SELECT pg_advisory_lock(hashtext($1))');
  assert.match(order[1], /FROM pg_catalog.pg_class c/);
  assert.deepEqual(order.slice(-4), ['verify', 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', 'release', 'end']);
});

test('unlock fallido descarta cliente, cierra pool y conserva fallo previo', async () => {
  const harness = createHarness({ schemaInitialized: true });
  const migrationError = new Error('migración fallida');
  const unlockError = new Error('conexión terminada');
  let releasedWith;
  const client = { query: async (...args) => {
    if (args[0].startsWith('SELECT pg_advisory_unlock')) throw unlockError;
    if (args[0] === 'FAIL;') throw migrationError;
    return harness.db.query(...args);
  }, release: error => { releasedWith = error; } };
  const result = await migrate({ ...harness,
    db: { connect: async () => client, end: harness.db.end },
    readDirectory: () => ['022_future.sql'], readMigration: () => 'FAIL;' });
  assert.equal(result.ok, false); assert.equal(result.error, migrationError);
  assert.equal(releasedWith, unlockError); assert.equal(harness.calls.end, 1);
});
