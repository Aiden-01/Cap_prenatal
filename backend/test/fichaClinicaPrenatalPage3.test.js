const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const {
  generarFichaClinicaPrenatalPdf,
  helpers,
} = require('../src/services/fichaClinicaPrenatalPdf');
const coords = require('../src/config/fichaClinicaPrenatalCoords');

function fakeDrawing() {
  const draws = [];
  return {
    draws,
    page: {
      getHeight: () => 936,
      drawText: (text, options) => draws.push({ text, ...options }),
      drawLine: () => {},
    },
    font: {
      widthOfTextAtSize: (text, size) => String(text).length * size * 0.52,
    },
  };
}

function morbilidad(overrides = {}) {
  return {
    id: 1,
    embarazo_id: 20,
    fecha: '2026-02-10',
    hora: '08:15:00',
    motivo_consulta: 'Dolor abdominal',
    historia_enfermedad_actual: 'Dolor de dos dias de evolucion.',
    revision_por_sistemas: 'Sin fiebre ni sintomas urinarios.',
    examen_fisico: 'Paciente alerta, signos vitales estables.',
    impresion_clinica: 'Dolor abdominal en estudio.',
    tratamiento_referencia: 'Hidratacion y control en 24 horas.',
    nombre_cargo_atiende: 'Ana Perez - Medica',
    ...overrides,
  };
}

test('el generador llama drawPage3 entre las paginas 2 y 4', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/fichaClinicaPrenatalPdf.js'),
    'utf8'
  );
  const page2 = source.indexOf('drawPage2({');
  const page3 = source.lastIndexOf('drawPage3({');
  const page4 = source.indexOf('drawPage4({', page3);
  assert.ok(page2 >= 0 && page3 > page2 && page4 > page3);
});

test('expediente vacio genera el PDF completo de cuatro paginas', async () => {
  const bytes = await generarFichaClinicaPrenatalPdf({
    paciente: {},
    embarazo: { id: 20 },
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
});

test('suplementacion coloca valores del control en su columna', () => {
  const drawing = fakeDrawing();
  helpers.drawPage3({
    ...drawing,
    embarazo: { id: 20 },
    controles: [{
      id: 5,
      numero_control: 1,
      sulfato_ferroso: true,
      sulfato_ferroso_tabletas: 30,
      acido_folico: false,
      acido_folico_tabletas: 60,
      suplementacion_hallazgos: 'Buena tolerancia',
      suplementacion_tratamiento: 'Continuar diariamente',
    }],
  });

  const textos = drawing.draws.map(({ text }) => text);
  assert.ok(textos.includes('30'));
  assert.ok(textos.includes('60'));
  assert.ok(textos.some((text) => text.includes('Buena tolerancia')));
  assert.ok(textos.some((text) => text.includes('Continuar diariamente')));
  assert.equal(drawing.draws.filter(({ text }) => text === 'X').length, 2);
});

test('un evento de morbilidad coloca todos sus campos en el primer bloque', () => {
  const drawing = fakeDrawing();
  helpers.drawPage3({
    ...drawing,
    embarazo: { id: 20 },
    morbilidad: [morbilidad()],
  });

  const contenido = drawing.draws.map(({ text }) => text).join(' ');
  for (const esperado of [
    'Dolor abdominal',
    'Dolor de dos dias',
    'Sin fiebre',
    'Paciente alerta',
    'Dolor abdominal en estudio',
    'Hidratacion',
    'Ana Perez',
  ]) {
    assert.match(contenido, new RegExp(esperado));
  }
});

test('persona que atiende usa el nombre real asociado cuando el campo clinico esta vacio', () => {
  const drawing = fakeDrawing();
  helpers.drawPage3({
    ...drawing,
    embarazo: { id: 20 },
    morbilidad: [morbilidad({
      nombre_cargo_atiende: null,
      persona_atiende_pdf: 'Usuario Clinico Asociado',
    })],
  });
  assert.match(
    drawing.draws.map(({ text }) => text).join(' '),
    /Usuario Clinico Asociado/
  );
});

test('varios eventos se seleccionan en orden cronologico', () => {
  const seleccion = helpers.seleccionarMorbilidades([
    morbilidad({ id: 3, fecha: '2026-03-10' }),
    morbilidad({ id: 1, fecha: '2026-01-10' }),
    morbilidad({ id: 2, fecha: '2026-02-10' }),
  ], 20, 3);
  assert.deepEqual(seleccion.eventos.map(({ id }) => id), [1, 2, 3]);
});

test('eventos de otro embarazo no se incluyen', () => {
  const seleccion = helpers.seleccionarMorbilidades([
    morbilidad({ id: 1, embarazo_id: 20 }),
    morbilidad({ id: 2, embarazo_id: 99 }),
  ], 20, 2);
  assert.deepEqual(seleccion.eventos.map(({ id }) => id), [1]);
});

test('eventos superiores a la capacidad se omiten sin crear un tercer bloque', () => {
  const drawing = fakeDrawing();
  const seleccion = helpers.drawPage3({
    ...drawing,
    embarazo: { id: 20 },
    morbilidad: [
      morbilidad({ id: 1, historia_enfermedad_actual: 'EVENTO UNO' }),
      morbilidad({ id: 2, fecha: '2026-03-01', historia_enfermedad_actual: 'EVENTO DOS' }),
      morbilidad({ id: 3, fecha: '2026-04-01', historia_enfermedad_actual: 'EVENTO TRES' }),
    ],
  });
  const contenido = drawing.draws.map(({ text }) => text).join(' ');

  assert.equal(seleccion.eventos.length, coords.pages[3].morbidityCapacity);
  assert.equal(seleccion.omitidos, 1);
  assert.match(contenido, /EVENTO UNO/);
  assert.match(contenido, /EVENTO DOS/);
  assert.doesNotMatch(contenido, /EVENTO TRES/);
});

test('texto extenso reduce fuente y recorta dentro de la casilla', () => {
  const drawing = fakeDrawing();
  const cfg = coords.pages[3].morbidity[0].historiaEnfermedadActual;
  const layout = helpers.layoutAdaptiveText(
    Array.from({ length: 180 }, () => 'descripcion').join(' '),
    drawing.font,
    cfg
  );

  assert.ok(layout.lines.length <= cfg.maxLines);
  assert.ok(layout.size >= cfg.minSize);
  assert.equal(layout.truncated, true);
  layout.lines.forEach((line, index) => {
    const width = index === 0 ? cfg.firstLineWidth : cfg.nextLinesWidth;
    assert.ok(drawing.font.widthOfTextAtSize(line, layout.size) <= width);
  });
});

test('la integracion conserva la ejecucion y presencia de paginas 1, 2 y 4', async () => {
  const bytes = await generarFichaClinicaPrenatalPdf({
    paciente: { no_expediente: 'TEST-001', nombres: 'Paciente' },
    embarazo: { id: 20 },
    controles: [{ id: 1, numero_control: 1, fecha: '2026-01-01' }],
    puerperio: [{ numero_atencion: 1, fecha: '2026-09-01' }],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPages().length, 4);
});
