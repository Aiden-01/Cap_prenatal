const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const ExcelJS = require('exceljs');

const { createReportesController } = require('../src/controllers/reportesController');
const { errorHandler } = require('../src/middleware/errorHandler');
const { verificarPermiso } = require('../src/middleware/permisos');
const { createReportesRepository } = require('../src/repositories/reportesRepository');
const { createReportesRouter } = require('../src/routes/reportes');
const {
  clasificarRiesgo,
  crearWorkbookCenso,
  createReportesService,
  indicadoresRiesgo,
  prepararFilasConRiesgo,
} = require('../src/services/reportesService');
const {
  buildCensoPrimerControlHtml,
  createReportesPdfService,
} = require('../src/services/reportesPdfService');
const {
  MAX_REPORT_DAYS,
  periodoReportesQuerySchema,
} = require('../src/validations/reportes.schemas');
const { AppError } = require('../src/utils/appError');

const PERIODO = { desde: '2026-07-01', hasta: '2026-07-31' };

function paciente(overrides = {}) {
  return {
    id: 10,
    numero_embarazo: 1,
    estado_embarazo: 'activo',
    no_expediente: 'EXP-10',
    cui: '1234567890101',
    nombre_completo: 'Paciente Sintetica',
    edad: 28,
    etnia: 'mestizo',
    comunidad: 'El Quetzal',
    fur: '2026-01-01',
    fpp: '2026-10-08',
    fecha_primer_control: '2026-07-10',
    semanas_gestacion: 27,
    gestas: 2,
    partos: 1,
    abortos: 0,
    tiene_riesgo: false,
    ...overrides,
  };
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function routeControllers(onCall = () => {}) {
  const handler = (name) => (_req, res) => {
    onCall(name);
    res.status(204).end();
  };
  return {
    censoMensual: handler('activos'),
    censoMensualPrimerControl: handler('primer-control'),
    exportarCensoExcel: handler('activos-excel'),
    exportarCensoPrimerControlExcel: handler('primer-control-excel'),
    exportarCensoPrimerControlPdf: handler('primer-control-pdf'),
    estadisticas: handler('estadisticas'),
    pacientesConRiesgo: handler('riesgo'),
    proximasAParir: handler('parto'),
    sinControlReciente: handler('sin-control'),
    resumenPorComunidad: handler('comunidades'),
  };
}

function authForReportTests(req, _res, next) {
  if (req.headers.authorization !== 'Bearer test') {
    return next(new AppError(401, 'Autenticacion requerida', { code: 'AUTHENTICATION_REQUIRED' }));
  }
  req.usuario = {
    id: 77,
    permisos: String(req.headers['x-permissions'] || '').split(',').filter(Boolean),
  };
  return next();
}

function reportRouteApp({ controllers = routeControllers() } = {}) {
  const app = express();
  app.use('/api/reportes', createReportesRouter({
    controllers,
    authenticate: authForReportTests,
    loadPermissions: (_req, _res, next) => next(),
    checkPermission: verificarPermiso,
  }));
  app.use(errorHandler);
  return app;
}

test('schema acepta un periodo inclusivo de hasta 366 dias', () => {
  const result = periodoReportesQuerySchema.safeParse({ desde: '2024-01-01', hasta: '2024-12-31' });
  assert.equal(MAX_REPORT_DAYS, 366);
  assert.equal(result.success, true);
});

test('schema rechaza fechas ausentes, formato invalido y fechas inexistentes', () => {
  assert.equal(periodoReportesQuerySchema.safeParse({ hasta: '2026-07-31' }).success, false);
  assert.equal(periodoReportesQuerySchema.safeParse({ desde: '07/01/2026', hasta: '2026-07-31' }).success, false);
  assert.equal(periodoReportesQuerySchema.safeParse({ desde: '2026-02-30', hasta: '2026-03-01' }).success, false);
});

test('schema rechaza orden inverso, periodo excesivo y parametros repetidos', () => {
  assert.equal(periodoReportesQuerySchema.safeParse({ desde: '2026-08-01', hasta: '2026-07-31' }).success, false);
  assert.equal(periodoReportesQuerySchema.safeParse({ desde: '2024-01-01', hasta: '2025-01-01' }).success, false);
  assert.equal(periodoReportesQuerySchema.safeParse({ desde: ['2026-07-01', '2026-07-02'], hasta: '2026-07-31' }).success, false);
});

test('consulta de primer control usa una fila determinista por embarazo y no p.created_at', async () => {
  let captured;
  const repository = createReportesRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [paciente({ estado_embarazo: 'cerrado' })] };
    },
  });
  const rows = await repository.obtenerRowsCensoPrimerControl(PERIODO.desde, PERIODO.hasta);
  assert.deepEqual(captured.params, [PERIODO.desde, PERIODO.hasta]);
  assert.match(captured.sql, /DISTINCT ON \(c\.embarazo_id\)/);
  assert.match(captured.sql, /ORDER BY c\.embarazo_id, c\.fecha ASC, c\.id ASC/);
  assert.match(captured.sql, /AGE\(pc\.fecha, p\.fecha_nacimiento\)/);
  assert.match(captured.sql, /pc\.fecha - COALESCE\(e\.fur, p\.fur\)/);
  assert.match(captured.sql, /pc\.fecha BETWEEN \$1::date AND \$2::date/);
  assert.match(captured.sql, /COALESCE\(com\.nombre, p\.comunidad\)/);
  assert.doesNotMatch(captured.sql, /p\.created_at/);
  assert.equal(rows[0].estado_embarazo, 'cerrado');
});

