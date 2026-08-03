const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PDFDocument } = require('pdf-lib');

const coords = require('../src/config/fichaClinicaPrenatalCoords');
const {
  generarFichaClinicaPrenatalPdf,
  helpers: {
    drawVaccines,
    isTdOrTdap,
    prepareOfficialVaccineData,
  },
} = require('../src/services/fichaClinicaPrenatalPdf');

const record = (tipo_vacuna, fecha_dosis, momento = 'durante_embarazo', extra = {}) => ({
  id: extra.id || 1,
  embarazo_id: extra.embarazo_id || 91,
  numero_dosis: extra.numero_dosis || 1,
  tipo_vacuna,
  momento,
  fecha_dosis,
});

function row(data, key) {
  return data.rows.find((item) => item.key === key);
}

test('fila oficial combina TD y Tdap sin crear un tipo almacenado adicional', () => {
  assert.equal(isTdOrTdap('td'), true);
  assert.equal(isTdOrTdap('tdap'), true);
  assert.equal(isTdOrTdap('influenza'), false);

  const onlyTd = prepareOfficialVaccineData([record('td', '2026-06-01')]);
  assert.equal(row(onlyTd, 'tdOrTdap').records.length, 1);
  const onlyTdap = prepareOfficialVaccineData([record('tdap', '2026-06-02')]);
  assert.equal(row(onlyTdap, 'tdOrTdap').records.length, 1);

  const mixed = prepareOfficialVaccineData([
    record('tdap', '2026-07-01', 'durante_embarazo', { id: 3 }),
    record('td', '2025-12-01', 'previo_embarazo', { id: 1 }),
    record('td', '2026-06-01', 'durante_embarazo', { id: 2 }),
    record('tdap', '2026-10-01', 'postparto_aborto', { id: 4 }),
  ]);
  assert.deepEqual(
    row(mixed, 'tdOrTdap').records.map(({ fecha_dosis }) => fecha_dosis),
    ['2025-12-01', '2026-06-01', '2026-07-01', '2026-10-01']
  );
  assert.deepEqual(mixed.previous.map(({ fecha_dosis }) => fecha_dosis), ['2025-12-01']);
  assert.deepEqual(
    mixed.duringOrPostpartum.map(({ fecha_dosis }) => fecha_dosis),
    ['2026-06-01', '2026-07-01', '2026-10-01']
  );
});

test('Influenza simple y SR/SPR conservan registros, fechas y momentos independientes', () => {
  const data = prepareOfficialVaccineData([
    record('influenza', '2026-01-15', 'previo_embarazo', { id: 1, numero_dosis: 1 }),
    record('influenza', '2026-06-20', 'durante_embarazo', { id: 2, numero_dosis: 1 }),
    record('influenza', '2026-10-20', 'postparto_aborto', { id: 3, numero_dosis: 1 }),
    record('spr_sr', '2025-12-01', 'previo_embarazo', { id: 4, numero_dosis: 2 }),
  ]);
  assert.deepEqual(
    row(data, 'influenza').records.map(({ id }) => id),
    [1, 2, 3]
  );
  assert.deepEqual(row(data, 'sprSr').records.map(({ id }) => id), [4]);
  assert.equal(data.previous.some(({ tipo_vacuna }) => tipo_vacuna === 'influenza'), true);
  assert.equal(data.duringOrPostpartum.some(({ tipo_vacuna }) => tipo_vacuna === 'spr_sr'), false);
});

test('ausencia total marca No y las fechas se dibujan en orden cronológico', () => {
  const drawn = [];
  const page = {
    getHeight: () => 936,
    drawText: (value, options) => drawn.push({ value, ...options }),
  };
  const font = { widthOfTextAtSize: (value) => String(value).length * 3 };
  drawVaccines(page, font, [], coords.pages[1]);
  assert.equal(drawn.filter(({ value }) => value === 'X').length, 3);

  drawn.length = 0;
  drawVaccines(page, font, [
    record('influenza', '2026-08-03', 'durante_embarazo', { id: 2 }),
    record('tdap', '2026-06-01', 'durante_embarazo', { id: 1 }),
    record('spr_sr', '2026-10-01', 'postparto_aborto', { id: 3 }),
  ], coords.pages[1]);
  const years = drawn.filter(({ value }) => value === '2026');
  assert.equal(years.length, 3);
  assert.deepEqual(years.map(({ x }) => x), [402, 485, 570]);
});

