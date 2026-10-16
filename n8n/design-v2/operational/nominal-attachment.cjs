'use strict';
// Serialized into the two Code builders. Only ExcelJS is requested at runtime.
async function nominalAttachment(kind, raw) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CAP Prenatal';
  workbook.subject = 'Listado operativo confidencial';
  const headers = ['Fecha de cita', 'Nombre completo', 'Teléfono', 'Comunidad'];
  const groups = kind === 'reminder' ? [['Citas programadas', raw.appointments]] : [
    ['Nuevas inasistencias', raw.appointments.filter(p => p.category === 'new')],
    ['Pendientes anteriores', raw.appointments.filter(p => p.category === 'previous_pending')],
  ];
  if (groups.reduce((n, x) => n + x[1].length, 0) !== raw.total) throw new Error('ATTACHMENT_INVALID');
  if (kind === 'missed' && (groups[0][1].length !== raw.summary.new || groups[1][1].length !== raw.summary.previous_pending)) throw new Error('ATTACHMENT_INVALID');
  for (const [name, rows] of groups) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [{ key: 'date', width: 18 }, { key: 'patient', width: 45 }, { key: 'phone', width: 22 }, { key: 'community', width: 40 }];
    headers.forEach((value, i) => { sheet.getRow(1).getCell(i + 1).value = value; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = 'A1:D1';
    for (const p of rows) {
      // Plain strings, never ExcelJS formula/hyperlink objects. Preserve phone zeros.
      const cells = [p.date, (p.first_name || 'No registrado') + ' ' + (p.last_name || 'No registrado'), p.phone || 'No registrado', p.community || 'No registrado'];
      sheet.addRow({ date: String(cells[0]), patient: String(cells[1]), phone: String(cells[2]), community: String(cells[3]) }).eachCell(cell => { cell.numFmt = '@'; });
    }
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D756C' } };
  }
  const bytes = await workbook.xlsx.writeBuffer();
  // Verify the actual serialized workbook before it can reach Resend.
  const checked = new ExcelJS.Workbook();
  await checked.xlsx.load(bytes);
  if (checked.worksheets.length !== groups.length) throw new Error('ATTACHMENT_INVALID');
  for (const [i, [name, rows]] of groups.entries()) {
    const sheet = checked.worksheets[i];
    if (sheet.name !== name || sheet.rowCount !== rows.length + 1 || JSON.stringify(sheet.getRow(1).values.slice(1)) !== JSON.stringify(headers)) throw new Error('ATTACHMENT_INVALID');
    for (let j = 0; j < rows.length; j++) {
      const p = rows[j], expected = [p.date, (p.first_name || 'No registrado') + ' ' + (p.last_name || 'No registrado'), p.phone || 'No registrado', p.community || 'No registrado'];
      for (let k = 0; k < 4; k++) if (sheet.getRow(j + 2).getCell(k + 1).value !== expected[k] || sheet.getRow(j + 2).getCell(k + 1).formula) throw new Error('ATTACHMENT_INVALID');
    }
  }
  const fileName = kind === 'reminder' ? 'Citas_programadas_' + raw.range.from + '.xlsx' : 'Seguimiento_inasistencias_' + raw.range.from + '_' + raw.range.to + '.xlsx';
  return { data: { data: bytes.toString('base64'), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName, fileExtension: 'xlsx' } };
}
function addAttachment(code, kind) {
  const tail = kind === 'reminder' ? 'return [{ json: { subject, html, total: raw.total } }];' : 'return [{ json: { subject, html, dispatch_token: raw.dispatch_token } }];';
  if (code.split(tail).length !== 2) throw new Error('Attachment return drift');
  const json = kind === 'reminder' ? '{ subject, html, total: raw.total }' : '{ subject, html, dispatch_token: raw.dispatch_token }';
  return code.replace(tail, 'const $nominalAttachment = ' + nominalAttachment.toString() + ';\nreturn $nominalAttachment(' + JSON.stringify(kind) + ', raw).then(binary => [{ json: ' + json + ', binary }]);');
}
module.exports = { nominalAttachment, addAttachment };
