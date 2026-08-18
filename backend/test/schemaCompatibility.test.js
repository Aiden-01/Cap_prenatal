const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  MIGRATION_COMMAND,
  REQUIRED_MIGRATIONS,
  SchemaCompatibilityError,
  assertSchemaCompatible,
  loadRequiredMigrations,
} = require('../src/db/schemaCompatibility');
const {
  calculateMigrationChecksum,
} = require('../src/db/migrationChecksum');

const REQUIRED_STATE = loadRequiredMigrations();

function legacyChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

function createRegistry({ rows = REQUIRED_STATE, registry = 'schema_migrations', queryError } = {}) {
  const calls = [];
  return {
    calls,
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('to_regclass')) return { rows: [{ migration_registry: registry }] };
        if (queryError) throw queryError;
        return { rows };
      },
    },
  };
}

function rejectsAsPending(promise, filenamePattern) {
  return assert.rejects(
    promise,
    (error) => error instanceof SchemaCompatibilityError
      && error.code === 'SCHEMA_MIGRATION_REQUIRED'
      && filenamePattern.test(error.message)
      && error.message.includes(MIGRATION_COMMAND)
  );
}

test('008 a 013 presentes con checksums correctos permiten continuar', async () => {
  const registry = createRegistry();
  await assertSchemaCompatible(registry.db);

  assert.equal(registry.calls.length, 2);
  assert.deepEqual(registry.calls[1].params, [REQUIRED_MIGRATIONS]);
});

for (const filename of REQUIRED_MIGRATIONS) {
  const version = filename.slice(0, 3);
  test(`falta ${version} y la compatibilidad falla de forma controlada`, async () => {
    const rows = REQUIRED_STATE.filter((migration) => migration.filename !== filename);
    await rejectsAsPending(
      assertSchemaCompatible(createRegistry({ rows }).db),
      new RegExp(filename.replaceAll('.', '\\.'), 'i')
    );
  });
}

test('migraciones adicionales futuras no rompen la compatibilidad', async () => {
  const rows = [
    ...REQUIRED_STATE,
    { filename: '014_cambio_futuro.sql', checksum: 'f'.repeat(64) },
  ];
  await assertSchemaCompatible(createRegistry({ rows }).db);
});

test('el orden de filas en schema_migrations no afecta la comprobacion', async () => {
  await assertSchemaCompatible(createRegistry({ rows: [...REQUIRED_STATE].reverse() }).db);
});

test('un checksum incorrecto impide el arranque', async () => {
  const rows = REQUIRED_STATE.map((migration) => (
    migration.filename === REQUIRED_MIGRATIONS[2]
      ? { ...migration, checksum: '0'.repeat(64) }
      : migration
  ));
  await rejectsAsPending(
    assertSchemaCompatible(createRegistry({ rows }).db),
    /010_vax31_historias_parciales\.sql/i
  );
});

test('schemaCompatibility acepta checksum historico CRLF con archivo actual LF', async () => {
  const filename = REQUIRED_MIGRATIONS[0];
  const currentSql = 'CREATE TABLE ejemplo (id INTEGER);\nSELECT 1;\n';
  const historicalSql = currentSql.replace(/\n/g, '\r\n');
  const requiredMigrations = [{
    filename,
    checksum: calculateMigrationChecksum(currentSql),
    sql: currentSql,
  }];
  const registry = createRegistry({
    rows: [{ filename, checksum: legacyChecksum(historicalSql) }],
  });

  await assertSchemaCompatible(registry.db, { requiredMigrations });
});

test('schemaCompatibility acepta checksum historico LF con archivo actual CRLF', async () => {
  const filename = REQUIRED_MIGRATIONS[0];
  const historicalSql = 'CREATE TABLE ejemplo (id INTEGER);\nSELECT 1;\n';
  const currentSql = historicalSql.replace(/\n/g, '\r\n');
  const requiredMigrations = [{
    filename,
    checksum: calculateMigrationChecksum(currentSql),
    sql: currentSql,
  }];
  const registry = createRegistry({
    rows: [{ filename, checksum: legacyChecksum(historicalSql) }],
  });

  await assertSchemaCompatible(registry.db, { requiredMigrations });
});

