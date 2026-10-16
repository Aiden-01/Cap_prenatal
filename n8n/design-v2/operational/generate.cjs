'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parse } = require('acorn'); // Existing development dependency; never emitted.
const C = require('../components.cjs');
const views = require('./views.cjs');
const { addAttachment } = require('./nominal-attachment.cjs');
const ROOT = path.resolve(__dirname, '../..');
const baselineHashes = require('../previews/workflow-baseline.json');
const ALLOWED = Object.freeze({
  'recordatorio-citas-resend-v1.json': { 'Construir detalle operativo': '((' + views.reminder.toString() + ')($v2, raw, subject, formatDate(raw.range.from)))' },
  'seguimiento-inasistencias-resend-v1.json': { 'Construir mensaje operativo': '((' + views.missed.toString() + ')($v2, raw, subject, fromLabel, toLabel, newItems, pendingItems))' },
  'seguimiento-tdap-el-chal-resend-v1.json': {
    'Construir correo con listas': '((' + views.tdap.toString() + ')($v2, data, data.subject, data.range_from.split("-").reverse().join("-"), data.range_to.split("-").reverse().join("-"), false))',
    'Validar contrato y construir correo': '((' + views.tdap.toString() + ')($v2, {new_total:raw.new_opportunities.total,pending_total:raw.pending.total,filename:raw.xlsx.filename}, subject, fromLabel, toLabel, true))',
  },
  'censo-primer-control-26-25-resend-v1.json': { 'Validar y preparar correo': '((' + views.census.toString() + ')($v2, raw, subject, fromLabel, toLabel, hasData, summary, true))' },
  'censo-primer-control-mes-cerrado-resend-v1.json': { 'Validar y preparar correo': '((' + views.census.toString() + ')($v2, raw, subject, fromLabel, toLabel, hasData, summary, false))' },
  'watchdog-calidad-datos-resend-v1.json': { 'Construir resumen agregado': '((' + views.quality.toString() + ')($v2, raw, subject, fromLabel, toLabel))' },
});
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function runtimeSource() {
  const names = ['escapeHtml', 'table', 'section', 'renderInstitutionalHeader', 'renderReportHeading', 'renderPeriodCard', 'renderKpiCard', 'renderKpiRow', 'renderEmptyState', 'renderDataTable', 'renderAttachmentNotice', 'renderInstitutionalFooter', 'renderEmailLayout'];
  // `table` is private in the approved master, recovered from its exact source.
  const master = fs.readFileSync(path.join(__dirname, '../components.cjs'), 'utf8');
  const tree = parse(master, { ecmaVersion: 'latest' });
  const tableDecl = tree.body.find(s => s.type === 'VariableDeclaration' && s.declarations[0].id.name === 'table');
  assert.ok(tableDecl, 'Approved table primitive missing');
  const tableSource = master.slice(tableDecl.start, tableDecl.end);
  const demo = '<p style="margin:18px 0 0;color:#516576;font-size:11px;line-height:1.6;">Maqueta V2 · Datos completamente ficticios · Sin envíos reales</p>';
  const guard = "if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid KPI');";
  let source = 'const $v2 = (() => {\nconst TOKENS = ' + JSON.stringify(C.TOKENS) + ';\n';
  for (const name of names) {
    let fn = name === 'table' ? tableSource : 'const ' + name + ' = ' + C[name].toString() + ';';
    if (name === 'renderEmailLayout') { assert.equal(fn.split(demo).length, 2); fn = fn.replace(demo, ''); }
    // Runtime must not add rejection rules on top of the original contracts.
    if (name === 'renderKpiCard') { assert.equal(fn.split(guard).length, 2); fn = fn.replace(guard, ''); fn = fn.replace("value.toString().padStart(2, '0')", "escapeHtml(String(value).padStart(2, '0'))"); }
    source += fn + '\n';
  }
  source += 'return { ' + names.filter(n => !['table'].includes(n)).join(', ') + ' };\n})();\n';
  assert.doesNotMatch(source, /Maqueta V2|Datos completamente ficticios|Sin envíos reales|\brequire\s*\(|\bimport\b/);
  return source;
}
function htmlInitializer(code) {
  const tree = parse(code, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, preserveParens: true });
  const declarations = tree.body.filter(s => s.type === 'VariableDeclaration').flatMap(s => s.declarations).filter(d => d.id.type === 'Identifier' && d.id.name === 'html');
  assert.equal(declarations.length, 1, 'Expected one top-level html declaration');
  assert.ok(declarations[0].init, 'HTML initializer missing');
  return declarations[0].init;
}
function patchCode(code, expression) {
  assert.ok(!code.includes('const $v2'), 'Unexpected already patched source');
  const init = htmlInitializer(code);
  // All existing statements (including validation map, subjects and returns) survive byte for byte.
  const next = runtimeSource() + code.slice(0, init.start) + expression + code.slice(init.end);
  new Function(next); // Syntax only; never execute a workflow.
  return next;
}
function canonicalWithoutHtml(code, generated) {
  const original = generated ? code.slice(runtimeSource().length) : code;
  if (generated) assert.ok(code.startsWith(runtimeSource()), 'Component bundle drift');
  const init = htmlInitializer(original);
  return original.slice(0, init.start) + '__VISUAL_HTML__' + original.slice(init.end);
}
function diffPaths(a, b, prefix = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => diffPaths(a[k], b[k], prefix + '/' + k));
  return [prefix];
}
function completeNameLimits(code) {
  assert.ok(code.includes("['first_name', 80]") && code.includes("['last_name', 80]"), 'Name contract drift');
  return code.replaceAll("['first_name', 80]", "['first_name', 150]").replaceAll("['last_name', 80]", "['last_name', 150]");
}
function candidate(file, source) {
  assert.equal(hash(source), baselineHashes[file], 'Baseline mismatch: ' + file);
  const before = JSON.parse(source), after = structuredClone(before);
  const paths = [];
  for (const [name, expression] of Object.entries(ALLOWED[file])) {
    const matches = after.nodes.filter(n => n.name === name);
    assert.equal(matches.length, 1, 'Ambiguous/missing node: ' + name);
    const node = matches[0];
    assert.equal(node.type, 'n8n-nodes-base.code');
    assert.equal(node.typeVersion, 2);
    const old = node.parameters.jsCode, htmlOnly = patchCode(old, expression);
    assert.equal(canonicalWithoutHtml(old, false), canonicalWithoutHtml(htmlOnly, true), 'Business statements changed');
    const kind = file === 'recordatorio-citas-resend-v1.json' ? 'reminder' : file === 'seguimiento-inasistencias-resend-v1.json' ? 'missed' : null;
    const next = kind === 'reminder' ? completeNameLimits(addAttachment(htmlOnly, kind)) : kind ? addAttachment(htmlOnly, kind) : htmlOnly;
    const oldLiteral = JSON.stringify(old);
    assert.equal(source.split(oldLiteral).length, 2, 'Cannot locate unique JSON code scalar');
    source = source.replace(oldLiteral, () => JSON.stringify(next));
    node.parameters.jsCode = next;
    paths.push('/nodes/' + after.nodes.indexOf(node) + '/parameters/jsCode');
  }
  if (file === 'recordatorio-citas-resend-v1.json' || file === 'seguimiento-inasistencias-resend-v1.json') {
    if (file === 'seguimiento-inasistencias-resend-v1.json') {
      const validator = after.nodes.find(n => n.name === 'Validar contrato y reserva');
      validator.parameters.jsCode = completeNameLimits(validator.parameters.jsCode);
      paths.push('/nodes/' + after.nodes.indexOf(validator) + '/parameters/jsCode');
    }
    const send = after.nodes.find(n => n.type === 'n8n-nodes-resend.resend');
    send.parameters.additionalOptions = { attachments: { attachments: [{ attachmentType: 'binaryData', binaryPropertyName: 'data', filename: '={{ $binary.data.fileName }}' }] } };
    paths.push('/nodes/' + after.nodes.indexOf(send) + '/parameters/additionalOptions/attachments');
    // JSON fields and graph remain unchanged; binary is the explicitly approved addition.
    source = JSON.stringify(after, null, 2) + '\n';
  }
  assert.deepEqual(JSON.parse(source), after);
  assert.deepEqual(diffPaths(before, after).sort(), paths.sort());
  return { source, before, after, paths };
}
function readBaseline(file) {
  const stored = path.join(__dirname, 'baseline', file);
  if (fs.existsSync(stored)) return fs.readFileSync(stored, 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8');
  assert.equal(hash(source), baselineHashes[file], 'Unexpected workflow changes; stop before writing');
  return source;
}
function prepare() {
  return Object.keys(ALLOWED).map(file => {
    const baseline = readBaseline(file), next = candidate(file, baseline);
    const current = fs.readFileSync(path.join(ROOT, 'workflows', file), 'utf8');
    assert.ok(current === baseline || current === next.source, 'Workflow drift: ' + file);
    return { file, baseline, current, ...next };
  });
}
function main(mode) {
  assert.ok(['--plan', '--apply', '--check'].includes(mode), 'Use --plan (review first), --apply or --check');
  const items = prepare(); // Validate all six before any write.
  const report = items.map(x => ({ file: x.file, beforeSha256: hash(x.baseline), afterSha256: hash(x.source), changedPaths: x.paths, businessSelectionAndDispatchPreserved: true, approvedBinaryAddition: /^(recordatorio|seguimiento-inasistencias)/.test(x.file), approvedCompleteNameLimit: /^(recordatorio|seguimiento-inasistencias)/.test(x.file) ? 150 : null }));
  if (mode === '--plan') {
    fs.mkdirSync(path.join(__dirname, 'baseline'), { recursive: true });
    fs.mkdirSync(path.join(__dirname, 'review'), { recursive: true });
    for (const x of items) {
      const baselinePath = path.join(__dirname, 'baseline', x.file);
      if (!fs.existsSync(baselinePath)) fs.writeFileSync(baselinePath, x.baseline, { flag: 'wx' });
      fs.writeFileSync(path.join(__dirname, 'review', x.file), x.source);
    }
    fs.writeFileSync(path.join(__dirname, 'review/structure.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('Review candidates in operational/review; functional JSON not written.');
  } else if (mode === '--apply') {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, 'review/structure.json'))), report, 'Plan is missing or outdated');
    for (const x of items) assert.equal(fs.readFileSync(path.join(__dirname, 'review', x.file), 'utf8'), x.source, 'Candidate modified after plan');
    for (const x of items) assert.equal(fs.readFileSync(path.join(ROOT, 'workflows', x.file), 'utf8'), x.current, 'Concurrent edit');
    for (const x of items) if (x.current !== x.source) fs.writeFileSync(path.join(ROOT, 'workflows', x.file), x.source);
    console.log('Applied reviewed HTML-only changes locally.');
  } else {
    for (const x of items) assert.equal(x.current, x.source, 'Workflow is not generated: ' + x.file);
    console.log('Six generated JSON verified; eight Code paths and two binary bindings include the approved complete-name contract expansion.');
  }
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main(process.argv[2]);
module.exports = { ALLOWED, hash, runtimeSource, htmlInitializer, canonicalWithoutHtml, candidate, prepare, diffPaths, ROOT };
