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
    const errors = [], requests = [], createdControls = [];
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
        'notas_enfermeria.ver', 'notas_enfermeria.registrar', 'notas_evolucion.finalizar_captura', 'notas_enfermeria.finalizar_captura'], lastActivityAt: new Date().toISOString(),
    })));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${base}/pacientes/1/controles/nuevo?embarazo_id=11`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('button[type="submit"]:not([disabled])');
      const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/pacientes/1/controles' && response.request().method() === 'POST');
      await page.click('button[type="submit"]');
      const response = await created; assert.equal(response.status(), 201);
      const control = await response.json(); assert.ok(Number.isInteger(control.id)); createdControls.push(control.id);
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
    // CPREN-120: shared editor against the same real API and disposable database.
    const clickText = async text => page.evaluate(text => {
      const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === text);
      if (!button || button.disabled) throw new Error(`Unavailable button: ${text}`);
      button.click();
    }, text);
    for (const [width, tipo, clase] of [[1440, 'nota_evolucion', 'medico'], [390, 'nota_enfermeria', 'enfermeria_ae'], [320, 'nota_enfermeria', 'enfermeria_ep']]) {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${base}/pacientes/1/notas?embarazo_id=11${tipo === 'nota_evolucion' ? `&control_id=${createdControls[0]}&tipo=${tipo}` : ''}`, { waitUntil: 'networkidle0' });
      if (tipo !== 'nota_evolucion') await clickText('Nueva nota de evolución de enfermería');
      await page.waitForSelector('.nota-clinica select');
      await page.select('.nota-clinica select', 'externo');
      const fields = await page.$$('.nota-clinica input');
      // Use native setter so React observes programmatic date/time input.
      await page.evaluate(() => {
        for (const [type, value] of [['date', '2026-10-20'], ['time', '09:30']]) {
          const input = document.querySelector(`.nota-clinica input[type="${type}"]`);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await fields[2].type(`Responsable sintético ${clase}`); await fields[3].type('Cargo sintético');
      if (tipo === 'nota_enfermeria') {
        const selects = await page.$$('.nota-clinica select'); await selects[1].select(clase);
      }
      const content = `Atención sintética ñ, áéíóú.\nSegunda línea. ${'Narrativa extensa de prueba. '.repeat(100)}`;
      await page.$eval('.nota-clinica textarea', (input, text) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, content);
      const saved = page.waitForResponse(r => r.url().endsWith('/notas-clinicas') && r.request().method() === 'POST');
      await clickText('Guardar borrador');
      const result = await saved; assert.equal(result.status(), 201);
      const metadata = await result.json(); assert.ok(metadata.id);
      await page.waitForFunction(() => document.querySelector('.nota-clinica')?.textContent.includes('Responsable:'));
      assert.equal(await page.$eval('.nota-clinica textarea', el => el.value), content);
      assert.equal(await page.$eval('.nota-clinica input[type="date"]', el => el.value), '2026-10-20');
      const finalized = page.waitForResponse(r => r.url().endsWith(`/notas-clinicas/${metadata.id}/finalizar`) && r.request().method() === 'POST');
      await clickText('Finalizar captura'); assert.equal((await finalized).status(), 200);
      await page.waitForFunction(() => document.querySelector('.nota-clinica')?.textContent.includes('Captura finalizada ·'));
      assert.ok(await page.$eval('.nota-clinica textarea', el => el.matches(':disabled')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: editor sin overflow`);
      await page.screenshot({ path: path.join(artifacts, `editor-finalizado-${clase}-${width}.png`), fullPage: true });
      await page.goto(`${base}/pacientes/1/notas?embarazo_id=11${tipo === 'nota_evolucion' ? `&control_id=${createdControls[0]}&tipo=${tipo}` : `&nota_id=${metadata.id}`}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.nota-clinica textarea');
      assert.equal(await page.$eval('.nota-clinica textarea', el => el.value), content);
      assert.ok(await page.$eval('.nota-clinica textarea', el => el.matches(':disabled')));
      const pdfResponse = page.waitForResponse(response => response.url().endsWith(`/notas-clinicas/${metadata.id}/pdf`));
      await clickText('Descargar PDF institucional');
      const pdfResult = await pdfResponse;
      assert.equal(pdfResult.status(), 200); assert.ok(pdfResult.headers()['cache-control'].includes('no-store'));
      const pdf = await require('pdf-lib').PDFDocument.load(await pdfResult.buffer());
      assert.equal(pdf.getPage(0).getWidth(), 612); assert.equal(pdf.getPage(0).getHeight(), 792);
    }
    t.diagnostic('CPREN-120: medicina, AE y EP; 1440/390/320px; crear, GET, finalizar, recargar históricos y descargar PDF carta contra API real; texto extenso y acentos; sin overflow.');
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
