const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');

const {
  createAutomatizacionesController,
  dataQualityAuditEvent,
} = require('../src/controllers/automatizacionesController');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const { createAutomatizacionesRouter } = require('../src/routes/automatizaciones');
const {
  DATA_QUALITY_CATEGORY_CATALOG,
  createAutomatizacionesService,
  normalizeDataQualityCategories,
  tokenHash,
} = require('../src/services/automatizacionesService');

const NOW = new Date('2026-08-31T15:00:00.000Z');
const PERIOD = Object.freeze({ desde: '2026-08-24', hasta: '2026-08-30' });
const CURRENT_KEY = 'quality_Automation_Key_0123456789abcdefghi';
const TOKEN = 'Q'.repeat(43);

function qualityRows(overrides = {}) {
  return DATA_QUALITY_CATEGORY_CATALOG.map(({ code }) => ({
    codigo: code,
    total: overrides[code] || 0,
  }));
}

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function createMemoryRepository(initialRows = qualityRows()) {
  let rows = initialRows;
  let dispatch = null;
  let nextId = 1;
  return {
    async enTransaccion(callback) {
      return callback({ syntheticTransaction: true });
    },
    async obtenerResumenCalidadDatos() {
      return copy(rows);
    },
    async obtenerDespacho() {
      return copy(dispatch);
    },
    async crearDespacho({ tipo, desde, hasta, estado, tokenHash: hash = null, total }) {
      if (dispatch) return null;
      dispatch = {
        id: nextId++,
        tipo,
        periodo_desde: desde,
        periodo_hasta: hasta,
        estado,
        token_hash: hash,
        total_registros: total,
        numero_intento: 1,
      };
      return copy(dispatch);
    },
    async renovarDespacho({ despachoId, tokenHash: hash, total }) {
      if (dispatch?.id !== despachoId || dispatch.estado !== 'reintento_autorizado') return null;
      dispatch = {
        ...dispatch,
        estado: 'reservado',
        token_hash: hash,
        total_registros: total,
        numero_intento: dispatch.numero_intento + 1,
      };
      return copy(dispatch);
    },
    async marcarDespachoSinResultados({ despachoId }) {
      if (dispatch?.id !== despachoId || dispatch.estado !== 'reintento_autorizado') return null;
      dispatch = { ...dispatch, estado: 'sin_resultados', token_hash: null, total_registros: 0 };
      return copy(dispatch);
    },
    async obtenerDespachoPorTokenHash({ tipo, tokenHash: hash }) {
      return dispatch?.tipo === tipo && dispatch.token_hash === hash ? copy(dispatch) : null;
    },
    async marcarDespachoEnviado({ despachoId }) {
      if (dispatch?.id !== despachoId || !['reservado', 'enviado'].includes(dispatch.estado)) {
        return null;
      }
      dispatch = { ...dispatch, estado: 'enviado' };
      return copy(dispatch);
    },
    async resolverDespacho({ despachoId, estado, motivoCodigo }) {
      if (dispatch?.id !== despachoId || dispatch.estado !== 'reservado') return null;
      dispatch = {
        ...dispatch,
        estado,
        token_hash: estado === 'reintento_autorizado' ? null : dispatch.token_hash,
        motivo_resolucion: motivoCodigo,
      };
      return copy(dispatch);
    },
    setRows(nextRows) {
      rows = nextRows;
    },
    state() {
      return copy(dispatch);
    },
  };
}

