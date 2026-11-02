const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  DOCUMENT_PROCESS_TIMEOUT_MS,
  DocumentProcessError,
  runDocumentProcess,
  terminateProcessByPid,
} = require('../src/utils/documentProcess');
const { buildPuppeteerLaunchOptions } = require('../src/utils/puppeteerLaunch');
const { withPdfTempDir } = require('../src/utils/pdfTemp');
const { exportExcelTemplateToPdf } = require('../src/controllers/pdfController');
const { inspectProcess, parseLinuxProcessState } = require('./helpers/syntheticProcessState');

function isProcessRunning(pid) {
  return inspectProcess(pid).running;
}

async function waitUntilStopped(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isProcessRunning(pid);
}

test('Puppeteer conserva sandbox en Windows local y contenedor productivo', () => {
  const local = buildPuppeteerLaunchOptions({ env: {} });
  assert.deepEqual(local, { headless: 'new', args: [] });

  const production = buildPuppeteerLaunchOptions({
    env: { NODE_ENV: 'production', PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium' },
  });
  assert.deepEqual(production, {
    headless: 'new',
    args: [],
    executablePath: '/usr/bin/chromium',
  });

  const serialized = JSON.stringify([local, production]);
  assert.doesNotMatch(serialized, /--no-sandbox|--disable-setuid-sandbox/);
});

test('timeout documental por defecto queda fijado en 120 segundos', () => {
  assert.equal(DOCUMENT_PROCESS_TIMEOUT_MS, 120_000);
});

test('Docker termina como usuario node y los launchers no contienen flags inseguros', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
  const pdfController = fs.readFileSync(path.join(__dirname, '../src/controllers/pdfController.js'), 'utf8');
  const reportesPdf = fs.readFileSync(path.join(__dirname, '../src/services/reportesPdfService.js'), 'utf8');
  const browserManager = fs.readFileSync(path.join(__dirname, '../src/services/puppeteerBrowserManager.js'), 'utf8');

  assert.match(dockerfile, /\r?\nUSER node\r?\n/);
  assert.doesNotMatch(dockerfile, /USER root/);
  assert.doesNotMatch(`${pdfController}\n${reportesPdf}\n${browserManager}`, /--no-sandbox|--disable-setuid-sandbox/);
  assert.match(browserManager, /launchOptionsFactory\(\)/);
  assert.match(pdfController, /puppeteerBrowserManager/);
  assert.match(reportesPdf, /puppeteerBrowserManager/);
});

test('proceso documental normal finaliza sin transformarse en timeout', async () => {
  const markerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-process-success-'));
  const marker = path.join(markerRoot, 'done.txt');
  try {
    await runDocumentProcess(process.execPath, [
      '-e',
      `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok'), 80)`,
    ], { timeoutMs: 1_500 });
    assert.equal(fs.readFileSync(marker, 'utf8'), 'ok');
  } finally {
    fs.rmSync(markerRoot, { recursive: true, force: true });
  }
});

test('fallo externo devuelve error controlado sin stderr, comando ni ruta sensible', async () => {
  const sensitive = 'C:\\datos\\paciente-sintetica.xlsx';
  await assert.rejects(
    runDocumentProcess(process.execPath, [
      '-e',
      `process.stderr.write(${JSON.stringify(sensitive)}); process.exit(9)`,
    ], { timeoutMs: 1_500 }),
    (error) => {
      assert.ok(error instanceof DocumentProcessError);
      assert.equal(error.code, 'DOCUMENT_PROCESS_FAILED');
      assert.equal(error.exitCode, 9);
      assert.doesNotMatch(JSON.stringify(error), /paciente-sintetica|datos|node\.exe/i);
      return true;
    }
  );
});

test('fallo de LibreOffice se sanea y elimina el XLSX temporal', async () => {
  const previousEngine = process.env.PDF_EXCEL_ENGINE;
  const previousExecutable = process.env.LIBREOFFICE_PATH;
  const tempBefore = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('cap-prenatal-pdf-'));

  process.env.PDF_EXCEL_ENGINE = 'libreoffice';
  process.env.LIBREOFFICE_PATH = process.execPath;
  try {
    await assert.rejects(
      exportExcelTemplateToPdf(
        path.join(__dirname, '../src/assets/official_forms/plan_parto_oficial.xlsx'),
        {}
      ),
      (error) => {
        assert.equal(error.code, 'DOCUMENT_PROCESS_FAILED');
        assert.doesNotMatch(JSON.stringify(error), /plan_parto|official_forms|--convert-to/i);
        return true;
      }
    );
    const tempAfter = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('cap-prenatal-pdf-'));
    assert.deepEqual(tempAfter.sort(), tempBefore.sort());
  } finally {
    if (previousEngine === undefined) delete process.env.PDF_EXCEL_ENGINE;
    else process.env.PDF_EXCEL_ENGINE = previousEngine;
    if (previousExecutable === undefined) delete process.env.LIBREOFFICE_PATH;
    else process.env.LIBREOFFICE_PATH = previousExecutable;
  }
});

