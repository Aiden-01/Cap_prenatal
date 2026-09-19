const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const puppeteer = require('puppeteer');

const { createReportesPdfService } = require('../src/services/reportesPdfService');
const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');

const execFileAsync = promisify(execFile);

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function memorySnapshot() {
  const { rss, heapUsed, external } = process.memoryUsage();
  return { rss, heapUsed, external };
}

function bytesToMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function formatMemory(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, value]) => [key, bytesToMb(value)])
  );
}

async function listProcesses() {
  try {
    if (process.platform === 'win32') {
      const script = [
        'Get-Process',
        "| Where-Object { $_.ProcessName -in @('chrome','chromium','chrome-headless-shell') }",
        '| Select-Object Id,ProcessName,WorkingSet64',
        '| ConvertTo-Json -Compress',
      ].join(' ');
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout || '[]');
      return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
        pid: Number(item.Id),
        parentPid: null,
        name: String(item.ProcessName || ''),
        rss: Number(item.WorkingSet64 || 0),
      }));
    }

    const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,comm=,rss=']);
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [pid, parentPid, name, rssKb] = line.trim().split(/\s+/, 4);
      return { pid: Number(pid), parentPid: Number(parentPid), name, rss: Number(rssKb) * 1024 };
    });
  } catch (error) {
    return [];
  }
}

function descendantsOf(processes, rootPid) {
  if (process.platform === 'win32') return processes;
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of processes) {
      if (descendants.has(item.parentPid) && !descendants.has(item.pid)) {
        descendants.add(item.pid);
        changed = true;
      }
    }
  }
  return processes.filter((item) => descendants.has(item.pid));
}

function createMetrics() {
  return {
    launches: [],
    newPages: [],
    setContent: [],
    pdf: [],
    closes: [],
    browserProcessPeaks: [],
    browserRssPeaksMb: [],
    launchedPids: [],
    observationOverheadMs: [],
  };
}

