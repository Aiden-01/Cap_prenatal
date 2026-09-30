const assert = require('node:assert/strict');
const test = require('node:test');

const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');
const { createPdfController } = require('../src/controllers/pdfController');
const { createReportesController } = require('../src/controllers/reportesController');
const { createOperationMetrics, thresholdMs } = require('../src/utils/operationMetrics');

function recorder({ ticks = [100, 137], env = {} } = {}) {
  const calls = [];
  const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [
    level, (line) => calls.push({ level, payload: JSON.parse(line) }),
  ]));
  let index = 0;
  const metrics = createOperationMetrics({
    clock: () => ticks[index++],
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    logger,
    env,
  });
  return { metrics, calls };
}

test('registra éxito con duración y timestamp inyectados sin alterar el resultado', async () => {
  const { metrics, calls } = recorder();
  const result = await metrics.measure('pdf.riesgo', async () => 'pdf sintético');
  assert.equal(result, 'pdf sintético');
  assert.deepEqual(calls, [{
    level: 'info',
    payload: {
      event: 'operation_metric',
      operation: 'pdf.riesgo',
      duration_ms: 37,
      outcome: 'success',
      timestamp: '2026-09-29T12:00:00.000Z',
    },
  }]);
});

test('conserva el error y registra solo su categoría segura, sin datos clínicos', async () => {
  const { metrics, calls } = recorder();
  const error = new Error('CUI-CANARY nombre paciente secreto embarazo_id=424242');
  await assert.rejects(metrics.measure('pdf.combined', async () => { throw error; }), (caught) => caught === error);
  assert.equal(calls[0].level, 'error');
  assert.equal(calls[0].payload.outcome, 'error');
  assert.equal(calls[0].payload.error_category, 'internal');
  assert.doesNotMatch(JSON.stringify(calls), /CUI-CANARY|paciente secreto|424242|body|query/);
});

test('clasifica timeout externo y status HTTP sin registrar mensajes', async () => {
  const { metrics, calls } = recorder({ ticks: [0, 12, 20, 39] });
  await assert.rejects(metrics.measure('pdf.plan_parto', async () => {
    throw Object.assign(new Error('detalle privado'), { code: 'DOCUMENT_PROCESS_TIMEOUT' });
  }));
  await assert.rejects(metrics.measure('report.excel.activos', async () => {
    throw Object.assign(new Error('otro detalle privado'), { statusCode: 409 });
  }));
  assert.equal(calls[0].payload.error_category, 'timeout');
  assert.equal(calls[1].payload.error_category, 'request');
  assert.equal(calls[1].payload.status_http, 409);
  assert.doesNotMatch(JSON.stringify(calls), /detalle privado/);
});

test('avisa solo cuando la medición supera el umbral configurable', async () => {
  const { metrics, calls } = recorder({
    ticks: [0, 50, 100, 151],
    env: { OP_SLOW_REPORT_PDF_MS: '50' },
  });
  await metrics.measure('report.pdf.primer_control', async () => {});
  await metrics.measure('report.pdf.primer_control', async () => {});
  assert.equal(calls[0].level, 'info');
  assert.equal(calls[1].level, 'warn');
  assert.equal(calls[1].payload.slow, true);
  assert.equal(calls[1].payload.slow_threshold_ms, 50);
});

test('usa el umbral documentado ante configuración ausente o inválida', () => {
  for (const value of [undefined, '', 'texto', 'NaN', '0', '-1', '1e3', '0x10', '600001', '999999999999999999999']) {
    assert.equal(thresholdMs('pdf.control', { OP_SLOW_PDF_BROWSER_MS: value }), 8000);
  }
  assert.equal(thresholdMs('pdf.control', { OP_SLOW_PDF_BROWSER_MS: ' 1200 ' }), 1200);
});

test('señala degradación sostenida tras tres operaciones lentas y reinicia la racha', async () => {
  const { metrics, calls } = recorder({
    ticks: [0, 51, 100, 151, 200, 251, 300, 310, 400, 451],
    env: { OP_SLOW_REPORT_PDF_MS: '50' },
  });
  for (let index = 0; index < 5; index += 1) {
    await metrics.measure('report.pdf.activos', async () => {});
  }
  assert.deepEqual(calls.map(({ payload }) => payload.slow_streak || 0), [1, 2, 3, 0, 1]);
  assert.equal(calls[2].payload.degraded, true);
  assert.equal(calls[3].level, 'info');
});

