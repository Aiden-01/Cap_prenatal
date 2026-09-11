const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const RISK_TEMPLATE_PATH = path.join(
  __dirname,
  '../assets/official_forms/riesgo_oficial.pdf'
);

const RISK_PAGE = Object.freeze({ width: 612, height: 792 });

// pdf-lib uses points with the origin at the bottom-left of the page.
const RISK_PDF_FIELDS = Object.freeze({
  historiaClinica: Object.freeze({
    y: 641,
    size: 8,
    width: 16,
    align: 'center',
    x: Object.freeze([264, 283, 302, 321, 369, 388, 407, 426, 445, 483, 500, 517, 534]),
  }),
  nombre: { x: 149, y: 628.5, width: 313, size: 8.5, minSize: 6.2 },
  edad: { x: 502, y: 628.5, width: 43, size: 8.5, align: 'center' },
  residencia: { x: 111, y: 614.8, width: 294, size: 8.1, minSize: 5.8 },
  telefono: { x: 425, y: 614.8, width: 120, size: 8.1, minSize: 6.2 },
  estadoCivil: { x: 433, y: 599.2, width: 112, size: 7.8, minSize: 5.8 },
  ocupacion: { x: 466, y: 584.9, width: 79, size: 7.8, minSize: 5.4 },
  nombreEsposo: { x: 158, y: 570.5, width: 304, size: 7.8, minSize: 5.6 },
  edadEsposo: { x: 502, y: 570.5, width: 43, size: 8, align: 'center' },
  ocupacionEsposo: { x: 466, y: 539.3, width: 79, size: 7.7, minSize: 5.3 },
  distancia: { x: 186, y: 528.3, width: 96, size: 7.8, align: 'center' },
  tiempo: { x: 435, y: 528.3, width: 110, size: 7.8, align: 'center' },
  fur: { x: 118, y: 517.2, width: 88, size: 7.8, align: 'center' },
  fpp: { x: 293, y: 517.2, width: 94, size: 7.8, align: 'center' },
  embarazos: { x: 445, y: 517.2, width: 83, size: 7.8, align: 'center' },
  partos: { x: 92, y: 506.2, width: 57, size: 7.8, align: 'center' },
  cesareas: { x: 205, y: 506.2, width: 59, size: 7.8, align: 'center' },
  abortos: { x: 318, y: 506.2, width: 69, size: 7.8, align: 'center' },
  hijosVivos: { x: 445, y: 506.2, width: 83, size: 7.8, align: 'center' },
  hijosMuertos: { x: 117, y: 495.1, width: 52, size: 7.8, align: 'center' },
  edadGestacional: { x: 235, y: 495.1, width: 66, size: 7.8, align: 'center' },
  referidaA: { x: 244, y: 123.5, width: 301, size: 8, minSize: 5.4 },
  personalAtendio: { x: 314, y: 102.5, width: 231, size: 8, minSize: 5.4, align: 'center' },
});

const RISK_PDF_MARKS = Object.freeze({
  pueblo: Object.freeze({ maya: [120, 599], xinca: [177, 599], garifuna: [234, 599], mestizo: [290, 599], mestiza: [290, 599] }),
  migrante: [377, 599.2],
  escolaridad: Object.freeze({
    primaria: [139, 584.9], basico: [196, 584.9], secundaria: [196, 584.9],
    diversificado: [273, 584.9], universitaria: [357, 584.9], universitario: [357, 584.9],
    ninguno: [415, 584.9], ninguna: [415, 584.9],
  }),
  puebloEsposo: Object.freeze({ maya: [120, 554.9], xinca: [177, 554.9], garifuna: [234, 554.9], mestizo: [290, 554.9], mestiza: [290, 554.9] }),
  escolaridadEsposo: Object.freeze({
    primaria: [139, 539.3], basico: [196, 539.3], secundaria: [196, 539.3],
    diversificado: [273, 539.3], universitaria: [357, 539.3], universitario: [357, 539.3],
    ninguno: [415, 539.3], ninguna: [415, 539.3],
  }),
  yesX: 505,
  noX: 537,
  criteriaY: Object.freeze([
    461, 450, 439, 428, 417, 406, 395,
    363, 352, 341, 330, 319, 308, 297, 286, 275, 264, 253, 242,
    210, 199, 188, 177, 166, 155,
  ]),
  tieneRiesgo: Object.freeze({ yes: [434, 134], no: [489, 134] }),
});

