const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { failureDiagnostic, processDiagnostic } = require('../../.github/clinical/test-failure-diagnostics.cjs');
const { collectLayoutDiagnostics } = require('./helpers/layoutDiagnostics');
const { reviewedOwnerEmailChanges, verifyOwnerEmailDiff, verifyReviewedLayout, verifyResponsiveActions } = require('../../.github/clinical/candidate-integrity.cjs');
const title = 'CI conserva la ubicación de la aserción';
const { correctiveChanges, verifyCorrectiveDiff, verifyCorrectiveLineage } = require('../../.github/clinical/candidate-integrity.cjs');

if (process.env.PREDEPLOY03_REPORTER_FIXTURE === '1') {
  test('CI conserva la ubicación de la aserción', async t => {
    await t.test('subprueba con aserción fallida', () => assert.equal(81234567, 768));
    t.diagnostic('postgres-cleanup:stop-temporary-server');
  });
} else if (process.env.PREDEPLOY03_REPORTER_FIXTURE === 'late') {
  test('subprueba con error asíncrono después de terminar', () => {
    setImmediate(() => Promise.reject(new Error('private password: synthetic value')));
  });
} else {
  test('CPREN-126 correctivo rechaza rutas productivas, migraciones, modos y linajes ajenos', () => {
    const changes = correctiveChanges.join('\n');
    verifyCorrectiveDiff(changes, () => '100644 blob');
    for (const file of ['backend/src/services/accountEmailService.js', 'backend/src/db/migrations/035_cambio_correo_titular.sql',
      'frontend/src/App.jsx', 'backend/package-lock.json', 'n8n/security/recuperacion-password.json']) {
      assert.throws(() => verifyCorrectiveDiff(changes + '\nM\t' + file, () => '100644 blob'));
    }
    assert.throws(() => verifyCorrectiveDiff(changes, () => '100755 blob'));
    assert.throws(() => verifyCorrectiveDiff(correctiveChanges.slice(1).join('\n'), () => '100644 blob'));
    const product = 'b9bdfe9557fdf73ee449748dad4a1111f8df8342';
    const run = '35a70a4ba0ca9563b5acce3f5b28ccd4f1fe3473';
    const parents = new Map([
      [product, [product, '0c0f7d94d1c6c99d4364bb2e8e28f5be911f0112']],
      [run, [run, product]], ['checkpoint', ['checkpoint', run]], ['activation', ['activation', 'checkpoint']],
    ]);
    verifyCorrectiveLineage('activation', 'checkpoint', sha => parents.get(sha));
    for (const sha of parents.keys()) {
      const changed = new Map(parents);
      changed.set(sha, [sha, 'other']);
      assert.throws(() => verifyCorrectiveLineage('activation', 'checkpoint', key => changed.get(key)));
      changed.set(sha, [...parents.get(sha), 'second-parent']);
      assert.throws(() => verifyCorrectiveLineage('activation', 'checkpoint', key => changed.get(key)));
    }
  });
  test('CPREN-126 verifica el conjunto exacto, modo y contenido productivo aprobado', () => {
    const root = path.resolve(__dirname, '../..');
    const changes = reviewedOwnerEmailChanges.join('\n');
    const readBlob = (file, verifyContent) => ({ mode: '100644 blob',
      content: verifyContent ? fs.readFileSync(path.join(root, file), 'utf8') : undefined });
    const product = verifyOwnerEmailDiff(changes, readBlob);
    assert.equal(product.length, 14);
    assert.ok(product.some(item => item.file.endsWith('/035_cambio_correo_titular.sql')));
    assert.throws(() => verifyOwnerEmailDiff(changes + '\nM\tfrontend/src/App.jsx', readBlob), /rutas no revisadas/);
    assert.throws(() => verifyOwnerEmailDiff(changes.replace('035_cambio_correo_titular.sql', '034_recuperacion_password.sql'), readBlob), /rutas no revisadas/);
    assert.throws(() => verifyOwnerEmailDiff(changes, (file, check) => ({ ...readBlob(file, check), mode: '100755 blob' })), /Modo no revisado/);
    assert.throws(() => verifyOwnerEmailDiff(changes, (file, check) => ({ ...readBlob(file, check), content: 'otro contenido' })), /Contenido productivo no revisado/);
  });

  test('diagnóstico de proceso rechaza claves y estados ajenos sin publicar texto arbitrario', () => {
    const valid = { stage: 'document-timeout', ready: true, parent: 'absent', child: 'Z', tempRemoved: true };
    assert.deepEqual(processDiagnostic(JSON.stringify(valid)), valid);
    assert.equal(processDiagnostic(JSON.stringify({ ...valid, cookie: 'synthetic' })), null);
    assert.equal(processDiagnostic(JSON.stringify({ ...valid, child: 'Paciente reservado' })), null);
    assert.equal(processDiagnostic('raw log'), null);
    const late = 'Error: A resource generated asynchronous activity after the test ended. This activity created the error "Error: read ECONNRESET" which triggered an uncaughtException event, caught by the test runner.';
    assert.equal(processDiagnostic(late).code, 'ECONNRESET');
    assert.equal(processDiagnostic(late.replace('ECONNRESET', 'ECONNRESET sensitive suffix')).code, null);
    const metadata = { file: __filename, nesting: 1 };
    const cleanup = processDiagnostic('postgres-cleanup:verify-client-sessions:failed:POSTGRES_SESSIONS_REMAIN', metadata);
    assert.equal(cleanup.code, 'POSTGRES_SESSIONS_REMAIN');
    assert.equal(cleanup.status, 'failed');
    assert.equal(cleanup.nesting, 1);
    assert.equal(processDiagnostic('postgres-cleanup:close-pool:failed:81234567', metadata).code, null);
    assert.equal(processDiagnostic('postgres-cleanup:close-pool:succeeded:details omitted', metadata), null);
  });
  test('integridad CI solo admite CSS revisado exacto y rechaza cambios de frontend adicionales', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../frontend/src/index.css'), 'utf8');
    assert.equal(verifyReviewedLayout(['frontend/src/index.css'], css).file, 'frontend/src/index.css');
    assert.throws(() => verifyReviewedLayout(['frontend/src/index.css', 'frontend/src/pages/NotasClinicas.jsx'], css));
    assert.throws(() => verifyReviewedLayout(['frontend/src/index.css'], css + '\nbody { display:none }'));
    assert.throws(() => verifyReviewedLayout([], css));
  });
  test('integridad CI exige solo la modificación exacta del CSS responsive de acciones', () => {
    const file = 'frontend/src/components/usuarios/profesionales.css';
    const css = execFileSync('git', ['show', '1bd79237eac045c4f57b5a31e170bec02046f151:' + file],
      { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
    const modified = [`M\t${file}`];
    assert.equal(verifyResponsiveActions(modified, css).file, file);
    assert.throws(() => verifyResponsiveActions([...modified, 'M\tbackend/src/db/schema.sql'], css), /Unexpected changes/);
    assert.throws(() => verifyResponsiveActions([`A\t${file}`], css), /Unexpected changes/);
    assert.throws(() => verifyResponsiveActions(modified, css + '\n/* cambio */'), /approved content/);
  });
  test('CI conserva la ubicación de la aserción', () => {
    const data = failureDiagnostic({ file: __filename, name: title, line: 12, column: 3,
      error: { code: 'ERR_ASSERTION', operator: 'strictEqual', actual: 808, expected: 768,
        message: 'Authorization: secret synthetic value', stack: 'private stack' } }, { stage: 'backend', exitCode: 1 });
    assert.equal(data.test_name, title);
    assert.equal(data.test_file, 'backend/test/predeploy03Diagnostics.test.js');
    assert.equal(data.line, 12); assert.equal(data.column, 3);
    assert.equal(data.operator, 'strictEqual');
    assert.equal(Object.hasOwn(data, 'actual'), false);
    assert.equal(Object.hasOwn(data, 'expected'), false);
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
    const shutdown = failureDiagnostic({ error: { code: 'ERR_TEST_FAILURE', failureType: 'uncaughtException',
      cause: { code: '57P01', detail: 'sensitive database details', message: 'raw shutdown message' } } });
    assert.equal(shutdown.code, '57P01');
    assert.equal(shutdown.failure_kind, 'uncaughtException');
    assert.doesNotMatch(JSON.stringify(shutdown), /sensitive database details|raw shutdown message/);
  });

  test('reporter Node real conserva subpruebas, cierre y actividad tardía sin logs crudos en JSON', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-ci-reporter-'));
    const output = path.join(directory, 'failures.jsonl');
    try {
      const childEnv = { ...process.env };
      delete childEnv.NODE_TEST_CONTEXT; // Otro runner real, no el contexto IPC del test padre.
      const args = ['--test', '--test-reporter=tap',
        `--test-reporter=${pathToFileURL(path.resolve(__dirname, '../../.github/clinical/node-test-reporter.cjs')).href}`,
        '--test-reporter-destination=stdout', `--test-reporter-destination=${output}`, __filename];
      function runFixture(mode) {
        const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000,
          env: { ...childEnv, PREDEPLOY03_REPORTER_FIXTURE: mode } });
        assert.equal(result.status, 1, result.stderr);
        const raw = fs.readFileSync(output, 'utf8').trim();
        assert.doesNotMatch(raw, /81234567|private password|synthetic value/);
        return raw.split('\n').map(JSON.parse);
      }
      const file = 'backend/test/predeploy03Diagnostics.test.js';
      const nested = runFixture('1');
      const assertion = nested.find(row => row.code === 'ERR_ASSERTION');
      assert.equal(assertion.test_name, 'subprueba con aserción fallida');
      assert.equal(assertion.test_file, file);
      assert.equal(assertion.nesting, 1);
      assert.ok(assertion.line > 0);
      assert.ok(nested.some(row => row.test_name === title && row.failure_kind === 'subtestsFailed'));
      assert.ok(nested.some(row => row.stage === 'postgres-cleanup' && row.step === 'stop-temporary-server'));

      const late = runFixture('late');
      const activity = late.find(row => row.stage === 'node-test-late-activity');
      assert.equal(activity.event, 'unhandledRejection');
      assert.equal(activity.code, null);
      assert.equal(activity.test_file, file);
      assert.equal(activity.test_name, 'subprueba con error asíncrono después de terminar');
      assert.ok(activity.line > 0);
      const child = late.find(row => row.scope === 'file-process');
      assert.equal(child.test_file, file);
      assert.equal(child.child_exit_code, 1);
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
