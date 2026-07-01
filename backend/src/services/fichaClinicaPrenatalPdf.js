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
  if (!cfg) return;
  const text = safe(value);
  if (!text) return;

  const size = cfg.size || 7;
  const width = cfg.w || 120;
  const x = cfg.x;
  let y = yFromTop(page, cfg.y, size);
  debugPoint(page, x, cfg.y, label, font);

  if (cfg.maxLines && cfg.maxLines > 1) {
    const lines = wrapText(text, font, size, width, cfg.maxLines);
    const lineGap = cfg.lineGap ?? 1.5;
    lines.forEach((line, idx) => {
      page.drawText(line, {
        x,
        y: y - idx * (size + lineGap),
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
  const gap = tiny ? 25 : 22;
  const yearOffset = cfg.yearOffset ?? (tiny ? 50 : 43);
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
  if (!cfg) return;
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

function drawControlDangerSigns(page, font, control, cfg, label) {
  const signs = cfg.signosPeligro;
  if (!signs) return;

  drawBooleanMarks(page, font, [
    [control.peligro_hemorragia_vaginal, signs.hemorragiaVaginal, `${label}:hemorragiaVaginal`],
    [control.peligro_palidez, signs.palidez, `${label}:palidez`],
    [control.peligro_dolor_cabeza, signs.dolorCabeza, `${label}:dolorCabeza`],
    [control.peligro_hipertension, signs.hipertension, `${label}:hipertension`],
    [control.peligro_dolor_epigastrico, signs.dolorEpigastrico, `${label}:dolorEpigastrico`],
    [control.peligro_trastornos_visuales, signs.trastornosVisuales, `${label}:trastornosVisuales`],
    [control.peligro_fiebre, signs.fiebre, `${label}:fiebre`],
  ]);

  drawTextBox(page, font, control.peligro_otro, signs.otro, `${label}:otro`);
}

function drawPersonalDiabetesMark(page, font, p, c) {
  const tipo = p.antec_diabetes_tipo;
  if (!tipo) {
    drawMark(page, font, c.yesNo.antecDiabetes.no, 'antecDiabetes:no');
    return;
  }

  const cfg = {
    1: c.marks.booleans.antecDiabetesTipo1,
    2: c.marks.booleans.antecDiabetesTipo2,
    G: c.marks.booleans.antecDiabetesTipoG,
  }[tipo];

  if (cfg) drawMark(page, font, cfg, `antecDiabetesTipo${tipo}`);
}

function hasVaccine(vacunas, tipoVacuna, momento) {
  return vacunas.some((v) => v.tipo_vacuna === tipoVacuna && v.momento === momento);
}

function findVaccine(vacunas, tipoVacuna, momentos, numeroDosis) {
  const momentosPermitidos = Array.isArray(momentos) ? momentos : [momentos];
  return vacunas.find((v) => (
    v.tipo_vacuna === tipoVacuna &&
    momentosPermitidos.includes(v.momento) &&
    Number(v.numero_dosis || 1) === numeroDosis
  ));
}

function drawVaccineCell(page, font, active, cfg, label) {
  if (active) drawMark(page, font, cfg, label);
}

function drawVaccines(page, font, vacunas = [], c) {
  const rows = [
    ['td_tdap', 'vacunaTdTdap'],
    ['influenza', 'vacunaInfluenza'],
    ['spr_sr', 'vacunaSprSr'],
  ];

  rows.forEach(([tipo, prefix]) => {
    const previo = hasVaccine(vacunas, tipo, 'previo_embarazo');
    const durante = hasVaccine(vacunas, tipo, 'durante_embarazo');
    const postparto = hasVaccine(vacunas, tipo, 'postparto_aborto');
    drawVaccineCell(page, font, !previo && !durante && !postparto, c.marks.booleans[`${prefix}No`], `${prefix}No`);
    drawVaccineCell(page, font, previo, c.marks.booleans[`${prefix}Previo`], `${prefix}Previo`);
    drawVaccineCell(page, font, durante, c.marks.booleans[`${prefix}Durante`], `${prefix}Durante`);
    drawVaccineCell(page, font, postparto, c.marks.booleans[`${prefix}Postparto`], `${prefix}Postparto`);
  });

  const previoVacunas = vacunas
    .filter((v) => v.tipo_vacuna === 'td_tdap' && v.momento === 'previo_embarazo')
    .sort((a, b) => Number(a.numero_dosis || 1) - Number(b.numero_dosis || 1));
  if (previoVacunas[0]) {
    drawTextBox(page, font, previoVacunas[previoVacunas.length - 1].numero_dosis, c.vaccineDates.previoDosis, 'vacunaPrevio:dosis');
    drawDate(page, font, previoVacunas[0].fecha_dosis, c.vaccineDates.previoFecha1, 'vacunaPrevio:fecha1');
  }
  if (previoVacunas[1]) {
    drawDate(page, font, previoVacunas[1].fecha_dosis, c.vaccineDates.previoFecha2, 'vacunaPrevio:fecha2');
  }

  [1, 2, 3].forEach((numeroDosis) => {
    const vacuna = findVaccine(vacunas, 'td_tdap', ['durante_embarazo', 'postparto_aborto'], numeroDosis);
    if (vacuna) drawDate(page, font, vacuna.fecha_dosis, c.vaccineDates[`duranteFecha${numeroDosis}`], `vacunaDurante:fecha${numeroDosis}`);
  });
}

function drawYesNoMarks(page, font, entries) {
  entries.forEach(([value, cfg, label]) => {
    markYesNo(page, font, value, cfg, label);
  });
}

function markNullableYesNo(page, font, value, cfg, label) {
  if (!cfg) return;
  if (value === null || value === undefined || value === '') return;
  markYesNo(page, font, value, cfg, label);
}

function formatPa(control) {
  if (!control.pa_sistolica && !control.pa_diastolica) return '';
  return `${safe(control.pa_sistolica)}/${safe(control.pa_diastolica)}`;
}

function markPositiveNegative(page, font, value, cfg, label) {
  if (!cfg) return;
  const normalized = safe(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!normalized) return;
  if (normalized.startsWith('pos') || normalized === '+') {
    drawMark(page, font, cfg.positive, `${label}:positive`);
  } else if (normalized.startsWith('neg') || normalized === '-') {
    drawMark(page, font, cfg.negative, `${label}:negative`);
  }
}

function markBooleanPositiveNegative(page, font, value, cfg, label) {
  if (!cfg) return;
  if (value === null || value === undefined || value === '') return;
  drawMark(page, font, bool(value) ? cfg.positive : cfg.negative, label);
}

function drawLabDoneResult(page, font, control, doneField, resultField, cfg, label) {
  if (!cfg) return;
  markYesNo(page, font, control[doneField], cfg.done, `${label}:done`);
  drawTextBox(page, font, control[resultField], cfg.result, `${label}:result`);
}

function drawPage2DebugReferences(page, font) {
  if (!isDebugEnabled()) return;
  const c = coords.pages[2];
  c.controls.forEach((cfg, idx) => {
    const label = `p2c${idx + 1}`;
    [
      cfg.examenFisico,
      cfg.examenObstetrico,
      cfg.examenGinecologico,
      cfg.laboratorios,
      cfg.estudiosComplementarios,
      cfg.orientaciones,
    ].forEach((section) => {
      Object.entries(section).forEach(([key, value]) => {
        if (!value) return;
        if (value.x !== undefined) {
          debugPoint(page, value.x, value.y, `${label}:${key}`, font);
          return;
        }
        Object.entries(value).forEach(([subKey, subValue]) => {
          if (!subValue) return;
          if (subValue.x !== undefined) {
            debugPoint(page, subValue.x, subValue.y, `${label}:${key}:${subKey}`, font);
          } else {
            debugPoint(page, subValue.yes.x, subValue.yes.y, `${label}:${key}:${subKey}:yes`, font);
            debugPoint(page, subValue.no.x, subValue.no.y, `${label}:${key}:${subKey}:no`, font);
          }
        });
      });
    });
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
    [cfg.fecha.x, cfg.fecha.x + 25, cfg.fecha.x + (cfg.fecha.yearOffset ?? 50)].forEach((x, dateIdx) => {
      debugPoint(page, x, cfg.fecha.y, `c${idx + 1}:fecha:${dateIdx}`, font);
    });
    debugPoint(page, cfg.hora.hour.x, cfg.hora.hour.y, `c${idx + 1}:hour`, font);
    debugPoint(page, cfg.hora.minute.x, cfg.hora.minute.y, `c${idx + 1}:minute`, font);
    debugPoint(page, cfg.motivo.x, cfg.motivo.y, `c${idx + 1}:motivo`, font);
    debugPoint(page, cfg.edadGestacional.x, cfg.edadGestacional.y, `c${idx + 1}:eg`, font);
    debugPoint(page, cfg.acompanante.x, cfg.acompanante.y, `c${idx + 1}:acompanante`, font);
    debugPoint(page, cfg.atiende.x, cfg.atiende.y, `c${idx + 1}:atiende`, font);
    if (cfg.signosPeligro) {
      Object.entries(cfg.signosPeligro).forEach(([sign, signCfg]) => {
        debugPoint(page, signCfg.x, signCfg.y, `c${idx + 1}:peligro:${sign}`, font);
      });
    }
  });
}

function controlAt(controles, numero) {
  return controles.find((c) => Number(c.numero_control) === numero) || {};
}

function formatDate(value) {
  const parts = dateParts(value);
  if (!parts.y || !parts.m || !parts.d) return '';
  return `${parts.d}/${parts.m}/${parts.y}`;
}

function compactYesNo(value) {
  if (value === null || value === undefined || value === '') return '';
  return bool(value) ? 'Si' : 'No';
}

function drawWrappedLine(page, font, label, value, x, y, width, size = 8.5) {
  const cleanValue = safe(value).replace(/\s+/g, ' ').trim();
  if (!cleanValue) return y;

  const labelText = `${label}: `;
  page.drawText(labelText, { x, y, size, font, color: rgb(0.05, 0.05, 0.05) });

  const labelWidth = font.widthOfTextAtSize(labelText, size);
  const lines = wrapText(cleanValue, font, size, width - labelWidth, 3);
  lines.forEach((line, idx) => {
    page.drawText(line, {
      x: idx === 0 ? x + labelWidth : x,
      y: y - idx * (size + 3),
      size,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
  });

  return y - Math.max(lines.length, 1) * (size + 3);
}

function drawPuerperioSummary({ pdfDoc, font, paciente, embarazo, puerperio = [] }) {
  if (!puerperio.length) return;

  const marginX = 42;
  let page = pdfDoc.addPage([coords.PAGE.width, coords.PAGE.height]);
  let y = page.getHeight() - 54;

  const addContinuationPage = () => {
    page = pdfDoc.addPage([coords.PAGE.width, coords.PAGE.height]);
    y = page.getHeight() - 54;
  };

  page.drawText('Anexo de puerperio', {
    x: marginX,
    y,
    size: 16,
    font,
    color: rgb(0.02, 0.12, 0.22),
  });
  y -= 22;

  page.drawText('Resumen generado desde los controles de puerperio registrados en el sistema.', {
    x: marginX,
    y,
    size: 8.5,
    font,
    color: rgb(0.18, 0.22, 0.25),
  });
  y -= 28;

  const nombre = `${safe(paciente?.nombres)} ${safe(paciente?.apellidos)}`.trim();
  y = drawWrappedLine(page, font, 'Paciente', nombre, marginX, y, 520, 8.5);
  y = drawWrappedLine(page, font, 'No. expediente', paciente?.no_expediente, marginX, y, 520, 8.5);
  y = drawWrappedLine(page, font, 'Embarazo', embarazo?.numero_embarazo, marginX, y, 520, 8.5);
  y -= 10;

  puerperio.forEach((registro) => {
    if (y < 170) {
      addContinuationPage();
    }

    page.drawText(`${registro.numero_atencion || ''}a atencion de puerperio`, {
      x: marginX,
      y,
      size: 11,
      font,
      color: rgb(0.02, 0.12, 0.22),
    });
    y -= 18;

    const fields = [
      ['Fecha', formatDate(registro.fecha)],
      ['Hora', safe(registro.hora).slice(0, 5)],
      ['Dias despues del parto', registro.dias_despues_parto],
      ['Lugar del parto', registro.lugar_atencion_parto],
      ['Quien atendio parto', registro.quien_atendio_parto],
      ['Tipo de parto', registro.tipo_parto],
      ['RN vivo', compactYesNo(registro.recien_nacido_vivo)],
      ['Apego inmediato', compactYesNo(registro.tuvo_apego_inmediato)],
      ['Lactancia materna exclusiva', compactYesNo(registro.lactancia_materna_exclusiva)],
      ['P/A', registro.pa_sistolica ? `${registro.pa_sistolica}/${registro.pa_diastolica || ''}` : ''],
      ['Temperatura', registro.temperatura],
      ['Signos de peligro', registro.signos_peligro],
      ['Examen mamas', registro.examen_mamas],
      ['Examen ginecologico', registro.examen_ginecologico],
      ['Orientacion/consejeria', registro.orientacion_consejeria],
      ['Impresion clinica', registro.impresion_clinica],
      ['Tratamiento', registro.tratamiento],
      ['Nombre/cargo atiende', registro.nombre_cargo_atiende],
    ];

    fields.forEach(([label, value]) => {
      if (y < 80) addContinuationPage();
      y = drawWrappedLine(page, font, label, value, marginX, y, 520, 8);
    });
    y -= 12;
  });
}

function drawPage1({ page, font, paciente, embarazo, controles, riesgo, planParto, vacunas = [] }) {
  const p = paciente;
  const c = coords.pages[1];
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
    partos: p.partos,
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

  drawPersonalDiabetesMark(page, font, p, c);

  drawBooleanMarks(page, font, [
    [p.rn_nc, c.marks.booleans.rnNc, 'rnNc'],
    [p.rn_normal, c.marks.booleans.rnNormal, 'rnNormal'],
    [p.rn_menor_2500g, c.marks.booleans.rnMenor2500, 'rnMenor2500'],
    [p.rn_mayor_4000g, c.marks.booleans.rnMayor4000, 'rnMayor4000'],
    [p.abortos_3_espont_consecutivos, c.marks.booleans.abortosConsecutivos, 'abortosConsecutivos'],
    [p.fin_embarazo_menos_1anio, c.marks.booleans.finEmbarazoMenos1Anio, 'finEmbarazoMenos1Anio'],
  ]);

  drawYesNoMarks(page, font, [
    [p.vive_sola, c.yesNo.viveSola, 'viveSola'],
    [p.embarazo_abuso_sexual, c.yesNo.embarazoAbusoSexual, 'embarazoAbusoSexual'],
  ]);

  drawYesNoMarks(page, font, [
    [p.fam_diabetes, c.yesNo.famDiabetes, 'famDiabetes'],
    [p.fam_tbc, c.yesNo.famTbc, 'famTbc'],
    [p.fam_hipertension, c.yesNo.famHipertension, 'famHipertension'],
    [p.fam_preeclampsia, c.yesNo.famPreeclampsia, 'famPreeclampsia'],
    [p.fam_eclampsia, c.yesNo.famEclampsia, 'famEclampsia'],
    [p.fam_otra_condicion_medica_grave, c.yesNo.famOtraCondicion, 'famOtraCondicion'],
    [p.antec_tbc, c.yesNo.antecTbc, 'antecTbc'],
    [p.antec_hipertension, c.yesNo.antecHipertension, 'antecHipertension'],
    [p.antec_preeclampsia, c.yesNo.antecPreeclampsia, 'antecPreeclampsia'],
    [p.antec_eclampsia, c.yesNo.antecEclampsia, 'antecEclampsia'],
    [p.antec_otra_condicion, c.yesNo.antecOtraCondicion, 'antecOtraCondicion'],
    [p.cirugia_genito_urinaria_pers || p.cirugia_genito_urinaria, c.yesNo.cirugiaGenitoUrinaria, 'cirugiaGenitoUrinaria'],
    [p.infertilidad, c.yesNo.infertilidad, 'infertilidad'],
    [p.antec_cardiopatia, c.yesNo.antecCardiopatia, 'antecCardiopatia'],
    [p.antec_nefropatia, c.yesNo.antecNefropatia, 'antecNefropatia'],
    [p.antec_violencia, c.yesNo.antecViolencia, 'antecViolencia'],
    [p.antec_vih_positivo, c.yesNo.antecVih, 'antecVih'],
  ]);

  drawYesNoMarks(page, font, [
    [p.fuma_activamente_1er_trimestre, c.yesNo.fumaActivaT1, 'fumaActivaT1'],
    [p.fuma_activamente_2do_trimestre, c.yesNo.fumaActivaT2, 'fumaActivaT2'],
    [p.fuma_activamente_3er_trimestre, c.yesNo.fumaActivaT3, 'fumaActivaT3'],
    [p.fuma_pasivamente_1er_trimestre, c.yesNo.fumaPasivaT1, 'fumaPasivaT1'],
    [p.fuma_pasivamente_2do_trimestre, c.yesNo.fumaPasivaT2, 'fumaPasivaT2'],
    [p.fuma_pasivamente_3er_trimestre, c.yesNo.fumaPasivaT3, 'fumaPasivaT3'],
    [p.consume_drogas_1er_trimestre, c.yesNo.drogasT1, 'drogasT1'],
    [p.consume_drogas_2do_trimestre, c.yesNo.drogasT2, 'drogasT2'],
    [p.consume_drogas_3er_trimestre, c.yesNo.drogasT3, 'drogasT3'],
    [p.consume_alcohol_1er_trimestre, c.yesNo.alcoholT1, 'alcoholT1'],
    [p.consume_alcohol_2do_trimestre, c.yesNo.alcoholT2, 'alcoholT2'],
    [p.consume_alcohol_3er_trimestre, c.yesNo.alcoholT3, 'alcoholT3'],
    [p.violencia_1er_trimestre, c.yesNo.violenciaT1, 'violenciaT1'],
    [p.violencia_2do_trimestre, c.yesNo.violenciaT2, 'violenciaT2'],
    [p.violencia_3er_trimestre, c.yesNo.violenciaT3, 'violenciaT3'],
  ]);

  drawVaccines(page, font, vacunas, c);

  drawMark(
    page,
    font,
    bool(p.antec_gemelares) ? c.yesNo.antecGemelares.yes : c.yesNo.antecGemelares.no,
    'antecGemelares'
  );

  c.controls.forEach((cfg, idx) => {
    const control = controlAt(controles, idx + 1);
    drawDate(page, font, control.fecha, cfg.fecha, `control${idx + 1}:fecha`, true);
    drawTime(page, font, control.hora, cfg.hora, `control${idx + 1}:hora`);
    drawTextBox(page, font, control.motivo_consulta, cfg.motivo, `control${idx + 1}:motivo`);
    drawControlDangerSigns(page, font, control, cfg, `control${idx + 1}`);
    drawTextBox(page, font, control.edad_gestacional_semanas, cfg.edadGestacional, `control${idx + 1}:eg`);
    drawTextBox(page, font, control.nombre_acompanante, cfg.acompanante, `control${idx + 1}:acompanante`);
    drawTextBox(page, font, control.nombre_cargo_atiende, cfg.atiende, `control${idx + 1}:atiende`);
  });

  drawDebugReferences(page, font);
}

function drawPage2({ page, font, controles }) {
  const c = coords.pages[2];

  c.controls.forEach((cfg, idx) => {
    const control = controlAt(controles, idx + 1);
    if (!control.id && !control.fecha && !control.numero_control) return;

    const baseLabel = `page2:control${idx + 1}`;
    const fisico = cfg.examenFisico;
    const obstetrico = cfg.examenObstetrico;
    const gine = cfg.examenGinecologico;
    const lab = cfg.laboratorios;
    const estudios = cfg.estudiosComplementarios;
    const orient = cfg.orientaciones;

    drawTextBox(page, font, formatPa(control), fisico.pa, `${baseLabel}:pa`);
    drawTextBox(page, font, control.frecuencia_cardiaca, fisico.fc, `${baseLabel}:fc`);
    drawTextBox(page, font, control.frecuencia_respiratoria, fisico.fr, `${baseLabel}:fr`);
    drawTextBox(page, font, control.temperatura, fisico.temperatura, `${baseLabel}:temperatura`);
    drawTextBox(page, font, control.perimetro_braquial_cm, fisico.perimetroBraquial, `${baseLabel}:perimetroBraquial`);
    drawTextBox(page, font, control.peso_kg, fisico.peso, `${baseLabel}:peso`);
    drawTextBox(page, font, control.talla_cm, fisico.talla, `${baseLabel}:talla`);
    drawTextBox(page, font, control.imc, fisico.imc, `${baseLabel}:imc`);
    markNullableYesNo(page, font, control.examen_bucodental, fisico.bucodental, `${baseLabel}:bucodental`);
    markNullableYesNo(page, font, control.examen_mamas, fisico.mamas, `${baseLabel}:mamas`);

    drawTextBox(page, font, control.altura_uterina_cm, obstetrico.alturaUterina, `${baseLabel}:alturaUterina`);
    drawTextBox(page, font, control.fcf, obstetrico.fcf, `${baseLabel}:fcf`);
    markNullableYesNo(page, font, control.movimientos_fetales, obstetrico.movimientosFetales, `${baseLabel}:movimientosFetales`);
    drawTextBox(page, font, control.situacion_fetal, obstetrico.situacionFetal, `${baseLabel}:situacionFetal`);
    drawTextBox(page, font, control.presentacion_fetal, obstetrico.presentacionFetal, `${baseLabel}:presentacionFetal`);

    markYesNo(page, font, control.sangre_manchado, gine.sangreManchado, `${baseLabel}:sangreManchado`);
    markYesNo(page, font, control.verrugas_herpes_papilomas, gine.verrugasHerpesPapilomas, `${baseLabel}:verrugasHerpesPapilomas`);
    markYesNo(page, font, control.flujo_vaginal, gine.flujoVaginal, `${baseLabel}:flujoVaginal`);
    drawTextBox(page, font, control.otros_ginecologico, gine.otros, `${baseLabel}:otrosGinecologico`);

    drawLabDoneResult(page, font, control, 'hematologia_realizada', 'hematologia_resultado', lab.hematologia, `${baseLabel}:hematologia`);
    drawLabDoneResult(page, font, control, 'glicemia_realizada', 'glicemia_resultado', lab.glicemia, `${baseLabel}:glicemia`);
    if (lab.grupoRh && (control.grupo_rh_realizado || control.grupo_rh_resultado)) {
      const rh = safe(control.grupo_rh_resultado);
      if (rh.includes('+')) drawMark(page, font, lab.grupoRh.positive, `${baseLabel}:grupoRh:positive`);
      if (rh.includes('-')) drawMark(page, font, lab.grupoRh.negative, `${baseLabel}:grupoRh:negative`);
      drawTextBox(page, font, rh.replace(/[+-]/g, ''), lab.grupoRh.result, `${baseLabel}:grupoRh:result`);
    }
    markYesNo(page, font, control.orina_realizada, lab.orina.done, `${baseLabel}:orina`);
    markNullableYesNo(page, font, control.orina_bacteriuria, lab.orina.bacteriuria, `${baseLabel}:orinaBacteriuria`);
    markNullableYesNo(page, font, control.orina_proteinuria, lab.orina.proteinuria, `${baseLabel}:orinaProteinuria`);
    drawLabDoneResult(page, font, control, 'heces_realizada', 'heces_resultado', lab.heces, `${baseLabel}:heces`);
    markPositiveNegative(page, font, control.vih_resultado, lab.vih, `${baseLabel}:vih`);
    markPositiveNegative(page, font, control.vdrl_resultado, lab.vdrl, `${baseLabel}:vdrl`);
    drawTextBox(page, font, control.vdrl_resultado, lab.vdrl.result, `${baseLabel}:vdrlResultado`);
    markBooleanPositiveNegative(page, font, control.torch_resultado_positivo, lab.torch, `${baseLabel}:torch`);
    drawTextBox(page, font, control.torch_resultado_valor, lab.torch.result, `${baseLabel}:torchResultado`);
    markPositiveNegative(page, font, control.papanicolau_ivaa_resultado, lab.papanicolauIvaa, `${baseLabel}:papanicolauIvaa`);
    drawTextBox(page, font, control.papanicolau_ivaa_resultado, lab.papanicolauIvaa.result, `${baseLabel}:papanicolauIvaaResultado`);
    markPositiveNegative(page, font, control.hepatitis_b_resultado, lab.hepatitisB, `${baseLabel}:hepatitisB`);
    drawTextBox(page, font, control.hepatitis_b_resultado, lab.hepatitisB.result, `${baseLabel}:hepatitisBResultado`);
    drawTextBox(page, font, control.otros_lab, lab.otros, `${baseLabel}:otrosLab`);

    markYesNo(page, font, control.usg_realizado, estudios.usg, `${baseLabel}:usg`);
    drawTextBox(page, font, control.usg_hallazgos, estudios.hallazgosUsg, `${baseLabel}:hallazgosUsg`);

    markYesNo(page, font, control.orient_plan_emergencia_parto, orient.planEmergenciaParto, `${baseLabel}:orientPlanEmergencia`);
    markYesNo(page, font, control.orient_alimentacion_embarazo, orient.alimentacionEmbarazo, `${baseLabel}:orientAlimentacion`);
    markYesNo(page, font, control.orient_senales_peligro, orient.senalesPeligro, `${baseLabel}:orientSenalesPeligro`);
    markYesNo(page, font, control.orient_importancia_atenciones, orient.importanciaAtenciones, `${baseLabel}:orientImportanciaAtenciones`);
    markYesNo(page, font, control.orient_pre_post_prueba_vih, orient.prePostPruebaVih, `${baseLabel}:orientPrePostVih`);
    markYesNo(page, font, control.orient_tratamiento_its_pareja, orient.tratamientoItsPareja, `${baseLabel}:orientTratamientoIts`);
    markYesNo(page, font, control.orient_lactancia_materna, orient.lactanciaMaterna, `${baseLabel}:orientLactancia`);
    markYesNo(page, font, control.orient_planificacion_familiar, orient.planificacionFamiliar, `${baseLabel}:orientPlanificacion`);
    markYesNo(page, font, control.orient_importancia_postparto, orient.importanciaPostparto, `${baseLabel}:orientPostparto`);
    markYesNo(page, font, control.orient_vacunacion_nino, orient.vacunacionNino, `${baseLabel}:orientVacunacion`);
    drawTextBox(page, font, control.orient_otros, orient.otros, `${baseLabel}:orientOtros`);
  });

  drawPage2DebugReferences(page, font);
}

async function generarFichaClinicaPrenatalPdf({
  paciente,
  embarazo,
  controles = [],
  puerperio = [],
  vacunas = [],
  riesgo = null,
  planParto = null,
}) {
  const templatePath = process.env.FICHA_CLINICA_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH;
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  if (!pages[0]) throw new Error('La plantilla PDF no tiene pagina 1');
  if (!pages[1]) throw new Error('La plantilla PDF no tiene pagina 2');

  drawPage1({
    page: pages[0],
    font,
    paciente,
    embarazo,
    controles,
    riesgo,
    planParto,
    vacunas,
  });

  drawPage2({
    page: pages[1],
    font,
    controles,
  });

  drawPuerperioSummary({
    pdfDoc,
    font,
    paciente,
    embarazo,
    puerperio,
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
