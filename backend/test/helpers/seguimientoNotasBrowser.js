const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');

async function verificarSeguimientoBrowser({ apiPort, token, t }) {
  const frontendRoot = path.resolve(__dirname, '../../../frontend');
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontendRoot] })).href);
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [frontendRoot] })).href);
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'cpren119-ui-'));
  const emptyEnv = path.join(artifacts, 'empty-env'); fs.mkdirSync(emptyEnv);
  let vite, browser;
  const previousCwd = process.cwd();
  try {
    process.chdir(frontendRoot);
    vite = await createServer({ configFile: false, root: frontendRoot, envDir: emptyEnv, mode: 'test',
      plugins: [react()], define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } }, logLevel: 'error' });
    await vite.listen();
    const port = vite.httpServer.address().port;
    const base = `http://127.0.0.1:${port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (req.method() === 'POST' && url.pathname === '/api/pacientes/1/controles') requests.push(url.pathname);
      if (['data:', 'blob:'].includes(url.protocol) || (url.hostname === '127.0.0.1' && url.port === String(port))) req.continue();
      else req.abort();
    });
    await browser.setCookie({ name: 'cap_prenatal_token', value: token, url: base, httpOnly: true },
      { name: 'cap_prenatal_csrf', value: 'synthetic', url: base });
    await page.evaluateOnNewDocument(() => localStorage.setItem('usuario', JSON.stringify({
      id: 1, nombre_completo: 'Capturista sintético', username: 'seg_cap', rol: 'personal_salud', activo: true,
      permisos: ['pacientes.ver', 'controles.crear', 'controles.editar', 'notas_evolucion.ver', 'notas_evolucion.registrar',
        'notas_enfermeria.ver', 'notas_enfermeria.registrar'], lastActivityAt: new Date().toISOString(),
    })));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${base}/pacientes/1/controles/nuevo?embarazo_id=11`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('button[type="submit"]:not([disabled])');
      const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pacientes/1/controles' && response.request().method() === 'POST');
      await page.click('button[type="submit"]');
      const response = await created; assert.equal(response.status(), 201);
      const control = await response.json(); assert.ok(Number.isInteger(control.id));
      await page.waitForSelector('#control-guardado');
      assert.equal(await page.$eval('#control-guardado', element => document.activeElement === element), true);
      await page.screenshot({ path: path.join(artifacts, `confirmacion-${width}.png`), fullPage: true });
      await page.locator('button::-p-text(Consultar seguimiento de notas)').click();
      await page.waitForSelector('.seguimiento-notas-form');
      assert.ok(page.url().includes(`/controles/${control.id}/seguimiento-notas?embarazo_id=11`));
      const forms = await page.$$('.seguimiento-notas-form');
      const medical = forms[0];
      await (await medical.$('select')).select('externo');
      await page.waitForFunction(() => document.querySelectorAll('.seguimiento-notas-form input').length >= 3);
      const fields = await medical.$$('input');
      await fields[0].type('Médico navegador sintético'); await fields[1].type('Médico declarado');
      const confirmed = page.waitForResponse(result => result.url().includes(`/controles/${control.id}/seguimiento-notas`) && result.request().method() === 'POST');
      await (await medical.$('button[type="submit"]')).click();
      assert.equal((await confirmed).status(), 200);
      await page.waitForFunction(() => document.querySelector('[aria-label="Seguimiento documental"]')?.textContent.includes('Nota pendiente'));
      await page.screenshot({ path: path.join(artifacts, `seguimiento-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: sin overflow horizontal`);
      // Abandono y recuperación desde expediente: ninguna nota se genera por navegar.
      await page.locator('button::-p-text(Volver al expediente sin completar una nota)').click();
      await page.waitForSelector('.prenatal-document-followup');
      await page.waitForFunction(() => document.querySelector('.prenatal-controls-card')?.textContent.includes('Nota pendiente'));
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('.prenatal-controls-card')?.textContent.includes('Nota pendiente'));
      await page.screenshot({ path: path.join(artifacts, `expediente-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: expediente sin overflow`);
    }
    assert.equal(requests.length, 2, 'Un solo POST de control por flujo');
    assert.deepEqual(errors, []);
    t.diagnostic(`Chrome real → API → PostgreSQL temporal, 1440 y 390px; confirmación, pendiente y recuperación tras recarga. Capturas: ${artifacts}`);
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    process.chdir(previousCwd);
  }
}
module.exports = { verificarSeguimientoBrowser };
