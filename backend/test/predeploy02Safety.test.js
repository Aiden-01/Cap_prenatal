const test = require('node:test');
const assert = require('node:assert/strict');
const { assertRunner, serviceFixture, serviceConfig } = require('./helpers/predeploy02Service');

test('PREDEPLOY-02 rechaza destinos fuera del runner y de la rama clínica', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'Aiden-01/Cap_prenatal',
    GITHUB_REF: 'refs/heads/feature/cpren-120-editor-pdf-notas-clinicas',
    CAP_PREDEPLOY02_SERVICE: '1', NODE_ENV: 'test', RUNNER_ENVIRONMENT: 'github-hosted' };
  assert.doesNotThrow(() => assertRunner(env, 'linux'));
  for (const key of Object.keys(env)) assert.throws(() => assertRunner({ ...env, [key]: 'invalid' }, 'linux'));
  assert.throws(() => assertRunner(env, 'win32'));
  assert.throws(() => assertRunner({ ...env, GITHUB_REF: 'refs/heads/main' }, 'linux'));
  assert.equal(serviceConfig.host, '127.0.0.1');
  assert.equal(serviceConfig.port, 55432);
  if (process.env.CAP_PREDEPLOY02_SERVICE !== '1') assert.equal(serviceFixture('notas', {}), null);
});
