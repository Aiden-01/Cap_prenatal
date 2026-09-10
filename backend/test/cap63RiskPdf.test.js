const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { PDFDocument } = require('pdf-lib');

const { createPdfController } = require('../src/controllers/pdfController');
const {
  CRITERIA_KEYS,
  RISK_PAGE,
  RISK_PDF_FIELDS,
  RISK_TEMPLATE_PATH,
  fitText,
  renderRiskPdf,
} = require('../src/services/riskPdfRenderer');

const SAMPLE = {
  paciente: {
    id: 41,
    cui: '1234567890101',
    nombres: 'Maria Alejandra de los Angeles',
    apellidos: 'Hernandez Castellanos',
    fecha_nacimiento: '1991-03-14',
    municipio: 'Aldea de residencia extensa, El Chal, Peten',
    telefono: '5555 1234',
    pueblo: 'maya',
    estado_civil: 'casada',
    nivel_estudios: 'universitaria',
    profesion_oficio: 'Comerciante y agricultora independiente',
    nombre_esposo_conviviente: 'Jose Francisco Perez Lopez',
  },
  embarazo: { id: 91, fur: '2026-01-15', fpp: '2026-10-22' },
  riesgo: {
    id: 63,
    embarazo_id: 91,
    migrante: true,
    edad_esposo: 38,
    pueblo_esposo: 'mestizo',
    escolaridad_esposo: 'diversificado',
    ocupacion_esposo: 'Transportista de carga pesada',
    distancia_servicio_km: '0.5',
    tiempo_horas: '0.25',
    no_embarazos: 4,
    no_partos: 2,
    no_cesareas: 1,
    no_abortos: 1,
    no_hijos_vivos: 2,
    no_hijos_muertos: 1,
    edad_embarazo_semanas: 34,
    tiene_riesgo: true,
    referida_a: 'Hospital Regional de San Benito, clinica de alto riesgo obstetrico',
    nombre_personal_atendio: 'Licda. Ana Gabriela Morales Hernandez',
    ...Object.fromEntries(CRITERIA_KEYS.map((key, index) => [key, index % 2 === 0])),
  },
};

function pdfOperators(bytes) {
  const source = Buffer.from(bytes).toString('latin1');
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      const stream = Buffer.from(match[1], 'latin1');
      try { return zlib.inflateSync(stream).toString('latin1'); } catch { return ''; }
    })
    .join('\n');
}

function assertEncodedText(operators, value) {
  assert.match(operators, new RegExp(Buffer.from(value, 'latin1').toString('hex'), 'i'));
}

test('CAP-63 carga la plantilla canonica Letter vertical de una pagina', async () => {
  const document = await PDFDocument.load(fs.readFileSync(RISK_TEMPLATE_PATH));
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual(document.getPage(0).getSize(), RISK_PAGE);
  assert.ok(RISK_PAGE.height > RISK_PAGE.width);
});

test('CAP-63 genera un PDF valido con una pagina y dimensiones identicas', async () => {
  const bytes = await renderRiskPdf(SAMPLE, { now: new Date(2026, 8, 10) });
  assert.ok(Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-')));
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual(document.getPage(0).getSize(), RISK_PAGE);
});

test('CAP-63 conserva texto, numeros, fechas, referencia, personal, X y decimales', async () => {
  const bytes = await renderRiskPdf(SAMPLE, { now: new Date(2026, 8, 10) });
  const raw = pdfOperators(bytes);
  for (const expected of ['Maria Alejandra', '38', '15/01/2026', '22/10/2026', '0.25', '0.5', 'Hospital Regional', 'Ana Gabriela', 'X']) {
    assertEncodedText(raw, expected);
  }
  assert.doesNotMatch(raw, /302e3030|312e3030/i);
});

test('CAP-63 preserva 0.25, 0.5 y 1.5 sin redondear', async () => {
  for (const value of ['0.25', '0.5', '1.5']) {
    const bytes = await renderRiskPdf({ ...SAMPLE, riesgo: { ...SAMPLE.riesgo, distancia_servicio_km: value, tiempo_horas: value } });
    assertEncodedText(pdfOperators(bytes), value);
  }
});

test('CAP-63 maneja nulls y limita texto largo al ancho configurado', async () => {
  await assert.doesNotReject(renderRiskPdf({ paciente: {}, embarazo: {}, riesgo: {} }));
  const document = await PDFDocument.create();
  const font = await document.embedFont('Helvetica-Bold');
  const fitted = fitText(font, 'Nombre extremadamente largo '.repeat(20), RISK_PDF_FIELDS.nombre);
  assert.ok(fitted.size >= RISK_PDF_FIELDS.nombre.minSize);
  assert.ok(font.widthOfTextAtSize(fitted.text, fitted.size) <= RISK_PDF_FIELDS.nombre.width);
  assert.match(fitted.text, /\.\.\.$/);
});

test('CAP-63 handler de riesgo conserva contrato y no invoca exportador de Office', async () => {
  const calls = [];
  const response = {
    set() {},
    send(value) { calls.push(['send', Buffer.from(value)]); return value; },
  };
  const controller = createPdfController({
    pdfService: { obtenerFichaRiesgoData: async () => SAMPLE },
    consumePdfQuota: () => calls.push(['quota']),
    renderRiskPdf: async () => { calls.push(['renderer']); return Buffer.from('%PDF-test'); },
    exportExcelTemplateToPdf: async () => { throw new Error('Riesgo no debe usar Office'); },
    registrarEventoPrivado: async (_req, event) => calls.push(['audit', event]),
    sendPdfResponse: (_res, pdf, filename) => { calls.push(['response', filename, pdf]); return pdf; },
  });
  await controller.pdfRiesgoObstetrico({ params: { pacienteId: '41' }, query: { embarazo_id: '91' } }, response);
  assert.deepEqual(calls.map(([name]) => name), ['quota', 'renderer', 'audit', 'response']);
  assert.equal(calls[2][1].contexto.evento, 'pdf_clinico_generado');
  assert.equal(calls[2][1].metadata.tipo_documento, 'riesgo_obstetrico');
  assert.equal(calls[3][1], 'ficha-riesgo-41.pdf');
});

test('CAP-63 mantiene Plan de parto en XLSX y exportador actual', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/pdfController.js'), 'utf8');
  assert.match(source, /plan_parto_oficial\.xlsx/);
  assert.match(source, /pdfPlanPartoHandler[\s\S]*?exportExcelTemplateToPdf\(templatePath, cellMap\)/);
  assert.doesNotMatch(source, /pdfRiesgoObstetricoHandler[\s\S]*?riesgo_oficial\.xlsx[\s\S]*?pdfPlanPartoHandler/);
});
