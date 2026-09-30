const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { diagnosticCode } = require('../utils/safeErrorLog');
const {
  calculateMigrationChecksum,
  isMigrationChecksumCompatible,
} = require('./migrationChecksum');

const DEFAULT_SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const MIGRATIONS_LOCK_NAME = 'cap_prenatal_schema_migrations';
// Núcleo anterior a las tablas incorporadas por upgrades numerados.
const APPLICATION_CORE_TABLES = Object.freeze([
  'roles', 'usuarios', 'permisos', 'usuario_permisos', 'pacientes', 'embarazos',
  'vacunas_paciente', 'controles_prenatales', 'morbilidad_embarazo',
  'controles_puerperio', 'planes_parto', 'fichas_riesgo_obstetrico',
]);
const CORE_IDENTITY_COLUMNS = Object.freeze({
  roles: ['id', 'nombre'], usuarios: ['id', 'rol_id'], permisos: ['id', 'codigo'],
  usuario_permisos: ['id', 'usuario_id', 'permiso_id'],
  pacientes: ['id', 'no_expediente'], embarazos: ['id', 'paciente_id', 'numero_embarazo'],
});
const DATABASE_STATES = Object.freeze({
  FRESH: 'FRESH', EXISTING: 'EXISTING', PARTIAL: 'AMBIGUOUS/PARTIAL',
});

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
  return calculateMigrationChecksum(sql);
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

async function classifyDatabase(db) {
  const { rows = [] } = await db.query(
    `SELECT n.nspname AS schema_name, c.relname AS name, c.relkind AS kind,
       ARRAY(SELECT a.attname FROM pg_catalog.pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_depend d
         WHERE d.classid = 'pg_catalog.pg_class'::regclass
           AND d.objid = c.oid AND d.deptype = 'e'
       )`
  );
  if (rows.length === 0) return DATABASE_STATES.FRESH;
  const tables = new Map(rows.filter((row) => row.schema_name === 'public'
    && ['r', 'p'].includes(row.kind)).map((row) => [row.name, row.columns]));
  const misplacedCore = rows.some((row) => APPLICATION_CORE_TABLES.includes(row.name)
    && row.schema_name !== 'public');
  const invalidRegistry = rows.some((row) => row.name === 'schema_migrations'
    && (row.schema_name !== 'public' || !['r', 'p'].includes(row.kind)
      || !['filename', 'checksum', 'applied_at'].every(name => row.columns?.includes(name))));
  return !misplacedCore && !invalidRegistry
    && APPLICATION_CORE_TABLES.every((name) => {
      const expected = CORE_IDENTITY_COLUMNS[name] || ['id', 'paciente_id', 'embarazo_id'];
      return expected.every(column => tables.get(name)?.includes(column));
    })
    ? DATABASE_STATES.EXISTING : DATABASE_STATES.PARTIAL;
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

async function applyMigration({ db, filename, sql }) {
  return inTransaction(db, async () => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATIONS_LOCK_NAME]);
    const { rows = [] } = await db.query(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (rows[0]) {
      if (!isMigrationChecksumCompatible(rows[0].checksum, sql)) {
        throw new Error(`La migracion aplicada fue modificada: ${filename}`);
      }
      return false;
    }

    await db.query(sql);
    await db.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
      [filename, calculateMigrationChecksum(sql)]
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
  // Carga diferida: schemaCompatibility importa el descubridor de este módulo.
  verifyCompatibility = (client) => require('./schemaCompatibility').assertSchemaCompatible(client),
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) {
  let migrationError = null;
  let client = null;
  let runLockAcquired = false;

  try {
    client = typeof db.connect === 'function' ? await db.connect() : db;
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATIONS_LOCK_NAME]);
    runLockAcquired = true;
    const state = await classifyDatabase(client);
    if (state === DATABASE_STATES.PARTIAL) {
      const error = new Error('Base AMBIGUOUS/PARTIAL: requiere inspeccion manual; no se ejecuta schema.sql.');
      error.code = 'MIGRATION_DATABASE_PARTIAL';
      throw error;
    }

    if (state === DATABASE_STATES.FRESH) {
      const schemaSql = readSchema(schemaPath, 'utf8');
      await applySchema({ db: client, sql: schemaSql });
    }
    await ensureMigrationRegistry(client);
    const migrationFiles = discoverMigrationFiles({ migrationsDir, readDirectory });

    let applied = 0;
    let skipped = 0;
    for (const migration of migrationFiles) {
      const sql = readMigration(migration.path, 'utf8');
      const wasApplied = await applyMigration({
        db: client,
        filename: migration.filename,
        sql,
      });
      if (wasApplied) applied += 1;
      else skipped += 1;
    }

    await verifyCompatibility(client);

    logger.log(`Migracion completada: ${applied} aplicada(s), ${skipped} omitida(s)`);
  } catch (error) {
    migrationError = error;
    logger.error('Error en migracion:', diagnosticCode(error));
    if (error.code === 'MIGRATION_DATABASE_PARTIAL') logger.error(error.message);
    if (error.rollbackError) {
      logger.error('Error al revertir migracion:', diagnosticCode(error.rollbackError));
    }
    setExitCode(1);
  } finally {
    let unlockError = null;
    if (runLockAcquired) {
      try {
        const { rows } = await client.query(
          'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', [MIGRATIONS_LOCK_NAME]
        );
        if (rows[0]?.unlocked !== true) throw new Error('No se pudo liberar el lock del migrador.');
      } catch (error) {
        unlockError = error;
        logger.error('Error al liberar lock de migracion:', diagnosticCode(error));
        setExitCode(1);
        if (!migrationError) migrationError = error;
      }
    }
    if (client && client !== db && typeof client.release === 'function') {
      // Un cliente con unlock fallido no debe volver disponible al pool.
      try {
        client.release(unlockError || undefined);
      } catch (releaseError) {
        logger.error('Error al liberar conexion de migracion:', diagnosticCode(releaseError));
        setExitCode(1);
        if (!migrationError) migrationError = releaseError;
      }
    }
    try {
      await db.end();
    } catch (closeError) {
      logger.error('Error al cerrar el pool de PostgreSQL:', diagnosticCode(closeError));
      setExitCode(1);
      if (!migrationError) migrationError = closeError;
    }
  }

  return { ok: migrationError === null, error: migrationError };
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Error inesperado ejecutando la migracion:', diagnosticCode(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  DEFAULT_SCHEMA_PATH,
  APPLICATION_CORE_TABLES,
  DATABASE_STATES,
  MIGRATION_FILE_PATTERN,
  MIGRATIONS_LOCK_NAME,
  applyMigration,
  checksum,
  discoverMigrationFiles,
  classifyDatabase,
  migrate,
};
