const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { obtenerEmbarazoActivoId } = require('../utils/embarazos');
const { generarFichaClinicaPrenatalPdf } = require('../services/fichaClinicaPrenatalPdf');

const execFileAsync = promisify(execFile);
const TEXT_FORMAT_CELLS = new Set(['T8', 'V8', 'F61', 'G19:J19', 'P19:S19', 'Q19:T19', 'AK19:AN19']);
const CENTER_FORMAT_RE = /^(N6|O6|P6|Q6|S6|T6|U6|V6|Y6|Z6|AA6|AB6|AA7:AB7|AA13:AB13|K18|X18|X19|E20|K20|Q20|X20|F21|M21)$/;

async function pdfControl(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.nombres, p.apellidos, p.no_expediente
       FROM controles_prenatales c
       JOIN pacientes p ON p.id = c.paciente_id
       WHERE c.id = $1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Control no encontrado'
      });
    }

    const c = rows[0];

    let html = fs.readFileSync(
      path.join(__dirname, '../templates/control.html'),
      'utf8'
    );

    html = html
      .replace('{{nombre}}', esc(`${c.nombres} ${c.apellidos}`))
      .replace('{{expediente}}', esc(c.no_expediente))
      .replace('{{fecha}}', esc(c.fecha))
      .replace('{{hora}}', esc(c.hora || ''))
      .replace('{{eg}}', esc(c.edad_embarazo_semanas || ''))
      .replace('{{motivo}}', esc(c.motivo_consulta || ''))
      .replace('{{temp}}', esc(c.temperatura || ''))
      .replace('{{pulso}}', esc(c.pulso || ''))
      .replace('{{resp}}', esc(c.respiraciones || ''))
      .replace('{{pa}}', esc(`${c.pa_sistolica || ''}/${c.pa_diastolica || ''}`))
      .replace('{{peso}}', esc(c.peso_kg || ''))
      .replace('{{talla}}', esc(c.talla_cm || ''))
      .replace('{{au}}', esc(c.au_cm || ''))
      .replace('{{fcf}}', esc(c.fcf || ''))
      .replace('{{imc}}', esc(c.imc || ''))
      .replace('{{tratamiento}}', esc(c.tratamiento || ''))
      .replace('{{consejeria}}', esc(c.consejeria || ''))
      .replace('{{personal}}', esc(c.personal_atendio || ''));

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=control-${id}.pdf`
    });

    return res.send(Buffer.from(pdf));

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Error al generar PDF'
    });
  }
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function assetBase64(fileName) {
  const filePath = path.join(__dirname, '../assets/mspas', fileName);
  return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function assetOfficialBase64(fileName, mime = 'image/png') {
  const filePath = path.join(__dirname, '../assets/official_forms', fileName);
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function dateParts(value) {
  if (!value) return { d: '', m: '', y: '' };
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return { d: match[3], m: match[2], y: match[1] };
    }
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return { d: '', m: '', y: '' };
  return {
    d: String(dt.getUTCDate()).padStart(2, '0'),
    m: String(dt.getUTCMonth() + 1).padStart(2, '0'),
    y: String(dt.getUTCFullYear()),
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

function field(text, x, y, w, h = 10, size = 7, extra = '') {
  if (text === null || text === undefined || text === '') return '';
  return `<div class="f ${extra}" style="left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;font-size:${size}pt;">${esc(text)}</div>`;
}

function mark(cond, x, y) {
  if (!cond) return '';
  return `<div class="x" style="left:${x}pt;top:${y}pt;">X</div>`;
}

function splitDateFields(value, x, y) {
  const p = dateParts(value);
  return [
    field(p.d, x, y, 16, 8, 5.6, 'center digits'),
    field(p.m, x + 25, y, 16, 8, 5.6, 'center digits'),
    field(p.y, x + 50, y, 30, 8, 5.6, 'center digits'),
  ].join('');
}

function splitDateTinyFields(value, x, y) {
  const p = dateParts(value);
  return [
    field(p.d, x, y, 15, 8, 5.2, 'center digits'),
    field(p.m, x + 25, y, 15, 8, 5.2, 'center digits'),
    field(p.y, x + 50, y, 29, 8, 5.2, 'center digits'),
  ].join('');
}

function boxDigits(value, x, y, gap = 10.25, size = 5.8) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .split('')
    .slice(0, 13)
    .map((digit, i) => field(digit, x + i * gap, y, 8, 8, size, 'center digits'))
    .join('');
}

function wrapField(text, x, y, w, h, size = 6.5) {
  if (!text) return '';
  return `<div class="f wrap" style="left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;font-size:${size}pt;">${esc(text)}</div>`;
}

function cleanCellText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function setMapValue(map, address, value) {
  if (value === null || value === undefined || value === '') return;
  map[address] = cleanCellText(value);
}

function splitTextAtWord(value, maxLength) {
  const text = cleanCellText(value).replace(/\s+/g, ' ').trim();
  if (!text || text.length <= maxLength) return [text, ''];

  const cutAt = text.lastIndexOf(' ', maxLength);
  const splitAt = cutAt > 0 ? cutAt : maxLength;
  return [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
}

function setTwoLineMapValue(map, firstAddress, secondAddress, value, firstMaxLength) {
  const [firstLine, secondLine] = splitTextAtWord(value, firstMaxLength);
  setMapValue(map, firstAddress, firstLine);
  setMapValue(map, secondAddress, secondLine);
}

function markMap(map, address, active) {
  if (active) map[address] = 'X';
}

function normalizeChoiceKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapChoice(map, value, options) {
  if (!value) return;
  const normalizedValue = normalizeChoiceKey(value);
  const normalizedOptions = Object.fromEntries(
    Object.entries(options).map(([key, addr]) => [normalizeChoiceKey(key), addr])
  );
  const addr = normalizedOptions[normalizedValue];
  if (addr) map[addr] = 'X';
}

function buildHistoriaClinicaMap(noExpediente) {
  const boxes = ['N6', 'O6', 'P6', 'Q6', 'S6', 'T6', 'U6', 'V6', 'W6', 'Y6', 'Z6', 'AA6', 'AB6'];
  const clean = String(noExpediente ?? '').replace(/\D/g, '');
  const out = {};
  boxes.forEach((addr, index) => {
    if (clean[index]) out[addr] = clean[index];
  });
  return out;
}

function buildPlanRegistroMap(cui) {
  const boxes = ['Y3', 'Z3', 'AA3', 'AB3', 'AD3', 'AE3', 'AF3', 'AG3', 'AH3', 'AJ3', 'AK3', 'AL3', 'AM3'];
  const clean = String(cui ?? '').replace(/\D/g, '');
  const out = {};
  boxes.forEach((addr, index) => {
    if (clean[index]) out[addr] = clean[index];
  });
  return out;
}

function buildRiskCellMap({ paciente, embarazo, riesgo }) {
  const edad = edadAnios(paciente.fecha_nacimiento);
  const fur = riesgo.fecha_ultima_regla || embarazo?.fur || paciente.fur;
  const fpp = riesgo.fecha_probable_parto || embarazo?.fpp || paciente.fpp;
  const map = {
    ...buildHistoriaClinicaMap(paciente.cui || paciente.no_expediente),
  };

  setMapValue(map, 'H7', `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim());
  setMapValue(map, 'AA7:AB7', edad);
  setMapValue(map, 'F8', paciente.municipio || paciente.domicilio || paciente.comunidad);
  setMapValue(map, 'V8', cleanCellText(riesgo.telefono || paciente.telefono).replace(/\s+/g, ' '));
  mapChoice(map, riesgo.pueblo || paciente.pueblo, {
    maya: 'F10',
    xinca: 'I10',
    garifuna: 'L10',
    mestizo: 'O10',
    mestiza: 'O10',
  });
  markMap(map, 'S10', Boolean(riesgo.migrante));
  setMapValue(map, 'W10', riesgo.estado_civil || paciente.estado_civil);
  mapChoice(map, riesgo.escolaridad || paciente.nivel_estudios, {
    primaria: 'G12',
    basico: 'J12',
    secundaria: 'J12',
    diversificado: 'N12',
    universitaria: 'R12',
    universitario: 'R12',
    ninguno: 'U12',
  });
  setMapValue(map, 'X12', riesgo.ocupacion || paciente.profesion_oficio);
  setMapValue(map, 'J13:W13', riesgo.nombre_esposo_conviviente || paciente.nombre_esposo_conviviente);
  setMapValue(map, 'AA13:AB13', riesgo.edad_esposo);
  mapChoice(map, riesgo.pueblo_esposo, {
    maya: 'F15',
    xinca: 'I15',
    garifuna: 'L15',
    mestizo: 'O15',
    mestiza: 'O15',
  });
  mapChoice(map, riesgo.escolaridad_esposo, {
    primaria: 'G17',
    basico: 'J17',
    secundaria: 'J17',
    diversificado: 'N17',
    universitaria: 'R17',
    universitario: 'R17',
    ninguno: 'U17',
    ninguna: 'U17',
  });
  setMapValue(map, 'X17', riesgo.ocupacion_esposo);
  setMapValue(map, 'K18', riesgo.distancia_servicio_km);
  setMapValue(map, 'X18', riesgo.tiempo_horas);
  setMapValue(map, 'G19:J19', formatDate(fur));
  setMapValue(map, 'P19:S19', formatDate(fpp));
  setMapValue(map, 'X19', riesgo.no_embarazos);
  setMapValue(map, 'E20', riesgo.no_partos);
  setMapValue(map, 'K20', riesgo.no_cesareas);
  setMapValue(map, 'Q20', riesgo.no_abortos);
  setMapValue(map, 'X20', riesgo.no_hijos_vivos);
  setMapValue(map, 'F21', riesgo.no_hijos_muertos);
  setMapValue(map, 'M21', riesgo.edad_embarazo_semanas);

  const yesNoRows = [
    ['24', riesgo.muerte_fetal_neonatal_previa],
    ['25', riesgo.abortos_espontaneos_3mas],
    ['26', riesgo.gestas_3mas],
    ['27', riesgo.peso_ultimo_bebe_menor_2500g],
    ['28', riesgo.peso_ultimo_bebe_mayor_4500g],
    ['29', riesgo.antec_hipertension_preeclampsia],
    ['30', riesgo.cirugias_tracto_reproductivo],
    ['33', riesgo.embarazo_multiple],
    ['34', riesgo.menor_20_anos],
    ['35', riesgo.mayor_35_anos],
    ['36', riesgo.paciente_rh_negativo],
    ['37', riesgo.hemorragia_vaginal],
    ['38', riesgo.vih_positivo_sifilis],
    ['39', riesgo.presion_diastolica_90mas],
    ['40', riesgo.anemia],
    ['41', riesgo.desnutricion_obesidad],
    ['42', riesgo.dolor_abdominal],
    ['43', riesgo.sintomatologia_urinaria],
    ['44', riesgo.ictericia],
    ['48', riesgo.diabetes],
    ['49', riesgo.enfermedad_renal],
    ['50', riesgo.enfermedad_corazon],
    ['51', riesgo.hipertension_arterial],
    ['52', riesgo.consumo_drogas_alcohol_tabaco],
    ['53', riesgo.otra_enfermedad_severa],
  ];
  yesNoRows.forEach(([row, active]) => {
    markMap(map, active ? `Z${row}` : `AB${row}`, true);
  });

  markMap(map, riesgo.tiene_riesgo ? 'V56' : 'Y56', true);
  setMapValue(map, 'M57', riesgo.referida_a);
  setMapValue(map, 'R59', riesgo.nombre_personal_atendio);

  return map;
}

