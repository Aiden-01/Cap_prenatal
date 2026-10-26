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
  const evidence = path.resolve(__dirname, '../../../docs/cpren120', process.env.CPREN_CHECKPOINT12 === '1' ? 'checkpoint12' : 'checkpoint11');
  fs.mkdirSync(evidence, { recursive: true });
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
    const initialIdentityScript = await page.evaluateOnNewDocument(() => localStorage.setItem('usuario', JSON.stringify({
      id: 1, nombre_completo: 'Director sintético', username: 'dir_test', rol: 'director',
      activo: true, permisos: ['catalogos_profesionales.gestionar'], lastActivityAt: new Date().toISOString(),
    })));
    await page.setViewport({ width: 1440, height: 1000 });
    const captureSet = async name => {
      for (const width of [1440, 1280, 768, 390, 320]) {
        await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
        for (const [theme, label] of [['light', 'claro'], ['dark', 'oscuro']]) {
          await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
          await page.evaluate(async () => {
            await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().iterations)).map(animation => animation.finished.catch(() => {})));
          });
          await page.screenshot({ path: path.join(evidence, `${name}-${width}-${label}.png`), fullPage: true });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${width} ${theme}: sin desbordamiento de página`);
          assert.ok(await page.evaluate(() => [...document.querySelectorAll('.usuarios-table .table-actions button')].every(button => button.scrollWidth <= button.clientWidth + 1)), `${width}: acciones completas sin recorte`);
        }
      }
      await page.setViewport({ width: 1440, height: 1000 });
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    };
    await page.goto(`${base}/usuarios`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.usuarios-grid');
    await page.waitForSelector('.tabla tbody tr');
    await captureSet('usuarios');
    await page.click('.user-create-minimal');
    await page.waitForFunction(() => [...document.querySelectorAll('.perfil-fields select option')].some(option => option.value === '4'));
    await page.type('input[name="nombre_completo"]', 'Perfil navegador');
    await page.type('input[name="username"]', 'browser_fixture');
    await page.type('input[name="email"]', '  BROWSER@EXAMPLE.TEST  ');
    await page.type('input[name="password"]', 'test-only-browser');
    await page.select('select[name="rol"]', 'admin');
    await page.select('.perfil-fields select', '4');
    await captureSet('nuevo-usuario');
    const created = page.waitForResponse(response => response.url().endsWith('/api/usuarios') && response.request().method() === 'POST');
    await page.click('form button[type="submit"]');
    assert.equal((await created).status(), 201);
    await page.waitForSelector('.status-banner.success');
    await page.click('.user-create-drawer button[aria-label="Cerrar"]');
    await page.waitForSelector('[title="Editar perfil de Perfil navegador"]');
    await page.locator('button::-p-text(Catálogo de cargos)').click();
    await page.waitForSelector('.catalogos-list li');
    assert.equal(await page.$('select[aria-label="Catálogo"]'), null);
    await page.click('.catalogos-controls .btn-primary');
    await page.type('#catalogo-nombre', 'Cargo navegador');
    assert.equal(await page.$('#catalogo-clasificacion'), null);
    await page.type('#catalogo-codigo', 'CP11-TEST');
    await captureSet('editar-cargo');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/catalogos/cargos') && response.request().method() === 'POST');
    await page.click('.perfil-modal .btn-primary'); assert.equal((await saved).status(), 201);
    await page.waitForSelector('.perfil-modal', { hidden: true });
    await page.waitForFunction(() => [...document.querySelectorAll('.catalogos-list strong')].some(el => el.textContent === 'Cargo navegador'));
    await captureSet('catalogo-cargos');
    await page.locator('button::-p-text(Volver a usuarios)').click();
    await page.click('[title="Editar perfil de Perfil navegador"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.perfil-fields select option')].some(el => el.textContent === 'Cargo navegador'));
    const cargo = await page.evaluate(() => [...document.querySelectorAll('.perfil-fields option')].find(el => el.textContent === 'Cargo navegador')?.value);
    await page.select('.perfil-fields select', cargo);
    assert.equal(await page.$eval('.perfil-modal input[type="email"]', element => element.value), 'browser@example.test');
    await page.$eval('.perfil-modal input[type="email"]', element => { element.focus(); element.select(); });
    await page.type('.perfil-modal input[type="email"]', 'UPDATED@EXAMPLE.TEST');
    const identityInputs = await page.$$('.perfil-modal input[required]');
    assert.equal(identityInputs.length, 2);
    for (const [index, value] of ['Perfil navegador actualizado', 'browser_renamed'].entries()) {
      await identityInputs[index].click({ clickCount: 3 }); await identityInputs[index].type(value);
    }
    await captureSet('perfil-usuario');
    const updated = page.waitForResponse(response => /\/api\/usuarios\/\d+$/.test(response.url()) && response.request().method() === 'PUT');
    await page.locator('button::-p-text(Guardar perfil)').click();
    assert.equal((await updated).status(), 200);
    await page.waitForSelector('.perfil-modal', { hidden: true });
    await page.waitForFunction(() => document.querySelector('.usuarios-grid')?.textContent.includes('Cargo navegador'));
    await page.waitForSelector('[title="Editar perfil de Perfil navegador actualizado"]');
    assert.ok(await page.$eval('.usuarios-grid', el => el.textContent.includes('browser_renamed')));
    await page.evaluate(() => { document.querySelector('.tabla-wrapper').scrollLeft = 0; });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'usuarios sin overflow de página en móvil');
    // Nuevo inicio de sesión desde la UI, usando las credenciales sintéticas renombradas.
    await page.removeScriptToEvaluateOnNewDocument(initialIdentityScript.identifier);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await browser.deleteCookie(...await browser.cookies());
    await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
    await page.type('input[name="username"]', 'browser_renamed');
    await page.type('input[name="password"]', 'test-only-browser');
    const loggedIn = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.click('button[type="submit"]'); assert.equal((await loggedIn).status(), 200);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('usuario') || 'null')?.username === 'browser_renamed');
    const identity = await page.evaluate(async () => ({ stored: JSON.parse(localStorage.getItem('usuario')), me: await (await fetch('/api/auth/me')).json() }));
    assert.equal(identity.stored.nombre_completo, 'Perfil navegador actualizado');
    assert.equal(identity.me.nombre_completo, 'Perfil navegador actualizado');
    assert.equal(identity.me.username, 'browser_renamed');
    await page.goto(`${base}/usuarios`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[title="Editar perfil de Perfil navegador actualizado"]');
    await page.click('[title="Editar perfil de Perfil navegador actualizado"]');
    const ownSaved = page.waitForResponse(response => /\/api\/usuarios\/\d+$/.test(response.url()) && response.request().method() === 'PUT');
    const ownUsername = (await page.$$('.perfil-modal input[required]'))[1];
    await ownUsername.click({ clickCount: 3 }); await ownUsername.type('browser_self_renamed');
    await page.locator('button::-p-text(Guardar perfil)').click(); assert.equal((await ownSaved).status(), 200);
    // El endpoint de sesión verifica la revocación aunque la UI no haya hecho otra petición.
    const revoked = await page.evaluate(async () => (await fetch('/api/auth/me')).status);
    assert.equal(revoked, 401);
    await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', 'browser_self_renamed');
    await page.type('input[name="password"]', 'test-only-browser');
    const relogged = page.waitForResponse(response => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST');
    await page.click('button[type="submit"]'); assert.equal((await relogged).status(), 200);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('usuario') || 'null')?.username === 'browser_self_renamed');
    fs.writeFileSync(path.join(evidence, 'profiles-browser-evidence.json'), JSON.stringify({
      machine: 'HUGUITO', equipo: 'Casa', synthetic_only: true, widths: [1440, 1280, 768, 390, 320],
      themes: ['light', 'dark'], name_username_email_cargo_saved: true, relogin_updated_identity: true,
      self_username_revokes_session: true, self_relogin_success: true, page_errors: errors,
    }, null, 2) + '\n');
    assert.deepEqual(errors, []);
    t.diagnostic(`CHECKPOINT-12 Casa: UI→API→PostgreSQL, crear/email/cargo/nombre/username, reautenticación y renombrado propio; cinco anchos claro/oscuro; ${evidence}`);
  } finally { if (browser) await browser.close(); if (vite) await vite.close(); process.chdir(previousCwd); }
}
module.exports = { verificarPerfilesBrowser };
