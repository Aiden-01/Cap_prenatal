const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DEFAULT_SCHEMA_PATH = path.join(__dirname, 'schema.sql');

async function migrate({
  db = pool,
  readSchema = fs.readFileSync,
  schemaPath = DEFAULT_SCHEMA_PATH,
  logger = console,
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) {
  let migrationError = null;

  try {
    const sql = readSchema(schemaPath, 'utf8');
    await db.query(sql);
    logger.log('Migracion completada exitosamente');
  } catch (error) {
    migrationError = error;
    logger.error('Error en migracion:', error.message);
    setExitCode(1);
  } finally {
    try {
      await db.end();
    } catch (closeError) {
      logger.error('Error al cerrar el pool de PostgreSQL:', closeError.message);
      setExitCode(1);
      if (!migrationError) migrationError = closeError;
    }
  }

  return {
    ok: migrationError === null,
    error: migrationError,
  };
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Error inesperado ejecutando la migracion:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_SCHEMA_PATH,
  migrate,
};
