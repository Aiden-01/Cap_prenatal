const reportesService = require('../services/reportesService');
const { asyncHandler } = require('../middleware/asyncHandler');
const { registrarEventoPrivado } = require('../services/auditService');
const { PDF_RESPONSE_HEADERS, sanitizePdfFilename } = require('../utils/pdfResponse');
const { getGuatemalaDateInputValue } = require('../utils/guatemalaTime');
const { operationMetrics } = require('../utils/operationMetrics');

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
    desde: periodo?.desde,
    hasta: periodo?.hasta,
    cantidad_filas: total,
    resultado: 'generado',
  };
}

function createReportesController({
  service = reportesService,
  audit = registrarEventoPrivado,
  metrics = operationMetrics,
} = {}) {
  const measuredHandler = (operation, handler) => asyncHandler(
    (req, res) => metrics.measure(operation, () => handler(req, res))
  );

  const createExportHandler = (reportId, format) => measuredHandler(`report.${format}.${reportId}`, async (req, res) => {
    const result = await service.exportReport(reportId, format, req.query);
    await audit(req, {
      contexto: { categoria: 'reportes', entidad: 'exportacion', evento: 'exportacion_reporte' },
      accion: 'exportar',
      metadata: {
        tipo_reporte: reportId,
        formato: format === 'excel' ? 'xlsx' : 'pdf',
        desde: ['primer_control', 'controles_prenatales'].includes(reportId) ? req.query.desde : undefined,
        hasta: ['primer_control', 'controles_prenatales'].includes(reportId) ? req.query.hasta : undefined,
        cantidad_filas: result.total,
        resultado: 'generado',
      },
    });
    const extension = format === 'excel' ? 'xlsx' : 'pdf';
    const filename = `${result.config.slug}_${getGuatemalaDateInputValue()}.${extension}`;
    return format === 'excel'
      ? writeWorkbook(res, result.workbook, filename)
      : sendReportPdf(res, result.pdf, filename);
  });

  const censoMensual = measuredHandler('report.query.censo_general', async (_req, res) => {
    const result = await service.censoMensual({});
    return res.json(result);
  });

  const censoMensualPrimerControl = measuredHandler('report.query.censo_primer_control', async (req, res) => {
    const result = await service.censoMensualPrimerControl(req.query);
    return res.json(result);
  });
  const controlesPrenatales = measuredHandler('report.query.controles_prenatales', async (req, res) =>
    res.json(await service.controlesPrenatales(req.query)));

  const exportarCensoExcel = measuredHandler('report.excel.censo_general', async (req, res) => {
    const result = await service.workbookCensoGeneral();
    await audit(req, {
      contexto: {
        categoria: 'reportes',
        entidad: 'exportacion',
        evento: 'exportacion_censo',
      },
      accion: 'exportar',
      metadata: exportAuditData({
        tipoReporte: 'censo_embarazos_activos',
        formato: 'xlsx',
        periodo: { desde: result.fechaCorte, hasta: result.fechaCorte },
        total: result.total,
      }),
    });
    return writeWorkbook(
      res,
      result.workbook,
      `censo_embarazos_activos_${result.fechaCorte}.xlsx`
    );
  });

  const exportarCensoPrimerControlExcel = measuredHandler('report.excel.censo_primer_control', async (req, res) => {
    const result = await service.workbookCensoPrimerControl(req.query);
    await audit(req, {
      contexto: {
        categoria: 'reportes',
        entidad: 'exportacion',
        evento: 'exportacion_censo',
      },
      accion: 'exportar',
      metadata: exportAuditData({
        tipoReporte: 'censo_primer_control',
        formato: 'xlsx',
        periodo: req.query,
        total: result.total,
      }),
    });
    return writeWorkbook(
      res,
      result.workbook,
      `censo_primer_control_${req.query.desde}_${req.query.hasta}.xlsx`
    );
  });

  const exportarCensoPrimerControlPdf = measuredHandler('report.pdf.censo_primer_control', async (req, res) => {
    const result = await service.pdfCensoPrimerControl(req.query);
    await audit(req, {
      contexto: {
        categoria: 'reportes',
        entidad: 'exportacion',
        evento: 'exportacion_censo',
      },
      accion: 'exportar',
      metadata: exportAuditData({
        tipoReporte: 'censo_primer_control',
        formato: 'pdf',
        periodo: req.query,
        total: result.total,
      }),
    });
    return sendReportPdf(
      res,
      result.pdf,
      `censo_primer_control_${req.query.desde}_${req.query.hasta}.pdf`
    );
  });

  const estadisticas = measuredHandler('report.query.estadisticas', async (_req, res) => res.json(await service.estadisticas()));
  const pacientesConRiesgo = measuredHandler('report.query.riesgo', async (_req, res) => res.json(await service.pacientesConRiesgo()));
  const proximasAParir = measuredHandler('report.query.proximas_parto', async (_req, res) => res.json(await service.proximasAParir()));
  const sinControlReciente = measuredHandler('report.query.sin_control', async (_req, res) => res.json(await service.sinControlReciente()));
  const resumenPorComunidad = measuredHandler('report.query.comunidades', async (_req, res) => res.json(await service.resumenPorComunidad()));

  return {
    controlesPrenatales,
    exportarControlesPrenatalesExcel: createExportHandler('controles_prenatales', 'excel'),
    exportarControlesPrenatalesPdf: createExportHandler('controles_prenatales', 'pdf'),
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
    exportarPrimerControlExcel: createExportHandler('primer_control', 'excel'),
    exportarPrimerControlPdf: createExportHandler('primer_control', 'pdf'),
    exportarActivosExcel: createExportHandler('activos', 'excel'),
    exportarActivosPdf: createExportHandler('activos', 'pdf'),
    exportarProximasPartoExcel: createExportHandler('proximas_parto', 'excel'),
    exportarProximasPartoPdf: createExportHandler('proximas_parto', 'pdf'),
    exportarSinControlExcel: createExportHandler('sin_control', 'excel'),
    exportarSinControlPdf: createExportHandler('sin_control', 'pdf'),
    exportarRiesgoExcel: createExportHandler('riesgo', 'excel'),
    exportarRiesgoPdf: createExportHandler('riesgo', 'pdf'),
    exportarComunidadesExcel: createExportHandler('comunidades', 'excel'),
    exportarComunidadesPdf: createExportHandler('comunidades', 'pdf'),
  };
}

module.exports = {
  ...createReportesController(),
  createReportesController,
  exportAuditData,
  sendReportPdf,
  writeWorkbook,
};
