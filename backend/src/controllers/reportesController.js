const reportesService = require('../services/reportesService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { registrarAuditoria } = require('../utils/auditoria');
const { PDF_RESPONSE_HEADERS, sanitizePdfFilename } = require('../utils/pdfResponse');

function setPrivateDownloadHeaders(res) {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
  });
}

async function writeWorkbook(res, workbook, nombreArchivo) {
  setPrivateDownloadHeaders(res);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  await workbook.xlsx.write(res);
  res.end();
}

function sendReportPdf(res, pdf, nombreArchivo) {
  const safeFilename = sanitizePdfFilename(nombreArchivo, 'censo-primer-control.pdf');
  res.set({
    ...PDF_RESPONSE_HEADERS,
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${safeFilename}"`,
  });
  return res.send(Buffer.from(pdf));
}

function exportAuditData({ tipoReporte, formato, periodo, total }) {
  return {
    tipo_reporte: tipoReporte,
    formato,
    filtros: periodo,
    cantidad_filas: total,
    fecha_generacion: new Date().toISOString(),
  };
}

function createReportesController({
  service = reportesService,
  audit = registrarAuditoria,
} = {}) {
  const censoMensual = asyncHandler(async (_req, res) => {
    const result = await service.censoMensual({});
    return res.json(result);
  });

  const censoMensualPrimerControl = asyncHandler(async (req, res) => {
    const result = await service.censoMensualPrimerControl(req.query);
    return res.json(result);
  });

  const exportarCensoExcel = asyncHandler(async (req, res) => {
    const result = await service.workbookCensoGeneral();
    await audit(req, {
      accion: 'exportar',
      tabla: 'reportes',
      datosNuevos: exportAuditData({
        tipoReporte: 'censo_embarazos_activos',
        formato: 'xlsx',
        periodo: { fecha_corte: result.fechaCorte },
        total: result.total,
      }),
      descripcion: 'Exportacion de censo actual de embarazos activos en Excel',
    });
    return writeWorkbook(
      res,
      result.workbook,
      `censo_embarazos_activos_${result.fechaCorte}.xlsx`
    );
  });

  const exportarCensoPrimerControlExcel = asyncHandler(async (req, res) => {
    const result = await service.workbookCensoPrimerControl(req.query);
    await audit(req, {
      accion: 'exportar',
      tabla: 'reportes',
      datosNuevos: exportAuditData({
        tipoReporte: 'censo_primer_control',
        formato: 'xlsx',
        periodo: req.query,
        total: result.total,
      }),
      descripcion: 'Exportacion de censo de captadas en primer control en Excel',
    });
    return writeWorkbook(
      res,
      result.workbook,
      `censo_primer_control_${req.query.desde}_${req.query.hasta}.xlsx`
    );
  });

  const exportarCensoPrimerControlPdf = asyncHandler(async (req, res) => {
    const result = await service.pdfCensoPrimerControl(req.query);
    await audit(req, {
      accion: 'exportar',
      tabla: 'reportes',
      datosNuevos: exportAuditData({
        tipoReporte: 'censo_primer_control',
        formato: 'pdf',
        periodo: req.query,
        total: result.total,
      }),
      descripcion: 'Exportacion de censo de captadas en primer control en PDF',
    });
    return sendReportPdf(
      res,
      result.pdf,
      `censo_primer_control_${req.query.desde}_${req.query.hasta}.pdf`
    );
  });

  const estadisticas = asyncHandler(async (_req, res) => res.json(await service.estadisticas()));
  const pacientesConRiesgo = asyncHandler(async (_req, res) => res.json(await service.pacientesConRiesgo()));
  const proximasAParir = asyncHandler(async (_req, res) => res.json(await service.proximasAParir()));
  const sinControlReciente = asyncHandler(async (_req, res) => res.json(await service.sinControlReciente()));
  const resumenPorComunidad = asyncHandler(async (_req, res) => res.json(await service.resumenPorComunidad()));

  return {
    censoMensual,
    censoMensualPrimerControl,
    exportarCensoExcel,
    exportarCensoPrimerControlExcel,
    exportarCensoPrimerControlPdf,
    estadisticas,
    pacientesConRiesgo,
    proximasAParir,
    sinControlReciente,
    resumenPorComunidad,
  };
}

module.exports = {
  ...createReportesController(),
  createReportesController,
  exportAuditData,
  sendReportPdf,
  writeWorkbook,
};