test('servicio conserva embarazos separados de la misma paciente y calcula indicadores sobre esas filas', async () => {
  const rows = [
    paciente({ numero_embarazo: 1, tiene_riesgo: true }),
    paciente({ numero_embarazo: 2, estado_embarazo: 'cerrado', edad: 18 }),
  ];
  const service = createReportesService({
    repository: { obtenerRowsCensoPrimerControl: async () => rows },
    pdfService: {},
  });
  const result = await service.censoMensualPrimerControl(PERIODO);
  assert.equal(result.total, 2);
  assert.deepEqual(result.pacientes.map((row) => row.numero_embarazo), [1, 2]);
  assert.deepEqual(result.indicadores, {
    total: 2,
    riesgo_alto: 1,
    riesgo_medio: 1,
    riesgo_bajo: 0,
  });
  assert.equal(result.pacientes[0].fecha_primer_control, '2026-07-10');
  assert.equal(result.pacientes[0].comunidad, 'El Quetzal');
});

test('clasificacion de riesgo mantiene alto por ficha y medio solo como semaforo por edad', () => {
  assert.equal(clasificarRiesgo({ tiene_riesgo: true, edad: 30 }), 'ALTO');
  assert.equal(clasificarRiesgo({ tiene_riesgo: false, edad: 19 }), 'MEDIO');
  assert.equal(clasificarRiesgo({ tiene_riesgo: false, edad: 36 }), 'MEDIO');
  assert.equal(clasificarRiesgo({ tiene_riesgo: false, edad: 20 }), 'BAJO');
  const prepared = prepararFilasConRiesgo([paciente()]);
  assert.deepEqual(indicadoresRiesgo(prepared), { total: 1, riesgo_alto: 0, riesgo_medio: 0, riesgo_bajo: 1 });
});

test('censo actual consulta solo embarazos activos y usa fecha de Guatemala', async () => {
  let sql;
  const repository = createReportesRepository({ async query(value) { sql = value; return { rows: [] }; } });
  await repository.obtenerRowsCensoGeneral();
  assert.match(sql, /WHERE e\.estado = 'activo'/);
  assert.match(sql, /America\/Guatemala/);
  assert.doesNotMatch(sql, /p\.created_at/);
  assert.doesNotMatch(sql, /BETWEEN \$1/);
});

test('reportes operativos aplican reglas de 30 y 28 dias y riesgo oficial positivo', async () => {
  const statements = [];
  const repository = createReportesRepository({
    async query(sql) { statements.push(sql); return { rows: [] }; },
  });
  await repository.obtenerProximasAParir();
  await repository.obtenerSinControlReciente();
  await repository.obtenerPacientesConRiesgo();
  assert.match(statements[0], /e\.estado = 'activo'/);
  assert.match(statements[0], /\+ 30/);
  assert.match(statements[1], /> 28/);
  assert.match(statements[1], /nunca_control/);
  assert.match(statements[2], /r\.tiene_riesgo = TRUE/);
  assert.doesNotMatch(statements[2], /edad < 20|edad > 35/);
});

