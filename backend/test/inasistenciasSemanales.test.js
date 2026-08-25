const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const express = require('express');

const { createAutomatizacionesController } = require('../src/controllers/automatizacionesController');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const { createAutomatizacionesRouter } = require('../src/routes/automatizaciones');
const {
  createAutomatizacionesService,
  previousCalendarWeek,
  tokenHash,
  validateCompletedCalendarWeek,
} = require('../src/services/automatizacionesService');

const NOW = new Date('2026-08-24T14:00:00.000Z');
const CUTOVER = new Date('2026-08-01T16:30:00.000Z');
const CURRENT_KEY = 'weekly_Automation_Key_0123456789abcdefgh';

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function missedRows() {
  return [{
    fecha_cita: '2026-08-19',
    primer_nombre: 'Ana',
    primer_apellido: 'López',
    telefono: '5555-0101',
    comunidad: 'El Chal',
  }];
}

function createMemoryRepository({ rows = missedRows() } = {}) {
  let dispatch = null;
  let sourceRows = rows;
  let nextId = 1;

  function copy(value) {
    return value ? structuredClone(value) : value;
  }

  return {
    async enTransaccion(callback) {
      return callback({ syntheticTransaction: true });
    },
    async obtenerCorteConfiableCitas() {
      return CUTOVER;
    },
    async obtenerInasistenciasSemanales() {
      return copy(sourceRows);
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
      dispatch = {
        ...dispatch,
        estado: 'sin_resultados',
        token_hash: null,
        total_registros: 0,
      };
      return copy(dispatch);
    },
    async obtenerDespachoPorTokenHash({ tokenHash: hash }) {
      return dispatch?.token_hash === hash ? copy(dispatch) : null;
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
    state() {
      return copy(dispatch);
    },
    setRows(nextRows) {
      sourceRows = nextRows;
    },
  };
}

function serviceFor(repository, createDispatchToken = () => 'a'.repeat(43)) {
  return createAutomatizacionesService({
    repository,
    now: () => new Date(NOW),
    createDispatchToken,
  });
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function automationApp(service) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  const controllers = createAutomatizacionesController({
    service,
    audit: async () => true,
  });
  app.use('/api/automatizaciones', createAutomatizacionesRouter({
    config: {
      active: true,
      allowedCidrs: ['127.0.0.1/32'],
      currentHash: sha256(CURRENT_KEY),
      nextHash: null,
      rateLimitMax: 100,
      rateLimitWindowMs: 60000,
    },
    controllers,
    resolveOrigin: () => '127.0.0.1',
  }));
  app.use(errorHandler);
  return app;
}

function headers(extra = {}) {
  return {
    'X-CAP-Automation-Key': CURRENT_KEY,
    ...extra,
  };
}

test('calcula exactamente el lunes-domingo anterior en America/Guatemala', () => {
  assert.deepEqual(previousCalendarWeek(NOW), {
    desde: '2026-08-17',
    hasta: '2026-08-23',
  });
  assert.deepEqual(previousCalendarWeek(new Date('2026-08-30T23:30:00.000Z')), {
    desde: '2026-08-17',
    hasta: '2026-08-23',
  });
});

test('solo acepta una semana calendario anterior completa', () => {
  assert.deepEqual(
    validateCompletedCalendarWeek(
      { desde: '2026-08-17', hasta: '2026-08-23' },
      { now: NOW }
    ),
    { desde: '2026-08-17', hasta: '2026-08-23' }
  );
  for (const period of [
    { desde: '2026-08-18', hasta: '2026-08-24' },
    { desde: '2026-08-17', hasta: '2026-08-22' },
    { desde: '2026-08-24', hasta: '2026-08-30' },
  ]) {
    assert.throws(
      () => validateCompletedCalendarWeek(period, { now: NOW }),
      (error) => error.code === 'AUTOMATION_INVALID_PERIOD'
    );
  }
});

test('preview entrega contrato minimo, fecha operativa y corte confiable', async () => {
  const result = await serviceFor(createMemoryRepository()).consultarInasistenciasSemanales({
    desde: '2026-08-17',
    hasta: '2026-08-23',
  });

  assert.deepEqual(Object.keys(result).sort(), [
    'appointments', 'cutoff_at', 'dispatch', 'generated_at', 'range',
    'report_type', 'schema_version', 'timezone', 'total',
  ]);
  assert.equal(result.total, 1);
  assert.deepEqual(result.dispatch, { status: 'preview' });
  assert.deepEqual(result.appointments[0], {
    date: '2026-08-19',
    first_name: 'Ana',
    last_name: 'López',
    phone: '5555-0101',
    community: 'El Chal',
  });
  assert.equal(result.cutoff_at, CUTOVER.toISOString());
  assert.doesNotMatch(JSON.stringify(result), /cui|expediente|diagnostico|embarazo_id|paciente_id/i);
});

test('consulta SQL aplica periodo, corte, estado programada, sin cumplimiento y embarazo activo', async () => {
  const calls = [];
  const repository = createAutomatizacionesRepository({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  });

  await repository.obtenerInasistenciasSemanales({
    desde: '2026-08-17',
    hasta: '2026-08-23',
    corteAt: CUTOVER.toISOString(),
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [
    '2026-08-17',
    '2026-08-23',
    CUTOVER.toISOString(),
  ]);
  assert.match(calls[0].sql, /cp\.fecha_programada BETWEEN \$1::date AND \$2::date/);
  assert.match(calls[0].sql, /cp\.estado = 'programada'/);
  assert.match(calls[0].sql, /cp\.control_cumplimiento_id IS NULL/);
  assert.match(calls[0].sql, /cp\.created_at >= \$3::timestamptz/);
  assert.match(calls[0].sql, /e\.estado = 'activo'/);
  assert.doesNotMatch(calls[0].sql, /cita_siguiente/);
});

test('cero resultados se registra una vez y nunca prepara correo', async () => {
  const repository = createMemoryRepository({ rows: [] });
  const service = serviceFor(repository);

  const first = await service.prepararDespachoInasistencias();
  const second = await service.prepararDespachoInasistencias();

  assert.deepEqual(first.dispatch, { status: 'no_results' });
  assert.equal(first.total, 0);
  assert.deepEqual(second.dispatch, { status: 'already_processed' });
  assert.equal(repository.state().estado, 'sin_resultados');
});

test('reserva, confirma y bloquea el reenvio del mismo periodo', async () => {
  const repository = createMemoryRepository();
  const service = serviceFor(repository);

  const prepared = await service.prepararDespachoInasistencias();
  assert.equal(prepared.dispatch.status, 'ready');
  assert.equal(prepared.dispatch.token, 'a'.repeat(43));
  assert.equal(repository.state().token_hash, tokenHash(prepared.dispatch.token));

  const confirmation = await service.confirmarDespachoInasistencias({
    dispatchToken: prepared.dispatch.token,
  });
  assert.deepEqual(confirmation.dispatch, { status: 'sent', idempotent: false });

  const repeatedConfirmation = await service.confirmarDespachoInasistencias({
    dispatchToken: prepared.dispatch.token,
  });
  assert.deepEqual(repeatedConfirmation.dispatch, { status: 'sent', idempotent: true });

  const second = await service.prepararDespachoInasistencias();
  assert.deepEqual(second.dispatch, { status: 'already_processed' });
  assert.equal(second.total, 0);
});

test('una reserva sin confirmacion bloquea doble trigger y timeout ambiguo', async () => {
  const service = serviceFor(createMemoryRepository());
  await service.prepararDespachoInasistencias();
  await assert.rejects(
    service.prepararDespachoInasistencias(),
    (error) => error.statusCode === 409 && error.code === 'AUTOMATION_DISPATCH_UNCERTAIN'
  );
});

test('replay exige resolucion manual controlada y emite un token nuevo', async () => {
  const repository = createMemoryRepository();
  let tokenIndex = 0;
  const tokens = ['a'.repeat(43), 'b'.repeat(43)];
  const service = serviceFor(repository, () => tokens[tokenIndex++]);
  await service.prepararDespachoInasistencias();

  await assert.rejects(
    service.resolverDespachoInasistencias({
      desde: '2026-08-17',
      hasta: '2026-08-23',
      resolucion: 'reintentar',
      motivoCodigo: 'entrega_confirmada_en_resend',
    }),
    (error) => error.code === 'AUTOMATION_INVALID_DISPATCH_RESOLUTION'
  );

  const resolution = await service.resolverDespachoInasistencias({
    desde: '2026-08-17',
    hasta: '2026-08-23',
    resolucion: 'reintentar',
    motivoCodigo: 'entrega_no_realizada_confirmada',
  });
  assert.equal(resolution.dispatch.status, 'reintento_autorizado');

  const replay = await service.prepararDespachoInasistencias();
  assert.equal(replay.dispatch.token, 'b'.repeat(43));
  assert.equal(repository.state().numero_intento, 2);
});

test('rutas semanales exigen M2M, validan periodo y no aceptan campos extra', async () => {
  const app = automationApp(serviceFor(createMemoryRepository()));
  await withServer(app, async (baseUrl) => {
    const endpoint = `${baseUrl}/api/automatizaciones/v1/inasistencias`;
    const unauthorized = await fetch(`${endpoint}?desde=2026-08-17&hasta=2026-08-23`);
    assert.equal(unauthorized.status, 401);

    const invalid = await fetch(
      `${endpoint}?desde=2026-08-18&hasta=2026-08-24`,
      { headers: headers() }
    );
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'AUTOMATION_INVALID_PERIOD');

    const extra = await fetch(
      `${endpoint}?desde=2026-08-17&hasta=2026-08-23&paciente_id=1`,
      { headers: headers() }
    );
    assert.equal(extra.status, 400);

    const valid = await fetch(
      `${endpoint}?desde=2026-08-17&hasta=2026-08-23`,
      { headers: headers() }
    );
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).total, 1);
  });
});

