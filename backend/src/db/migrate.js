const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DEFAULT_SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const MIGRATIONS_LOCK_NAME = 'cap_prenatal_schema_migrations';

function discoverMigrationFiles({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  readDirectory = fs.readdirSync,
} = {}) {
  return readDirectory(migrationsDir)
    .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
    .sort()
    .map((filename) => ({
      filename,
      path: path.join(migrationsDir, filename),
    }));
}

function checksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function inTransaction(db, callback) {
  await db.query('BEGIN');
  try {
    const result = await callback();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  }
}

async function applySchema({ db, sql }) {
  await inTransaction(db, () => db.query(sql));
}

async function ensureMigrationRegistry(db) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       checksum CHAR(64) NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
}

async function applyMigration({ db, filename, sql, sqlChecksum }) {
  return inTransaction(db, async () => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATIONS_LOCK_NAME]);
    const { rows = [] } = await db.query(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (rows[0]) {
      if (rows[0].checksum !== sqlChecksum) {
        throw new Error(`La migracion aplicada fue modificada: ${filename}`);
      }
      return false;
    }

    await db.query(sql);
    await db.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [filename, sqlChecksum]
    );
    return true;
  });
}

async function migrate({
  db = pool,
  readSchema = fs.readFileSync,
  readMigration = fs.readFileSync,
  readDirectory = fs.readdirSync,
  schemaPath = DEFAULT_SCHEMA_PATH,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  logger = console,
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) {
  let migrationError = null;
  let client = null;

  try {
    const schemaSql = readSchema(schemaPath, 'utf8');
    const migrationFiles = discoverMigrationFiles({ migrationsDir, readDirectory });
    client = typeof db.connect === 'function' ? await db.connect() : db;

    await applySchema({ db: client, sql: schemaSql });
    await ensureMigrationRegistry(client);

    let applied = 0;
    let skipped = 0;
    for (const migration of migrationFiles) {
      const sql = readMigration(migration.path, 'utf8');
      const wasApplied = await applyMigration({
        db: client,
        filename: migration.filename,
        sql,
        sqlChecksum: checksum(sql),
      });
      if (wasApplied) applied += 1;
      else skipped += 1;
    }

    logger.log(`Migracion completada: ${applied} aplicada(s), ${skipped} omitida(s)`);
  } catch (error) {
    migrationError = error;
    logger.error('Error en migracion:', error.message);
    if (error.rollbackError) {
      logger.error('Error al revertir migracion:', error.rollbackError.message);
    }
    setExitCode(1);
  } finally {
    if (client && client !== db && typeof client.release === 'function') client.release();
    try {
      await db.end();
    } catch (closeError) {
      logger.error('Error al cerrar el pool de PostgreSQL:', closeError.message);
      setExitCode(1);
      if (!migrationError) migrationError = closeError;
    }
  }

  return { ok: migrationError === null, error: migrationError };
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Error inesperado ejecutando la migracion:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  DEFAULT_SCHEMA_PATH,
  MIGRATION_FILE_PATTERN,
  MIGRATIONS_LOCK_NAME,
  applyMigration,
  checksum,
  discoverMigrationFiles,
  migrate,
};
