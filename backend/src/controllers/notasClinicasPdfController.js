const { asyncHandler } = require('../middleware/asyncHandler');
const { consumePdfQuota } = require('../middleware/pdfRateLimit');
const { sendPdfResponse } = require('../utils/pdfResponse');
const { registrarEventoPrivado } = require('../services/auditService');
const { generarNotaClinicaPdf } = require('../services/notaClinicaPdf');
const { HttpError } = require('../utils/httpError');

function createNotasClinicasPdfController({ service, render = generarNotaClinicaPdf,
  quota = consumePdfQuota, audit = registrarEventoPrivado } = {}) {
  return asyncHandler(async (req, res) => {
    const data = await service.obtenerNotaParaPdf({ pacienteId: req.params.pacienteId, notaId: req.params.notaId, req });
    quota(req);
    let pdf;
    try { pdf = await render(data); }
    catch { throw new HttpError(500, 'No se pudo generar el PDF de la nota', { code: 'PDF_GENERATION_ERROR' }); }
    await audit(req, { contexto: { categoria: 'documentos', entidad: 'documento', evento: 'pdf_clinico_generado' },
      accion: 'generar_pdf', entidadId: data.nota.id, pacienteId: data.nota.paciente_id,
      embarazoId: data.nota.embarazo_id || null,
      metadata: { tipo_documento: data.nota.tipo, formato: 'pdf', resultado: 'generado' } }, { obligatorio: true });
    return sendPdfResponse(res, pdf, `nota-clinica-${data.nota.id}.pdf`);
  });
}

module.exports = { createNotasClinicasPdfController };
