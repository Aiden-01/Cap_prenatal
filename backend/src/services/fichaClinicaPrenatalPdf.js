const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const coords = require('../config/fichaClinicaPrenatalCoords');

const DEFAULT_TEMPLATE_PATH = path.join(
  __dirname,
  '../assets/mspas/ficha_clinica_embarazo_puerperio.pdf'
);

function isDebugEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DEBUG_PDF_COORDS || '').toLowerCase()
  );
}

function safe(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function dateParts(value) {
  if (!value) return { d: '', m: '', y: '' };
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return { d: match[3], m: match[2], y: match[1] };
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return { d: '', m: '', y: '' };
  return {
    d: String(dt.getUTCDate()).padStart(2, '0'),
    m: String(dt.getUTCMonth() + 1).padStart(2, '0'),
    y: String(dt.getUTCFullYear()),
  };
}

function timeParts(value) {
  if (!value) return { h: '', m: '' };
  const text = safe(value);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { h: '', m: '' };
  return {
    h: match[1].padStart(2, '0'),
    m: match[2],
  };
}

function edadAnios(fecha) {
  if (!fecha) return '';
  const n = new Date(fecha);
  if (Number.isNaN(n.getTime())) return '';
  const hoy = new Date();
  let edad = hoy.getFullYear() - n.getUTCFullYear();
  const mes = hoy.getMonth() - n.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < n.getUTCDate())) edad -= 1;
  return edad;
}

function calcularFppDesdeFur(fur) {
  if (!fur) return '';
  const parts = dateParts(fur);
  if (!parts.y || !parts.m || !parts.d) return '';
  const dt = new Date(Date.UTC(Number(parts.y), Number(parts.m) - 1, Number(parts.d)));
  if (Number.isNaN(dt.getTime())) return '';
  dt.setUTCDate(dt.getUTCDate() + 280);
  return dt.toISOString().slice(0, 10);
}

function firstDateValue(...values) {
  return values.find((value) => {
    const parts = dateParts(value);
    return Boolean(parts.y && parts.m && parts.d);
  }) || '';
}

function yFromTop(page, yTop, size = 7) {
  return page.getHeight() - yTop - size;
}

function fitText(text, font, size, width) {
  let out = safe(text).replace(/\s+/g, ' ').trim();
  if (!out || !width) return out;
  if (font.widthOfTextAtSize(out, size) <= width) return out;

  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) {
    out = out.slice(0, -1).trimEnd();
  }
  return out ? `${out}...` : '';
}

function wrapText(text, font, size, width, maxLines = 2) {
  const words = safe(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.length) {
    lines[maxLines - 1] = fitText(lines[maxLines - 1], font, size, width);
  }
  return lines;
}

function debugPoint(page, x, yTop, label, font) {
  if (!isDebugEnabled()) return;
  const y = page.getHeight() - yTop;
  page.drawLine({ start: { x: x - 3, y }, end: { x: x + 3, y }, color: rgb(1, 0, 0), thickness: 0.5 });
  page.drawLine({ start: { x, y: y - 3 }, end: { x, y: y + 3 }, color: rgb(1, 0, 0), thickness: 0.5 });
  if (label) {
    page.drawText(label, {
      x: x + 3,
      y: y + 2,
      size: 3.8,
      font,
      color: rgb(1, 0, 0),
    });
  }
}

function drawTextBox(page, font, value, cfg, label) {
  const text = safe(value);
  if (!text) return;

  const size = cfg.size || 7;
  const width = cfg.w || 120;
  const x = cfg.x;
  let y = yFromTop(page, cfg.y, size);
  debugPoint(page, x, cfg.y, label, font);

  if (cfg.maxLines && cfg.maxLines > 1) {
    const lines = wrapText(text, font, size, width, cfg.maxLines);
    lines.forEach((line, idx) => {
      page.drawText(line, {
        x,
        y: y - idx * (size + 1.5),
        size,
        font,
        color: rgb(0.05, 0.05, 0.05),
      });
    });
    return;
  }

  const fitted = fitText(text, font, size, width);
  const textWidth = font.widthOfTextAtSize(fitted, size);
  if (cfg.align === 'center') {
    y = yFromTop(page, cfg.y, size);
  }
  page.drawText(fitted, {
    x: cfg.align === 'center' ? x + Math.max((width - textWidth) / 2, 0) : x,
    y,
    size,
    font,
    color: rgb(0.05, 0.05, 0.05),
  });
}