function createService(repository) {
  return createAutomatizacionesService({
    repository,
    now: () => new Date(NOW),
    createDispatchToken: () => TOKEN,
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function withServer(service, callback) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/automatizaciones', createAutomatizacionesRouter({
    config: {
      active: true,
      allowedCidrs: ['127.0.0.1/32'],
      currentHash: sha256(CURRENT_KEY),
      nextHash: null,
      rateLimitMax: 100,
      rateLimitWindowMs: 60000,
    },
    controllers: createAutomatizacionesController({ service, audit: async () => true }),
    resolveOrigin: () => '127.0.0.1',
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

test('consulta SQL aplica solo invariantes objetivas y respeta vacunas previas al embarazo', async () => {
  let captured;
  const repository = createAutomatizacionesRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: qualityRows() };
    },
  });
  await repository.obtenerResumenCalidadDatos();
  assert.equal(captured.params, undefined);
  assert.match(captured.sql, /BTRIM\(no_expediente\)/);
  assert.match(captured.sql, /controles_prenatales[\s\S]*embarazo_id IS NULL/);
  assert.match(captured.sql, /momento IN \('durante_embarazo', 'postparto_aborto'\)/);
  assert.match(captured.sql, /cp\.paciente_id <> e\.paciente_id/);
  assert.match(captured.sql, /estado IN \('activo', 'puerperio'\)[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(captured.sql, /America\/Guatemala/);
  assert.match(captured.sql, /cp\.estado = 'programada'[\s\S]*e\.estado = 'cerrado'/);
  assert.doesNotMatch(captured.sql, /vih_resultado|diagnostico|laboratorio|riesgo_obstetrico.*tiene_riesgo/i);
});

test('normaliza una o varias categorias y descarta conteos en cero', () => {
  const categories = normalizeDataQualityCategories(qualityRows({
    pregnancy_link_missing: 2,
    future_prenatal_control: 3,
  }));
  assert.deepEqual(categories.map(({ code, count }) => ({ code, count })), [
    { code: 'pregnancy_link_missing', count: 2 },
    { code: 'future_prenatal_control', count: 3 },
  ]);
  assert.ok(categories.every(({ label, description }) => label && description));
});

test('rechaza catalogos incompletos, duplicados o con conteos invalidos', () => {
  assert.throws(() => normalizeDataQualityCategories(qualityRows().slice(1)));
  assert.throws(() => normalizeDataQualityCategories([
    ...qualityRows(),
    { codigo: 'future_prenatal_control', total: 1 },
  ]));
  assert.throws(() => normalizeDataQualityCategories(qualityRows({
    future_prenatal_control: -1,
  })));
});

test('cero incidencias registra sin_resultados y la segunda ejecucion no envia', async () => {
  const repository = createMemoryRepository();
  const service = createService(repository);
  const first = await service.prepararWatchdogCalidadDatos();
  const second = await service.prepararWatchdogCalidadDatos();
  assert.deepEqual(first.range, { from: PERIOD.desde, to: PERIOD.hasta });
  assert.equal(first.as_of, '2026-08-31');
  assert.equal(first.dispatch.status, 'no_results');
  assert.equal(first.total, 0);
  assert.deepEqual(first.categories, []);
  assert.equal(second.dispatch.status, 'already_processed');
  assert.equal(repository.state().estado, 'sin_resultados');
});

test('reserva un resumen agregado con multiples categorias y sin datos sensibles', async () => {
  const repository = createMemoryRepository(qualityRows({
    patient_required_identity_missing: 1,
    pregnancy_patient_mismatch: 2,
    scheduled_appointment_closed_pregnancy: 4,
  }));
  const service = createService(repository);
  const prepared = await service.prepararWatchdogCalidadDatos();
  assert.equal(prepared.dispatch.status, 'ready');
  assert.equal(prepared.dispatch.token, TOKEN);
  assert.equal(prepared.total, 7);
  assert.equal(prepared.categories.length, 3);
  assert.equal(repository.state().total_registros, 7);
  assert.equal(repository.state().token_hash, tokenHash(TOKEN));
  assert.doesNotMatch(
    JSON.stringify(prepared).toLowerCase(),
    /cui|no_expediente|telefono|direccion|vih|laboratorio|diagnostico|paciente_id|embarazo_id/
  );
});

test('confirmacion es idempotente y una nueva preparacion queda already_processed', async () => {
  const repository = createMemoryRepository(qualityRows({ pregnancy_link_missing: 1 }));
  const service = createService(repository);
  const prepared = await service.prepararWatchdogCalidadDatos();
  const first = await service.confirmarWatchdogCalidadDatos({ dispatchToken: prepared.dispatch.token });
  const repeated = await service.confirmarWatchdogCalidadDatos({ dispatchToken: prepared.dispatch.token });
  const next = await service.prepararWatchdogCalidadDatos();
  assert.deepEqual(first.dispatch, { status: 'sent', idempotent: false });
  assert.deepEqual(repeated.dispatch, { status: 'sent', idempotent: true });
  assert.equal(next.dispatch.status, 'already_processed');
});

test('resolucion manual solo reabre una reserva con evidencia de no entrega', async () => {
  const repository = createMemoryRepository(qualityRows({ pregnancy_link_missing: 1 }));
  const service = createService(repository);
  await service.prepararWatchdogCalidadDatos();
  await assert.rejects(
    service.resolverWatchdogCalidadDatos({
      ...PERIOD,
      resolucion: 'reintentar',
      motivoCodigo: 'entrega_confirmada_en_resend',
    }),
    (error) => error.code === 'AUTOMATION_INVALID_DISPATCH_RESOLUTION'
  );
  const resolved = await service.resolverWatchdogCalidadDatos({
    ...PERIOD,
    resolucion: 'reintentar',
    motivoCodigo: 'entrega_no_realizada_confirmada',
  });
  assert.equal(resolved.dispatch.status, 'reintento_autorizado');
});

test('rutas de calidad exigen M2M y validan confirmacion y resolucion', async () => {
  const service = createService(createMemoryRepository(qualityRows({ pregnancy_link_missing: 1 })));
  await withServer(service, async (baseUrl) => {
    const prepareUrl = `${baseUrl}/api/automatizaciones/v1/calidad-datos/preparar`;
    assert.equal((await fetch(prepareUrl, { method: 'POST' })).status, 401);
    const preparedResponse = await fetch(prepareUrl, {
      method: 'POST',
      headers: { 'X-CAP-Automation-Key': CURRENT_KEY },
    });
    assert.equal(preparedResponse.status, 200);
    const prepared = await preparedResponse.json();

    const confirmResponse = await fetch(
      `${baseUrl}/api/automatizaciones/v1/calidad-datos/confirmar`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CAP-Automation-Key': CURRENT_KEY,
        },
        body: JSON.stringify({ dispatch_token: prepared.dispatch.token }),
      }
    );
    assert.equal(confirmResponse.status, 200);
    assert.equal((await confirmResponse.json()).dispatch.status, 'sent');

    const invalidResolution = await fetch(
      `${baseUrl}/api/automatizaciones/v1/calidad-datos/resolver`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CAP-Automation-Key': CURRENT_KEY,
        },
        body: JSON.stringify({
          desde: PERIOD.desde,
          hasta: PERIOD.hasta,
          resolucion: 'reintentar',
          confirmacion: 'TEXTO_INCORRECTO',
          motivo_codigo: 'entrega_no_realizada_confirmada',
        }),
      }
    );
    assert.equal(invalidResolution.status, 400);
  });
});

