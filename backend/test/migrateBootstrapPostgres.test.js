const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Client, Pool } = require('pg');

const { applyMigration, discoverMigrationFiles, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');

const enabled = process.env.RUN_POSTGRES_MIGRATE_BOOTSTRAP === '1';
const postgresTest = enabled ? test : test.skip;
const baseUrl = process.env.MIGRATE_BOOTSTRAP_TEST_DATABASE_URL;
const repositoryRoot = path.resolve(__dirname, '../..');

function safeBaseUrl() {
  assert.equal(process.env.MIGRATE_BOOTSTRAP_TEMP_CLUSTER, '1');
  assert.ok(baseUrl);
  const url = new URL(baseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname));
  return url;
}

function dbUrl(name) {
  const url = safeBaseUrl();
  url.pathname = `/${name}`;
  return url.toString();
}

async function withDatabase(prefix, callback) {
  const name = `cap_migrate_${prefix}_${process.pid}_${Date.now()}`.slice(0, 60);
  assert.match(name, /^cap_migrate_[a-z0-9_]+$/);
  const admin = new Client({ connectionString: safeBaseUrl().toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  try {
    await callback(dbUrl(name));
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

async function runMigrator(url) {
  const messages = [];
  const result = await migrate({
    db: new Pool({ connectionString: url }),
    logger: {
      log: (...args) => messages.push(args.join(' ')),
      error: (...args) => messages.push(args.join(' ')),
    },
    setExitCode() {},
  });
  assert.equal(result.ok, true, result.error?.message);
  return messages;
}

async function installSchemaAt016(url) {
  const db = new Client({ connectionString: url });
  await db.connect();
  const schemaAt016 = execFileSync(
    'git',
    ['show', '7f80554d85d79945502248efa7b122b6d1d54578^:backend/src/db/schema.sql'],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );
  await db.query(schemaAt016);
  for (const migration of discoverMigrationFiles().filter(({ filename }) => filename < '017_')) {
    const sql = fs.readFileSync(migration.path, 'utf8');
    await applyMigration({ db, filename: migration.filename, sql });
  }
  return db;
}

async function assertCurrentDatabase(db) {
  await assertSchemaCompatible(db);
  const state = await db.query(`
    SELECT
      to_regclass('public.citas_prenatales') AS citas,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'citas_prenatales'
          AND column_name = 'seguimiento_inasistencia_desde_id'
      ) AS column_exists,
      EXISTS (
        SELECT 1 FROM schema_migrations WHERE filename = '017_citas_inasistencias.sql'
      ) AS migration_exists,
      to_regclass('public.ux_citas_seguimiento_inasistencia_desde') AS followup_index
  `);
  assert.deepEqual(state.rows[0], {
    citas: 'citas_prenatales',
    column_exists: true,
    migration_exists: true,
    followup_index: 'ux_citas_seguimiento_inasistencia_desde',
  });
  const constraints = await db.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.citas_prenatales'::regclass
      AND conname IN (
        'citas_prenatales_seguimiento_no_circular_check',
        'citas_prenatales_derivacion_exclusiva_check',
        'citas_prenatales_seguimiento_embarazo_fkey'
      )
  `);
  assert.equal(constraints.rowCount, 3);
}

postgresTest('instalación limpia usa schema como bootstrap y queda compatible', async () => {
  await withDatabase('clean', async (url) => {
    const messages = await runMigrator(url);
    assert.match(messages.join('\n'), /Migracion completada: 14 aplicada\(s\), 0 omitida\(s\)/);
    const db = new Pool({ connectionString: url });
    try {
      await assertCurrentDatabase(db);
    } finally {
      await db.end();
    }
  });
});

postgresTest('upgrade real 016→017 migra antes del schema y segunda ejecución es idempotente', async () => {
  await withDatabase('upgrade016', async (url) => {
    const setup = await installSchemaAt016(url);
    const before = await setup.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'citas_prenatales'
        AND column_name = 'seguimiento_inasistencia_desde_id'
    `);
    assert.equal(before.rowCount, 0);
    await setup.end();

    const firstMessages = await runMigrator(url);
    assert.match(firstMessages.join('\n'), /Migracion completada: 1 aplicada\(s\), 13 omitida\(s\)/);

    const db = new Pool({ connectionString: url });
    try {
      await assertCurrentDatabase(db);
    } finally {
      await db.end();
    }

    const secondMessages = await runMigrator(url);
    assert.match(secondMessages.join('\n'), /Migracion completada: 0 aplicada\(s\), 14 omitida\(s\)/);
  });
});