function drawDate(page, font, value, cfg, label, tiny = false) {
  const parts = dateParts(value);
  const gap = tiny ? 25 : 25;
  const yearOffset = tiny ? 50 : 50;
  const size = tiny ? 5.2 : 5.6;
  const boxes = [
    { value: parts.d, x: cfg.x, w: tiny ? 15 : 16 },
    { value: parts.m, x: cfg.x + gap, w: tiny ? 15 : 16 },
    { value: parts.y, x: cfg.x + yearOffset, w: tiny ? 29 : 30 },
  ];
  boxes.forEach((box, index) => drawTextBox(
    page,
    font,
    box.value,
    { x: box.x, y: cfg.y, w: box.w, size, align: 'center' },
    `${label || 'date'}:${index}`
  ));
}

function drawTime(page, font, value, cfg, label) {
  const parts = timeParts(value);
  drawTextBox(page, font, parts.h, { ...cfg.hour, w: 12, size: 5.2, align: 'center' }, `${label}:hour`);
  drawTextBox(page, font, parts.m, { ...cfg.minute, w: 12, size: 5.2, align: 'center' }, `${label}:minute`);
}

function drawMark(page, font, cfg, label) {
  if (!cfg) return;
  debugPoint(page, cfg.x, cfg.y, label, font);
  page.drawText('X', {
    x: cfg.x,
    y: yFromTop(page, cfg.y, 6.4),
    size: 6.4,
    font,
    color: rgb(0.05, 0.05, 0.05),
  });
}

function markChoice(page, font, value, options, label) {
  const key = safe(value);
  if (!key) return;
  drawMark(page, font, options[key], `${label}:${key}`);
}

function markYesNo(page, font, value, cfg, label) {
  drawMark(page, font, bool(value) ? cfg.yes : cfg.no, label);
}

function drawDigitBoxes(page, font, value, cfg, label) {
  const digits = safe(value).replace(/\D/g, '').split('').slice(0, cfg.max || 13);
  digits.forEach((digit, idx) => drawTextBox(
    page,
    font,
    digit,
    { x: cfg.x + idx * cfg.gap, y: cfg.y, w: 8, size: cfg.size || 5.8, align: 'center' },
    `${label}:${idx}`
  ));
}

function drawBooleanMarks(page, font, entries) {
  entries.forEach(([active, cfg, label]) => {
    if (bool(active)) drawMark(page, font, cfg, label);
  });
}

function drawDebugReferences(page, font) {
  if (!isDebugEnabled()) return;
  const c = coords.pages[1];

  Object.entries(c.text).forEach(([label, cfg]) => debugPoint(page, cfg.x, cfg.y, label, font));
  Object.entries(c.dateTiny).forEach(([label, cfg]) => {
    [cfg.x, cfg.x + 25, cfg.x + 50].forEach((x, idx) => debugPoint(page, x, cfg.y, `${label}:${idx}`, font));
  });
  Object.entries(c.date).forEach(([label, cfg]) => {
    [cfg.x, cfg.x + 25, cfg.x + 50].forEach((x, idx) => debugPoint(page, x, cfg.y, `${label}:${idx}`, font));
  });
  Object.entries(c.digitBoxes).forEach(([label, cfg]) => {
    Array.from({ length: cfg.max || 13 }).forEach((_, idx) => {
      debugPoint(page, cfg.x + idx * cfg.gap, cfg.y, `${label}:${idx}`, font);
    });
  });
  Object.entries(c.marks).forEach(([group, value]) => {
    if (group === 'booleans') {
      Object.entries(value).forEach(([label, cfg]) => debugPoint(page, cfg.x, cfg.y, label, font));
      return;
    }
    Object.entries(value).forEach(([label, cfg]) => debugPoint(page, cfg.x, cfg.y, `${group}:${label}`, font));
  });
  Object.entries(c.yesNo).forEach(([label, cfg]) => {
    debugPoint(page, cfg.yes.x, cfg.yes.y, `${label}:yes`, font);
    debugPoint(page, cfg.no.x, cfg.no.y, `${label}:no`, font);
  });
  c.controls.forEach((cfg, idx) => {
    [cfg.fecha.x, cfg.fecha.x + 25, cfg.fecha.x + 50].forEach((x, dateIdx) => {
      debugPoint(page, x, cfg.fecha.y, `c${idx + 1}:fecha:${dateIdx}`, font);
    });
    debugPoint(page, cfg.hora.hour.x, cfg.hora.hour.y, `c${idx + 1}:hour`, font);
    debugPoint(page, cfg.hora.minute.x, cfg.hora.minute.y, `c${idx + 1}:minute`, font);
    debugPoint(page, cfg.motivo.x, cfg.motivo.y, `c${idx + 1}:motivo`, font);
    debugPoint(page, cfg.edadGestacional.x, cfg.edadGestacional.y, `c${idx + 1}:eg`, font);
    debugPoint(page, cfg.acompanante.x, cfg.acompanante.y, `c${idx + 1}:acompanante`, font);
    debugPoint(page, cfg.atiende.x, cfg.atiende.y, `c${idx + 1}:atiende`, font);
  });
}