test('exceso de fechas usa los primeros dos antecedentes y las primeras tres aplicaciones actuales', () => {
  const drawn = [];
  const page = {
    getHeight: () => 936,
    drawText: (value, options) => drawn.push({ value, ...options }),
  };
  const font = { widthOfTextAtSize: (value) => String(value).length * 3 };
  drawVaccines(page, font, [
    record('td', '2020-01-01', 'previo_embarazo', { id: 1 }),
    record('td', '2021-01-01', 'previo_embarazo', { id: 2 }),
    record('influenza', '2022-01-01', 'previo_embarazo', { id: 3 }),
    record('tdap', '2023-01-01', 'durante_embarazo', { id: 4 }),
    record('influenza', '2024-01-01', 'durante_embarazo', { id: 5 }),
    record('influenza', '2025-01-01', 'durante_embarazo', { id: 6 }),
    record('spr_sr', '2026-01-01', 'postparto_aborto', { id: 7 }),
  ], coords.pages[1]);
  assert.deepEqual(
    drawn.filter(({ value }) => /^20\d{2}$/.test(value)).map(({ value }) => value),
    ['2020', '2021', '2023', '2024', '2025']
  );
});

test('fecha vacía no imprime Invalid Date ni rompe el PDF', () => {
  const drawn = [];
  const page = {
    getHeight: () => 936,
    drawText: (value, options) => drawn.push({ value, ...options }),
  };
  const font = { widthOfTextAtSize: (value) => String(value).length * 3 };
  drawVaccines(page, font, [record('influenza', null)], coords.pages[1]);
  assert.equal(drawn.some(({ value }) => /Invalid Date/i.test(String(value))), false);
});

test('plantilla permanece byte por byte y coordenadas oficiales no cambian', () => {
  const root = path.join(__dirname, '../src');
  const template = fs.readFileSync(path.join(root, 'assets/mspas/ficha_clinica_embarazo_puerperio.pdf'));
  assert.equal(crypto.createHash('sha256').update(template).digest('hex'), 'bb77f7d02d69b5e56933486a8900e1a6eceb722fcdba4af3a5342adb583a265d');
  assert.deepEqual(coords.pages[1].vaccineDates, {
    previoDosis: { x: 259, y: 549, w: 42, size: 6.4, align: 'center' },
    previoFecha1: { x: 249, y: 569 },
    previoFecha2: { x: 249, y: 594 },
    duranteFecha1: { x: 350, y: 579 },
    duranteFecha2: { x: 433, y: 579 },
    duranteFecha3: { x: 518, y: 579 },
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(coords.pages[1].marks.booleans)
      .filter(([key]) => key.startsWith('vacuna'))),
    {
      vacunaTdTdapNo: { x: 78, y: 564 },
      vacunaTdTdapPrevio: { x: 114, y: 564 },
      vacunaTdTdapDurante: { x: 147, y: 564 },
      vacunaTdTdapPostparto: { x: 181, y: 564 },
      vacunaInfluenzaNo: { x: 78, y: 579 },
      vacunaInfluenzaPrevio: { x: 114, y: 579 },
      vacunaInfluenzaDurante: { x: 147, y: 579 },
      vacunaInfluenzaPostparto: { x: 181, y: 579 },
      vacunaSprSrNo: { x: 78, y: 595 },
      vacunaSprSrPrevio: { x: 114, y: 595 },
      vacunaSprSrDurante: { x: 147, y: 595 },
      vacunaSprSrPostparto: { x: 181, y: 595 },
    }
  );
});

test('PDF final conserva cuatro páginas con TD, Tdap, Influenza y SR/SPR', async () => {
  const bytes = await generarFichaClinicaPrenatalPdf({
    paciente: {},
    embarazo: {},
    vacunas: [
      record('td', '2025-12-01', 'previo_embarazo', { id: 1 }),
      record('tdap', '2026-06-01', 'durante_embarazo', { id: 2 }),
      record('influenza', '2026-07-01', 'durante_embarazo', { id: 3 }),
      record('influenza', '2026-08-01', 'durante_embarazo', { id: 4 }),
      record('spr_sr', '2026-10-01', 'postparto_aborto', { id: 5 }),
    ],
  });
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 4);
});

test('consulta PDF mantiene paciente y embarazo seleccionados', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/repositories/pdfRepository.js'), 'utf8');
  assert.match(source, /WHERE vp\.embarazo_id = \$1 AND e\.paciente_id = \$2/);
  assert.match(source, /ORDER BY vp\.fecha_dosis ASC NULLS LAST, vp\.id ASC/);
});
