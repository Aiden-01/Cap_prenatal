'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const codes = new Set(['ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ENOENT', 'EACCES', 'EPERM',
  'ETIMEDOUT', 'FIXTURE_NOT_READY', 'DOCUMENT_PROCESS_TIMEOUT', 'DOCUMENT_PROCESS_FAILED']);
const operators = new Set(['strictEqual', 'deepStrictEqual', 'equal', 'deepEqual',
  'notStrictEqual', 'notDeepStrictEqual', 'ok', 'match', 'doesNotMatch', 'rejects', 'throws']);
const scalar = value => value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const confidential = /-----BEGIN|(?:gh[pousr]_|github_pat_)[\w]+|eyJ[\w-]{8,}\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:cookie|authorization|password|token)\s*[:=]/i;

function testFile(file, base = root) {
  if (typeof file !== 'string') return null;
  const relative = path.relative(base, file).replaceAll('\\', '/');
  return /^(?:backend\/test\/[a-zA-Z0-9_-]+\.test\.js|frontend\/test(?:-dom)?\/[a-zA-Z0-9_-]+\.test\.[jt]sx?)$/.test(relative) ? relative : null;
}

function safeTestName(name, file, base = root) {
  if (!file || typeof name !== 'string' || name.length > 240 || confidential.test(name)) return '[dynamic or unverified test name omitted]';
  // Nombres dinámicos, datos interpolados y texto de logs nunca se publican.
  const source = fs.readFileSync(path.join(base, file), 'utf8');
  const literals = [...source.matchAll(/(?:\btest|\bit)(?:\.\w+)?\(\s*(['"])([^'"\r\n\\]*)\1\s*[,)]/g)].map(match => match[2]);
  return literals.includes(name) ? name : '[dynamic or unverified test name omitted]';
}

function failureDiagnostic(data, { stage, exitCode = null, base = root } = {}) {
  const file = testFile(data.file, base);
  let error = data.details?.error || data.error || {};
  // El runner envuelve errores de aserción en ERR_TEST_FAILURE.
  if (error.cause && typeof error.cause === 'object') error = error.cause;
  const code = codes.has(error.code) ? error.code : 'UNCLASSIFIED_TEST_FAILURE';
  const diagnostic = { stage, exit_code: Number.isInteger(exitCode) ? exitCode : null,
    test_file: file, test_name: safeTestName(data.name, file, base),
    line: Number.isInteger(data.line) ? data.line : null,
    column: Number.isInteger(data.column) ? data.column : null, code,
    type: ['Error', 'AssertionError', 'TypeError', 'ReferenceError', 'RangeError', 'TimeoutError'].includes(error.name) ? error.name : 'Error' };
  if (code === 'ERR_ASSERTION') {
    diagnostic.operator = operators.has(error.operator) ? error.operator : '[omitted]';
    diagnostic.message = `Assertion failed (${diagnostic.operator}); string/object operands omitted`;
    if (scalar(error.actual)) diagnostic.actual = error.actual;
    if (scalar(error.expected)) diagnostic.expected = error.expected;
    if (scalar(error.actual) && scalar(error.expected)) diagnostic.message = `Assertion failed: ${JSON.stringify(error.actual)} ${diagnostic.operator} ${JSON.stringify(error.expected)}`;
  } else {
    diagnostic.message = ({ ENOENT: 'Filesystem entry missing; paths omitted',
      FIXTURE_NOT_READY: 'Synthetic process readiness failed',
      DOCUMENT_PROCESS_TIMEOUT: 'Document process exceeded its deadline',
      DOCUMENT_PROCESS_FAILED: 'Document process failed; command and stderr omitted',
      ERR_TEST_FAILURE: 'Test failed; child tests or details require structured diagnostics' })[code] || 'Test failed; free-form error message omitted';
  }
  return diagnostic;
}

function processDiagnostic(message) {
  let data;
  try { data = JSON.parse(message); } catch { return null; }
  if (!data || Object.keys(data).sort().join(',') !== 'child,parent,ready,stage,tempRemoved' || data.stage !== 'document-timeout' || typeof data.ready !== 'boolean'
    || !(data.tempRemoved === null || typeof data.tempRemoved === 'boolean')) return null;
  const states = new Set(['not-started', 'absent', 'unknown', 'running', 'R', 'S', 'D', 'Z', 'X', 'T', 't', 'I', 'W', 'P']);
  if (!states.has(data.parent) || !states.has(data.child)) return null;
  return data;
}

module.exports = { failureDiagnostic, processDiagnostic, testFile };
