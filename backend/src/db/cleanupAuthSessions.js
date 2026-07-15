const authSessionsRepository = require('../repositories/authSessionsRepository');
const pool = require('./pool');

function retentionDays(env = process.env) {
  const raw = env.SESSION_RETENTION_DAYS || '30';
  if (!/^\d+$/.test(raw)) throw new Error('SESSION_RETENTION_DAYS debe ser un entero positivo');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 3650) {
    throw new Error('SESSION_RETENTION_DAYS fuera de rango');
  }
  return value;
}

async function cleanup({ repository = authSessionsRepository, clock = Date, env = process.env } = {}) {
  const days = retentionDays(env);
  const before = new Date(clock.now() - days * 24 * 60 * 60 * 1000);
  return repository.eliminarAntiguas({ before });
}

async function runCleanup({
  cleanupTask = cleanup,
  db = pool,
  logger = console,
  setExitCode = (code) => { process.exitCode = code; },
} = {}) {
  let cleanupError = null;
  try {
    const count = await cleanupTask();
    logger.log(`Sesiones antiguas eliminadas: ${count}`);
  } catch (error) {
    cleanupError = error;
    logger.error('No se pudo limpiar auth_sessions:', error.message);
    setExitCode(1);
  } finally {
    try {
      await db.end();
    } catch (closeError) {
      logger.error('No se pudo cerrar el pool de PostgreSQL:', closeError.message);
      setExitCode(1);
      if (!cleanupError) cleanupError = closeError;
    }
  }
  return { ok: cleanupError === null, error: cleanupError };
}

if (require.main === module) {
  runCleanup().catch((error) => {
    console.error('Fallo inesperado limpiando auth_sessions:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { cleanup, retentionDays, runCleanup };
