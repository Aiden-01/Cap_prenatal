const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');

const {
  checksum,
  discoverMigrationFiles,
  isApplicationSchemaInitialized,
  migrate,
} = require('../src/db/migrate');
const {
  calculateMigrationChecksum,
  normalizeLineEndings,
} = require('../src/db/migrationChecksum');

function legacyChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function createHarness({ query = null, closeError = null, schemaInitialized = false } = {}) {
  const calls = { query: [], end: 0 };
  const entries = { log: [], error: [] };
  const codes = [];
  return {
    calls,
    codes,
    entries,
    db: {
      async query(sql, params) {
        calls.query.push({ sql, params });
        if (sql === 'SELECT to_regclass($1) AS application_schema') {
          return { rows: [{ application_schema: schemaInitialized ? 'pacientes' : null }] };
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
  assert.deepEqual(querySql.slice(0, 4), [
    'SELECT to_regclass($1) AS application_schema',
    'BEGIN',
    'SELECT schema_base;',
    'COMMIT',
  ]);
  assert.match(harness.calls.query[4].sql, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.deepEqual(querySql.slice(5), [
    'BEGIN',
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    'SELECT checksum FROM schema_migrations WHERE filename = $1',
    'CREATE TABLE IF NOT EXISTS auth_sessions (id UUID);',
    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
    'COMMIT',
  ]);
  const insert = harness.calls.query.find(({ sql }) => sql.startsWith('INSERT INTO schema_migrations'));
  assert.equal(insert.params[0], '007_auth_sessions.sql');
  assert.equal(insert.params[1].length, 64);
});

test('detecta el esquema de aplicación por una tabla núcleo, no por schema_migrations', async () => {
  const queries = [];
  const initialized = await isApplicationSchemaInitialized({
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ application_schema: 'pacientes' }] };
    },
  });

  assert.equal(initialized, true);
  assert.deepEqual(queries, [{
    sql: 'SELECT to_regclass($1) AS application_schema',
    params: ['public.pacientes'],
  }]);
});

test('DB existente ejecuta migraciones antes de schema', async () => {
  const harness = createHarness({ schemaInitialized: true });
  const migrationSql = 'SELECT migration_017;';
  const result = await migrate({
    ...harness,
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => migrationSql,
  });

  assert.equal(result.ok, true);
  const sql = harness.calls.query.map((call) => call.sql);
  assert.ok(sql.indexOf(migrationSql) < sql.indexOf('SELECT schema_base;'));
  assert.match(sql[1], /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.deepEqual(sql.slice(-3), ['BEGIN', 'SELECT schema_base;', 'COMMIT']);
});

test('DB existente omite migración aplicada por checksum y luego aplica schema', async () => {
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
  assert.equal(harness.calls.query.some(({ sql }) => sql === 'SELECT schema_base;'), true);
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

test('error de schema posterior conserva la migración confirmada y reporta fallo', async () => {
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
    readSchema: () => 'SELECT schema_base;',
    readDirectory: () => ['017_citas_inasistencias.sql'],
    readMigration: () => 'SELECT migration_017;',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, schemaError);
  const sql = harness.calls.query.map((call) => call.sql);
  const insertIndex = sql.findIndex((value) => value.startsWith('INSERT INTO schema_migrations'));
  assert.equal(sql[insertIndex + 1], 'COMMIT');
  assert.equal(sql.at(-1), 'ROLLBACK');
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
  assert.equal(harness.calls.query.at(-1).sql, 'ROLLBACK');
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
  assert.deepEqual(harness.calls.query.map(({ sql }) => sql), [
    'SELECT to_regclass($1) AS application_schema',
    'BEGIN',
    'SQL INVALIDO;',
    'ROLLBACK',
  ]);
  assert.equal(harness.calls.end, 1);
  assert.match(harness.entries.error[0].join(' '), /Error en migracion: 23505/);
  assert.doesNotMatch(JSON.stringify(harness.entries.error), /secret-example|1234567890101|SELECT ficticio|synthetic\/internal/);
  assert.deepEqual(harness.codes, [1]);
});

test('un error leyendo schema no ejecuta SQL y siempre cierra el pool', async () => {
  const readError = new Error('No se pudo leer schema.sql');
  const harness = createHarness();
  const result = await migrate({
    ...harness,
    readSchema: () => { throw readError; },
  });

  assert.equal(result.error, readError);
  assert.deepEqual(harness.calls.query, []);
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
