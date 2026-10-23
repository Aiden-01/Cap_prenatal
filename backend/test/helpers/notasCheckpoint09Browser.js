const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');

async function verificarNotas09({ apiPort, tokens, setMedicalRegistration, setPregnancyState, t, outputDirectory = 'checkpoint09' }) {
  const frontend = path.resolve(__dirname, '../../../frontend');
  const output = path.resolve(__dirname, '../../../docs/cpren120', outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [frontend] })).href);
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react', { paths: [frontend] })).href);
  const emptyEnv = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'cpren09-env-'));
  const previousCwd = process.cwd(); let server, browser;
  const notes = [], evidence = [], errors = [];
  try {
    process.chdir(frontend);
    server = await createServer({ configFile: false, root: frontend, envDir: emptyEnv, mode: 'test', plugins: [react()],
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/api': `http://127.0.0.1:${apiPort}` } }, logLevel: 'error' });
    server.middlewares.use('/__cpren09/session', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body></body></html>'); });
    await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await puppeteer.launch({ headless: true }); const page = await browser.newPage();
    await page.emulateTimezone('Asia/Tokyo');
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.setRequestInterception(true);
    page.on('request', request => request.url().startsWith(origin) || /^(data:|blob:)/.test(request.url()) ? request.continue() : request.abort());
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/') && (url.pathname.includes('notas-clinicas') || url.pathname.includes('profesionales') || response.status() >= 400)) {
        evidence.push({ path: url.pathname, method: response.request().method(), status: response.status() });
      }
    });
    const click = text => page.evaluate(text => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && button.offsetParent !== null);
      if (!button || button.disabled) throw new Error(`Botón no disponible: ${text}`); button.click();
    }, text);
    const setText = (selector, value) => page.$eval(selector, (input, text) => {
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    const actor = async id => {
      await browser.setCookie({ name: 'cap_prenatal_token', value: tokens[id], url: origin, httpOnly: true }, { name: 'cap_prenatal_csrf', value: 'synthetic', url: origin });
      await page.goto(origin + '/__cpren09/session', { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (!response.ok) throw new Error('Sesión sintética inválida');
        const data = await response.json(); localStorage.setItem('usuario', JSON.stringify(data));
      });
    };
    const start = async (id, tipo, paciente = 1) => {
      await actor(id);
      await page.goto(`${origin}/pacientes/${paciente}?tab=notas${paciente === 1 ? '&embarazo_id=11' : ''}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.notas-module').catch(async error => {
        t.diagnostic(JSON.stringify({ url: page.url(), text: await page.$eval('body', el => el.innerText.slice(0, 500)), errors, requests: evidence.slice(-8) }));
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error;
      });
      assert.equal(await page.$$('.clinical-workflow-header').then(items => items.length), 0, 'Sin cabecera clínica duplicada');
      await click('Nueva nota'); await page.select('.nota-create select', tipo); await click('Abrir editor');
      await page.waitForSelector('.nota-clinica textarea');
      const times = await page.evaluate(() => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type, p.value]));
        return { expectedDate: `${parts.year}-${parts.month}-${parts.day}`, expectedHour: `${parts.hour}:${parts.minute}`,
          date: document.querySelector('.nota-clinica input[type=date]').value, hour: document.querySelector('.nota-clinica input[type=time]').value };
      });
      assert.equal(times.date, times.expectedDate); assert.equal(times.hour, times.expectedHour);
      return times;
    };
    const create = async text => {
      await setText('.nota-clinica textarea', text);
      const response = page.waitForResponse(r => r.url().endsWith('/notas-clinicas') && r.request().method() === 'POST');
      await click('Guardar borrador'); const result = await response; assert.equal(result.status(), 201);
      const data = await result.json(); notes.push(data.id);
      await page.waitForFunction(() => document.querySelector('.nota-success')?.textContent.includes('Borrador guardado correctamente'));
      assert.ok(page.url().includes(`nota_id=${data.id}`));
      await page.reload({ waitUntil: 'networkidle0' }); await page.waitForSelector('.nota-clinica textarea');
      assert.equal(await page.$eval('.nota-clinica textarea', element => element.value), text);
      return data;
    };
    const scenarios = [[2, 'nota_evolucion', 'autenticado', 'MED'], [3, 'nota_enfermeria', 'autenticado', 'AE'],
      [4, 'nota_enfermeria', 'autenticado', 'EP'], [1, 'nota_evolucion', 'usuario', 'MED', 2],
      [1, 'nota_enfermeria', 'usuario', 'AE', 3], [1, 'nota_enfermeria', 'externo', 'EP']];
    for (const [id, tipo, mode, clase, responsable] of scenarios) {
      await page.setViewport({ width: 1440, height: 1000 });
      await start(id, tipo, mode === 'externo' ? 3 : 1);
      if (mode === 'autenticado') await page.waitForSelector('.nota-clinica option[value=autenticado]:not([disabled])');
      if (id === 1) assert.ok(await page.$eval('.nota-clinica option[value=autenticado]', el => el.disabled), 'Digitador no se convierte en clínico');
      await page.select('.nota-clinica select', mode);
      if (mode === 'usuario') {
        await page.waitForSelector('.nota-clinica select option[value="' + responsable + '"]');
        const selects = await page.$$('.nota-clinica select'); await selects[1].select(String(responsable));
      } else if (mode === 'externo') {
        const fields = await page.$$('.nota-clinica input'); await fields[2].type('Responsable externo sintético');
        const selects = await page.$$('.nota-clinica select'); await selects[1].select(clase);
      }
      const text = `CHECKPOINT-09 ${clase} ${mode}\nAtención sintética áéíóú ñ.\nSegundo párrafo.`;
      const note = await create(text);
      const snapshot = await page.evaluate(async id => (await fetch(`/api/pacientes/${location.pathname.includes('/3') ? 3 : 1}/notas-clinicas/${id}`)).json(), note.id);
      assert.equal(snapshot.responsable_snapshot.cargo_codigo, clase);
      assert.equal(snapshot.capturista_usuario_id, id);
      if (mode === 'autenticado') assert.equal(snapshot.responsable_usuario_id, id);
      if (mode === 'usuario') assert.equal(snapshot.responsable_usuario_id, responsable);
      if (mode === 'externo') assert.equal(snapshot.embarazo_id, null);
      const finished = page.waitForResponse(r => r.url().endsWith(`/${note.id}/finalizar`));
      await click('Finalizar captura'); assert.equal((await finished).status(), 200);
      await page.waitForSelector('.nota-clinica .nota-status.is-final');
      assert.ok(await page.$eval('.nota-clinica textarea', el => el.matches(':disabled')));
      const pdfResponse = page.waitForResponse(r => r.url().endsWith(`/${note.id}/pdf`));
      await click('Descargar PDF institucional'); const pdf = await pdfResponse;
      assert.equal(pdf.status(), 200); assert.ok(pdf.headers()['content-type'].includes('application/pdf'));
    }
    // Layout, contraste, navegación y conservación del texto local al cambiar pestaña.
    await start(1, 'nota_evolucion'); await page.select('.nota-clinica select', 'usuario');
    await page.waitForSelector('.nota-clinica select option[value="2"]'); const selects = await page.$$('.nota-clinica select'); await selects[1].select('2');
    await setText('.nota-clinica textarea', 'Borrador local que no debe perderse al cambiar pestaña');
    const tabs = await page.$$eval('.content-tabs button', elements => elements.map(el => el.textContent.replace(/\s*\(\d+\)/g, '')));
    assert.deepEqual(tabs, ['Datos generales', 'Controles', 'Notas clínicas', 'Laboratorios', 'Riesgo obstétrico', 'Plan de parto', 'Morbilidad', 'Puerperio', 'Vacunas']);
    await page.evaluate(() => [...document.querySelectorAll('.content-tabs button')].find(button => button.textContent.startsWith('Controles')).click());
    await click('Notas clínicas');
    assert.equal(await page.$eval('.nota-clinica textarea', el => el.value), 'Borrador local que no debe perderse al cambiar pestaña');
    for (const width of [1440, 1280, 768, 390, 320]) for (const dark of [false, true]) {
      await page.setViewport({ width, height: 1000 }); await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(output, `notas-${width}-${dark ? 'oscuro' : 'claro'}.png`), fullPage: true });
      const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('body *')].filter(el => el.offsetParent && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })) }));
      assert.ok(overflow.scroll <= width + 1, `${width}: sin overflow ${JSON.stringify(overflow)}`);
      assert.ok(await page.$eval('.nota-editor-header > div', el => el.getBoundingClientRect().width >= 120), `${width}: título legible sin columna comprimida`);
    }
    // Rechazo real de permisos conserva el borrador local; no se inventa éxito.
    await setMedicalRegistration(false);
    const denied = page.waitForResponse(r => r.url().endsWith('/notas-clinicas') && r.request().method() === 'POST');
    await click('Guardar borrador'); assert.equal((await denied).status(), 403);
    await page.waitForSelector('.nota-error'); assert.ok(await page.$eval('.nota-clinica textarea', el => el.value.includes('no debe perderse')));
    await setMedicalRegistration(true);
    const faultNote = await create('Borrador para conflicto de versión');
    const alternate = await page.evaluate(async id => {
      const response = await fetch(`/api/pacientes/1/notas-clinicas/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-csrf-token': 'synthetic' }, body: JSON.stringify({ version: 1, contenido: 'Edición concurrente sintética' }) });
      return response.status;
    }, faultNote.id); assert.equal(alternate, 200);
    await setText('.nota-clinica textarea', 'Texto local preservado ante 409');
    const conflict = page.waitForResponse(r => r.url().endsWith(`/notas-clinicas/${faultNote.id}`) && r.request().method() === 'PUT');
    await click('Guardar borrador'); assert.equal((await conflict).status(), 409);
    await page.waitForFunction(() => document.querySelector('.nota-error')?.textContent.includes('cambió'));
    assert.equal(await page.$eval('.nota-clinica textarea', el => el.value), 'Texto local preservado ante 409');
    await click('Recuperar versión guardada'); await page.waitForFunction(() => document.querySelector('.nota-clinica textarea')?.value === 'Edición concurrente sintética');
    const missing = await page.evaluate(async () => { const r = await fetch('/api/pacientes/999/notas-clinicas'); return { status: r.status, body: await r.json() }; });
    assert.equal(missing.status, 404); assert.equal(missing.body.code, 'PACIENTE_NO_ENCONTRADA');
    await page.goto(`${origin}/pacientes/1?tab=notas&embarazo_id=12`, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Nueva nota')), false);
    await setPregnancyState('puerperio');
    await page.goto(`${origin}/pacientes/1?tab=notas&embarazo_id=11`, { waitUntil: 'networkidle0' });
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Nueva nota')));
    await setPregnancyState('activo');
    await browser.setCookie({ name: 'cap_prenatal_token', value: tokens.expired, url: origin, httpOnly: true });
    const expired = await page.evaluate(async () => { const r = await fetch('/api/auth/me'); return { status: r.status, body: await r.json() }; });
    assert.equal(expired.status, 401); assert.equal(expired.body.code, 'ACCESS_TOKEN_EXPIRED');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'http-evidence.json'), JSON.stringify({ synthetic_only: true, requests: evidence, cases: scenarios.map(([actor, tipo, mode, clase]) => ({ actor, tipo, mode, clase })), notes_created: notes.length, errors_verified: [401, 403, 404, 409], widths: [1440, 1280, 768, 390, 320] }, null, 2));
    t.diagnostic('CHECKPOINT-09: UI→Express→PostgreSQL, 7 borradores reales recargados, autoría autenticada/directorio/externa, AE/EP, finalización/PDF, 401/403/404/409, claro/oscuro y cinco anchos.');
    return notes;
  } finally {
    await setMedicalRegistration(true); await setPregnancyState('activo');
    if (browser) await browser.close(); if (server) await server.close(); process.chdir(previousCwd);
    fs.rmdirSync(emptyEnv);
  }
}
module.exports = { verificarNotas09 };
