const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('reproduce causa original: DATE UTC serializado y listado en Guatemala retroceden un día', () => {
  const backendValue = execFileSync(process.execPath, ['-e', `console.log(JSON.stringify(require('pg').types.getTypeParser(1082)('2026-01-01')))`],
    { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }).trim();
  assert.equal(backendValue, '"2026-01-01T00:00:00.000Z"');
  const displayed = execFileSync(process.execPath, ['-e', `console.log(new Date(${backendValue}).toLocaleDateString('es-GT'))`],
    { env: { ...process.env, TZ: 'America/Guatemala' }, encoding: 'utf8' }).trim();
  assert.equal(displayed, '31/12/2025');
});

for (const TZ of ['UTC', 'America/Guatemala', 'Asia/Tokyo']) {
  test(`DATE sin conversión UTC; Excel y documentos preservan fechas (${TZ})`, () => {
    execFileSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const ExcelJS = require('exceljs');
      const { types } = require('pg');
      const clinical = require('./src/db/clinicalDateTypes');
      const { crearWorkbookCenso } = require('./src/services/reportesService');
      const { buildCensoPrimerControlHtml } = require('./src/services/reportesPdfService');
      const { formatDate } = require('./src/services/riskPdfRenderer');
      const { helpers } = require('./src/services/fichaClinicaPrenatalPdf');
      (async () => {
        // Positive TZ proves that the old backend JSON prefix can also shift.
        if (process.env.TZ === 'Asia/Tokyo') assert.equal(types.getTypeParser(1082)('2026-01-01').toISOString().slice(0,10), '2025-12-31');
        for (const oid of [types.builtins.TIMESTAMP, types.builtins.TIMESTAMPTZ, types.builtins.INT4])
          assert.equal(clinical.getTypeParser(oid), types.getTypeParser(oid));
        assert.equal(clinical.getTypeParser(1082, 'binary'), types.getTypeParser(1082, 'binary'));
        for (const date of ['2026-01-15','2026-01-31','2026-12-31','2026-02-28','2024-02-29']) {
          const value = clinical.getTypeParser(1082)(date);
          assert.equal(value, date);
          assert.equal(JSON.parse(JSON.stringify({ fur: value })).fur, date);
          const row = { no_expediente: 'SYN-DATE', nombre_completo: 'Sintetica Prueba', nivel_riesgo: 'BAJO', fur: value, fpp: value, fecha_primer_control: value };
          const workbook = crearWorkbookCenso([row], { incluirPrimerControl: true });
          const decoded = new ExcelJS.Workbook();
          await decoded.xlsx.load(await workbook.xlsx.writeBuffer());
          for (const column of [8,9,10]) assert.equal(decoded.worksheets[0].getCell(9,column).value.toISOString(), date+'T00:00:00.000Z');
          const html = buildCensoPrimerControlHtml({ rows: [row], desde: date, hasta: date });
          const body = html.split('<tbody>')[1].split('</tbody>')[0];
          assert.equal(body.split('<td class="center">'+date+'</td>').length - 1, 3);
          assert.equal(formatDate(value), date.slice(8)+'/'+date.slice(5,7)+'/'+date.slice(0,4));
          const drawn = [];
          helpers.drawDate({ drawText: text => drawn.push(text), getHeight: () => 792 }, { widthOfTextAtSize: text => text.length }, value,
            { x: 0, y: 0 }, 'synthetic');
          assert.deepEqual(drawn, [date.slice(8), date.slice(5,7), date.slice(0,4)]);
        }
        const empty = crearWorkbookCenso([{ fur: null, fpp: null, nivel_riesgo: 'BAJO' }]);
        assert.equal(empty.worksheets[0].getCell(9,8).value, '');
        assert.equal(formatDate(null), '');
      })().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
    `], { cwd: path.join(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8', timeout: 20000 });
  });
}
