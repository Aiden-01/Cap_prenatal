const citasInasistenciasService = require('./citasInasistenciasService');
const { diagnosticCode } = require('../utils/safeErrorLog');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function createCitasMaterializacionRunner({
  materializar = () => citasInasistenciasService.materializarGlobal(),
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
  setIntervalFn = setInterval,
} = {}) {
  async function ejecutar() {
    try {
      return await materializar();
    } catch (error) {
      logger.error('[citas] Falló la materialización de inasistencias:', diagnosticCode(error));
      return null;
    }
  }

  function iniciar() {
    void ejecutar();
    const timer = setIntervalFn(() => { void ejecutar(); }, intervalMs);
    timer.unref?.();
    return timer;
  }

  return { ejecutar, iniciar };
}

module.exports = { DEFAULT_INTERVAL_MS, createCitasMaterializacionRunner };
