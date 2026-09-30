// Synthetic local measurements for CPREN-22. Never connects to PostgreSQL or HTTP.
const { performance } = require('node:perf_hooks');
const path = require('node:path');

const { getReportExportConfig } = require('../src/config/reportExportConfig');
const { combinePdfBuffers, exportExcelTemplateToPdf } = require('../src/controllers/pdfController');
const { generarFichaClinicaPrenatalPdf } = require('../src/services/fichaClinicaPrenatalPdf');
const { createPuppeteerBrowserManager } = require('../src/services/puppeteerBrowserManager');
const { renderRiskPdf } = require('../src/services/riskPdfRenderer');
const { createReportesPdfService } = require('../src/services/reportesPdfService');
const { createReportesService } = require('../src/services/reportesService');

const MB = 1024 * 1024;

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    no_expediente: `SINTETICO-${index + 1}`,
    cui: `TEST-${index + 1}`,
    nombre_completo: 'REGISTRO SINTETICO',
    edad: 25,
    etnia: 'SINTETICA',
    comunidad: 'COMUNIDAD SINTETICA',
    fur: '2026-01-01',
    fpp: '2026-10-08',
    fecha_primer_control: '2026-02-01',
    semanas_gestacion: 12,
    gestas: 1,
    partos: 0,
    abortos: 0,
    estado_embarazo: 'activo',
    tiene_riesgo: index % 5 === 0,
  }));
}

async function measure(operation) {
  let peakRss = process.memoryUsage().rss;
  const before = process.memoryUsage();
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 25);
  const start = performance.now();
  try {
    const result = await operation();
    return {
      duration_ms: Math.round((performance.now() - start) * 10) / 10,
      node_rss_before_mb: Math.round(before.rss / MB),
      node_rss_peak_mb: Math.round(Math.max(peakRss, process.memoryUsage().rss) / MB),
      node_rss_after_mb: Math.round(process.memoryUsage().rss / MB),
      ...result,
    };
  } finally {
    clearInterval(sampler);
  }
}

function reportService(browserManager, count) {
  const syntheticRows = rows(count);
  return createReportesService({
    repository: { async obtenerRowsCensoGeneral() { return syntheticRows; } },
    pdfService: createReportesPdfService({ browserManager }),
    now: () => new Date('2026-09-29T12:00:00Z'),
  });
}

async function benchmarkReportPdf(concurrency, count) {
  const browserManager = createPuppeteerBrowserManager();
  const service = reportService(browserManager, count);
  const columnas = getReportExportConfig('activos').columns.map(({ key }) => key).join(',');
  try {
    if (concurrency > 1) await service.exportReport('activos', 'pdf', { columnas });
    return await measure(async () => {
      const jobs = Array.from({ length: concurrency }, async () => {
        const start = performance.now();
        const result = await service.exportReport('activos', 'pdf', { columnas });
        return {
          duration_ms: Math.round((performance.now() - start) * 10) / 10,
          pdf_bytes: result.pdf.length,
          valid_pdf: Buffer.from(result.pdf).subarray(0, 5).toString() === '%PDF-',
        };
      });
      return { jobs: await Promise.all(jobs) };
    });
  } finally {
    await browserManager.close();
  }
}

async function benchmarkReportExcel(count) {
  const service = reportService(null, count);
  const columnas = getReportExportConfig('activos').columns.map(({ key }) => key).join(',');
  return measure(async () => {
    const result = await service.exportReport('activos', 'excel', { columnas });
    const bytes = await result.workbook.xlsx.writeBuffer();
    return { rows: result.total, xlsx_bytes: bytes.length };
  });
}

async function benchmarkClinical() {
  const paciente = { nombres: 'REGISTRO', apellidos: 'SINTETICO', no_expediente: 'SINTETICO', fecha_nacimiento: '2000-01-01' };
  const embarazo = { fur: '2026-01-01', fpp: '2026-10-08' };
  const riesgo = { tiene_riesgo: false };
  const clinicalData = { paciente, embarazo, controles: [], morbilidad: [], puerperio: [], vacunas: [] };
  const individual = await measure(async () => {
    const pdf = await generarFichaClinicaPrenatalPdf(clinicalData);
    return { pdf_bytes: pdf.length };
  });
  const risk = await measure(async () => {
    const pdf = await renderRiskPdf({ paciente, embarazo, riesgo });
    return { pdf_bytes: pdf.length };
  });
  const template = path.join(__dirname, '../src/assets/official_forms/plan_parto_oficial.xlsx');
  const plan = await measure(async () => {
    const pdf = await exportExcelTemplateToPdf(template, {});
    return { pdf_bytes: pdf.length };
  });
  const combined = await measure(async () => {
    const [expedientePdf, planPartoPdf, riesgoPdf] = await Promise.all([
      generarFichaClinicaPrenatalPdf(clinicalData),
      exportExcelTemplateToPdf(template, {}),
      renderRiskPdf({ paciente, embarazo, riesgo }),
    ]);
    const pdf = await combinePdfBuffers([expedientePdf, planPartoPdf, riesgoPdf]);
    return { pdf_bytes: pdf.length };
  });
  return { individual, risk, plan, combined };
}

async function benchmarkCombinedConcurrent() {
  const paciente = { nombres: 'REGISTRO', apellidos: 'SINTETICO', no_expediente: 'SINTETICO' };
  const embarazo = { fur: '2026-01-01', fpp: '2026-10-08' };
  const riesgo = { tiene_riesgo: false };
  const clinicalData = { paciente, embarazo, controles: [], morbilidad: [], puerperio: [], vacunas: [] };
  const template = path.join(__dirname, '../src/assets/official_forms/plan_parto_oficial.xlsx');
  await exportExcelTemplateToPdf(template, {});
  return measure(async () => {
    const jobs = await Promise.all(Array.from({ length: 2 }, async () => {
      const start = performance.now();
      const parts = await Promise.all([
        generarFichaClinicaPrenatalPdf(clinicalData),
        exportExcelTemplateToPdf(template, {}),
        renderRiskPdf({ paciente, embarazo, riesgo }),
      ]);
      const pdf = await combinePdfBuffers(parts);
      return {
        duration_ms: Math.round((performance.now() - start) * 10) / 10,
        pdf_bytes: pdf.length,
        valid_pdf: pdf.subarray(0, 5).toString() === '%PDF-',
      };
    }));
    return { jobs };
  });
}

async function main() {
  const [scenario, sizeArg, rowArg] = process.argv.slice(2);
  let result;
  if (scenario === 'report-pdf') {
    const concurrency = Number(sizeArg);
    const count = Number(rowArg || 80);
    if (![1, 2, 3, 5].includes(concurrency) || !Number.isInteger(count)
      || count < 1 || count * concurrency > 1000) throw new RangeError('invalid scenario');
    result = await benchmarkReportPdf(concurrency, count);
  } else if (scenario === 'report-excel') {
    const count = Number(sizeArg);
    if (![20, 200, 1000].includes(count)) throw new RangeError('invalid scenario');
    result = await benchmarkReportExcel(count);
  } else if (scenario === 'clinical') {
    result = await benchmarkClinical();
  } else if (scenario === 'clinical-combined-2') {
    result = await benchmarkCombinedConcurrent();
  } else {
    throw new RangeError('usage: report-pdf <1|2|3|5> [rows], report-excel <20|200|1000>, clinical, clinical-combined-2');
  }
  process.stdout.write(`${JSON.stringify({ scenario, size: sizeArg || null, result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});
