const assert = require('node:assert/strict');
const test = require('node:test');
const { PDFDocument } = require('pdf-lib');

const { combinePdfBuffers, createPdfController } = require('../src/controllers/pdfController');

async function onePagePdf(width) {
  const document = await PDFDocument.create();
  document.addPage([width, 100]);
  return Buffer.from(await document.save());
}

test('combina PDFs válidos respetando expediente, plan y riesgo', async () => {
  const bytes = await combinePdfBuffers(await Promise.all([onePagePdf(101), onePagePdf(202), onePagePdf(303)]));
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 3);
  assert.deepEqual(document.getPages().map((page) => page.getWidth()), [101, 202, 303]);
});

test('endpoint combinado responde PDF, audita y conserva el orden obligatorio', async () => {
  const calls = [];
  const pdfs = await Promise.all([onePagePdf(101), onePagePdf(202), onePagePdf(303)]);
  const controller = createPdfController({
    pdfService: {
      obtenerFichaMspasData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 } }),
      obtenerPlanPartoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, plan: { id: 7 } }),
      obtenerFichaRiesgoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, riesgo: { id: 8 } }),
    },
    generarFichaClinicaPrenatalPdf: async () => pdfs[0],
    exportExcelTemplateToPdf: async () => pdfs[1],
    renderRiskPdf: async () => pdfs[2],
    consumePdfQuota: () => calls.push('quota'),
    registrarEventoPrivado: async (_req, event) => calls.push(event.metadata.tipo_documento),
    sendPdfResponse: (_res, pdf, filename) => { calls.push(filename); return pdf; },
  });
  const bytes = await controller.pdfCombinado({ params: { pacienteId: '41' }, query: { embarazo_id: '91' } }, {});
  const document = await PDFDocument.load(bytes);
  assert.deepEqual(document.getPages().map((page) => page.getWidth()), [101, 202, 303]);
  assert.deepEqual(calls, ['quota', 'expediente_completo', 'expediente-completo-41.pdf']);
});

test('endpoint combinado rechaza documento faltante sin generar un PDF parcial', async () => {
  const controller = createPdfController({
    pdfService: {
      obtenerFichaMspasData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 } }),
      obtenerPlanPartoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, plan: null }),
      obtenerFichaRiesgoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, riesgo: { id: 8 } }),
    },
  });
  await assert.rejects(
    controller.pdfCombinado({ params: { pacienteId: '41' }, query: { embarazo_id: '91' } }, {}),
    (error) => error.status === 409 && error.code === 'COMBINED_PDF_DOCUMENTS_MISSING' && /Plan de parto/.test(error.message)
  );
});

test('endpoint combinado transforma errores de generación y no responde contenido parcial', async () => {
  let responded = false;
  const controller = createPdfController({
    pdfService: {
      obtenerFichaMspasData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 } }),
      obtenerPlanPartoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, plan: { id: 7 } }),
      obtenerFichaRiesgoData: async () => ({ paciente: { id: 41 }, embarazo: { id: 91 }, riesgo: { id: 8 } }),
    },
    generarFichaClinicaPrenatalPdf: async () => { throw new Error('generator failed'); },
    exportExcelTemplateToPdf: async () => onePagePdf(202),
    renderRiskPdf: async () => onePagePdf(303),
    consumePdfQuota: () => {},
    sendPdfResponse: () => { responded = true; },
  });
  await assert.rejects(
    controller.pdfCombinado({ params: { pacienteId: '41' }, query: { embarazo_id: '91' } }, {}),
    (error) => error.status === 500 && error.code === 'COMBINED_PDF_GENERATION_ERROR'
  );
  assert.equal(responded, false);
});
