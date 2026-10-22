const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');

// El navegador usa el frontend y la API reales del clúster temporal de la prueba.
// Todas las peticiones externas se bloquean. Vite no carga archivos .env.
async function verificarPerfilesBrowser({ apiPort, token, t }) {
  const frontendRoot = path.resolve(__dirname, '../../../frontend');
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontendRoot] })).href);
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [frontendRoot] })).href);
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'cpren116-ui-'));
  const emptyEnv = path.join(artifacts, 'empty-env'); fs.mkdirSync(emptyEnv);
  let vite, browser;
  const previousCwd = process.cwd();
  try {
    process.chdir(frontendRoot);
    vite = await createServer({ configFile: false, root: frontendRoot, envDir: emptyEnv, mode: 'test',
      plugins: [react()], define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
      logLevel: 'error' });
    await vite.listen();
    const port = vite.httpServer.address().port;
    const base = `http://127.0.0.1:${port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (['data:', 'blob:'].includes(url.protocol) || (url.hostname === '127.0.0.1' && url.port === String(port))) req.continue();
      else req.abort();
    });
    await browser.setCookie({ name: 'cap_prenatal_token', value: token, url: base, httpOnly: true },
      { name: 'cap_prenatal_csrf', value: 'test', url: base });
    await page.evaluateOnNewDocument(() => localStorage.setItem('usuario', JSON.stringify({
      id: 1, nombre_completo: 'Director sintético', username: 'dir_test', rol: 'director',
      activo: true, permisos: ['catalogos_profesionales.gestionar'], lastActivityAt: new Date().toISOString(),
    })));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${base}/usuarios`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.usuarios-grid');
    await page.click('.user-create-minimal');
    await page.waitForFunction(() => [...document.querySelectorAll('.perfil-fields select option')].some(option => option.value === '4'));
    await page.type('input[name="nombre_completo"]', 'Perfil navegador');
    await page.type('input[name="username"]', 'browser_fixture');
    await page.type('input[name="password"]', 'test-only-browser');
    await page.select('.perfil-fields select', '4');
    const created = page.waitForResponse(response => response.url().endsWith('/api/usuarios') && response.request().method() === 'POST');
    await page.click('form button[type="submit"]');
    assert.equal((await created).status(), 201);
    await page.waitForSelector('.status-banner.success');
    await page.click('.user-create-drawer button[aria-label="Cerrar"]');
    await page.waitForSelector('[title="Editar perfil profesional de Perfil navegador"]');
    await page.screenshot({ path: path.join(artifacts, 'usuarios-desktop.png'), fullPage: true });
    await page.locator('button::-p-text(Catálogos profesionales)').click();
    await page.waitForSelector('.catalogos-list li');
    for (const [tipo, nombre] of [['cargos', 'Cargo navegador'], ['especialidades', 'Especialidad navegador']]) {
      await page.select('.catalogos-controls label:first-child select', tipo);
      await page.waitForSelector('.catalogos-panel [role="status"]', { hidden: true });
      await page.click('.catalogos-controls .btn-primary');
      await page.type('#catalogo-nombre', nombre);
      const saved = page.waitForResponse(response => response.url().endsWith(`/api/catalogos/${tipo}`) && response.request().method() === 'POST');
      await page.click('.perfil-modal .btn-primary'); assert.equal((await saved).status(), 201);
      await page.waitForSelector('.perfil-modal', { hidden: true });
      await page.waitForFunction(text => [...document.querySelectorAll('.catalogos-list strong')].some(el => el.textContent === text), {}, nombre);
    }
    await page.screenshot({ path: path.join(artifacts, 'catalogos-desktop.png'), fullPage: true });
    // Cambiar isMobile en Puppeteer recarga la página y pierde el panel abierto.
    // El breakpoint real se verifica redimensionando la misma sesión.
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForSelector('.catalogos-panel');
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('.app-main')).marginLeft)) < 1);
    await page.screenshot({ path: path.join(artifacts, 'catalogos-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'catálogos sin overflow de página en móvil');
    await page.locator('button::-p-text(Volver a usuarios)').click();
    await page.click('[title="Editar perfil profesional de Perfil navegador"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.perfil-fields select option')].some(el => el.textContent === 'Cargo navegador'));
    const ids = await page.evaluate(() => ({
      cargo: [...document.querySelectorAll('.perfil-fields select:first-of-type option')].find(el => el.textContent === 'Cargo navegador')?.value,
      especialidad: [...document.querySelectorAll('.perfil-fields option')].find(el => el.textContent === 'Especialidad navegador')?.value,
    }));
    const selects = await page.$$('.perfil-fields select');
    await selects[0].select(ids.cargo); await selects[1].select(ids.especialidad);
    await page.screenshot({ path: path.join(artifacts, 'perfil-mobile.png'), fullPage: false });
    const updated = page.waitForResponse(response => /\/api\/usuarios\/\d+$/.test(response.url()) && response.request().method() === 'PUT');
    await page.locator('button::-p-text(Guardar perfil)').click();
    assert.equal((await updated).status(), 200);
    await page.waitForSelector('.perfil-modal', { hidden: true });
    await page.waitForFunction(() => document.querySelector('.usuarios-grid')?.textContent.includes('Cargo navegador'));
    await page.evaluate(() => { document.querySelector('.tabla-wrapper').scrollLeft = 0; });
    await page.screenshot({ path: path.join(artifacts, 'usuarios-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'usuarios sin overflow de página en móvil');
    assert.deepEqual(errors, []);
    t.diagnostic(`Navegador real: creación de usuario, cargo, especialidad y edición de perfil; 1440×1000 y 390×844; capturas: ${artifacts}`);
  } finally { if (browser) await browser.close(); if (vite) await vite.close(); process.chdir(previousCwd); }
}
module.exports = { verificarPerfilesBrowser };
