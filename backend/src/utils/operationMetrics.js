const { performance } = require('node:perf_hooks');

const PDF_OPERATIONS = new Set([
  'pdf.control', 'pdf.expediente', 'pdf.riesgo', 'pdf.plan_parto', 'pdf.combined',
]);
const REPORT_TYPES = new Set([
  'activos', 'primer_control', 'controles_prenatales', 'proximas_parto',
  'sin_control', 'riesgo', 'comunidades', 'censo_general', 'censo_primer_control',
  'estadisticas',
]);

// Conservative local baselines from CPREN-22: report PDF <=3.44 s at 1000 rows,
// Excel <=0.15 s at 1000 rows, pdf-lib <=0.16 s, external PDF <=8.92 s cold.
// These are warnings, not request deadlines. Operators can tune them by environment.
const DEFAULT_SLOW_MS = Object.freeze({
  PDF_BROWSER: 8000,
  PDF_LIB: 2000,
  PDF_EXTERNAL: 20000,
  REPORT_PDF: 8000,
  REPORT_EXCEL: 3000,
  REPORT_QUERY: 8000,
});

function isAllowedOperation(operation) {
  if (typeof operation !== 'string') return false;
  if (PDF_OPERATIONS.has(operation)) return true;
  const match = /^report\.(pdf|excel|query)\.([a-z_]+)$/.exec(operation);
  return Boolean(match && REPORT_TYPES.has(match[2]));
}

function thresholdKey(operation) {
  if (operation === 'pdf.control') return 'PDF_BROWSER';
  if (operation === 'pdf.expediente' || operation === 'pdf.riesgo') return 'PDF_LIB';
  if (operation === 'pdf.plan_parto' || operation === 'pdf.combined') return 'PDF_EXTERNAL';
  if (operation.startsWith('report.pdf.')) return 'REPORT_PDF';
  if (operation.startsWith('report.excel.')) return 'REPORT_EXCEL';
  return 'REPORT_QUERY';
}

function thresholdMs(operation, env) {
  const key = thresholdKey(operation);
  const raw = env[`OP_SLOW_${key}_MS`];
  if (raw === undefined || raw === null || raw === '') return DEFAULT_SLOW_MS[key];
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return DEFAULT_SLOW_MS[key];
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 600_000
    ? parsed : DEFAULT_SLOW_MS[key];
}

function errorCategory(error) {
  if (['DOCUMENT_PROCESS_TIMEOUT', 'ETIMEDOUT'].includes(error?.code)) return 'timeout';
  if (error?.name === 'DocumentProcessError' || error?.code === 'DOCUMENT_PROCESS_FAILED') {
    return 'external_process';
  }
  const status = Number(error?.statusCode ?? error?.status);
  if (status >= 400 && status < 500) return 'request';
  if (typeof error?.code === 'string' && /^[0-9][0-9A-Z]{4}$/.test(error.code)) return 'database';
  return 'internal';
}

function createOperationMetrics({
  clock = () => performance.now(),
  now = () => new Date(),
  logger = console,
  env = process.env,
} = {}) {
  const slowStreaks = new Map();

  async function measure(operation, work) {
    if (!isAllowedOperation(operation) || typeof work !== 'function') {
      throw new TypeError('Metrica de operacion invalida');
    }

    let started;
    try {
      started = clock();
    } catch {
      return work();
    }
    let error = null;
    let failed = false;
    try {
      return await work();
    } catch (caught) {
      error = caught;
      failed = true;
      throw caught;
    } finally {
      try {
        const durationMs = Math.max(0, Math.round(clock() - started));
        const threshold = thresholdMs(operation, env);
        const record = {
          event: 'operation_metric',
          operation,
          duration_ms: durationMs,
          outcome: failed ? 'error' : 'success',
          timestamp: now().toISOString(),
        };
        let level = 'info';
        if (failed) {
          slowStreaks.delete(operation);
          level = 'error';
          record.error_category = errorCategory(error);
          const status = Number(error?.statusCode ?? error?.status);
          if (Number.isInteger(status) && status >= 400 && status <= 599) record.status_http = status;
        } else if (durationMs > threshold) {
          const streak = Math.min(3, (slowStreaks.get(operation) || 0) + 1);
          slowStreaks.set(operation, streak);
          level = 'warn';
          record.slow = true;
          record.slow_threshold_ms = threshold;
          record.slow_streak = streak;
          if (streak >= 3) record.degraded = true;
        } else {
          slowStreaks.delete(operation);
        }
        logger[level](JSON.stringify(record));
      } catch {
        // La observabilidad nunca cambia el resultado de la operación.
      }
    }
  }

  return { measure };
}

const operationMetrics = createOperationMetrics();

module.exports = {
  DEFAULT_SLOW_MS,
  createOperationMetrics,
  errorCategory,
  isAllowedOperation,
  operationMetrics,
  thresholdMs,
};
