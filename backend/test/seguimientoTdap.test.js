const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');
const ExcelJS = require('exceljs');

const { createAutomatizacionesController } = require('../src/controllers/automatizacionesController');
const { gestationalAgeAtDate } = require('../src/domain/vacunasRules');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const { createAutomatizacionesRouter } = require('../src/routes/automatizaciones');
const {
  classifyTdapCandidates,
  createAutomatizacionesService,
  createTdapDispatchToken,
  tdapSnapshotHash,
  tokenHash,
} = require('../src/services/automatizacionesService');

const NOW = new Date('2026-08-31T14:00:00.000Z');
const PERIOD = Object.freeze({ desde: '2026-08-24', hasta: '2026-08-30' });
const CURRENT_KEY = 'tdap_Automation_Key_0123456789abcdefghij';

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function furForThreshold(thresholdDate) {
  return shiftDate(thresholdDate, -140);
}

function candidate({
  threshold = '2026-08-24',
  municipio = ' El Chal ',
  first = 'Ana',
  last = 'López',
  community = 'Comunidad Sintética',
  fur = furForThreshold(threshold),
} = {}) {
  return {
    fur,
    municipio,
    primer_nombre: first,
    primer_apellido: last,
    comunidad: community,
  };
}

function copy(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function createMemoryRepository(initialRows = []) {
  let rows = initialRows;
  let dispatch = null;
  let nextId = 1;
  return {
    async enTransaccion(callback) {
      return callback({ syntheticTransaction: true });
    },
    async obtenerCandidatasTdapElChal() {
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
  let tokenIndex = 0;
  return createAutomatizacionesService({
    repository,
    now: () => new Date(NOW),
    createTdapToken: (snapshotHash) => createTdapDispatchToken(
      snapshotHash,
      () => Buffer.alloc(16, ++tokenIndex)
    ),
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

test('reutiliza la edad gestacional oficial y el umbral institucional de 140 dias', () => {
  const fur = furForThreshold('2026-08-24');
  assert.deepEqual(gestationalAgeAtDate(fur, '2026-08-23'), {
    totalDays: 139,
    weeks: 19,
    days: 6,
  });
  assert.deepEqual(gestationalAgeAtDate(fur, '2026-08-24'), {
    totalDays: 140,
    weeks: 20,
    days: 0,
  });
});

test('clasifica limites lunes y domingo en listas mutuamente excluyentes', () => {
  const report = classifyTdapCandidates([
    candidate({ threshold: '2026-08-24', first: 'Lunes' }),
    candidate({ threshold: '2026-08-30', first: 'Domingo' }),
    candidate({ threshold: '2026-08-23', first: 'Anterior' }),
    candidate({ threshold: '2026-08-31', first: 'Actual' }),
    candidate({ threshold: '2026-09-01', first: 'Futura' }),
  ], { period: PERIOD, asOf: '2026-08-31' });

  assert.deepEqual(
    report.newOpportunities.map(({ first_name: name }) => name).sort(),
    ['Domingo', 'Lunes']
  );
  assert.deepEqual(
    report.pending.map(({ first_name: name }) => name).sort(),
    ['Actual', 'Anterior']
  );
  assert.equal(report.newOpportunities.some((row) => report.pending.some(
    (pending) => pending.first_name === row.first_name
  )), false);
});

test('territorialidad usa municipio normalizado y nunca infiere desde comunidad', () => {
  const report = classifyTdapCandidates([
    candidate({ municipio: '  EL CHAL  ', first: 'Incluida', community: 'A' }),
    candidate({ municipio: 'Dolores', first: 'Excluida', community: 'El Chal' }),
  ], { period: PERIOD, asOf: '2026-08-31' });
  assert.deepEqual(report.newOpportunities.map((row) => row.first_name), ['Incluida']);
  assert.deepEqual(report.pending, []);
});

test('falla cerrado si una candidata territorial activa no tiene FUR valida', () => {
  assert.throws(
    () => classifyTdapCandidates([
      candidate({ fur: null }),
    ], { period: PERIOD, asOf: '2026-08-31' }),
    (error) => error.code === 'AUTOMATION_TDAP_GESTATIONAL_SOURCE_INCOMPLETE'
  );
});

test('consulta SQL exige El Chal, embarazo activo y ausencia de Tdap en ese embarazo', async () => {
  let captured;
  const repository = createAutomatizacionesRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
  });
  await repository.obtenerCandidatasTdapElChal();
  assert.deepEqual(captured.params, undefined);
  assert.match(captured.sql, /e\.estado = 'activo'/);
  assert.match(captured.sql, /LOWER\(BTRIM\(COALESCE\(p\.municipio, ''\)\)\) = 'el chal'/);
  assert.match(captured.sql, /NOT EXISTS[\s\S]*v\.embarazo_id = e\.id[\s\S]*v\.tipo_vacuna = 'tdap'/);
  assert.doesNotMatch(captured.sql, /v\.paciente_id\s*=\s*p\.id/);
  assert.doesNotMatch(captured.sql, /e\.estado IN|puerperio|edad_gestacional_semanas/);
  assert.doesNotMatch(captured.sql, /p\.cui|p\.no_expediente|p\.telefono|e\.id AS|p\.id AS/);
});

test('preparacion devuelve solo conteos, reserva una vez y conserva ISO interno', async () => {
  const repository = createMemoryRepository([
    candidate({ threshold: '2026-08-24' }),
    candidate({ threshold: '2026-08-23', first: 'Pendiente' }),
  ]);
  const service = createService(repository);
  const prepared = await service.prepararDespachoTdap();

  assert.deepEqual(Object.keys(prepared).sort(), [
    'as_of', 'dispatch', 'generated_at', 'has_information', 'new_opportunities',
    'pending', 'range', 'report_type', 'schema_version', 'timezone', 'xlsx',
  ]);
  assert.deepEqual(prepared.range, { from: '2026-08-24', to: '2026-08-30' });
  assert.equal(prepared.as_of, '2026-08-31');
  assert.equal(prepared.new_opportunities.total, 1);
  assert.equal(prepared.pending.total, 1);
  assert.equal(prepared.dispatch.status, 'ready');
  assert.match(prepared.dispatch.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(prepared.xlsx.filename, 'Seguimiento_Tdap_El_Chal_31-08-2026.xlsx');
  assert.equal(repository.state().total_registros, 2);
  assert.equal(repository.state().token_hash, tokenHash(prepared.dispatch.token));
  assert.doesNotMatch(
    JSON.stringify(prepared).toLowerCase(),
    /primer_nombre|primer_apellido|comunidad|cui|expediente|telefono|embarazo_id|paciente_id|fur/
  );
});

test('ambos cero registra sin_resultados y una segunda ejecucion es already_processed', async () => {
  const repository = createMemoryRepository([]);
  const service = createService(repository);
  const first = await service.prepararDespachoTdap();
  const second = await service.prepararDespachoTdap();
  assert.equal(first.dispatch.status, 'no_results');
  assert.equal(first.has_information, false);
  assert.equal(first.xlsx.available, false);
  assert.equal(second.dispatch.status, 'already_processed');
  assert.equal(repository.state().estado, 'sin_resultados');
});

test('XLSX tiene dos hojas exactas, tres columnas exactas y ninguna columna sensible', async () => {
  const repository = createMemoryRepository([
    candidate({ threshold: '2026-08-24', first: 'Ana', last: 'López', community: 'Centro' }),
    candidate({ threshold: '2026-08-23', first: 'Bea', last: 'Méndez', community: 'Las Flores' }),
  ]);
  const service = createService(repository);
  const prepared = await service.prepararDespachoTdap();
  const result = await service.generarSeguimientoTdapExcel({
    dispatchToken: prepared.dispatch.token,
  });
  assert.equal(result.filename, 'Seguimiento_Tdap_El_Chal_31-08-2026.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.content);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    'Nuevas oportunidades Tdap',
    'Pendientes de Tdap',
  ]);
  for (const sheet of workbook.worksheets) {
    assert.equal(sheet.columnCount, 3);
    assert.deepEqual(sheet.getRow(1).values.slice(1), [
      'Primer nombre', 'Primer apellido', 'Comunidad',
    ]);
  }
  assert.equal(workbook.getWorksheet('Nuevas oportunidades Tdap').actualRowCount, 2);
  assert.equal(workbook.getWorksheet('Pendientes de Tdap').actualRowCount, 2);
  assert.deepEqual(
    workbook.getWorksheet('Nuevas oportunidades Tdap').getColumn(1).values.slice(2),
    ['Ana']
  );
  assert.deepEqual(
    workbook.getWorksheet('Pendientes de Tdap').getColumn(1).values.slice(2),
    ['Bea']
  );
  const serialized = JSON.stringify(workbook.worksheets.map((sheet) => (
    Array.from({ length: sheet.actualRowCount }, (_, index) => sheet.getRow(index + 1).values)
  ))).toLowerCase();
  assert.doesNotMatch(
    serialized,
    /cui|expediente|tel[eé]fono|direcci[oó]n|paciente id|embarazo id|edad gestacional|fur|fpp|riesgo|diagn[oó]stico|laboratorio|vih|morbilidad/
  );
});

test('XLSX conserva la hoja de nuevas vacia con encabezados cuando solo hay pendientes', async () => {
  const repository = createMemoryRepository([
    candidate({ threshold: '2026-08-01', first: 'Pendiente' }),
  ]);
  const service = createService(repository);
  const prepared = await service.prepararDespachoTdap();
  assert.equal(prepared.new_opportunities.total, 0);
  assert.equal(prepared.pending.total, 1);
  const result = await service.generarSeguimientoTdapExcel({
    dispatchToken: prepared.dispatch.token,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.content);
  assert.equal(workbook.getWorksheet('Nuevas oportunidades Tdap').actualRowCount, 1);
  assert.equal(workbook.getWorksheet('Pendientes de Tdap').actualRowCount, 2);
});

test('snapshot firmado impide descargar un Excel distinto al resumen reservado', async () => {
  const repository = createMemoryRepository([candidate()]);
  const service = createService(repository);
  const prepared = await service.prepararDespachoTdap();
  repository.setRows([candidate({ first: 'Cambio' })]);
  await assert.rejects(
    service.generarSeguimientoTdapExcel({ dispatchToken: prepared.dispatch.token }),
    (error) => error.code === 'AUTOMATION_DISPATCH_SNAPSHOT_CHANGED'
  );
});

test('confirmacion es idempotente y la doble ejecucion no prepara otro envio', async () => {
  const repository = createMemoryRepository([candidate()]);
  const service = createService(repository);
  const prepared = await service.prepararDespachoTdap();
  const first = await service.confirmarDespachoTdap({ dispatchToken: prepared.dispatch.token });
  const repeated = await service.confirmarDespachoTdap({ dispatchToken: prepared.dispatch.token });
  const next = await service.prepararDespachoTdap();
  assert.deepEqual(first.dispatch, { status: 'sent', idempotent: false });
  assert.deepEqual(repeated.dispatch, { status: 'sent', idempotent: true });
  assert.equal(next.dispatch.status, 'already_processed');
});

test('rutas Tdap exigen M2M y token separado para el XLSX', async () => {
  const service = createService(createMemoryRepository([candidate()]));
  await withServer(service, async (baseUrl) => {
    const prepareUrl = `${baseUrl}/api/automatizaciones/v1/tdap/preparar`;
    assert.equal((await fetch(prepareUrl, { method: 'POST' })).status, 401);
    const preparedResponse = await fetch(prepareUrl, {
      method: 'POST',
      headers: { 'X-CAP-Automation-Key': CURRENT_KEY },
    });
    assert.equal(preparedResponse.status, 200);
    const prepared = await preparedResponse.json();

    const xlsxUrl = `${baseUrl}/api/automatizaciones/v1/tdap/xlsx`;
    assert.equal((await fetch(xlsxUrl, {
      headers: { 'X-CAP-Automation-Key': CURRENT_KEY },
    })).status, 400);
    const xlsx = await fetch(xlsxUrl, {
      headers: {
        'X-CAP-Automation-Key': CURRENT_KEY,
        'X-CAP-Dispatch-Token': prepared.dispatch.token,
      },
    });
    assert.equal(xlsx.status, 200);
    assert.equal(
      xlsx.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert.equal(
      xlsx.headers.get('content-disposition'),
      'attachment; filename="Seguimiento_Tdap_El_Chal_31-08-2026.xlsx"'
    );
    assert.equal(xlsx.headers.get('x-cap-new-count'), '1');
    assert.equal(xlsx.headers.get('x-cap-pending-count'), '0');
  });
});

test('hash del snapshot solo contiene periodo y filas operativas normalizadas', () => {
  const report = classifyTdapCandidates([candidate()], {
    period: PERIOD,
    asOf: '2026-08-31',
  });
  assert.match(tdapSnapshotHash(report), /^[a-f0-9]{64}$/);
});