const CRITERIA_KEYS = Object.freeze([
  'muerte_fetal_neonatal_previa', 'abortos_espontaneos_3mas', 'gestas_3mas',
  'peso_ultimo_bebe_menor_2500g', 'peso_ultimo_bebe_mayor_4500g',
  'antec_hipertension_preeclampsia', 'cirugias_tracto_reproductivo',
  'embarazo_multiple', 'menor_20_anos', 'mayor_35_anos', 'paciente_rh_negativo',
  'hemorragia_vaginal', 'vih_positivo_sifilis', 'presion_diastolica_90mas',
  'anemia', 'desnutricion_obesidad', 'dolor_abdominal', 'sintomatologia_urinaria',
  'ictericia', 'diabetes', 'enfermedad_renal', 'enfermedad_corazon',
  'hipertension_arterial', 'consumo_drogas_alcohol_tabaco', 'otra_enfermedad_severa',
]);

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeChoice(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
}

function dateParts(value) {
  if (!value) return null;
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { y: match[1], m: match[2], d: match[3] } : null;
}

function formatDate(value) {
  const parts = dateParts(value);
  return parts ? `${parts.d}/${parts.m}/${parts.y}` : '';
}

function ageYears(value, now = new Date()) {
  const parts = dateParts(value);
  if (!parts) return '';
  let age = now.getFullYear() - Number(parts.y);
  if ((now.getMonth() + 1) < Number(parts.m) || ((now.getMonth() + 1) === Number(parts.m) && now.getDate() < Number(parts.d))) age -= 1;
  return age >= 0 ? String(age) : '';
}

function fitText(font, text, options) {
  const value = clean(text);
  if (!value) return { text: '', size: options.size };
  const minSize = options.minSize || options.size;
  let size = options.size;
  while (size > minSize && font.widthOfTextAtSize(value, size) > options.width) size = Math.max(minSize, size - 0.25);
  if (font.widthOfTextAtSize(value, size) <= options.width) return { text: value, size };
  const suffix = '...';
  let output = value;
  while (output && font.widthOfTextAtSize(`${output}${suffix}`, size) > options.width) output = output.slice(0, -1);
  return { text: `${output.trimEnd()}${suffix}`, size };
}

function drawField(page, font, value, options) {
  const fitted = fitText(font, value, options);
  if (!fitted.text) return;
  let x = options.x;
  if (options.align === 'center') x += Math.max(0, (options.width - font.widthOfTextAtSize(fitted.text, fitted.size)) / 2);
  page.drawText(fitted.text, { x, y: options.y, size: fitted.size, font, color: rgb(0.05, 0.05, 0.05) });
}

function drawMark(page, font, point) {
  if (!point) return;
  const size = 8;
  const width = font.widthOfTextAtSize('X', size);
  page.drawText('X', { x: point[0] - width / 2, y: point[1], size, font, color: rgb(0.02, 0.02, 0.02) });
}

function drawChoice(page, font, value, positions) {
  drawMark(page, font, positions[normalizeChoice(value)]);
}

