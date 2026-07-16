const puppeteer = require('puppeteer');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function buildCensoPrimerControlHtml({ rows, desde, hasta, generadoEn }) {
  const bodyRows = rows.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(row.no_expediente)}</td>
      <td>${escapeHtml(row.cui)}</td>
      <td class="name">${escapeHtml(row.nombre_completo)}</td>
      <td class="center">${escapeHtml(row.edad)}</td>
      <td>${escapeHtml(row.etnia)}</td>
      <td>${escapeHtml(row.comunidad)}</td>
      <td class="center">${escapeHtml(dateOnly(row.fur))}</td>
      <td class="center">${escapeHtml(dateOnly(row.fpp))}</td>
      <td class="center">${escapeHtml(dateOnly(row.fecha_primer_control))}</td>
      <td class="center">${escapeHtml(row.semanas_gestacion)}</td>
      <td class="center">${escapeHtml(row.gestas)}</td>
      <td class="center">${escapeHtml(row.partos)}</td>
      <td class="center">${escapeHtml(row.abortos)}</td>
      <td class="center risk risk-${escapeHtml(String(row.nivel_riesgo || '').toLowerCase())}">
        ${escapeHtml(row.nivel_riesgo)}
      </td>
      <td class="center">${escapeHtml(row.estado_embarazo)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: 13in 8.5in; margin: 0.34in 0.28in 0.44in; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #172033; font-family: Arial, sans-serif; }
      body { font-size: 7.2pt; }
      .institution { text-align: center; border-bottom: 2px solid #1d6fa4; padding-bottom: 5px; }
      .institution h1 { color: #155e8e; font-size: 12pt; margin: 0; letter-spacing: 0.2px; }
      .institution h2 { font-size: 10pt; margin: 2px 0 0; }
      .institution h3 { font-size: 9.5pt; margin: 4px 0 0; }
      .meta { display: table; table-layout: fixed; width: 100%; margin: 6px 0; }
      .meta span { display: table-cell; border: 1px solid #9fb6c8; background: #f8fbfd; padding: 4px 6px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5px solid #9fb6c8; padding: 2.7px 2px; vertical-align: middle; overflow-wrap: anywhere; }
      th { color: #fff; background: #155e8e; font-size: 6.6pt; line-height: 1.05; text-align: center; }
      tbody tr:nth-child(even) td { background: #f8fbfd; }
      .center { text-align: center; }
      .name { font-weight: 600; }
      .risk { font-weight: 700; }
      .risk-alto { color: #a11d2a; background: #f8d7da !important; }
      .risk-medio { color: #995000; background: #fff1d6 !important; }
      .risk-bajo { color: #087a5b; background: #dff3ea !important; }
      .confidential { margin-top: 5px; color: #5f7185; font-size: 6.5pt; text-align: center; }
      col.c1 { width: 2.4%; } col.c2 { width: 6.4%; } col.c3 { width: 7%; }
      col.c4 { width: 12.2%; } col.c5 { width: 3.2%; } col.c6 { width: 5.3%; }
      col.c7 { width: 9%; } col.c8, col.c9 { width: 6.3%; } col.c10 { width: 7%; }
      col.c11 { width: 3.5%; } col.c12, col.c13, col.c14 { width: 3.2%; }
      col.c15 { width: 5.2%; } col.c16 { width: 6.4%; }
    </style>
  </head>
  <body>
    <header class="institution">
      <h1>MINISTERIO DE SALUD PUBLICA Y ASISTENCIA SOCIAL</h1>
      <h2>CAP El Chal</h2>
      <h3>Censo mensual de captadas en primer control</h3>
    </header>
    <div class="meta">
      <span><strong>Periodo:</strong> ${escapeHtml(desde)} al ${escapeHtml(hasta)}</span>
      <span><strong>Total de captadas:</strong> ${rows.length}</span>
      <span><strong>Emitido en Guatemala:</strong> ${escapeHtml(generadoEn)}</span>
    </div>
    <table>
      <colgroup>${Array.from({ length: 16 }, (_, index) => `<col class="c${index + 1}">`).join('')}</colgroup>
      <thead><tr>
        <th>No.</th><th>Expediente</th><th>CUI</th><th>Nombre completo</th><th>Edad</th>
        <th>Etnia</th><th>Comunidad</th><th>FUR</th><th>FPP</th><th>1er control</th>
        <th>Sem.</th><th>Gestas</th><th>Partos</th><th>Abortos</th><th>Riesgo</th><th>Estado</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="confidential">Documento confidencial para uso institucional. Proteja los datos nominales de las pacientes.</p>
  </body>
  </html>`;
}

function createReportesPdfService({ puppeteerClient = puppeteer } = {}) {
  async function renderCensoPrimerControlPdf(data) {
    let browser = null;
    try {
      browser = await puppeteerClient.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(buildCensoPrimerControlHtml(data), { waitUntil: 'networkidle0' });
      return await page.pdf({
        width: '13in',
        height: '8.5in',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width:100%;font:6.5pt Arial;color:#5f7185;text-align:center;">
            Pagina <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>`,
        margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  return { renderCensoPrimerControlPdf };
}

module.exports = {
  buildCensoPrimerControlHtml,
  createReportesPdfService,
  ...createReportesPdfService(),
};