test('separa las rachas por operación y las acota a tres', async () => {
  const { metrics, calls } = recorder({
    ticks: [0, 51, 100, 151, 200, 251, 300, 351, 400, 451, 500, 551, 600, 651],
    env: { OP_SLOW_REPORT_PDF_MS: '50' },
  });
  for (const operation of [
    'report.pdf.activos', 'report.pdf.censo_general',
    'report.pdf.activos', 'report.pdf.activos',
    'report.pdf.activos', 'report.pdf.censo_general', 'report.pdf.activos',
  ]) {
    await metrics.measure(operation, async () => {});
  }
  assert.deepEqual(calls.map(({ payload }) => payload.slow_streak), [1, 1, 2, 3, 3, 2, 3]);
  assert.equal(calls[3].payload.degraded, true);
  assert.equal(calls[4].payload.degraded, true);
});

test('rechaza nombres de operación no permitidos antes de ejecutar o registrar', async () => {
  const { metrics, calls } = recorder();
  let executed = false;
  await assert.rejects(metrics.measure('report.pdf.paciente_id=123', async () => { executed = true; }), TypeError);
  await assert.rejects(metrics.measure({
    toString: () => 'report.pdf.activos',
    pacienteId: 'PHI-CANARY',
  }, async () => { executed = true; }), TypeError);
  assert.equal(executed, false);
  assert.deepEqual(calls, []);
});

test('una falla del logger no altera éxito ni error de la operación', async () => {
  let tick = 0;
  const metrics = createOperationMetrics({
    clock: () => tick++,
    now: () => new Date('2026-09-29T12:00:00.000Z'),
    logger: { info() { throw new Error('logger'); }, warn() { throw new Error('logger'); }, error() { throw new Error('logger'); } },
    env: {},
  });
  assert.equal(await metrics.measure('pdf.riesgo', async () => 42), 42);
  const original = new Error('error original');
  await assert.rejects(metrics.measure('pdf.riesgo', async () => { throw original; }), (caught) => caught === original);
});

test('una falla del reloj inicial ejecuta la operación y conserva su resultado', async () => {
  const metrics = createOperationMetrics({ clock() { throw new Error('reloj'); } });
  assert.equal(await metrics.measure('pdf.control', async () => 42), 42);
  const original = new Error('original');
  await assert.rejects(metrics.measure('pdf.control', async () => { throw original; }), (error) => error === original);
});

test('el registro de error no impide liberar Page y BrowserContext', async () => {
  const events = [];
  const browserManager = createPuppeteerBrowserManager({
    puppeteerClient: {
      async launch() {
        return {
          connected: true,
          async createBrowserContext() {
            return {
              async newPage() { return { async close() { events.push('page'); } }; },
              async close() { events.push('context'); },
            };
          },
          async close() { events.push('browser'); },
        };
      },
    },
  });
  const { metrics, calls } = recorder();
  await assert.rejects(metrics.measure('report.pdf.activos', () => browserManager.withPage(async () => {
    throw new Error('fallo sintético');
  })));
  await browserManager.close();
  assert.deepEqual(events, ['page', 'context', 'browser']);
  assert.equal(calls[0].payload.outcome, 'error');
});

test('PDF clínico y exportación reportan nombres lógicos sin datos de la solicitud', async () => {
  const { metrics, calls } = recorder({ ticks: [0, 12, 20, 39] });
  const pdfController = createPdfController({
    metrics,
    pdfService: {
      async obtenerFichaRiesgoData() {
        return {
          paciente: { nombres: 'NOMBRE-CANARY' },
          embarazo: {},
          riesgo: { id: 55 },
        };
      },
    },
    consumePdfQuota() {},
    async renderRiskPdf() { return Buffer.from('%PDF-sintetico'); },
    async registrarEventoPrivado() {},
    sendPdfResponse() { return 'respuesta pdf'; },
  });
  const request = {
    params: { pacienteId: '1234567' },
    query: { embarazo_id: '2345678' },
    body: { secreto: 'BODY-CANARY' },
  };
  assert.equal(await pdfController.pdfRiesgoObstetrico(request, {}), 'respuesta pdf');

  const reports = createReportesController({
    metrics,
    audit: async () => {},
    service: {
      async exportReport() {
        return { config: { slug: 'activos' }, total: 1, pdf: Buffer.from('%PDF-sintetico') };
      },
    },
  });
  const response = { set() { return this; }, send() { return this; } };
  await reports.exportarActivosPdf(request, response, (error) => { throw error; });

  assert.deepEqual(calls.map(({ payload }) => payload.operation), ['pdf.riesgo', 'report.pdf.activos']);
  assert.doesNotMatch(JSON.stringify(calls), /NOMBRE-CANARY|BODY-CANARY|1234567|2345678|55/);
});
