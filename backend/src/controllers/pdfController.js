const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { obtenerEmbarazoActivoId } = require('../utils/embarazos');

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
      .replace('{{nombre}}', `${c.nombres} ${c.apellidos}`)
      .replace('{{expediente}}', c.no_expediente)
      .replace('{{fecha}}', c.fecha)
      .replace('{{hora}}', c.hora || '')
      .replace('{{eg}}', c.edad_embarazo_semanas || '')
      .replace('{{motivo}}', c.motivo_consulta || '')
      .replace('{{temp}}', c.temperatura || '')
      .replace('{{pulso}}', c.pulso || '')
      .replace('{{resp}}', c.respiraciones || '')
      .replace('{{pa}}', `${c.pa_sistolica}/${c.pa_diastolica}`)
      .replace('{{peso}}', c.peso_kg || '')
      .replace('{{talla}}', c.talla_cm || '')
      .replace('{{au}}', c.au_cm || '')
      .replace('{{fcf}}', c.fcf || '')
      .replace('{{imc}}', c.imc || '')
      .replace('{{tratamiento}}', c.tratamiento || '')
      .replace('{{consejeria}}', c.consejeria || '')
      .replace('{{personal}}', c.personal_atendio || '');

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // 👈 importante en Windows
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

function dateParts(value) {
  if (!value) return { d: '', m: '', y: '' };
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
    const [pacienteRes, embarazoRes, controlesRes] = await Promise.all([
      pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
      pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoActivoId]),
      pool.query(
        'SELECT * FROM controles_prenatales WHERE embarazo_id = $1 ORDER BY numero_control LIMIT 5',
        [embarazoActivoId]
      ),
    ]);

    if (!pacienteRes.rows[0]) {
      return res.status(404).json({ error: 'Paciente no encontrada' });
    }

    const html = buildMspasHtml({
      paciente: pacienteRes.rows[0],
      embarazo: embarazoRes.rows[0] || null,
      controles: controlesRes.rows,
    });

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      width: '8.5in',
      height: '13in',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=ficha-mspas-${pacienteId}.pdf`,
    });
    return res.send(Buffer.from(pdf));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar PDF MSPAS' });
  }
}

module.exports = {
  pdfControl,
  pdfMspas,
};
