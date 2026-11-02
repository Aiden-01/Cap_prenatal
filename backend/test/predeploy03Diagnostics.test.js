const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { failureDiagnostic, processDiagnostic } = require('../../.github/clinical/test-failure-diagnostics.cjs');
const { collectLayoutDiagnostics } = require('./helpers/layoutDiagnostics');
const { verifyReviewedLayout } = require('../../.github/clinical/candidate-integrity.cjs');
const title = 'CI conserva assertion numérica sin publicar operandos sensibles';

if (process.env.PREDEPLOY03_REPORTER_FIXTURE === '1') {
  test('CI conserva assertion numérica sin publicar operandos sensibles', () => assert.equal(808, 768));
} else {
  test('diagnóstico de proceso rechaza claves y estados ajenos sin publicar texto arbitrario', () => {
    const valid = { stage: 'document-timeout', ready: true, parent: 'absent', child: 'Z', tempRemoved: true };
    assert.deepEqual(processDiagnostic(JSON.stringify(valid)), valid);
    assert.equal(processDiagnostic(JSON.stringify({ ...valid, cookie: 'synthetic' })), null);
    assert.equal(processDiagnostic(JSON.stringify({ ...valid, child: 'Paciente reservado' })), null);
    assert.equal(processDiagnostic('raw log'), null);
  });
  test('integridad CI solo admite CSS revisado exacto y rechaza cambios de frontend adicionales', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../frontend/src/index.css'), 'utf8');
    assert.equal(verifyReviewedLayout(['frontend/src/index.css'], css).file, 'frontend/src/index.css');
    assert.throws(() => verifyReviewedLayout(['frontend/src/index.css', 'frontend/src/pages/NotasClinicas.jsx'], css));
    assert.throws(() => verifyReviewedLayout(['frontend/src/index.css'], css + '\nbody { display:none }'));
    assert.throws(() => verifyReviewedLayout([], css));
  });
  test('CI conserva assertion numérica sin publicar operandos sensibles', () => {
    const data = failureDiagnostic({ file: __filename, name: title, line: 12, column: 3,
      error: { code: 'ERR_ASSERTION', operator: 'strictEqual', actual: 808, expected: 768,
        message: 'Authorization: secret synthetic value', stack: 'private stack' } }, { stage: 'backend', exitCode: 1 });
    assert.equal(data.test_name, title);
    assert.equal(data.test_file, 'backend/test/predeploy03Diagnostics.test.js');
    assert.equal(data.actual, 808); assert.equal(data.expected, 768);
    assert.match(data.message, /808 strictEqual 768/);
    assert.equal(data.exit_code, 1); assert.equal(data.stage, 'backend');
    assert.doesNotMatch(JSON.stringify(data), /Authorization|private stack|secret synthetic/);
  });

  test('CI omite mensajes, nombres dinámicos, paths externos y operandos de texto u objetos', () => {
    for (const sensitive of ['Paciente reservado', 'Cookie: session=synthetic', { body: 'narrativa', password: 'synthetic' }]) {
      const data = failureDiagnostic({ file: 'C:\\outside\\sensitive.test.js', name: String(sensitive),
        error: { code: 'ERR_ASSERTION', operator: 'match', actual: sensitive, expected: sensitive,
          message: JSON.stringify(sensitive), headers: { authorization: 'synthetic' } } }, { stage: 'backend' });
      assert.equal(data.test_file, null);
      assert.equal(data.test_name, '[dynamic or unverified test name omitted]');
      assert.equal(Object.hasOwn(data, 'actual'), false);
      assert.equal(Object.hasOwn(data, 'expected'), false);
      assert.doesNotMatch(JSON.stringify(data), /Paciente reservado|session=|narrativa|password|authorization/i);
    }
  });

  test('CI desenvuelve ERR_TEST_FAILURE y omite códigos no permitidos', () => {
    const data = failureDiagnostic({ error: { code: 'ERR_TEST_FAILURE', cause: { code: 'ENOENT', message: 'private path' } } }, { stage: 'backend' });
    assert.equal(data.code, 'ENOENT'); assert.doesNotMatch(data.message, /private path/);
    assert.equal(failureDiagnostic({ error: { code: 'PATIENT_RESERVED' } }).code, 'UNCLASSIFIED_TEST_FAILURE');
  });

  test('reporter Node real conserva fallo y exit1 junto a TAP sin logs crudos en JSON', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-ci-reporter-'));
    const output = path.join(directory, 'failures.jsonl');
    try {
      const childEnv = { ...process.env, PREDEPLOY03_REPORTER_FIXTURE: '1' };
      delete childEnv.NODE_TEST_CONTEXT; // Otro runner real, no el contexto IPC del test padre.
      const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
        `--test-reporter=${pathToFileURL(path.resolve(__dirname, '../../.github/clinical/node-test-reporter.cjs')).href}`,
        '--test-reporter-destination=stdout', `--test-reporter-destination=${output}`, __filename],
      { encoding: 'utf8', timeout: 15000, env: childEnv });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /# fail 1/);
      const row = JSON.parse(fs.readFileSync(output, 'utf8').trim());
      assert.equal(row.code, 'ERR_ASSERTION'); assert.equal(row.test_name, title);
      assert.equal(row.actual, 808); assert.equal(row.expected, 768);
      assert.equal(row.test_file, 'backend/test/predeploy03Diagnostics.test.js');
      assert.ok(row.line > 0);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test('layout publica únicamente geometría y CSS de lista permitida, sin texto ni valores', () => {
    const previous = Object.fromEntries(['document', 'innerWidth', 'innerHeight', 'getComputedStyle'].map(key => [key, global[key]]));
    const element = { tagName: 'H1', classList: ['patient-hero-title', 'patient-reserved-name'],
      textContent: 'Paciente reservado', value: 'narrativa reservada', id: 'sensitive',
      clientWidth: 300, scrollWidth: 384, parentElement: null,
      getBoundingClientRect: () => ({ left: 424, right: 808, top: 10, bottom: 30, width: 384, height: 20 }),
      getClientRects: () => [1] };
    try {
      global.innerWidth = 768; global.innerHeight = 1000;
      global.document = { documentElement: { scrollWidth: 808 }, querySelectorAll: () => [element] };
      global.getComputedStyle = () => ({ whiteSpace: 'nowrap', width: '384px' });
      const result = collectLayoutDiagnostics();
      assert.equal(result.viewport.scrollWidth, 808);
      assert.equal(result.overflowing[0].selector, 'h1.patient-hero-title');
      assert.equal(result.overflowing[0].css.whiteSpace, 'nowrap');
      assert.doesNotMatch(JSON.stringify(result), /Paciente reservado|narrativa|patient-reserved|sensitive/);
    } finally { for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    } }
  });
}