test('error inesperado del repositorio produce 500 controlado', async () => {
  const repository = createMemoryRepository();
  repository.obtenerResumenCalidadDatos = async () => { throw new Error('detalle interno'); };
  await withServer(createService(repository), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/automatizaciones/v1/calidad-datos/preparar`, {
      method: 'POST',
      headers: { 'X-CAP-Automation-Key': CURRENT_KEY },
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: 'No se pudo preparar la revision de calidad de datos',
      code: 'AUTOMATION_INTERNAL_ERROR',
    });
  });
});

test('auditoria conserva solo conteo, periodo y codigos controlados', () => {
  const event = dataQualityAuditEvent({
    total: 7,
    range: { from: PERIOD.desde, to: PERIOD.hasta },
    dispatch: { status: 'ready' },
  });
  assert.deepEqual(event.metadata, {
    tipo_automatizacion: 'weekly_data_quality_watchdog',
    resultado: 'exitoso',
    motivo_codigo: 'ready',
    cantidad_incidencias: 7,
    fecha_desde: PERIOD.desde,
    fecha_hasta: PERIOD.hasta,
  });
  assert.doesNotMatch(
    JSON.stringify(event),
    /cui|no_expediente|nombres|apellidos|telefono|direccion|embarazo_id|vih|laboratorio/i
  );
});
