const reportesService = require('../services/reportesService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { AppError } = require('../utils/appError');
const { registrarAuditoria } = require('../utils/auditoria');

function requirePeriodo(req, message = 'Parametros desde y hasta son requeridos (YYYY-MM-DD)') {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    throw new AppError(400, message, { code: 'PERIOD_REQUIRED' });
  }

  return { desde, hasta };
}

async function writeWorkbook(res, workbook, nombreArchivo) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
  await workbook.xlsx.write(res);
  res.end();
}

const censoMensual = asyncHandler(async (req, res) => {
  const periodo = requirePeriodo(req);
  const result = await reportesService.censoMensual(periodo);
  return res.json(result);
});

const censoMensualPrimerControl = asyncHandler(async (req, res) => {
  const periodo = requirePeriodo(req);
  const result = await reportesService.censoMensualPrimerControl(periodo);
  return res.json(result);
});

const exportarCensoExcel = asyncHandler(async (req, res) => {
  const periodo = requirePeriodo(req, 'Parametros requeridos');
  const workbook = await reportesService.workbookCensoGeneral(periodo);
  await registrarAuditoria(req, {
    accion: 'exportar',
    tabla: 'reportes',
    datosNuevos: {
      tipo_reporte: 'censo_general',
      formato: 'xlsx',
      filtros: periodo,
    },
    descripcion: 'Exportacion de censo general en Excel',
  });
  return writeWorkbook(res, workbook, `censo_${periodo.desde}_${periodo.hasta}.xlsx`);
});

const exportarCensoPrimerControlExcel = asyncHandler(async (req, res) => {
  const periodo = requirePeriodo(req, 'Parametros requeridos');
  const workbook = await reportesService.workbookCensoPrimerControl(periodo);
  await registrarAuditoria(req, {
    accion: 'exportar',
    tabla: 'reportes',
    datosNuevos: {
      tipo_reporte: 'censo_primer_control',
      formato: 'xlsx',
      filtros: periodo,
    },
    descripcion: 'Exportacion de censo de primer control en Excel',
  });
  return writeWorkbook(
    res,
    workbook,
    `censo_primer_control_${periodo.desde}_${periodo.hasta}.xlsx`
  );
});

const estadisticas = asyncHandler(async (_req, res) => {
  const result = await reportesService.estadisticas();
  return res.json(result);
});

const pacientesConRiesgo = asyncHandler(async (_req, res) => {
  const result = await reportesService.pacientesConRiesgo();
  return res.json(result);
});

const proximasAParir = asyncHandler(async (_req, res) => {
  const result = await reportesService.proximasAParir();
  return res.json(result);
});

const sinControlReciente = asyncHandler(async (_req, res) => {
  const result = await reportesService.sinControlReciente();
  return res.json(result);
});

module.exports = {
  censoMensual,
  censoMensualPrimerControl,
  exportarCensoExcel,
  exportarCensoPrimerControlExcel,
  estadisticas,
  pacientesConRiesgo,
  proximasAParir,
  sinControlReciente,
};
