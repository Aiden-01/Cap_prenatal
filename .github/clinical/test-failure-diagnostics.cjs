'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const codes = new Set(['ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ENOENT', 'EACCES', 'EPERM',
  'ETIMEDOUT', 'EADDRINUSE', 'EBUSY', 'ENOTEMPTY', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE',
  '08006', '23503', '23514', '55006', '57P01', '57P02', '57P03',
  'POSTGRES_CLOSE_TIMEOUT', 'POSTGRES_SESSIONS_REMAIN',
  'FIXTURE_NOT_READY', 'DOCUMENT_PROCESS_TIMEOUT', 'DOCUMENT_PROCESS_FAILED']);
const failureKinds = new Set(['testCodeFailure', 'subtestsFailed', 'hookFailed', 'testTimeoutFailure',
  'testAborted', 'cancelledByParent', 'parentAlreadyFinished', 'uncaughtException', 'unhandledRejection']);
const syscalls = new Set(['connect', 'listen', 'read', 'write', 'open', 'unlink', 'rmdir', 'scandir', 'spawnSync']);
const cleanupSteps = new Set(['close-pool', 'close-control-pool', 'close-fixture', 'restore-shared-pool',
  'close-http-server', 'drain-simulated-delivery',
  'verify-client-sessions', 'drop-fixture-databases', 'stop-temporary-server', 'stop-after-drain-failure',
  'clean-temporary-directory', 'remove-temporary-files', 'complete']);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT']);
const lateErrorCodes = new Map([
  ['Error: read ECONNRESET', 'ECONNRESET'],
  ['Error: write EPIPE', 'EPIPE'],
  ['error: terminating connection due to administrator command', '57P01'],
]);
const operators = new Set(['strictEqual', 'deepStrictEqual', 'equal', 'deepEqual',
  'notStrictEqual', 'notDeepStrictEqual', 'ok', 'match', 'doesNotMatch', 'rejects', 'throws']);
const safeOperand = value => value === null || typeof value === 'boolean';
const integer = value => Number.isInteger(value) ? value : null;
const confidential = /-----BEGIN|(?:gh[pousr]_|github_pat_)[\w]+|eyJ[\w-]{8,}\.[\w-]+\.[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:cookie|authorization|password|token)\s*[:=]/i;

function testFile(file, base = root) {
  if (typeof file !== 'string') return null;
  const relative = path.relative(base, file).replaceAll('\\', '/');
  return /^(?:backend\/test\/[a-zA-Z0-9_-]+\.test\.js|frontend\/test(?:-dom)?\/[a-zA-Z0-9_-]+\.test\.[jt]sx?)$/.test(relative) ? relative : null;
}