function instrumentPuppeteer(metrics) {
  function wrapPage(page) {
    return new Proxy(page, {
      get(pageTarget, pageProperty) {
        if (pageProperty === 'setContent') {
          return async (...pageArgs) => {
            const contentStart = process.hrtime.bigint();
            const result = await pageTarget.setContent(...pageArgs);
            metrics.setContent.push(elapsedMs(contentStart));
            return result;
          };
        }
        if (pageProperty === 'pdf') {
          return async (...pageArgs) => {
            const pdfStart = process.hrtime.bigint();
            const result = await pageTarget.pdf(...pageArgs);
            metrics.pdf.push(elapsedMs(pdfStart));
            return result;
          };
        }
        const value = pageTarget[pageProperty];
        return typeof value === 'function' ? value.bind(pageTarget) : value;
      },
    });
  }

  return {
    async launch(options) {
      const start = process.hrtime.bigint();
      const browser = await puppeteer.launch(options);
      metrics.launches.push(elapsedMs(start));
      const browserPid = browser.process()?.pid;
      if (browserPid) metrics.launchedPids.push(browserPid);

      return new Proxy(browser, {
        get(target, property) {
          if (property === 'newPage') {
            return async (...args) => {
              const pageStart = process.hrtime.bigint();
              const page = await target.newPage(...args);
              metrics.newPages.push(elapsedMs(pageStart));
              return wrapPage(page);
            };
          }
          if (property === 'createBrowserContext') {
            return async (...args) => {
              const context = await target.createBrowserContext(...args);
              return new Proxy(context, {
                get(contextTarget, contextProperty) {
                  if (contextProperty === 'newPage') {
                    return async (...pageArgs) => {
                      const pageStart = process.hrtime.bigint();
                      const page = await contextTarget.newPage(...pageArgs);
                      metrics.newPages.push(elapsedMs(pageStart));
                      return wrapPage(page);
                    };
                  }
                  const value = contextTarget[contextProperty];
                  return typeof value === 'function' ? value.bind(contextTarget) : value;
                },
              });
            };
          }
          if (property === 'close') {
            return async (...args) => {
              if (browserPid) {
                const observationStart = process.hrtime.bigint();
                const tree = descendantsOf(await listProcesses(), browserPid);
                metrics.observationOverheadMs.push(elapsedMs(observationStart));
                metrics.browserProcessPeaks.push(tree.length);
                metrics.browserRssPeaksMb.push(bytesToMb(tree.reduce((sum, item) => sum + item.rss, 0)));
              }
              const closeStart = process.hrtime.bigint();
              const result = await target.close(...args);
              metrics.closes.push(elapsedMs(closeStart));
              return result;
            };
          }
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function fixture() {
  const columns = [
    { key: 'numero', header: 'No.' },
    { key: 'codigo', header: 'Código sintético' },
    { key: 'fecha', header: 'Fecha' },
    { key: 'estado', header: 'Estado' },
    { key: 'observacion', header: 'Observación' },
  ];
  const rows = Array.from({ length: 80 }, (_, index) => ({
    numero: index + 1,
    codigo: `TEST-${String(index + 1).padStart(3, '0')}`,
    fecha: '2026-09-19',
    estado: index % 3 === 0 ? 'Seguimiento' : 'Control',
    observacion: 'Dato completamente sintético para medición reproducible.',
  }));
  return {
    title: 'Benchmark sintético de generación PDF',
    columns,
    rows,
    filters: 'Fixture local sin datos clínicos reales',
    generadoEn: '2026-09-19 00:00',
  };
}

async function runScenario(name, count, render, metrics) {
  const before = memorySnapshot();
  const overheadBefore = metrics.observationOverheadMs.reduce((sum, value) => sum + value, 0);
  const start = process.hrtime.bigint();
  const outputs = [];
  for (let index = 0; index < count; index += 1) outputs.push(await render());
  const totalMs = elapsedMs(start);
  const overheadAfter = metrics.observationOverheadMs.reduce((sum, value) => sum + value, 0);
  const adjustedTotalMs = totalMs - (overheadAfter - overheadBefore);
  const after = memorySnapshot();
  return {
    name,
    count,
    totalMs,
    adjustedTotalMs,
    averageMs: adjustedTotalMs / count,
    pdfBytes: outputs.map((output) => output.length),
    pdfHeadersValid: outputs.every((output) => Buffer.from(output).subarray(0, 5).toString() === '%PDF-'),
    memoryBeforeMb: formatMemory(before),
    memoryAfterMb: formatMemory(after),
  };
}

async function main() {
  const metrics = createMetrics();
  const browserManager = createPuppeteerBrowserManager({
    puppeteerClient: instrumentPuppeteer(metrics),
  });
  const service = createReportesPdfService({ browserManager });
  const data = fixture();
  const beforeProcesses = await listProcesses();
  const render = () => service.renderReportPdf(data);
  const scenarios = [];

  scenarios.push(await runScenario('cold-first', 1, render, metrics));
  scenarios.push(await runScenario('second-consecutive', 1, render, metrics));
  scenarios.push(await runScenario('five-sequential', 5, render, metrics));

  const persistentProcesses = await listProcesses();
  await browserManager.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const afterProcesses = await listProcesses();
  const liveAfter = process.platform === 'win32'
    ? afterProcesses.filter((item) => !beforeProcesses.some((before) => before.pid === item.pid))
    : metrics.launchedPids.flatMap((pid) => descendantsOf(afterProcesses, pid));
  const summary = {
    generatedAt: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    puppeteer: require('puppeteer/package.json').version,
    executablePath: puppeteer.executablePath(),
    scenarios,
    timingsMs: metrics,
    processObservation: {
      systemProcessCountBefore: beforeProcesses.length,
      persistentChromiumProcesses: persistentProcesses.length - beforeProcesses.length,
      persistentChromiumRssMb: bytesToMb(persistentProcesses
        .filter((item) => !beforeProcesses.some((before) => before.pid === item.pid))
        .reduce((sum, item) => sum + item.rss, 0)),
      systemProcessCountAfter: afterProcesses.length,
      trackedChromiumProcessesAliveAfter: [...new Set(liveAfter.map((item) => item.pid))].length,
    },
  };
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  const outputFlag = process.argv.indexOf('--output');
  if (outputFlag !== -1 && process.argv[outputFlag + 1]) {
    fs.writeFileSync(path.resolve(process.argv[outputFlag + 1]), serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