test('resumen por comunidad conserva grupo sin catalogar y suma totales', async () => {
  let sql;
  const repository = {
    async obtenerResumenPorComunidad() {
      return [
        { comunidad: 'El Quetzal', embarazos_activos: 2, con_riesgo: 1, proximas_a_parir: 1, sin_control_reciente: 0 },
        { comunidad: 'Sin comunidad catalogada', embarazos_activos: 1, con_riesgo: 0, proximas_a_parir: 0, sin_control_reciente: 1 },
      ];
    },
  };
  const service = createReportesService({ repository, pdfService: {} });
  const result = await service.resumenPorComunidad();
  assert.deepEqual(result.totales, { embarazos_activos: 3, con_riesgo: 1, proximas_a_parir: 1, sin_control_reciente: 1 });

  const sqlRepository = createReportesRepository({ async query(value) { sql = value; return { rows: [] }; } });
  await sqlRepository.obtenerResumenPorComunidad();
  assert.match(sql, /Sin comunidad catalogada/);
  assert.match(sql, /GROUP BY com\.id/);
  assert.match(sql, /p\.comunidad_id/);
});

test('dashboard obtiene embarazos activos separado del total historico de pacientes', async () => {
  const counts = [{ count: '99' }, { count: '12' }, { count: '4' }, { count: '8' }];
  let index = 0;
  const repository = createReportesRepository({
    async query() {
      const current = index++;
      return current === 4 ? { rows: [] } : { rows: [counts[current]] };
    },
  });
  const base = await repository.obtenerEstadisticasBase();
  const service = createReportesService({
    repository: { obtenerEstadisticasBase: async () => base },
    pdfService: {},
  });
  const stats = await service.estadisticas();
  assert.equal(stats.total_pacientes_historico, 99);
  assert.equal(stats.embarazos_activos, 12);
});

test('Excel principal usa oficio horizontal, una pagina de ancho y columnas requeridas', async () => {
  const rows = prepararFilasConRiesgo([paciente()]);
  const workbook = crearWorkbookCenso(rows, {
    ...PERIODO,
    titulo: 'CENSO MENSUAL DE CAPTADAS EN PRIMER CONTROL',
    incluirPrimerControl: true,
    generadoEn: '16/07/2026 10:30:00',
  });
  const sheet = workbook.getWorksheet('Censo MSPAS');
  assert.equal(sheet.pageSetup.paperSize, 14);
  assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.pageSetup.fitToPage, true);
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.pageSetup.printTitlesRow, '8:8');
  assert.match(String(sheet.getRow(8).values), /Fecha 1er\ncontrol/);
  assert.match(String(sheet.getRow(8).values), /Comunidad/);
  assert.match(String(sheet.getRow(8).values), /Estado\nembarazo/);
  assert.ok(sheet.autoFilter);
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.getWorksheet('Censo MSPAS').getCell('J9').value instanceof Date, true);
});

