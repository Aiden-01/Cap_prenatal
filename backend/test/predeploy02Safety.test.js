const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRunner, serviceFixture, serviceConfig } = require('./helpers/predeploy02Service');
const { assertNoPostgresSessions, runPostgresCleanup } = require('./helpers/postgresCleanup');

test('PREDEPLOY-02 rechaza destinos fuera del runner y de la rama clínica', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Aiden-01/Cap_prenatal',
    GITHUB_REF: 'refs/heads/feature/cpren-127-normalizacion-comunidades',
    CAP_PREDEPLOY02_SERVICE: '1', NODE_ENV: 'test', RUNNER_ENVIRONMENT: 'github-hosted' };
  assert.doesNotThrow(() => assertRunner(env, 'linux'));
  assert.doesNotThrow(() => assertRunner({ ...env, GITHUB_REF: 'refs/heads/feature/recuperacion-password' }, 'linux'));
  for (const key of Object.keys(env)) assert.throws(() => assertRunner({ ...env, [key]: 'invalid' }, 'linux'));
  assert.throws(() => assertRunner(env, 'win32'));
  assert.throws(() => assertRunner({ ...env, GITHUB_REF: 'refs/heads/main' }, 'linux'));
  assert.throws(() => assertRunner({ ...env, GITHUB_REF: 'refs/heads/feature/cpren-120-editor-pdf-notas-clinicas' }, 'linux'));
  assert.equal(serviceConfig.host, '127.0.0.1');
  assert.equal(serviceConfig.port, 55432);
  if (process.env.CAP_PREDEPLOY02_SERVICE !== '1') assert.equal(serviceFixture('notas', {}), null);
});

test('el control de cierre rechaza sesiones restantes antes de eliminar bases sintéticas', async () => {
  const databases = ['cap_predeploy02_checkpoint14', 'restored_before'];
  const control = {
    async query({ text, values }) {
      assert.match(text, /pid <> pg_backend_pid\(\)/);
      assert.match(text, /datname = ANY\(\$1\)/);
      assert.deepEqual(values, [databases]);
      return { rows: [{ sessions: 1 }] };
    },
  };
  await assert.rejects(assertNoPostgresSessions(control, databases), { code: 'POSTGRES_SESSIONS_REMAIN' });
});

test('un error de cierre se conserva y no interrumpe los pasos de limpieza restantes', async () => {
  const diagnostics = [];
  const context = { diagnostic: message => diagnostics.push(message) };
  const failure = Object.assign(new Error('sensitive synthetic details'), { code: 'ETIMEDOUT' });
  await assert.rejects(runPostgresCleanup(context, [
    ['close-pool', () => { throw failure; }],
    ['stop-temporary-server', () => {}],
  ]), { code: 'ETIMEDOUT' });
  assert.deepEqual(diagnostics, [
    'postgres-cleanup:close-pool', 'postgres-cleanup:close-pool:failed:ETIMEDOUT',
    'postgres-cleanup:stop-temporary-server', 'postgres-cleanup:stop-temporary-server:succeeded',
  ]);
});