test('timeout termina padre e hijo y withPdfTempDir elimina temporales', { timeout: 15000 }, async t => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-process-timeout-'));
  let generatedDir;
  let childPid;
  let parent;
  let ready = false;

  try {
    await assert.rejects(
      withPdfTempDir(async (tempDir) => {
        generatedDir = tempDir;
        const fixture = path.join(__dirname, 'fixtures/document-process-tree.cjs');
        parent = spawn(process.execPath, [fixture], { detached: process.platform !== 'win32',
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
        // Separar arranque del ensayo de timeout: 450 ms conserva su valor.
        // El límite de arranque solo evita colgar el harness; nunca da un PASS.
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Object.assign(new Error('Synthetic process readiness failed'), { code: 'FIXTURE_NOT_READY' })), 5000);
          parent.once('error', error => { clearTimeout(timer); reject(error); });
          parent.once('message', message => {
            clearTimeout(timer);
            if (message.ready !== true || !Number.isInteger(message.childPid) || message.childPid <= 0) {
              reject(Object.assign(new Error('Invalid synthetic process readiness'), { code: 'FIXTURE_NOT_READY' }));
              return;
            }
            childPid = message.childPid; ready = true; resolve();
          });
        });
        assert.equal(isProcessRunning(parent.pid), true);
        assert.equal(isProcessRunning(childPid), true);
        await runDocumentProcess(process.execPath, [fixture], { timeoutMs: 450,
          execFileImpl: (file, args, options, callback) => {
            assert.equal(file, process.execPath); assert.deepEqual(args, [fixture]);
            assert.equal(options.detached, process.platform !== 'win32');
            // Proceso real ya listo; runDocumentProcess y su terminación son reales.
            parent.once('error', callback);
            parent.once('close', (code, signal) => callback(code === 0 ? null : { code, signal }));
            return parent;
          } });
      }, { tmpRoot: testRoot }),
      (error) => error instanceof DocumentProcessError && error.code === 'DOCUMENT_PROCESS_TIMEOUT'
    );

    assert.equal(fs.existsSync(generatedDir), false);
    assert.equal(await waitUntilStopped(parent.pid), true);
    assert.equal(await waitUntilStopped(childPid), true);
  } finally {
    t.diagnostic(JSON.stringify({ stage: 'document-timeout', ready,
      parent: inspectProcess(parent?.pid).state, child: inspectProcess(childPid).state,
      tempRemoved: generatedDir ? !fs.existsSync(generatedDir) : null }));
    if (isProcessRunning(parent?.pid)) await terminateProcessByPid(parent.pid);
    if (isProcessRunning(childPid)) {
      await terminateProcessByPid(childPid);
    }
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('sonda sintética distingue zombi Linux de proceso ejecutable y falla cerrado ante estado desconocido', () => {
  assert.equal(parseLinuxProcessState('123 (synthetic (child)) Z 1 123 0'), 'Z');
  for (const state of ['Z', 'X', 'S', 'R']) {
    const result = inspectProcess(123, { platform: 'linux', kill() {}, readFile: () => `123 (synthetic) ${state} 1 123 0` });
    assert.equal(result.running, !['Z', 'X'].includes(state));
  }
  assert.equal(inspectProcess(123, { platform: 'linux', kill() {}, readFile: () => 'truncated' }).running, true);
  assert.equal(inspectProcess(123, { kill() { throw Object.assign(new Error(), { code: 'EPERM' }); } }).running, true);
});

test('withPdfTempDir limpia también cuando la fixture falla antes del timeout', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-process-startup-'));
  let directory;
  try {
    await assert.rejects(withPdfTempDir(async tempDir => {
      directory = tempDir; throw Object.assign(new Error('Synthetic startup failure'), { code: 'FIXTURE_NOT_READY' });
    }, { tmpRoot: testRoot }), { code: 'FIXTURE_NOT_READY' });
    assert.equal(fs.existsSync(directory), false);
  } finally { fs.rmSync(testRoot, { recursive: true, force: true }); }
});

test('arranque sintético lento reproduce child.pid ausente sin perder el error de timeout', { timeout: 15000 }, async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-slow-start-'));
  const pidFile = path.join(testRoot, 'child.pid');
  try {
    await assert.rejects(runDocumentProcess(process.execPath, ['-e',
      `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid)),1500);setInterval(()=>{},1000)`],
    { timeoutMs: 450 }), { code: 'DOCUMENT_PROCESS_TIMEOUT' });
    assert.throws(() => fs.readFileSync(pidFile), { code: 'ENOENT' });
  } finally { fs.rmSync(testRoot, { recursive: true, force: true }); }
});

test('cleanup adicional de timeout termina solo el PID externo indicado', async () => {
  const extra = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  extra.unref();

  try {
    await assert.rejects(
      runDocumentProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        timeoutMs: 350,
        onTimeout: () => terminateProcessByPid(extra.pid),
      }),
      (error) => error.code === 'DOCUMENT_PROCESS_TIMEOUT'
    );
    assert.equal(await waitUntilStopped(extra.pid), true);
  } finally {
    if (isProcessRunning(extra.pid)) {
      await terminateProcessByPid(extra.pid);
    }
  }
});

test('Windows usa kill directo del mismo PID si taskkill no esta disponible', async () => {
  const signals = [];
  await terminateProcessByPid(43210, {
    platform: 'win32',
    execFileImpl: (_file, _args, _options, callback) => callback(new Error('denegado')),
    killImpl: (pid, signal) => signals.push({ pid, signal }),
  });
  assert.deepEqual(signals, [{ pid: 43210, signal: 'SIGKILL' }]);
});

test('POSIX dirige TERM y KILL al grupo del proceso documental', async () => {
  const signals = [];
  await terminateProcessByPid(43210, { platform: 'linux', graceMs: 0,
    killImpl: (pid, signal) => signals.push({ pid, signal }) });
  assert.deepEqual(signals, [{ pid: -43210, signal: 'SIGTERM' }, { pid: -43210, signal: 'SIGKILL' }]);
});