test('HTML y renderer PDF fijan oficio 13 x 8.5, tabla completa y encabezado repetible', async () => {
  const rows = prepararFilasConRiesgo(Array.from({ length: 60 }, (_, index) => paciente({ id: index + 1 })));
  const html = buildCensoPrimerControlHtml({ rows, ...PERIODO, generadoEn: '16/07/2026 10:30:00' });
  assert.match(html, /@page \{ size: 13in 8\.5in/);
  assert.match(html, /thead \{ display: table-header-group/);
  assert.match(html, /table-layout: fixed/);
  assert.match(html, /Primer control|1er control/);
  assert.match(html, /Comunidad/);
  assert.doesNotMatch(html, /control_id|embarazo_id/);

  let pdfOptions;
  let closed = false;
  const service = createReportesPdfService({
    puppeteerClient: {
      async launch() {
        return {
          async newPage() {
            return {
              async setContent() {},
              async pdf(options) { pdfOptions = options; return Buffer.from('%PDF-sintetico'); },
            };
          },
          async close() { closed = true; },
        };
      },
    },
  });
  const pdf = await service.renderCensoPrimerControlPdf({ rows, ...PERIODO, generadoEn: 'ahora' });
  assert.equal(pdfOptions.width, '13in');
  assert.equal(pdfOptions.height, '8.5in');
  assert.equal(pdfOptions.preferCSSPageSize, true);
  assert.match(pdfOptions.footerTemplate, /pageNumber/);
  assert.equal(closed, true);
  assert.ok(Buffer.isBuffer(pdf));
});

test('rutas exigen autenticacion, reportes.ver para consulta y reportes.exportar para archivos', async () => {
  await withServer(reportRouteApp(), async (baseUrl) => {
    const query = '?desde=2026-07-01&hasta=2026-07-31';
    assert.equal((await fetch(`${baseUrl}/api/reportes/censo/primer-control${query}`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/reportes/censo/primer-control${query}`, {
      headers: { Authorization: 'Bearer test' },
    })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/reportes/censo/primer-control${query}`, {
      headers: { Authorization: 'Bearer test', 'X-Permissions': 'reportes.ver' },
    })).status, 204);
    for (const format of ['excel', 'pdf']) {
      assert.equal((await fetch(`${baseUrl}/api/reportes/censo/primer-control/${format}${query}`, {
        headers: { Authorization: 'Bearer test', 'X-Permissions': 'reportes.ver' },
      })).status, 403);
      assert.equal((await fetch(`${baseUrl}/api/reportes/censo/primer-control/${format}${query}`, {
        headers: { Authorization: 'Bearer test', 'X-Permissions': 'reportes.exportar' },
      })).status, 204);
    }
  });
});

test('validacion HTTP rechaza fecha invalida y parametro repetido antes del controlador', async () => {
  let calls = 0;
  const app = reportRouteApp({ controllers: routeControllers(() => { calls += 1; }) });
  await withServer(app, async (baseUrl) => {
    for (const query of [
      '?desde=2026-02-30&hasta=2026-03-01',
      '?desde=2026-07-02&hasta=2026-07-01',
      '?desde=2026-07-01&desde=2026-07-02&hasta=2026-07-31',
    ]) {
      const response = await fetch(`${baseUrl}/api/reportes/censo/primer-control${query}`, {
        headers: { Authorization: 'Bearer test', 'X-Permissions': 'reportes.ver' },
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VALIDATION_ERROR');
    }
  });
  assert.equal(calls, 0);
});

test('exportaciones responden con nombre seguro, no-store y auditoria minima sin datos nominales', async () => {
  const audits = [];
  const fakeWorkbook = {
    xlsx: { async write(res) { res.write('xlsx-sintetico'); } },
  };
  const service = {
    async workbookCensoPrimerControl() { return { workbook: fakeWorkbook, total: 7 }; },
    async pdfCensoPrimerControl() { return { pdf: Buffer.from('%PDF-sintetico'), total: 7 }; },
  };
  const controllers = createReportesController({
    service,
    audit: async (_req, event) => audits.push(event),
  });
  const app = reportRouteApp({ controllers: { ...routeControllers(), ...controllers } });

  await withServer(app, async (baseUrl) => {
    const headers = { Authorization: 'Bearer test', 'X-Permissions': 'reportes.exportar' };
    const query = '?desde=2026-07-01&hasta=2026-07-31';
    const pdf = await fetch(`${baseUrl}/api/reportes/censo/primer-control/pdf${query}`, { headers });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(pdf.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(pdf.headers.get('content-disposition'), 'attachment; filename="censo_primer_control_2026-07-01_2026-07-31.pdf"');

    const excel = await fetch(`${baseUrl}/api/reportes/censo/primer-control/excel${query}`, { headers });
    assert.equal(excel.status, 200);
    assert.match(excel.headers.get('content-disposition'), /^attachment; filename="censo_primer_control_/);
  });

  assert.equal(audits.length, 2);
  for (const audit of audits) {
    assert.equal(audit.datosNuevos.cantidad_filas, 7);
    assert.deepEqual(audit.datosNuevos.filtros, PERIODO);
    assert.ok(audit.datosNuevos.fecha_generacion);
    const serialized = JSON.stringify(audit);
    assert.doesNotMatch(serialized, /Paciente Sintetica|1234567890101|pdf-sintetico/);
  }
});
