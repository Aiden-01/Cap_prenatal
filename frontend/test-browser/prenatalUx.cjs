// Run against a local Vite server: node frontend/test-browser/prenatalUx.cjs [URL]
// Real Chromium, actual application routes/layout, synthetic HTTP responses only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../../backend/node_modules/puppeteer');

const base = process.argv[2] || 'http://127.0.0.1:5125';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local server only');
const output = path.resolve(__dirname, '../../tmp_ux125');
fs.mkdirSync(output, { recursive: true });
const user = { id: 9001, username: 'prueba.sintetica', nombre_completo: 'Personal sintético', rol: 'medico',
  permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'], lastActivityAt: new Date().toISOString() };
const control = { id: 3, numero_control: 1, fecha: '2026-01-15', hora: '09:00',
  motivo_consulta: 'Datos sintéticos de prueba', impresion_clinica: 'Histórico sintético', tratamiento: 'Histórico sintético' };
let state = 'activo';
let allowEdit = true;
let rejectNextSave = false;
const writes = [];
const errors = [];
const unexpected = [];
const results = [];
let browser;

async function clickText(page, selector, text) {
  const found = await page.evaluate((sel, label) => {
    const button = [...document.querySelectorAll(sel)].find(el => el.textContent.trim() === label);
    if (!button) return false;
    button.click(); return true;
  }, selector, text);
  assert.ok(found, `Missing ${selector}: ${text}`);
}
async function open(page, route) {
  await page.goto(base + route, { waitUntil: 'networkidle0' });
  await page.waitForSelector(route.includes('/controles/') ? '[role="tab"]' : '.prenatal-actions');
}
async function measure(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.control-sticky-navigation').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('.control-workflow-tab')].map(el => {
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return { width: innerWidth, top: nav.top, bottom: nav.bottom, tabs,
      scrollWidth: document.documentElement.scrollWidth, height: innerHeight };
  });
}
(async () => {
  browser = await puppeteer.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(usr => localStorage.setItem('usuario', JSON.stringify(usr)), user);
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) return request.abort();
    if (!url.pathname.startsWith('/api/')) return request.continue();
    const method = request.method();
    let data;
    let status = 200;
    if (url.pathname.startsWith('/api/auth/')) data = { ...user,
      permisos: allowEdit ? user.permisos : ['pacientes.ver'], lastActivityAt: new Date().toISOString() };
    else if (url.pathname.endsWith('/expediente')) {
      const pregnancy = { id: 2, numero_embarazo: 1, estado: state, fur: '2026-01-01' };
      data = { paciente: { id: 1, nombres: 'Paciente', apellidos: 'Sintética', no_expediente: 'PRUEBA-UX' },
        embarazo_seleccionado: pregnancy, embarazo_actual: pregnancy, embarazos: [pregnancy],
        is_read_only: state === 'cerrado', is_embarazo_actual: true, controles_prenatales: [control],
        vacunas: [], morbilidad: [], controles_puerperio: [] };
    } else if (url.pathname.endsWith('/vacunas/antecedentes')) data = [];
    else if (/\/controles(?:\/3)?$/.test(url.pathname)) {
      if (method === 'GET') data = url.pathname.endsWith('/3') ? control : [];
      else {
        writes.push({ method, url: url.pathname + url.search, body: JSON.parse(request.postData()) });
        if (rejectNextSave) {
          rejectNextSave = false; status = 400;
          data = { message: 'Datos inválidos', details: [{ campo: 'peso_kg', mensaje: 'Peso inválido de prueba' }] };
        } else data = { ...control, ...JSON.parse(request.postData()) };
      }
    } else {
      unexpected.push(`${method} ${url.pathname}`); status = 500; data = { message: 'Unexpected synthetic endpoint' };
    }
    return request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewport({ width, height: width === 320 ? 568 : 900 });
    await open(page, '/pacientes/1/controles/3/editar?embarazo_id=2');
    assert.equal(await page.$eval('.control-navigation-summary [role="status"]', el => el.textContent), '0 de 4 secciones revisadas');
    // Inspect the foundation and the bottom of a long General panel.
    for (const selector of ['#control-motivo_consulta', '#control-cita_siguiente']) {
      await page.$eval(selector, el => el.scrollIntoView({ block: 'center' }));
      const layout = await measure(page);
      assert.ok(layout.scrollWidth <= width + 1, `Page overflow at ${width}: ${layout.scrollWidth}`);
      assert.ok(layout.top >= 0 && layout.bottom <= layout.height, `Sticky return missing at ${width}: ${JSON.stringify(layout)}`);
      assert.ok(layout.tabs.every(t => t.left >= 0 && t.right <= width + 1 && t.top >= layout.top && t.bottom <= layout.bottom), 'Tabs outside navigation');
      assert.ok(await page.$eval('.control-workflow-tabs', el => el.scrollWidth <= el.clientWidth + 1), 'Tab contents overflow');
      const fieldTop = await page.$eval(selector, el => el.getBoundingClientRect().top);
      assert.ok(fieldTop >= layout.bottom, `Field covered at ${width}`);
    }
    await clickText(page, '.control-section-review button', 'Marcar sección como revisada');
    await clickText(page, '[role="tab"]', 'LaboratoriosPor revisar');
    await clickText(page, '.control-section-review button', 'Marcar sección como revisada');
    assert.equal(await page.$eval('.control-navigation-summary [role="status"]', el => el.textContent), '2 de 4 secciones revisadas');
    await clickText(page, '[role="tab"]', 'OrientacionesPor revisar');
    await clickText(page, '.control-section-review button', 'Marcar sección como revisada');
    await clickText(page, '[role="tab"]', 'SuplementaciónPor revisar');
    await clickText(page, '.control-section-review button', 'Marcar sección como revisada');
    assert.equal(await page.$eval('.control-navigation-summary [role="status"]', el => el.textContent), '4 de 4 secciones revisadas');
    await clickText(page, '[role="tab"]', 'GeneralRevisada');
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    await page.$eval('#control-peso_kg', el => el.scrollIntoView({ block: 'center' }));
    const finalLayout = await measure(page);
    assert.ok(finalLayout.top >= 0 && finalLayout.bottom <= finalLayout.height, `Navigation clipped after tab changes: ${JSON.stringify(finalLayout)}`);
    await page.screenshot({ path: path.join(output, `edit-${width}.png`) });
    await page.$eval('.control-sticky-navigation button', el => el.click());
    await page.waitForSelector('.prenatal-actions');
    assert.ok(page.url().endsWith('/pacientes/1?embarazo_id=2&tab=controles'));
    await clickText(page, '.prenatal-actions button', 'Editar');
    await page.waitForSelector('#control-cita_siguiente');
    assert.ok(page.url().endsWith('/pacientes/1/controles/3/editar?embarazo_id=2'));
    results.push({ width, sticky: 'foundation and bottom', overflow: false, review: '4/4', directEdit: true });
  }

  // Actual button submits, error response and success response in real Chromium.
  rejectNextSave = true;
  await page.$eval('button[type="submit"]', el => el.click());
  await page.waitForSelector('.control-review-state.needs-correction');
  await page.$eval('#control-peso_kg', el => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '63'); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.$eval('button[type="submit"]', el => el.click());
  await page.waitForSelector('.prenatal-actions');
  assert.equal(writes.length, 2);
  for (const { body } of writes) {
    assert.ok(!('impresion_clinica' in body) && !('tratamiento' in body));
    assert.ok(!('reviewedSections' in body));
  }
  await open(page, '/pacientes/1/controles/nuevo?embarazo_id=2');
  await page.$eval('button[type="submit"]', el => el.click());
  await page.waitForSelector('.prenatal-actions');
  assert.equal(writes[2].method, 'POST');
  assert.ok(!('impresion_clinica' in writes[2].body) && !('tratamiento' in writes[2].body));
  for (const pregnancyState of ['activo', 'cerrado', 'puerperio']) {
    state = pregnancyState;
    await open(page, '/pacientes/1?embarazo_id=2&tab=controles');
    assert.equal(await page.$$eval('.prenatal-actions button', els => els.some(el => el.textContent.trim() === 'Editar')), state === 'activo');
    await clickText(page, '.prenatal-actions button', 'Abrir');
    await page.waitForSelector('.control-sticky-navigation');
    assert.equal(await page.$('button[type="submit"]'), null);
    assert.equal(await page.$('.control-review-state'), null);
  }
  allowEdit = false; state = 'activo';
  await open(page, '/pacientes/1?embarazo_id=2&tab=controles');
  assert.equal(await page.$$eval('.prenatal-actions button', els => els.some(el => el.textContent.trim() === 'Editar')), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ results, writes: writes.map(({ method, url }) => ({ method, url })), errors, unexpected }, null, 2));
  console.log(JSON.stringify({ passed: true, viewports: results, saves: writes.length, errors }, null, 2));
})().finally(async () => { if (browser) await browser.close(); }).catch(error => { console.error(error); process.exitCode = 1; });