function controlAt(controles, numero) {
  return controles.find((c) => Number(c.numero_control) === numero) || {};
}

function drawPage1({ page, font, paciente, embarazo, controles, riesgo, planParto }) {
  const p = paciente;
  const c = coords.pages[1];
  const c1 = controlAt(controles, 1);
  const c2 = controlAt(controles, 2);
  const fur = firstDateValue(
    embarazo?.fur,
    riesgo?.fecha_ultima_regla,
    planParto?.fur,
    p.fur,
    p.fecha_ultima_regla
  );
  const fpp = firstDateValue(
    embarazo?.fpp,
    embarazo?.fecha_probable_parto,
    riesgo?.fecha_probable_parto,
    planParto?.fecha_probable_parto,
    p.fpp,
    p.fecha_probable_parto,
    calcularFppDesdeFur(fur)
  );

  const textValues = {
    noExpediente: p.no_expediente,
    establecimiento: p.nombre_establecimiento,
    distrito: p.distrito,
    areaSalud: p.area_salud,
    nombres: p.nombres,
    apellidos: p.apellidos,
    domicilio: p.domicilio,
    municipio: p.municipio,
    territorio: p.territorio,
    sector: p.sector,
    comunidad: p.comunidad,
    telefono: p.telefono,
    edad: edadAnios(p.fecha_nacimiento),
    ultimoAnioAprobado: p.ultimo_anio_aprobado,
    profesion: p.profesion_oficio,
    esposo: p.nombre_esposo_conviviente,
    migranteDetalle: p.migrante_municipio_depto_pais,
    comunidadLinguistica: p.comunidad_linguistica,
    coberturaPrivadaDetalle: p.cobertura_privada_detalle,
    referidaDe: p.referida_de,
    gestasPrevias: p.gestas_previas,
    abortos: p.abortos,
    partosVaginales: p.partos_vaginales,
    nacidosVivos: p.nacidos_vivos,
    hijosViven: p.hijos_viven,
    nacidosMuertos: p.nacidos_muertos,
    muertosAntes1Semana: p.muertos_antes_1sem,
    muertosDespues1Semana: p.muertos_despues_1sem,
    cesareas: p.cesareas,
    embarazoEctopicoNum: p.antec_emb_ectopico_num,
  };

  Object.entries(textValues).forEach(([key, value]) => {
    drawTextBox(page, font, value, c.text[key], key);
  });

  drawDigitBoxes(page, font, p.cui, c.digitBoxes.cui, 'cui');
  drawDate(page, font, p.fecha_nacimiento, c.dateTiny.fechaNacimiento, 'fechaNacimiento', true);
  drawDate(page, font, p.fin_embarazo_anterior, c.date.finEmbarazoAnterior, 'finEmbarazoAnterior');
  drawDate(page, font, fur, c.date.fur, 'fur');
  drawDate(page, font, fpp, c.date.fpp, 'fpp');

  markChoice(page, font, p.categoria_servicio, c.marks.categoria, 'categoria');
  markChoice(page, font, p.rango_edad, c.marks.rangoEdad, 'rangoEdad');
  markChoice(page, font, p.clasificacion_alfa_beta, c.marks.clasificacion, 'clasificacion');
  markChoice(page, font, p.nivel_estudios, c.marks.nivelEstudios, 'nivelEstudios');
  markChoice(page, font, p.estado_civil, c.marks.estadoCivil, 'estadoCivil');
  markChoice(page, font, p.pueblo, c.marks.pueblo, 'pueblo');
  markChoice(page, font, p.fracaso_metodo, c.marks.fracasoMetodo, 'fracasoMetodo');

  markYesNo(page, font, p.es_migrante, c.yesNo.migrante, 'migrante');
  markYesNo(page, font, p.cobertura_igss, c.yesNo.coberturaIgss, 'coberturaIgss');
  markYesNo(page, font, p.cobertura_privada, c.yesNo.coberturaPrivada, 'coberturaPrivada');
  markYesNo(page, font, p.viene_referida, c.yesNo.vieneReferida, 'vieneReferida');
  markYesNo(page, font, p.embarazo_planeado, c.yesNo.embarazoPlaneado, 'embarazoPlaneado');
  markYesNo(page, font, p.eg_confiable_fur, c.yesNo.egConfiableFur, 'egConfiableFur');
  markYesNo(page, font, p.eg_confiable_usg, c.yesNo.egConfiableUsg, 'egConfiableUsg');
  markYesNo(page, font, p.tiene_ficha_riesgo, c.yesNo.tieneFichaRiesgo, 'tieneFichaRiesgo');

  drawBooleanMarks(page, font, [
    [p.vive_sola, c.marks.booleans.viveSola, 'viveSola'],
    [p.fam_diabetes, c.marks.booleans.famDiabetes, 'famDiabetes'],
    [p.fam_hipertension, c.marks.booleans.famHipertension, 'famHipertension'],
    [p.fam_preeclampsia, c.marks.booleans.famPreeclampsia, 'famPreeclampsia'],
    [p.fam_eclampsia, c.marks.booleans.famEclampsia, 'famEclampsia'],
    [p.fam_otra_condicion_medica_grave, c.marks.booleans.famOtraCondicion, 'famOtraCondicion'],
    [p.antec_diabetes, c.marks.booleans.antecDiabetes, 'antecDiabetes'],
    [p.antec_diabetes_tipo === '1', c.marks.booleans.antecDiabetesTipo1, 'antecDiabetesTipo1'],
    [p.antec_diabetes_tipo === '2', c.marks.booleans.antecDiabetesTipo2, 'antecDiabetesTipo2'],
    [p.antec_diabetes_tipo === 'G', c.marks.booleans.antecDiabetesTipoG, 'antecDiabetesTipoG'],
    [p.antec_hipertension, c.marks.booleans.antecHipertension, 'antecHipertension'],
    [p.antec_preeclampsia, c.marks.booleans.antecPreeclampsia, 'antecPreeclampsia'],
    [p.antec_eclampsia, c.marks.booleans.antecEclampsia, 'antecEclampsia'],
    [p.antec_otra_condicion, c.marks.booleans.antecOtraCondicion, 'antecOtraCondicion'],
    [p.cirugia_genito_urinaria_pers || p.cirugia_genito_urinaria, c.marks.booleans.cirugiaGenitoUrinaria, 'cirugiaGenitoUrinaria'],
    [p.infertilidad, c.marks.booleans.infertilidad, 'infertilidad'],
    [p.antec_cardiopatia, c.marks.booleans.antecCardiopatia, 'antecCardiopatia'],
    [p.antec_nefropatia, c.marks.booleans.antecNefropatia, 'antecNefropatia'],
    [p.antec_violencia, c.marks.booleans.antecViolencia, 'antecViolencia'],
    [p.antec_vih_positivo, c.marks.booleans.antecVih, 'antecVih'],
    [p.rn_nc, c.marks.booleans.rnNc, 'rnNc'],
    [p.rn_normal, c.marks.booleans.rnNormal, 'rnNormal'],
    [p.rn_menor_2500g, c.marks.booleans.rnMenor2500, 'rnMenor2500'],
    [p.rn_mayor_4000g, c.marks.booleans.rnMayor4000, 'rnMayor4000'],
    [p.abortos_3_espont_consecutivos, c.marks.booleans.abortosConsecutivos, 'abortosConsecutivos'],
    [p.antec_gemelares, c.marks.booleans.gemelares, 'gemelares'],
    [p.fin_embarazo_menos_1anio, c.marks.booleans.finEmbarazoMenos1Anio, 'finEmbarazoMenos1Anio'],
  ]);

  [c1, c2].forEach((control, idx) => {
    const cfg = c.controls[idx];
    drawDate(page, font, control.fecha, cfg.fecha, `control${idx + 1}:fecha`, true);
    drawTime(page, font, control.hora, cfg.hora, `control${idx + 1}:hora`);
    drawTextBox(page, font, control.motivo_consulta, cfg.motivo, `control${idx + 1}:motivo`);
    drawTextBox(page, font, control.edad_gestacional_semanas, cfg.edadGestacional, `control${idx + 1}:eg`);
    drawTextBox(page, font, control.nombre_acompanante, cfg.acompanante, `control${idx + 1}:acompanante`);
    drawTextBox(page, font, control.nombre_cargo_atiende, cfg.atiende, `control${idx + 1}:atiende`);
  });

  drawDebugReferences(page, font);
}

async function generarFichaClinicaPrenatalPdf({
  paciente,
  embarazo,
  controles = [],
  riesgo = null,
  planParto = null,
}) {
  const templatePath = process.env.FICHA_CLINICA_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH;
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (!pages[0]) throw new Error('La plantilla PDF no tiene pagina 1');

  drawPage1({
    page: pages[0],
    font,
    paciente,
    embarazo,
    controles,
    riesgo,
    planParto,
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  generarFichaClinicaPrenatalPdf,
  // Exported for future page 2-4 work and coordinate calibration tests.
  helpers: {
    drawTextBox,
    drawDate,
    drawTime,
    markYesNo,
    drawMark,
    fitText,
    safe,
  },
};
