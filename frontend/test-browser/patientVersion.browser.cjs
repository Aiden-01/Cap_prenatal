// Verificación visual aislada: usa el formulario real con API sintética en memoria.
// No carga .env, no inicia backend y bloquea peticiones fuera del servidor temporal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('../../backend/node_modules/puppeteer');

(async () => {
  const frontend = path.resolve(__dirname, '..');
  const fixture = fs.mkdtempSync(path.join(frontend, 'tmp_cpren65_browser_'));
  fs.writeFileSync(path.join(fixture, 'index.html'), '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="./main.jsx"></script></html>');
  fs.writeFileSync(path.join(fixture, 'main.jsx'), `
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter, Routes, Route } from 'react-router-dom';
    import { ToastContext } from '/src/context/ToastContext.js';
    import { ChatbotScreenProvider } from '/src/context/ChatbotScreenContext.jsx';
    import api from '/src/api/axios.js';
    import NuevaPaciente from '/src/pages/NuevaPaciente.jsx';
    import '/src/index.css';
    const patient={id:41,version:7,no_expediente:'SYN-VISUAL',nombres:'Paciente',apellidos:'Sintética',pueblo:'mestizo',telefono:'11111111'};
    let reads=0; window.__puts=[];
    api.get=async url=>({data:url==='/comunidades/activas'?[]:{...patient,version:++reads===1?7:8,telefono:reads===1?'11111111':'33333333'}});
    api.put=async (url,payload)=>{window.__puts.push(payload); if(window.__puts.length===1) throw {response:{status:409,data:{code:'PATIENT_VERSION_CONFLICT'}}};return {data:{version:9}};};
    createRoot(document.getElementById('root')).render(<ToastContext.Provider value={()=>{}}><MemoryRouter initialEntries={['/pacientes/41/editar']}><Routes><Route path='/pacientes/:id/editar' element={<ChatbotScreenProvider><NuevaPaciente/></ChatbotScreenProvider>}/><Route path='/pacientes/:id' element={<div>Expediente</div>}/></Routes></MemoryRouter></ToastContext.Provider>);
  `);
  const { createServer } = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')));
  const { default: react } = await import(pathToFileURL(path.join(frontend, 'node_modules/@vitejs/plugin-react/dist/index.js')));
  const server = await createServer({ root: frontend, configFile: false, envDir: fixture, plugins: [react()],
    server: { host: '127.0.0.1', port: 51765, strictPort: true, proxy: {} } });
  let browser;
  try {
    await server.listen();
    browser = await puppeteer.launch({ headless: true });
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setRequestInterception(true);
      page.on('request', req => { if (req.url().startsWith('http://127.0.0.1:51765/') || req.url().startsWith('data:')) req.continue(); else req.abort(); });
      await page.setViewport({ width, height: 900 });
      await page.goto(`http://127.0.0.1:51765/${path.basename(fixture)}/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('[name="no_expediente"]')?.value === 'SYN-VISUAL');
      const clickTab = async label => page.evaluate(label => Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent.includes(label)).click(), label);
      const clickButton = async text => page.evaluate(text => Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === text).click(), text);
      await clickTab('Paciente');
      await page.$eval('[name="telefono"]', el => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '22222222'); el.dispatchEvent(new Event('input', { bubbles: true })); });
      await clickTab('Confirmar');
      await clickButton('Guardar cambios');
      await page.waitForSelector('.patient-version-conflict');
      assert.equal(await page.evaluate(() => window.__puts[0].version), 7);
      assert.equal(await page.evaluate(() => window.__puts[0].telefono), '22222222');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'patient-conflict-title');
      await clickTab('Paciente');
      assert.equal(await page.$eval('[name="telefono"]', el => el.value), '22222222');
      await clickButton('Cargar versión más reciente');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Sin overflow a ${width}px`);
      await page.$eval('.patient-version-conflict', el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(fixture, `conflict-${width}.png`) });
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.screenshot({ path: path.join(fixture, `conflict-dark-${width}.png`) });
      await clickButton('Confirmar y cargar datos actuales');
      await page.waitForFunction(() => !document.querySelector('.patient-version-conflict'));
      await clickTab('Paciente');
      assert.equal(await page.$eval('[name="telefono"]', el => el.value), '33333333');
      await clickTab('Confirmar');
      await clickButton('Guardar cambios');
      await page.waitForFunction(() => window.__puts.length === 2);
      assert.deepEqual(await page.evaluate(() => window.__puts[1]), { version: 8 });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: borrador conservado, recarga confirmada, version 7→8, sin overflow ni errores JS`);
      await page.close();
    }
    console.log(`Capturas: ${fixture}`);
  } finally {
    if (browser) await browser.close();
    await server.close();
    // Conservar capturas, retirar solo los dos archivos de fixture generados.
    fs.rmSync(path.join(fixture, 'main.jsx'), { force: true });
    fs.rmSync(path.join(fixture, 'index.html'), { force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
