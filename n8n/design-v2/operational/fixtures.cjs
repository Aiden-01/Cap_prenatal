'use strict';
// Synthetic fixtures only; never used by the generator or embedded in workflows.
const ExcelJS = require('../../../backend/node_modules/exceljs');
const person = { date: '2026-10-07', first_name: '<Ejemplo>', last_name: 'Ficticio & Otro', phone: '0000-0000', community: 'Sector "Sintético" O\'Prueba & Anexo' };
const range = { from: '2026-10-05', to: '2026-10-11' };
const token = 's'.repeat(43);
function daily() {
  return { schema_version: 1, generated_at: '2026-10-14T12:00:00Z', timezone: 'America/Guatemala', range: { from: '2026-10-15', to: '2026-10-15' }, total: 1, summary_by_date: [{ date: '2026-10-15', total: 1 }], appointments: [{ ...person, date: '2026-10-15' }], secure_path: '/dashboard' };
}
function missed(newTotal = 1, previous = 1) {
  return { range, summary: { new: newTotal, previous_pending: previous, total: newTotal + previous }, total: newTotal + previous, appointments: [...Array.from({ length: newTotal }, () => ({ ...person, category: 'new' })), ...Array.from({ length: previous }, () => ({ ...person, date: '2026-10-01', first_name: 'Muestra', category: 'previous_pending' }))], dispatch_token: token, should_send: true };
}
function missedContract(status = 'ready') {
  const data = missed(status === 'ready' ? 1 : 0, status === 'ready' ? 1 : 0);
  return { schema_version: 2, generated_at: '2026-10-12T14:00:00Z', timezone: 'America/Guatemala', report_type: 'weekly_missed_appointments', range, cutoff_at: '2026-08-01T00:00:00Z', dispatch: status === 'ready' ? { status, token } : { status }, summary: data.summary, total: data.total, appointments: data.appointments };
}
function tdapContract(status = 'ready', n = 1, p = 1) {
  const ready = status === 'ready';
  return { schema_version: 1, generated_at: '2026-10-12T14:00:00Z', timezone: 'America/Guatemala', report_type: 'seguimiento_tdap_el_chal', range, as_of: '2026-10-12', new_opportunities: { total: ready ? n : 0 }, pending: { total: ready ? p : 0 }, has_information: ready, xlsx: { available: ready, download_path: '/api/automatizaciones/v1/tdap/xlsx', filename: ready ? 'Seguimiento_Tdap_El_Chal_12-10-2026.xlsx' : null }, dispatch: ready ? { status, token } : { status } };
}
async function tdapMail(n = 1, p = 1) {
  const rows = (count, pending) => Array.from({ length: count }, () => ({ 'Primer nombre': pending ? 'Muestra' : person.first_name, 'Primer apellido': pending ? 'Sintética' : person.last_name, Comunidad: person.community }));
  const newRows = rows(n, false), pendingRows = rows(p, true);
  const book = new ExcelJS.Workbook();
  for (const [name, list] of [['Nuevas oportunidades Tdap', newRows], ['Pendientes de Tdap', pendingRows]]) {
    const sheet = book.addWorksheet(name);
    sheet.addRow(['Primer nombre', 'Primer apellido', 'Comunidad']);
    for (const row of list) sheet.addRow(Object.values(row));
  }
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(buffer);
  if (reopened.worksheets.length !== 2) throw Error('Synthetic XLSX invalid');
  return { dispatch_token: token, filename: 'Seguimiento_Tdap_El_Chal_12-10-2026.xlsx', subject: 'CAP Prenatal | Seguimiento oportuno Tdap - El Chal', attachment_base64: buffer.toString('base64'), new_rows: newRows, pending_rows: pendingRows, new_total: n, pending_total: p, range_from: range.from, range_to: range.to };
}
function census(logistic, total = 4) {
  return { schema_version: 1, generated_at: '2026-10-26T14:00:00Z', timezone: 'America/Guatemala', report_type: 'first_prenatal_control_census', range: { from: logistic ? '2026-09-26' : '2026-09-01', to: logistic ? '2026-10-25' : '2026-09-30' }, total, secure_path: '/reportes' };
}
function quality(status = 'ready') {
  const ready = status === 'ready';
  return { schema_version: 1, generated_at: '2026-10-12T14:00:00Z', timezone: 'America/Guatemala', report_type: 'weekly_data_quality_watchdog', range, as_of: '2026-10-12', dispatch: ready ? { status, token } : { status }, total: ready ? 2 : 0, categories: ready ? [{ code: 'future_prenatal_control', label: 'Controles prenatales con fecha futura', description: 'Hay controles con una fecha posterior al dia operativo actual.', count: 2 }] : [], secure_path: '/dashboard' };
}
module.exports = { person, range, daily, missed, missedContract, tdapContract, tdapMail, census, quality };