async function renderRiskPdf({ paciente = {}, embarazo = {}, riesgo = {} }, options = {}) {
  const templateBytes = options.templateBytes || fs.readFileSync(options.templatePath || RISK_TEMPLATE_PATH);
  const document = await PDFDocument.load(templateBytes);
  const pages = document.getPages();
  if (pages.length !== 1) throw new Error('La plantilla oficial de riesgo debe contener exactamente una pagina');
  const page = pages[0];
  const { width, height } = page.getSize();
  if (width !== RISK_PAGE.width || height !== RISK_PAGE.height) {
    throw new Error(`Dimensiones inesperadas en plantilla de riesgo: ${width}x${height}`);
  }

  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const nombre = `${clean(paciente.nombres)} ${clean(paciente.apellidos)}`.trim();
  const fur = riesgo.fecha_ultima_regla || embarazo.fur || paciente.fur;
  const fpp = riesgo.fecha_probable_parto || embarazo.fpp || paciente.fpp;

  const history = clean(paciente.cui || paciente.no_expediente).replace(/\D/g, '').slice(0, 13);
  [...history].forEach((digit, index) => drawField(page, bold, digit, { ...RISK_PDF_FIELDS.historiaClinica, x: RISK_PDF_FIELDS.historiaClinica.x[index] }));
  drawField(page, bold, nombre, RISK_PDF_FIELDS.nombre);
  drawField(page, bold, ageYears(paciente.fecha_nacimiento, options.now), RISK_PDF_FIELDS.edad);
  drawField(page, bold, paciente.municipio || paciente.domicilio || paciente.comunidad, RISK_PDF_FIELDS.residencia);
  drawField(page, bold, riesgo.telefono || paciente.telefono, RISK_PDF_FIELDS.telefono);
  drawChoice(page, bold, riesgo.pueblo || paciente.pueblo, RISK_PDF_MARKS.pueblo);
  if (riesgo.migrante) drawMark(page, bold, RISK_PDF_MARKS.migrante);
  drawField(page, bold, riesgo.estado_civil || paciente.estado_civil, RISK_PDF_FIELDS.estadoCivil);
  drawChoice(page, bold, riesgo.escolaridad || paciente.nivel_estudios, RISK_PDF_MARKS.escolaridad);
  drawField(page, bold, riesgo.ocupacion || paciente.profesion_oficio, RISK_PDF_FIELDS.ocupacion);
  drawField(page, bold, riesgo.nombre_esposo_conviviente || paciente.nombre_esposo_conviviente, RISK_PDF_FIELDS.nombreEsposo);
  drawField(page, bold, riesgo.edad_esposo, RISK_PDF_FIELDS.edadEsposo);
  drawChoice(page, bold, riesgo.pueblo_esposo, RISK_PDF_MARKS.puebloEsposo);
  drawChoice(page, bold, riesgo.escolaridad_esposo, RISK_PDF_MARKS.escolaridadEsposo);
  drawField(page, bold, riesgo.ocupacion_esposo, RISK_PDF_FIELDS.ocupacionEsposo);
  drawField(page, bold, riesgo.distancia_servicio_km, RISK_PDF_FIELDS.distancia);
  drawField(page, bold, riesgo.tiempo_horas, RISK_PDF_FIELDS.tiempo);
  drawField(page, bold, formatDate(fur), RISK_PDF_FIELDS.fur);
  drawField(page, bold, formatDate(fpp), RISK_PDF_FIELDS.fpp);
  drawField(page, bold, riesgo.no_embarazos, RISK_PDF_FIELDS.embarazos);
  drawField(page, bold, riesgo.no_partos, RISK_PDF_FIELDS.partos);
  drawField(page, bold, riesgo.no_cesareas, RISK_PDF_FIELDS.cesareas);
  drawField(page, bold, riesgo.no_abortos, RISK_PDF_FIELDS.abortos);
  drawField(page, bold, riesgo.no_hijos_vivos, RISK_PDF_FIELDS.hijosVivos);
  drawField(page, bold, riesgo.no_hijos_muertos, RISK_PDF_FIELDS.hijosMuertos);
  drawField(page, bold, riesgo.edad_embarazo_semanas, RISK_PDF_FIELDS.edadGestacional);

  CRITERIA_KEYS.forEach((key, index) => {
    drawMark(page, bold, [riesgo[key] ? RISK_PDF_MARKS.yesX : RISK_PDF_MARKS.noX, RISK_PDF_MARKS.criteriaY[index]]);
  });
  drawMark(page, bold, riesgo.tiene_riesgo ? RISK_PDF_MARKS.tieneRiesgo.yes : RISK_PDF_MARKS.tieneRiesgo.no);
  drawField(page, font, riesgo.referida_a, RISK_PDF_FIELDS.referidaA);
  drawField(page, font, riesgo.nombre_personal_atendio, RISK_PDF_FIELDS.personalAtendio);

  return document.save();
}

module.exports = {
  CRITERIA_KEYS,
  RISK_PAGE,
  RISK_PDF_FIELDS,
  RISK_PDF_MARKS,
  RISK_TEMPLATE_PATH,
  fitText,
  formatDate,
  renderRiskPdf,
};