test('schemaCompatibility rechaza una modificacion SQL real aunque cambien los finales de linea', async () => {
  const filename = REQUIRED_MIGRATIONS[0];
  const historicalSql = 'CREATE TABLE ejemplo (id TEXT);\r\n';
  const currentSql = 'CREATE TABLE ejemplo (id INTEGER);\n';
  const requiredMigrations = [{
    filename,
    checksum: calculateMigrationChecksum(currentSql),
    sql: currentSql,
  }];
  const registry = createRegistry({
    rows: [{ filename, checksum: legacyChecksum(historicalSql) }],
  });

  await rejectsAsPending(
    assertSchemaCompatible(registry.db, { requiredMigrations }),
    /008_retirar_referencias_efectuadas\.sql/i
  );
});

test('loadRequiredMigrations calcula checksums canonicos LF', () => {
  const sql = 'SELECT 1;\r\nSELECT 2;\r';
  const migrations = loadRequiredMigrations({
    migrationsDir: 'migrations-test',
    readDirectory: () => [...REQUIRED_MIGRATIONS],
    readMigration: () => sql,
  });

  assert.equal(
    migrations.every(({ checksum }) => checksum === calculateMigrationChecksum(sql)),
    true
  );
});

test('un registro inexistente produce un error controlado', async () => {
  const registry = createRegistry({ registry: null });
  await assert.rejects(
    assertSchemaCompatible(registry.db),
    (error) => error.code === 'SCHEMA_MIGRATION_REQUIRED'
      && /schema_migrations/.test(error.message)
      && error.message.includes(MIGRATION_COMMAND)
  );
  assert.equal(registry.calls.length, 1);
});

test('un registro incompatible no expone URL, password ni secretos', async () => {
  const sensitive = 'DATABASE_URL=postgres://usuario:password-real@db/cap JWT_SECRET=secreto';
  const registry = createRegistry({ queryError: new Error(sensitive) });

  await assert.rejects(
    assertSchemaCompatible(registry.db),
    (error) => error.code === 'SCHEMA_MIGRATION_REQUIRED'
      && /registro schema_migrations compatible/.test(error.message)
      && !error.message.includes('DATABASE_URL')
      && !error.message.includes('password-real')
      && !error.message.includes('JWT_SECRET')
      && !error.message.includes('secreto')
  );
});

test('schemaCompatibility solo ejecuta consultas SELECT y nunca DDL o DML', async () => {
  const registry = createRegistry();
  await assertSchemaCompatible(registry.db);

  for (const { sql } of registry.calls) {
    assert.match(sql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
  }
});

test('el entrypoint valida compatibilidad antes de abrir el puerto y no migra', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/index.js'), 'utf8');
  const compatibilityCall = source.indexOf('await assertSchemaCompatible(pool)');
  const listenCall = source.indexOf('app.listen(config.port');

  assert.notEqual(compatibilityCall, -1);
  assert.notEqual(listenCall, -1);
  assert.ok(compatibilityCall < listenCall);
  assert.doesNotMatch(source, /\brequire\(['"]\.\/db\/migrate['"]\)|\bmigrate\s*\(/);
  assert.match(source, /No se pudo iniciar el servidor:', error\.message/);
});

test('la lista requerida es explicita y cada checksum procede del archivo versionado', () => {
  assert.deepEqual(REQUIRED_MIGRATIONS, [
    '008_retirar_referencias_efectuadas.sql',
    '009_vax2_reglas_vacunas.sql',
    '010_vax31_historias_parciales.sql',
    '011_vax4_influenza_aplicaciones_independientes.sql',
    '012_vax5_correccion_final.sql',
    '013_plan_parto_horas_decimales.sql',
  ]);
  assert.equal(REQUIRED_STATE.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)), true);
});