function markYesNo(map, active, yesAddress, noAddress) {
  markMap(map, active ? yesAddress : noAddress, true);
}

function buildPlanPartoCellMap({ paciente, plan }) {
  const nombre = `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim();
  const map = {
    ...buildPlanRegistroMap(plan.no_registro || paciente.cui),
  };

  setMapValue(map, 'I5', plan.servicio_salud || paciente.nombre_establecimiento || 'CAP El Chal');
  setMapValue(map, 'AA5', formatDate(plan.fecha));
  setMapValue(map, 'I6', plan.lugar_residencia || paciente.comunidad || paciente.domicilio);
  setMapValue(map, 'J7:V7', nombre);
  setMapValue(map, 'AL7', edadAnios(plan.fecha_nacimiento || paciente.fecha_nacimiento));
  setMapValue(map, 'J8', plan.nombre_conyuge || paciente.nombre_esposo_conviviente);
  setMapValue(map, 'T8', cleanCellText(plan.telefono || paciente.telefono).replace(/\s+/g, ' '));
  setMapValue(map, 'AE8', formatDate(plan.fecha_nacimiento || paciente.fecha_nacimiento));

  mapChoice(map, plan.estado_civil || paciente.estado_civil, {
    soltera: 'D12',
    casada: 'G12',
    unida: 'K12',
    viuda: 'D14',
    separada: 'G14',
    otro: 'K14',
    vive_sola: 'D12',
  });
  mapChoice(map, plan.pueblo || paciente.pueblo, {
    mestizo: 'P12',
    mestiza: 'P12',
    maya: 'R12',
    xinca: 'T12',
    garifuna: 'P14',
    otro: 'R14',
  });
  mapChoice(map, plan.escolaridad || paciente.nivel_estudios, {
    ninguno: 'Z12',
    ninguna: 'Z12',
    primaria: 'AD12',
    basico: 'Z14',
    secundaria: 'Z14',
    diversificado: 'Z14',
    universitaria: 'AD14',
    universitario: 'AD14',
  });
  mapChoice(map, plan.con_quien_vive, {
    sola: 'AH12',
    esposo: 'AN12',
    conyuge: 'AN12',
    familia: 'AH14',
    amigo: 'AN14',
    amiga: 'AN14',
  });
  setMapValue(map, 'I16', plan.idioma || paciente.comunidad_linguistica);
  markYesNo(map, plan.ha_tenido_atencion_prenatal, 'AH16', 'AJ16');

  setMapValue(map, 'H18', plan.no_embarazos);
  setMapValue(map, 'Q18', plan.no_partos);
  setMapValue(map, 'X18', plan.no_abortos);
  setMapValue(map, 'AE18', plan.no_hijos_vivos);
  setMapValue(map, 'AM18', plan.no_hijos_muertos);
  setMapValue(map, 'E19', formatDate(plan.fur));
  setMapValue(map, 'Q19:T19', formatDate(plan.fecha_probable_parto));
  setMapValue(map, 'AB19', plan.no_cesareas);
  setMapValue(map, 'AK19:AN19', formatDate(plan.fecha_ultima_cesarea));
  setMapValue(map, 'J20', plan.edad_gestacional_semanas);
  setMapValue(map, 'AC20', plan.edad_gestacional_au);

  markMap(map, 'O22', plan.parto_anterior_hospital);
  markMap(map, 'R22', plan.parto_anterior_caimi);
  markMap(map, 'X22', plan.parto_anterior_comadrona);
  markMap(map, 'AE22', plan.parto_anterior_clinica_privada);
  if (plan.parto_anterior_otro) setMapValue(map, 'AL22', plan.parto_anterior_otro);

  const dangerRows = [
    [25, plan.peligro_dolor_cabeza, plan.peligro_vision_borrosa, plan.peligro_embarazo_multiple],
    [26, plan.peligro_hemorragia_vaginal, plan.peligro_edema_mi, plan.peligro_nino_transverso],
    [27, plan.peligro_dolor_estomago, plan.peligro_salida_liquidos, plan.peligro_convulsiones],
    [28, plan.peligro_fiebre, plan.peligro_ausencia_mov_fetales, plan.peligro_placenta_no_salia],
  ];
  dangerRows.forEach(([row, a, b, c]) => {
    markYesNo(map, a, `Q${row}`, `R${row}`);
    markYesNo(map, b, `AA${row}`, `AC${row}`);
    markYesNo(map, c, `AL${row}`, `AN${row}`);
  });

  const posicionParto = normalizeChoiceKey(plan.posicion_parto);
  if (posicionParto === 'otro' || (plan.posicion_parto && !['semi_reclinada', 'acostada', 'cuclillas', 'rodillas', 'de_pie'].includes(posicionParto))) {
    setMapValue(map, 'C38:G38', posicionParto === 'otro' ? 'X' : plan.posicion_parto);
  } else {
    mapChoice(map, plan.posicion_parto, {
      semi_reclinada: 'G33',
      acostada: 'G34',
      cuclillas: 'G35',
      rodillas: 'G36',
      de_pie: 'G37',
    });
  }
  const lugarAtencionParto = normalizeChoiceKey(plan.lugar_atencion_parto);
  if (lugarAtencionParto === 'otro' || (plan.lugar_atencion_parto && !['cap', 'caimi', 'hospital', 'clinica', 'clinica_privada'].includes(lugarAtencionParto))) {
    setMapValue(map, 'AG32:AN32', lugarAtencionParto === 'otro' ? 'X' : plan.lugar_atencion_parto);
  } else {
    mapChoice(map, String(plan.lugar_atencion_parto || '').toLowerCase(), {
      cap: 'L32',
      caimi: 'Q32',
      hospital: 'V32',
      clinica: 'AC32',
      clinica_privada: 'AC32',
    });
  }
  mapChoice(map, String(plan.horas_distancia || ''), {
    '-1': 'K35',
    '1': 'K35',
    '2': 'M35',
    '3': 'O35',
    '4': 'Q35',
    '5': 'S35',
  });
  if (Number(plan.horas_distancia) > 5) markMap(map, 'S35', true);
  setMapValue(map, 'V37:AH37', plan.kms_servicio);
  markYesNo(map, plan.casa_materna_cercana, 'AG38', 'AK38');
  markYesNo(map, plan.usara_casa_materna, 'T39', 'W39');

  mapChoice(map, plan.como_trasladara, {
    vehiculo_familiar: 'F42',
    vehiculo: 'F42',
    ambulancia: 'E43',
    bomberos: 'E44',
    otro: 'C45',
  });
  mapChoice(map, plan.acompana_traslado, {
    conyuge: 'Q42',
    hermano: 'W42',
    hermana: 'W42',
    madre_padre: 'AC42',
    padre_madre: 'AC42',
    suegra: 'AG42',
    suegro: 'AG42',
    vecina: 'AK42',
  });
  mapChoice(map, plan.acompana_parto, {
    esposo: 'AD43',
    comadrona: 'AI43',
    conyuge: 'AD43',
    familiar: 'AM43',
  });
  setMapValue(map, 'X45', plan.bebida_durante_parto);
  setMapValue(map, 'X46', plan.bebida_despues_parto);
  markYesNo(map, plan.cuenta_ahorro, 'C48', 'E48');
  markMap(map, 'T48', plan.ropa_nino);
  markMap(map, 'AB48', plan.ropa_madre);
  setTwoLineMapValue(map, 'AH48', 'O49', plan.otros_articulos, 20);

  mapChoice(map, plan.con_quien_hijos, {
    hijos_mayores: 'F51',
    parientes: 'E52',
    vecinos: 'D53',
    otros: 'C54',
    otro: 'C54',
  });
  markMap(map, 'T51', plan.lleva_dpi_madre);
  markMap(map, 'AC51', plan.lleva_dpi_conyuge);
  markMap(map, 'AG53', plan.lleva_partida_nacimiento);
  markYesNo(map, plan.comunicado_comite, 'T56', 'X56');
  mapChoice(map, plan.quien_cuida_casa, {
    parientes: 'D57',
    vecinos: 'D58',
    otros: 'C59',
    otro: 'C59',
  });
  setMapValue(map, 'F61', plan.telefono_vehiculo);
  mapChoice(map, plan.responsable_activar, {
    conyuge: 'Q58',
    hermano: 'V58',
    hermana: 'V58',
    madre_padre: 'AC58',
    padre_madre: 'AC58',
    vecina: 'Q59',
    suegra: 'V59',
    suegro: 'V59',
    comadrona: 'AC59',
    otro_familiar: 'AJ59',
  });
  setMapValue(map, 'AE60', plan.nombre_activara_plan);
  setMapValue(map, 'K70:T70', plan.nombre_proveedor_salud);

  return map;
}

function firstCellAddress(address) {
  return String(address).split(':')[0];
}

function shouldCenterCell(address, value) {
  return (String(value).length === 1 && value === 'X') || CENTER_FORMAT_RE.test(address);
}

async function writeExcelTemplate(templatePath, outputPath, cellMap) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const worksheet = workbook.worksheets[0];

  Object.entries(cellMap).forEach(([address, value]) => {
    if (value === null || value === undefined || value === '') return;

    if (address.includes(':')) {
      try {
        worksheet.mergeCells(address);
      } catch {
        // Official templates often already contain merged cells.
      }
    }

    const cell = worksheet.getCell(firstCellAddress(address));
    cell.value = String(value);

    if (TEXT_FORMAT_CELLS.has(address)) {
      cell.numFmt = '@';
    }

    if (shouldCenterCell(address, String(value))) {
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: 'center',
        vertical: 'middle',
      };
    }
  });

  await workbook.xlsx.writeFile(outputPath);
}

function libreOfficeExecutable() {
  return process.env.LIBREOFFICE_PATH || (process.platform === 'win32' ? 'soffice.exe' : 'soffice');
}

async function exportWithLibreOffice(templatePath, cellMap, pdfFileName, tempDir) {
  const tempXlsx = path.join(tempDir, 'template.xlsx');
  const generatedPdf = path.join(tempDir, 'template.pdf');
  const tempPdf = path.join(tempDir, pdfFileName);

  await writeExcelTemplate(templatePath, tempXlsx, cellMap);
  await execFileAsync(libreOfficeExecutable(), [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    tempDir,
    tempXlsx,
  ], {
    maxBuffer: 1024 * 1024 * 10,
  });

  if (!fs.existsSync(generatedPdf)) {
    throw new Error('LibreOffice no genero el PDF esperado');
  }

  if (generatedPdf !== tempPdf) {
    fs.renameSync(generatedPdf, tempPdf);
  }

  return fs.readFileSync(tempPdf);
}

async function exportWithExcelCom(templatePath, cellMap, pdfFileName, tempDir) {
  const tempXlsx = path.join(tempDir, 'template.xlsx');
  const tempPdf = path.join(tempDir, pdfFileName);
  const tempJson = path.join(tempDir, 'cells.json');

  fs.copyFileSync(templatePath, tempXlsx);
  fs.writeFileSync(tempJson, JSON.stringify(cellMap), 'utf8');

  const psScript = `
$ErrorActionPreference = 'Stop'
$xlsx = '${tempXlsx.replace(/'/g, "''")}'
$pdf = '${tempPdf.replace(/'/g, "''")}'
$jsonPath = '${tempJson.replace(/'/g, "''")}'
$excel = $null
$wb = $null
try {
  $map = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($xlsx)
  $ws = $wb.Worksheets.Item(1)
  foreach ($prop in $map.PSObject.Properties) {
    $addr = $prop.Name
    $val = [string]$prop.Value
    $range = $ws.Range($addr)
    if ($addr -match ':') {
      $range.Merge() | Out-Null
      $range = $ws.Range($addr)
    }
    if (@('T8', 'V8', 'F61', 'G19:J19', 'P19:S19', 'Q19:T19', 'AK19:AN19').Contains($addr)) {
      $range.NumberFormat = '@'
    }
    $range.Value2 = $val
    if ($val.Length -eq 1 -and $val -eq 'X') {
      $range.HorizontalAlignment = -4108
      $range.VerticalAlignment = -4108
    }
    elseif ($addr -match '^(N6|O6|P6|Q6|S6|T6|U6|V6|Y6|Z6|AA6|AB6|AA7:AB7|AA13:AB13|K18|X18|X19|E20|K20|Q20|X20|F21|M21)$') {
      $range.HorizontalAlignment = -4108
      $range.VerticalAlignment = -4108
    }
  }
  $wb.ExportAsFixedFormat(0, $pdf)
  Write-Output $pdf
}
finally {
  if ($wb -ne $null) { $wb.Close($false) | Out-Null; [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
  if ($excel -ne $null) { $excel.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });
  return fs.readFileSync(tempPdf);
}

async function exportExcelTemplateToPdf(templatePath, cellMap, pdfFileName) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-prenatal-'));
  const engine = (process.env.PDF_EXCEL_ENGINE || 'auto').toLowerCase();

  try {
    if (engine === 'excel' || (engine === 'auto' && process.platform === 'win32')) {
      return await exportWithExcelCom(templatePath, cellMap, pdfFileName, tempDir);
    }

    return await exportWithLibreOffice(templatePath, cellMap, pdfFileName, tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function formatDate(value) {
  const { d, m, y } = dateParts(value);
  if (!d || !m || !y) return '';
  return `${d}/${m}/${y}`;
}

function yesNo(value) {
  return value ? 'Si' : 'No';
}

function riskCriteria(riesgo) {
  return [
    ['Muerte fetal/neonatal previa', riesgo.muerte_fetal_neonatal_previa],
    ['3 o mas abortos espontaneos consecutivos', riesgo.abortos_espontaneos_3mas],
    ['Tres o mas gestas', riesgo.gestas_3mas],
    ['RN anterior menor de 2500 g', riesgo.peso_ultimo_bebe_menor_2500g],
    ['RN anterior mayor de 4500 g', riesgo.peso_ultimo_bebe_mayor_4500g],
    ['Antecedente de HTA/preeclampsia', riesgo.antec_hipertension_preeclampsia],
    ['Cirugias del tracto reproductivo', riesgo.cirugias_tracto_reproductivo],
    ['Embarazo multiple', riesgo.embarazo_multiple],
    ['Menor de 20 anos', riesgo.menor_20_anos],
    ['Mayor de 35 anos', riesgo.mayor_35_anos],
    ['Paciente Rh negativo', riesgo.paciente_rh_negativo],
    ['Hemorragia vaginal', riesgo.hemorragia_vaginal],
    ['VIH positivo o sifilis', riesgo.vih_positivo_sifilis],
    ['Presion arterial diastolica mayor o igual a 90', riesgo.presion_diastolica_90mas],
    ['Anemia', riesgo.anemia],
    ['Desnutricion u obesidad', riesgo.desnutricion_obesidad],
    ['Dolor abdominal', riesgo.dolor_abdominal],
    ['Sintomatologia urinaria', riesgo.sintomatologia_urinaria],
    ['Ictericia', riesgo.ictericia],
    ['Diabetes', riesgo.diabetes],
    ['Enfermedad renal', riesgo.enfermedad_renal],
    ['Enfermedad del corazon', riesgo.enfermedad_corazon],
    ['Hipertension arterial', riesgo.hipertension_arterial],
    ['Consumo de drogas, alcohol o tabaco', riesgo.consumo_drogas_alcohol_tabaco],
    ['Otra enfermedad severa', riesgo.otra_enfermedad_severa],
  ];
}

function buildRiskPdfHtml({ paciente, embarazo, riesgo }) {
  const criteria = riskCriteria(riesgo);
  const bg = assetOfficialBase64('riesgo_oficial_page1.png');
  const nombre = `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim();
  const edad = edadAnios(paciente.fecha_nacimiento);
  const fur = riesgo.fecha_ultima_regla || embarazo?.fur || paciente.fur;
  const fpp = riesgo.fecha_probable_parto || embarazo?.fpp || paciente.fpp;

  const field = (text, x, y, w, size = 8.2, align = 'left', weight = 600) => {
    if (text === null || text === undefined || text === '') return '';
    return `<div class="f" style="left:${x}pt;top:${y}pt;width:${w}pt;font-size:${size}pt;text-align:${align};font-weight:${weight};">${esc(text)}</div>`;
  };

  const mark = (active, x, y) =>
    active
      ? `<div class="mark" style="left:${x}pt;top:${y}pt;">X</div>`
      : '';

  const yesNoRowMarks = (active, y) => [
    mark(active, 500, y),
    mark(!active, 532, y),
  ].join('');

  const checks = [
    yesNoRowMarks(riesgo.muerte_fetal_neonatal_previa, 323),
    yesNoRowMarks(riesgo.abortos_espontaneos_3mas, 344),
    yesNoRowMarks(riesgo.gestas_3mas, 364.5),
    yesNoRowMarks(riesgo.peso_ultimo_bebe_menor_2500g, 384.5),
    yesNoRowMarks(riesgo.peso_ultimo_bebe_mayor_4500g, 405),
    yesNoRowMarks(riesgo.antec_hipertension_preeclampsia, 425),
    yesNoRowMarks(riesgo.cirugias_tracto_reproductivo, 445),
    yesNoRowMarks(riesgo.embarazo_multiple, 489),
    yesNoRowMarks(riesgo.menor_20_anos, 509.5),
    yesNoRowMarks(riesgo.mayor_35_anos, 530),
    yesNoRowMarks(riesgo.paciente_rh_negativo, 550),
    yesNoRowMarks(riesgo.hemorragia_vaginal, 570.5),
    yesNoRowMarks(riesgo.vih_positivo_sifilis, 591),
    yesNoRowMarks(riesgo.presion_diastolica_90mas, 611),
    yesNoRowMarks(riesgo.anemia, 632),
    yesNoRowMarks(riesgo.desnutricion_obesidad, 652),
    yesNoRowMarks(riesgo.dolor_abdominal, 672.5),
    yesNoRowMarks(riesgo.sintomatologia_urinaria, 693),
    yesNoRowMarks(riesgo.ictericia, 713),
    yesNoRowMarks(riesgo.diabetes, 765),
    yesNoRowMarks(riesgo.enfermedad_renal, 785),
    yesNoRowMarks(riesgo.enfermedad_corazon, 805.5),
    yesNoRowMarks(riesgo.hipertension_arterial, 826),
    yesNoRowMarks(riesgo.consumo_drogas_alcohol_tabaco, 846.5),
    yesNoRowMarks(riesgo.otra_enfermedad_severa, 867),
  ].join('');

  const overlay = [
    field(nombre, 85, 157, 380, 9),
    field(edad, 500, 157, 45, 9, 'center'),
    field(paciente.municipio || paciente.domicilio, 85, 171, 320, 8.4),
    field(riesgo.telefono || paciente.telefono, 430, 171, 115, 8.4),

    mark((riesgo.pueblo || paciente.pueblo) === 'maya', 112, 185),
    mark((riesgo.pueblo || paciente.pueblo) === 'xinca', 167, 185),
    mark((riesgo.pueblo || paciente.pueblo) === 'garifuna', 224, 185),
    mark((riesgo.pueblo || paciente.pueblo) === 'mestizo', 281, 185),
    mark(Boolean(riesgo.migrante), 393, 185),
    field(riesgo.estado_civil || paciente.estado_civil, 446, 178, 100, 8.1),

    field(riesgo.escolaridad || paciente.nivel_estudios, 87, 199, 180, 8.1),
    mark((riesgo.escolaridad || paciente.nivel_estudios) === 'primaria', 131, 205),
    mark((riesgo.escolaridad || paciente.nivel_estudios) === 'basico' || (riesgo.escolaridad || paciente.nivel_estudios) === 'secundaria', 188, 205),
    mark((riesgo.escolaridad || paciente.nivel_estudios) === 'diversificado', 264, 205),
    mark((riesgo.escolaridad || paciente.nivel_estudios) === 'ninguno', 393, 205),
    field(riesgo.ocupacion || paciente.profesion_oficio, 445, 199, 100, 8.1),

    field(riesgo.nombre_esposo_conviviente || paciente.nombre_esposo_conviviente, 159, 220, 306, 8.1),
    field(riesgo.edad_esposo, 500, 220, 45, 8.4, 'center'),

    field(riesgo.pueblo_esposo, 83, 238, 235, 8.1),
    field(riesgo.escolaridad_esposo, 84, 256, 320, 8.1),
    field(riesgo.ocupacion_esposo, 424, 256, 121, 8.1),

    field(riesgo.distancia_servicio_km, 283, 274, 30, 8.1, 'center'),
    field(riesgo.tiempo_horas, 479, 274, 66, 8.1, 'center'),
    field(formatDate(fur), 84, 292, 130, 8.1),
    field(formatDate(fpp), 237, 292, 160, 8.1),
    field(riesgo.no_embarazos, 475, 292, 70, 8.1, 'center'),
    field(riesgo.no_partos, 85, 304, 62, 8.1, 'center'),
    field(riesgo.no_cesareas, 237, 304, 60, 8.1, 'center'),
    field(riesgo.no_abortos, 386, 304, 68, 8.1, 'center'),
    field(riesgo.no_hijos_vivos, 475, 304, 70, 8.1, 'center'),
    field(riesgo.no_hijos_muertos, 113, 316, 55, 8.1, 'center'),
    field(riesgo.edad_embarazo_semanas, 243, 316, 58, 8.1, 'center'),

    checks,

    mark(Boolean(riesgo.tiene_riesgo), 425, 894),
    mark(!riesgo.tiene_riesgo, 482, 894),
    field(riesgo.referida_a, 240, 911, 305, 8.2),
    field(riesgo.nombre_personal_atendio, 343, 935, 202, 8.2, 'center'),
  ].join('');

  return `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: letter portrait; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; }
      .sheet {
        position: relative;
        width: 612pt;
        height: 792pt;
        margin: 0 auto;
        overflow: hidden;
      }
      .bg { position: absolute; inset: 0; width: 612pt; height: 792pt; }
      .f {
        position: absolute;
        line-height: 1.05;
        white-space: nowrap;
        color: #111;
      }
      .mark {
        position: absolute;
        width: 10pt;
        text-align: center;
        font-size: 9pt;
        font-weight: 800;
        color: #111;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <img class="bg" src="${bg}" />
      ${overlay}
    </main>
  </body>
  </html>`;
}

function controlAt(controles, numero) {
  return controles.find((c) => Number(c.numero_control) === numero) || {};
}

function buildMspasHtml({ paciente, embarazo, controles }) {
  const p = paciente;
  const c1 = controlAt(controles, 1);
  const c2 = controlAt(controles, 2);
  const edad = edadAnios(p.fecha_nacimiento);
  const pages = [5, 6, 7, 8].map((n) => assetBase64(`formato_mspas_p${n}.png`));
  const fullName = `${p.nombres || ''} ${p.apellidos || ''}`.trim();
  const fur = embarazo?.fur || p.fur;
  const fpp = embarazo?.fpp || p.fpp;

  const colX = [62, 169, 276, 383, 490];
  const controlHeader = (c, idx) => {
    const x = colX[idx];
    return [
      splitDateTinyFields(c.fecha, x + 3, 640),
      field(c.hora ? String(c.hora).slice(0, 2) : '', x + 13, 667, 12, 8, 5.2, 'center digits'),
      field(c.hora ? String(c.hora).slice(3, 5) : '', x + 39, 667, 12, 8, 5.2, 'center digits'),
      wrapField(c.motivo_consulta, x + 4, 693, 96, 40, 6.2),
      field(c.edad_gestacional_semanas, x + 5, 885, 90, 9, 6.5),
      field(c.nombre_acompanante, x + 5, 899, 90, 9, 6.2),
      field(c.nombre_cargo_atiende, x + 5, 913, 90, 9, 5.8),
    ].join('');
  };

  const page1 = [
    field(p.no_expediente, 449, 118, 130, 10, 6.2),
    boxDigits(p.cui, 462, 139, 10.25, 5.5),
    field(p.nombre_establecimiento, 20, 205, 285, 8, 5.8),
    field(p.distrito, 310, 205, 150, 8, 5.8),
    field(p.area_salud, 20, 224, 285, 8, 5.8),
    mark(p.categoria_servicio === 'CCS', 372, 215),
    mark(p.categoria_servicio === 'PS', 413, 215),
    mark(p.categoria_servicio === 'CS_B', 464, 215),
    mark(p.categoria_servicio === 'CS_A', 514, 215),
    field(p.nombres, 20, 260, 280, 8, 5.8),
    field(p.apellidos, 310, 260, 280, 8, 5.8),
    field(p.domicilio, 20, 279, 280, 8, 5.8),
    field(p.municipio, 310, 279, 280, 8, 5.8),
    field(p.territorio, 20, 297, 70, 8, 5.8),
    field(p.sector, 310, 297, 70, 8, 5.8),
    field(p.comunidad, 20, 316, 280, 8, 5.8),
    field(p.telefono, 310, 316, 180, 8, 5.8),
    splitDateTinyFields(p.fecha_nacimiento, 23, 349),
    field(edad, 25, 368, 34, 8, 5.8, 'center digits'),
    mark(p.rango_edad === '14_19', 62, 356),
    mark(p.rango_edad === 'menor_14', 62, 366),
    mark(p.rango_edad === 'mayor_35', 62, 376),
    mark(p.clasificacion_alfa_beta === 'SI', 96, 359),
    mark(p.clasificacion_alfa_beta === 'NO', 96, 346),
    mark(p.nivel_estudios === 'ninguno', 116, 334),
    mark(p.nivel_estudios === 'primaria', 136, 334),
    mark(p.nivel_estudios === 'basico' || p.nivel_estudios === 'secundaria', 116, 350),
    mark(p.nivel_estudios === 'universitaria', 136, 350),
    field(p.ultimo_anio_aprobado, 120, 377, 34, 8, 5.6, 'center'),
    field(p.profesion_oficio, 148, 353, 66, 14, 5.1),
    mark(p.estado_civil === 'casada', 254, 326),
    mark(p.estado_civil === 'unida', 254, 338),
    mark(p.estado_civil === 'soltera', 254, 350),
    mark(p.estado_civil === 'separada', 254, 362),
    mark(Boolean(p.vive_sola), 242, 374),
    field(p.nombre_esposo_conviviente, 264, 353, 70, 14, 5),
    mark(Boolean(p.es_migrante), 349, 340),
    mark(!p.es_migrante, 349, 366),
    field(p.migrante_municipio_depto_pais, 366, 353, 100, 14, 5),
    mark(p.pueblo === 'maya', 482, 335),
    mark(p.pueblo === 'garifuna', 482, 349),
    mark(p.pueblo === 'xinca', 482, 363),
    mark(p.pueblo === 'mestizo', 482, 377),
    mark(p.pueblo === 'otro', 482, 390),
    field(p.comunidad_linguistica, 510, 354, 78, 14, 5),
    mark(Boolean(p.cobertura_igss), 40, 401),
    mark(!p.cobertura_igss, 55, 401),
    mark(Boolean(p.cobertura_privada), 97, 401),
    mark(!p.cobertura_privada, 112, 401),
    field(p.cobertura_privada_detalle, 149, 404, 185, 8, 5.2),
    mark(Boolean(p.viene_referida), 357, 401),
    mark(!p.viene_referida, 372, 401),
    field(p.referida_de, 395, 404, 190, 8, 5.2),
    mark(Boolean(p.fam_diabetes), 52, 432),
    mark(Boolean(p.fam_hipertension), 52, 453),
    mark(Boolean(p.fam_preeclampsia), 52, 465),
    mark(Boolean(p.fam_eclampsia), 52, 477),
    mark(Boolean(p.fam_otra_condicion_medica_grave), 52, 489),
    mark(Boolean(p.antec_diabetes), 119, 432),
    mark(Boolean(p.antec_diabetes_tipo === '1'), 128, 442),
    mark(Boolean(p.antec_diabetes_tipo === '2'), 140, 442),
    mark(Boolean(p.antec_diabetes_tipo === 'G'), 151, 442),
    mark(Boolean(p.antec_hipertension), 119, 453),
    mark(Boolean(p.antec_preeclampsia), 119, 465),
    mark(Boolean(p.antec_eclampsia), 119, 477),
    mark(Boolean(p.antec_otra_condicion), 119, 489),
    mark(Boolean(p.cirugia_genito_urinaria_pers || p.cirugia_genito_urinaria), 188, 425),
    mark(Boolean(p.infertilidad), 188, 444),
    mark(Boolean(p.antec_cardiopatia), 188, 456),
    mark(Boolean(p.antec_nefropatia), 188, 468),
    mark(Boolean(p.antec_violencia), 188, 480),
    mark(Boolean(p.antec_vih_positivo), 188, 492),
    field(p.gestas_previas, 264, 432, 22, 10, 7, 'center'),
    field(p.abortos, 313, 432, 20, 10, 7, 'center'),
    field(p.partos_vaginales, 349, 432, 20, 10, 7, 'center'),
    field(p.nacidos_vivos, 400, 432, 20, 10, 7, 'center'),
    field(p.hijos_viven, 459, 432, 20, 10, 7, 'center'),
    field(p.nacidos_muertos, 399, 477, 22, 10, 7, 'center'),
    field(p.muertos_antes_1sem, 461, 467, 18, 10, 7, 'center'),
    field(p.muertos_despues_1sem, 461, 495, 18, 10, 7, 'center'),
    field(p.cesareas, 362, 478, 20, 10, 7, 'center'),
    mark(Boolean(p.rn_nc), 224, 457),
    mark(Boolean(p.rn_normal), 224, 472),
    mark(Boolean(p.rn_menor_2500g), 257, 457),
    mark(Boolean(p.rn_mayor_4000g), 257, 472),
    field(p.antec_emb_ectopico_num, 273, 473, 20, 10, 7, 'center'),
    mark(Boolean(p.abortos_3_espont_consecutivos), 331, 459),
    mark(Boolean(p.antec_gemelares), 257, 502),
    splitDateFields(p.fin_embarazo_anterior, 492, 432),
    mark(Boolean(p.fin_embarazo_menos_1anio), 573, 425),
    mark(Boolean(p.embarazo_planeado), 569, 467),
    mark(!p.embarazo_planeado, 585, 467),
    mark(p.fracaso_metodo === 'no', 490, 494),
    mark(p.fracaso_metodo === 'barrera', 515, 494),
    mark(p.fracaso_metodo === 'DIU', 540, 494),
    mark(p.fracaso_metodo === 'hormonal', 565, 494),
    mark(p.fracaso_metodo === 'emergencia', 585, 494),
    splitDateFields(fur, 342, 536),
    splitDateFields(fpp, 342, 561),
    mark(Boolean(p.eg_confiable_fur), 475, 524),
    mark(!p.eg_confiable_fur, 489, 524),
    mark(Boolean(p.eg_confiable_usg), 475, 566),
    mark(!p.eg_confiable_usg, 489, 566),
    mark(Boolean(p.tiene_ficha_riesgo), 556, 553),
    mark(!p.tiene_ficha_riesgo, 572, 553),
    controlHeader(c1, 0),
    controlHeader(c2, 1),
  ].join('');

  const vitalRows = [
    ['pa_sistolica', 'pa_diastolica', 111],
    ['frecuencia_cardiaca', null, 127],
    ['frecuencia_respiratoria', null, 143],
    ['temperatura', null, 158],
    ['perimetro_braquial_cm', null, 175],
    ['peso_kg', null, 192],
    ['talla_cm', null, 208],
    ['imc', null, 224],
  ];
  const page2Control = (c, idx) => {
    const x = colX[idx];
    return [
      ...vitalRows.map(([a, b, y]) => field(b ? `${c[a] || ''}/${c[b] || ''}` : c[a], x + 5, y, 90, 9, 6.5, 'center')),
      mark(c.examen_bucodental === true, x + 7, 239),
      mark(c.examen_bucodental === false, x + 19, 239),
      mark(c.examen_mamas === true, x + 7, 259),
      mark(c.examen_mamas === false, x + 19, 259),
      field(c.altura_uterina_cm, x + 5, 294, 90, 9, 6.5, 'center'),
      field(c.fcf, x + 5, 310, 90, 9, 6.5, 'center'),
      mark(c.movimientos_fetales === true, x + 50, 326),
      mark(c.movimientos_fetales === false, x + 63, 326),
      field(c.situacion_fetal, x + 5, 346, 90, 9, 6),
      field(c.presentacion_fetal, x + 5, 363, 90, 9, 6),
      mark(c.sangre_manchado === true, x + 47, 388),
      mark(c.sangre_manchado === false, x + 60, 388),
      mark(c.verrugas_herpes_papilomas === true, x + 47, 407),
      mark(c.verrugas_herpes_papilomas === false, x + 60, 407),
      mark(c.flujo_vaginal === true, x + 47, 428),
      mark(c.flujo_vaginal === false, x + 60, 428),
      field(c.otros_ginecologico, x + 5, 441, 95, 9, 5.8),
      mark(c.hematologia_realizada === true, x + 8, 474),
      mark(c.hematologia_realizada === false, x + 21, 474),
      field(c.hematologia_resultado, x + 36, 474, 60, 8, 5.5),
      mark(c.glicemia_realizada === true, x + 8, 495),
      mark(c.glicemia_realizada === false, x + 21, 495),
      field(c.glicemia_resultado, x + 36, 495, 60, 8, 5.5),
      field(c.grupo_rh_resultado, x + 36, 514, 50, 8, 5.5),
      mark(c.orina_realizada === true, x + 48, 534),
      mark(c.orina_bacteriuria === true, x + 48, 549),
      mark(c.orina_proteinuria === true, x + 48, 571),
      mark(c.heces_realizada === true, x + 8, 592),
      field(c.heces_resultado, x + 36, 592, 60, 8, 5.5),
      mark(c.vih_realizado === true, x + 8, 615),
      field(c.vih_resultado_valor || c.vih_resultado, x + 36, 615, 60, 8, 5.2),
      mark(c.vdrl_realizado === true, x + 8, 634),
      field(c.vdrl_resultado, x + 36, 634, 60, 8, 5.5),
      mark(c.torch_realizado === true, x + 8, 674),
      field(c.torch_resultado_valor || (c.torch_resultado_positivo ? 'Positivo' : ''), x + 36, 674, 60, 8, 5.2),
      mark(c.papanicolau_ivaa_realizado === true, x + 8, 696),
      field(c.papanicolau_ivaa_resultado, x + 36, 696, 60, 8, 5.2),
      mark(c.hepatitis_b_realizado === true, x + 8, 717),
      field(c.hepatitis_b_resultado, x + 36, 717, 60, 8, 5.2),
      field(c.otros_lab, x + 5, 735, 95, 10, 5.2),
      mark(c.usg_realizado === true, x + 8, 780),
      mark(c.usg_realizado === false, x + 21, 780),
      wrapField(c.usg_hallazgos, x + 5, 808, 95, 35, 5.2),
    ].join('');
  };
  const page2 = [page2Control(c1, 0), page2Control(c2, 1)].join('');

  const page3Control = (c, idx) => {
    const x = colX[idx];
    return [
      mark(c.sulfato_ferroso === true, x + 7, 112),
      mark(c.sulfato_ferroso === false, x + 20, 112),
      field(c.sulfato_ferroso_tabletas, x + 5, 130, 90, 9, 6.5, 'center'),
      mark(c.acido_folico === true, x + 7, 148),
      mark(c.acido_folico === false, x + 20, 148),
      field(c.acido_folico_tabletas, x + 5, 166, 90, 9, 6.5, 'center'),
      wrapField(c.suplementacion_hallazgos, x + 5, 185, 95, 18, 5.2),
      wrapField(c.suplementacion_tratamiento, x + 5, 208, 95, 20, 5.2),
    ].join('');
  };
  const page3 = [page3Control(c1, 0), page3Control(c2, 1)].join('');

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: 8.5in 13in; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
      .page { position: relative; width: 612pt; height: 936pt; page-break-after: always; overflow: hidden; }
      .page img.bg { position: absolute; inset: 0; width: 612pt; height: 936pt; z-index: 0; }
      .f { position: absolute; z-index: 1; line-height: 1.05; overflow: hidden; white-space: nowrap; font-weight: 600; background: rgba(255,255,255,0.72); padding: 0 1pt; }
      .wrap { white-space: normal; line-height: 1.15; }
      .center { text-align: center; }
      .digits { font-weight: 600; letter-spacing: 0; }
      .x { position: absolute; z-index: 1; width: 7pt; height: 7pt; font-size: 6.4pt; line-height: 7pt; text-align: center; font-weight: 900; color: #111; }
    </style>
  </head>
  <body>
    <section class="page"><img class="bg" src="${pages[0]}" />${page1}</section>
    <section class="page"><img class="bg" src="${pages[1]}" />${page2}</section>
    <section class="page"><img class="bg" src="${pages[2]}" />${page3}</section>
    <section class="page"><img class="bg" src="${pages[3]}" /></section>
  </body>
  </html>`;
}

async function pdfMspas(req, res) {
  const { pacienteId } = req.params;

  try {
    const embarazoActivoId = await obtenerEmbarazoActivoId(pacienteId);
    const [pacienteRes, embarazoRes, controlesRes, riesgoRes, planPartoRes] = await Promise.all([
      pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
      pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoActivoId]),
      pool.query(
        'SELECT * FROM controles_prenatales WHERE embarazo_id = $1 ORDER BY numero_control LIMIT 5',
        [embarazoActivoId]
      ),
      pool.query(
        'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
        [embarazoActivoId]
      ),
      pool.query(
        'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
        [embarazoActivoId]
      ),
    ]);

    if (!pacienteRes.rows[0]) {
      return res.status(404).json({ error: 'Paciente no encontrada' });
    }

    const pdf = await generarFichaClinicaPrenatalPdf({
      paciente: pacienteRes.rows[0],
      embarazo: embarazoRes.rows[0] || null,
      controles: controlesRes.rows,
      riesgo: riesgoRes.rows[0] || null,
      planParto: planPartoRes.rows[0] || null,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ficha-prenatal.pdf"',
    });
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar PDF MSPAS' });
  }
}

async function pdfRiesgoObstetrico(req, res) {
  const { pacienteId } = req.params;

  try {
    const embarazoActivoId = await obtenerEmbarazoActivoId(pacienteId);
    const [pacienteRes, embarazoRes, riesgoRes] = await Promise.all([
      pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
      pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoActivoId]),
      pool.query(
        'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
        [embarazoActivoId]
      ),
    ]);

    const paciente = pacienteRes.rows[0];
    const riesgo = riesgoRes.rows[0];

    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrada' });
    }
    if (!riesgo) {
      return res.status(404).json({ error: 'La paciente no tiene ficha de riesgo registrada' });
    }

    const cellMap = buildRiskCellMap({
      paciente,
      embarazo: embarazoRes.rows[0] || null,
      riesgo,
    });
    const templatePath = path.join(__dirname, '../assets/official_forms/riesgo_oficial.xlsx');
    const pdf = await exportExcelTemplateToPdf(templatePath, cellMap, `ficha-riesgo-${pacienteId}.pdf`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=ficha-riesgo-${pacienteId}.pdf`,
    });
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar PDF de ficha de riesgo' });
  }
}

async function pdfPlanParto(req, res) {
  const { pacienteId } = req.params;

  try {
    const embarazoActivoId = await obtenerEmbarazoActivoId(pacienteId);
    const [pacienteRes, planRes] = await Promise.all([
      pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
      pool.query(
        'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
        [embarazoActivoId]
      ),
    ]);

    const paciente = pacienteRes.rows[0];
    const plan = planRes.rows[0];

    if (!paciente) {
      return res.status(404).json({ error: 'Paciente no encontrada' });
    }
    if (!plan) {
      return res.status(404).json({ error: 'La paciente no tiene plan de parto registrado' });
    }

    const cellMap = buildPlanPartoCellMap({ paciente, plan });
    const templatePath = path.join(__dirname, '../assets/official_forms/plan_parto_oficial.xlsx');
    const pdf = await exportExcelTemplateToPdf(templatePath, cellMap, `plan-parto-${pacienteId}.pdf`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=plan-parto-${pacienteId}.pdf`,
    });
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar PDF de plan de parto' });
  }
}

module.exports = {
  pdfControl,
  pdfMspas,
  pdfRiesgoObstetrico,
  pdfPlanParto,
};