function safeTestName(name, file, base = root) {
  if (!file || typeof name !== 'string' || name.length > 240 || confidential.test(name)) return '[dynamic or unverified test name omitted]';
  // Nombres dinámicos, datos interpolados y texto de logs nunca se publican.
  let source;
  try { source = fs.readFileSync(path.join(base, file), 'utf8'); }
  catch { return '[dynamic or unverified test name omitted]'; }
  const literals = [...source.matchAll(/(?:\btest|\bit)(?:\.\w+)?\(\s*(['"])([^'"\r\n\\]*)\1\s*[,)]/g)].map(match => match[2]);
  return literals.includes(name) ? name : '[dynamic or unverified test name omitted]';
}

function failureDiagnostic(data, { stage, exitCode = null, base = root } = {}) {
  const file = testFile(data.file, base);
  const runnerError = data.details?.error || data.error || {};
  const error = runnerError.code === 'ERR_TEST_FAILURE' && typeof runnerError.cause === 'object'
    ? runnerError.cause ?? runnerError : runnerError;
  const fileProcess = file && testFile(data.name, base) === file && runnerError.code === 'ERR_TEST_FAILURE';
  const code = codes.has(error.code) ? error.code : 'UNCLASSIFIED_TEST_FAILURE';
  const diagnostic = { stage, exit_code: integer(exitCode),
    test_file: file, test_name: fileProcess ? file : safeTestName(data.name, file, base),
    scope: fileProcess ? 'file-process' : 'test',
    nesting: integer(data.nesting), test_number: integer(data.testNumber),
    line: integer(data.line), column: integer(data.column), code,
    failure_kind: failureKinds.has(runnerError.failureType) ? runnerError.failureType : null,
    type: ['Error', 'AssertionError', 'TypeError', 'ReferenceError', 'RangeError', 'TimeoutError'].includes(error.name) ? error.name : 'Error' };
  if (fileProcess) diagnostic.child_exit_code = integer(runnerError.exitCode);
  if (syscalls.has(error.syscall)) diagnostic.syscall = error.syscall;
  if (Number.isInteger(error.status)) diagnostic.command_exit_code = error.status;
  if (signals.has(error.signal)) diagnostic.signal = error.signal;
  if (code === 'ERR_ASSERTION') {
    diagnostic.operator = operators.has(error.operator) ? error.operator : '[omitted]';
    diagnostic.message = `Assertion failed (${diagnostic.operator}); non-boolean, non-null operands omitted`;
    if (safeOperand(error.actual)) diagnostic.actual = error.actual;
    if (safeOperand(error.expected)) diagnostic.expected = error.expected;
  } else {
    diagnostic.message = ({ ENOENT: 'Filesystem entry missing; paths omitted',
      FIXTURE_NOT_READY: 'Synthetic process readiness failed',
      DOCUMENT_PROCESS_TIMEOUT: 'Document process exceeded its deadline',
      DOCUMENT_PROCESS_FAILED: 'Document process failed; command and stderr omitted',
      ERR_TEST_FAILURE: 'Test failed; child tests or details require structured diagnostics' })[code] || 'Test failed; free-form error message omitted';
  }
  return diagnostic;
}

function processDiagnostic(message, event = {}, { base = root, cwd = process.cwd() } = {}) {
  if (typeof message !== 'string' || message.length > 8192) return null;
  const targetFile = testFile(event.file, base);
  const cleanup = /^postgres-cleanup:([a-z-]+)(?::(succeeded|failed)(?::([A-Z0-9_]+))?)?$/.exec(message);
  if (targetFile && cleanup && cleanupSteps.has(cleanup[1])) {
    const [, step, status, code] = cleanup;
    return { stage: 'postgres-cleanup', step, status: status ?? null, code: codes.has(code) ? code : null,
      test_file: targetFile, nesting: integer(event.nesting) };
  }
  // El runner emite actividad tardía como diagnóstico. Solo se conservan la clase y la ubicación comprobada.
  const late = /^Error: (?:Test(?: hook)? "([^\r\n]{1,240}?)"(?: at ([^\r\n]+?):(\d+):(\d+))?|A resource) generated asynchronous activity after the test ended\. This activity created the error "([\s\S]*)" (?:and would have caused the test to fail, but instead |which )triggered an (uncaughtException|unhandledRejection) event(?:, caught by the test runner)?\.$/.exec(message);
  if (late) {
    const [, name, location, line, column, errorText, eventType] = late;
    const file = location ? testFile(path.resolve(cwd, location), base) : targetFile;
    return { stage: 'node-test-late-activity', event: eventType, code: lateErrorCodes.get(errorText) ?? null,
      test_file: file, test_name: safeTestName(name, file, base),
      line: line && file ? integer(Number(line)) : null, column: column && file ? integer(Number(column)) : null };
  }
  let data;
  try { data = JSON.parse(message); } catch { return null; }
  if (!data || Object.keys(data).sort().join(',') !== 'child,parent,ready,stage,tempRemoved' || data.stage !== 'document-timeout' || typeof data.ready !== 'boolean'
    || !(data.tempRemoved === null || typeof data.tempRemoved === 'boolean')) return null;
  const states = new Set(['not-started', 'absent', 'unknown', 'running', 'R', 'S', 'D', 'Z', 'X', 'T', 't', 'I', 'W', 'P']);
  if (!states.has(data.parent) || !states.has(data.child)) return null;
  return data;
}

module.exports = { failureDiagnostic, processDiagnostic, testFile };
