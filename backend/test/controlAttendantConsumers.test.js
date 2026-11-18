const test = require('node:test');
const assert = require('node:assert/strict');
const { formatControlAttendant, controlAttendantName, controlAttendantRole } = require('../src/utils/controlAttendant');
const { createReportesRepository } = require('../src/repositories/reportesRepository');
const { generarFichaClinicaPrenatalPdf } = require('../src/services/fichaClinicaPrenatalPdf');
const { PDFDocument, PDFArray, decodePDFRawStream } = require('pdf-lib');

test('atiende conserva texto legado sin desglosar ni inferir datos estructurados', () => {
  const control = { nombre_cargo_atiende: '  Dra. Texto legado - puesto declarado  ' };
  assert.equal(formatControlAttendant(control), control.nombre_cargo_atiende);
  assert.equal(controlAttendantName(control), '');
  assert.equal(controlAttendantRole(control), '');
});

test('atiende usa solo nombre libre y snapshot histórico, sin mezclar legado ni cargo vigente', () => {
  const control = { nombre_atiende: 'Nombre capturado', cargo_atiende_snapshot: { id: 7, nombre: 'Cargo histórico', codigo: null },
    nombre_cargo_atiende: 'No incorporar', cargo_nombre: 'Cargo renombrado', registrado_por: 15 };
  assert.equal(formatControlAttendant(control), 'Nombre capturado · Cargo histórico');
  assert.equal(formatControlAttendant({ ...control, nombre_atiende: null }), 'Cargo histórico');
  assert.equal(formatControlAttendant({ ...control, cargo_atiende_snapshot: null }), 'Nombre capturado');
});

test('reporte conserva contrato personal_atiende, con cargos históricos y sin campos internos extra', async () => {
  const repository = createReportesRepository({ query: async () => ({ rows: [
    { id: 1, personal_atiende: 'Legado íntegro', nombre_atiende: null, cargo_atiende_snapshot: null },
    { id: 2, personal_atiende: 'No mezclar', nombre_atiende: 'Nuevo nombre', cargo_atiende_snapshot: { nombre: 'Cargo guardado' } },
    { id: 3, personal_atiende: null, nombre_atiende: null, cargo_atiende_snapshot: null },
    { id: 4, personal_atiende: '', nombre_atiende: '', cargo_atiende_snapshot: null },
  ] }) });
  assert.deepEqual(await repository.obtenerControlesPrenatales('2026-01-01', '2026-12-31'), [
    { id: 1, personal_atiende: 'Legado íntegro' }, { id: 2, personal_atiende: 'Nuevo nombre · Cargo guardado' },
    { id: 3, personal_atiende: null }, { id: 4, personal_atiende: '' },
  ]);
});

test('ficha MSPAS conserva cuatro hojas y dibuja nombre/cargo declarado nuevo o legado', async () => {
  const cases = [
    { nombre_atiende: 'Nombre', cargo_atiende_snapshot: { nombre: 'MED' }, nombre_cargo_atiende: 'No mezclar', expected: 'Nombre · MED' },
    { nombre_cargo_atiende: 'Texto legado', expected: 'Texto legado' },
  ];
  for (const control of cases) {
    const bytes = await generarFichaClinicaPrenatalPdf({ paciente: {}, embarazo: {}, controles: [{ numero_control: 1, ...control }] });
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 4);
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const content = streams.map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1')).join('\n');
    assert.ok(content.includes(Buffer.from(control.expected, 'latin1').toString('hex').toUpperCase()));
    assert.ok(!content.includes(Buffer.from('No mezclar', 'latin1').toString('hex').toUpperCase()));
  }
});

test('ficha conserva situación/presentación nuevas o históricas en el control evaluable sin normalización silenciosa', async () => {
  const expected = ['Longitudinal', 'Pélvica/podálica', 'Dato legado'];
  const bytes = await generarFichaClinicaPrenatalPdf({ paciente: {}, embarazo: {}, controles: [
    { numero_control: 3, situacion_fetal: expected[0], presentacion_fetal: expected[1] },
    { numero_control: 4, situacion_fetal: expected[2], presentacion_fetal: expected[2] },
  ] });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
  const contents = pdf.getPage(1).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = streams.map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1')).join('\n');
  for (const text of expected) assert.ok(content.includes(Buffer.from(text, 'latin1').toString('hex').toUpperCase()), text);
});
