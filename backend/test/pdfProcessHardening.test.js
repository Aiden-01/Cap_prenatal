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

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

  assert.match(dockerfile, /\r?\nUSER node\r?\n/);
  assert.doesNotMatch(dockerfile, /USER root/);
  assert.doesNotMatch(`${pdfController}\n${reportesPdf}`, /--no-sandbox|--disable-setuid-sandbox/);
  assert.match(pdfController, /buildPuppeteerLaunchOptions\(\)/);
  assert.match(reportesPdf, /buildPuppeteerLaunchOptions\(\)/);
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

test('timeout termina padre e hijo y withPdfTempDir elimina temporales', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-process-timeout-'));
  let generatedDir;
  let childPid;

  try {
    await assert.rejects(
      withPdfTempDir(async (tempDir) => {
        generatedDir = tempDir;
        const pidFile = path.join(tempDir, 'child.pid');
        const childScript = 'setInterval(() => {}, 1000)';
        const parentScript = [
          "const { spawn } = require('child_process');",
          "const fs = require('fs');",
          `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' });`,
          `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
          'setInterval(() => {}, 1000);',
        ].join(' ');

        try {
          await runDocumentProcess(process.execPath, ['-e', parentScript], { timeoutMs: 450 });
        } catch (error) {
          childPid = Number(fs.readFileSync(pidFile, 'utf8'));
          throw error;
        }
      }, { tmpRoot: testRoot }),
      (error) => error instanceof DocumentProcessError && error.code === 'DOCUMENT_PROCESS_TIMEOUT'
    );

    assert.equal(fs.existsSync(generatedDir), false);
    assert.equal(await waitUntilStopped(childPid), true);
  } finally {
    if (isProcessRunning(childPid)) {
      await terminateProcessByPid(childPid);
    }
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
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