test('resolver HTTP exige confirmacion literal y motivo coherente', async () => {
  const repository = createMemoryRepository();
  const service = serviceFor(repository);
  await service.prepararDespachoInasistencias();
  const app = automationApp(service);

  await withServer(app, async (baseUrl) => {
    const endpoint = `${baseUrl}/api/automatizaciones/v1/inasistencias/resolver`;
    const invalid = await fetch(endpoint, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        desde: '2026-08-17',
        hasta: '2026-08-23',
        resolucion: 'reintentar',
        confirmacion: 'confirmar',
        motivo_codigo: 'entrega_no_realizada_confirmada',
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'AUTOMATION_INVALID_DISPATCH_RESOLUTION');

    const valid = await fetch(endpoint, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        desde: '2026-08-17',
        hasta: '2026-08-23',
        resolucion: 'reintentar',
        confirmacion: 'REINTENTAR_INASISTENCIAS_SEMANALES',
        motivo_codigo: 'entrega_no_realizada_confirmada',
      }),
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).dispatch.status, 'reintento_autorizado');
  });
});

test('entrypoint procesa JSON antes de entregar los POST de automatizacion al router', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/index.js'), 'utf8');
  assert.match(
    source,
    /app\.use\(\s*['"]\/api\/automatizaciones['"],\s*express\.json\(\{ limit: config\.jsonBodyLimit \}\),\s*automatizacionesRoutes\s*\)/
  );
});
