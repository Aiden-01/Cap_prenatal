const fs = require('node:fs');
const path = require('node:path');
const { puppeteerBrowserManager } = require('./puppeteerBrowserManager');

const TITULOS = Object.freeze({ nota_evolucion: 'Nota de evolución médica', nota_enfermeria: 'Nota de evolución de enfermería' });
const CLASES = Object.freeze({ medico: 'Médico', enfermeria_ae: 'Auxiliar de Enfermería (AE)', enfermeria_ep: 'Enfermera Profesional (EP)' });
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const logo = name => `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../assets/institucional', name)).toString('base64')}`;

function crearDocumentoNota({ nota, paciente }) {
  if (!Object.hasOwn(TITULOS, nota.tipo)) throw new Error('Tipo documental no admitido');
  const responsable = nota.responsable_snapshot || {};
  const finalizada = nota.estado === 'captura_finalizada';
  const field = (label, value) => `<div><strong>${esc(label)}:</strong> ${esc(value || 'No registrado')}</div>`;
  const header = `<div style="width:100%;padding:0 42px;font-family:Arial,sans-serif;color:#111;box-sizing:border-box;">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #666;padding-bottom:8px;gap:12px;">
      <img alt="Gobierno de Guatemala y MSPAS" src="${logo('gobierno-guatemala-mspas.png')}" style="width:190px;height:auto;flex-shrink:0;" />
      <div style="text-align:center;font-size:10px;line-height:1.5;"><strong style="font-size:17px;">CAP El Chal</strong><br>DDRISS Petén<br>Área Sur Oriente</div>
      <img alt="DDRISS Petén Área Sur Oriente" src="${logo('ddriss-peten-area-sur-oriente.png')}" style="width:72px;height:auto;flex-shrink:0;" />
    </div></div>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'">
    <style>html{font-family:Arial,sans-serif;font-size:11pt;color:#111}body{margin:0}h1{font-size:16pt;margin:0 0 10pt}h2{font-size:12pt;margin:16pt 0 8pt}
    .datos{line-height:1.5;overflow-wrap:anywhere;break-inside:avoid}.estado{font-weight:bold;margin-bottom:12pt;border:1px solid #888;padding:6pt}
    .narrativa{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.55;orphans:3;widows:3}
    .aviso{font-size:9pt;line-height:1.5;border-top:1px solid #888;padding-top:8pt;margin-top:18pt;break-inside:avoid}</style></head><body>
    <h1>${esc(TITULOS[nota.tipo])}</h1><div class="estado">${finalizada ? 'Captura finalizada' : 'BORRADOR - Captura no finalizada'}</div>
    <div class="datos">${field('Paciente', `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim())}
      ${field('N.º de expediente', paciente.no_expediente)}${field('Fecha de atención', nota.fecha_atencion)}${field('Hora de atención', nota.hora_atencion)}
      ${field('Documento', `Nota ${nota.id} · Versión ${nota.version}`)}${field('Control prenatal', nota.control_prenatal_id || 'Sin control asociado')}
      ${field('Profesional responsable', responsable.nombre_completo)}${field('Cargo', responsable.cargo_nombre)}
      ${field('Clasificación', CLASES[responsable.clasificacion_profesional])}${responsable.especialidad_nombre ? field('Especialidad', responsable.especialidad_nombre) : ''}
      ${field('Origen del responsable', responsable.tipo === 'externo' ? 'Profesional externo' : 'Directorio institucional')}
      ${field('Usuario capturista', nota.capturista_usuario_id)}</div>
    <h2>Contenido de la atención</h2><div class="narrativa">${esc(nota.contenido)}</div>
    <div class="aviso">La finalización de captura es un cierre administrativo y no equivale a firma clínica. Este documento no incorpora firma electrónica ni acredita una firma manuscrita.</div>
    </body></html>`;
  return { html, header };
}

async function generarNotaClinicaPdf(data, { browserManager = puppeteerBrowserManager } = {}) {
  const { html, header } = crearDocumentoNota(data);
  return browserManager.withPage(async page => {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith('data:') ? request.continue() : request.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    return page.pdf({ format: 'Letter', landscape: false, printBackground: true, displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: '<div style="width:100%;font-family:Arial,sans-serif;font-size:9px;text-align:center;color:#444;">CAP El Chal · Documento clínico confidencial · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      margin: { top: '125px', bottom: '58px', left: '48px', right: '48px' }, timeout: 30000 });
  });
}

module.exports = { crearDocumentoNota, generarNotaClinicaPdf };
