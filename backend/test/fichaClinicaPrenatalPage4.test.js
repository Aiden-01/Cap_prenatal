const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

const {
  generarFichaClinicaPrenatalPdf,
  helpers,
} = require('../src/services/fichaClinicaPrenatalPdf');

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

function puerperio(numero, token) {
  const largo = Array.from({ length: 45 }, () => `${token} texto clinico`).join(' ');
  return {
    numero_atencion: numero,
    fecha: '2026-08-01',
    hora: '09:30:00',
    examen_mamas: largo,
    examen_ginecologico: largo,
    orientacion_consejeria: largo,
    impresion_clinica: largo,
    tratamiento: largo,
    nombre_cargo_atiende: `Profesional ${numero}`,
  };
}

function assertMargenAdaptable(draws, token) {
  const lineas = draws.filter(({ text }) => text.includes(token));
  assert.ok(lineas.length > 5);
  assert.ok(lineas.some(({ x }) => x === 25));
  assert.ok(lineas.every(({ size }) => size >= 4.8));
  assert.ok(lineas.some(({ text }) => text.endsWith('...')));
}

test('primera atencion aplica salto y margen uniforme a textos largos', () => {
  const drawing = fakeDrawing();
  helpers.drawPage4({
    ...drawing,
    puerperio: [puerperio(1, 'PRIMERA')],
  });
  assertMargenAdaptable(drawing.draws, 'PRIMERA');
});

test('segunda atencion utiliza el mismo comportamiento adaptable', () => {
  const drawing = fakeDrawing();
  helpers.drawPage4({
    ...drawing,
    puerperio: [puerperio(2, 'SEGUNDA')],
  });
  assertMargenAdaptable(drawing.draws, 'SEGUNDA');
});

test('la ficha con ambas atenciones conserva cuatro paginas', async () => {
  const bytes = await generarFichaClinicaPrenatalPdf({
    paciente: { no_expediente: 'PAGE4-TEST' },
    embarazo: { id: 20 },
    puerperio: [puerperio(1, 'PRIMERA'), puerperio(2, 'SEGUNDA')],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
});
