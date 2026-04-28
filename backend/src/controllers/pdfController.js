const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

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

    return res.send(pdf);

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Error al generar PDF'
    });
  }
}

module.exports = {
  pdfControl
};