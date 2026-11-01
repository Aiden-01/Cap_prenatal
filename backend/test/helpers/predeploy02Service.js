// Adaptador opt-in de pruebas: nunca se importa desde código productivo.
const assert = require('node:assert/strict');
const path = require('node:path');
const { Pool } = require('pg');

const branch = 'refs/heads/feature/cpren-120-editor-pdf-notas-clinicas';
const control = 'cap_predeploy02_control';
const serviceConfig = Object.freeze({ host: '127.0.0.1', port: 55432,
  user: 'predeploy02', password: 'synthetic-predeploy02-only', database: control,
  ssl: false, connectionTimeoutMillis: 5000 });

function assertRunner(env = process.env, platform = process.platform) {
  assert.equal(platform, 'linux', 'PREDEPLOY-02 solo corre en Linux hospedado');
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_REPOSITORY, 'Aiden-01/Cap_prenatal');
  assert.equal(env.GITHUB_REF, branch);
  assert.equal(env.CAP_PREDEPLOY02_SERVICE, '1');
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
}

function evidenceDirectory(fallback, suffix = '') {
  if (process.env.CAP_PREDEPLOY02_SERVICE !== '1') return fallback;
  assertRunner();
  assert.ok(['', 'regression'].includes(suffix));
  return path.resolve(__dirname, '../../../tmp_predeploy02/evidence', suffix);
}

// La lista impide limpiar bases ajenas incluso si una prueba falla.
const children = Object.freeze({
  catalogos: ['catalogos_bootstrap'], perfiles: ['perfiles_bootstrap'],
  autoria: ['autoria_bootstrap'], notas: ['notas_bootstrap'],
  seguimiento: ['seguimiento_bootstrap', 'seguimiento_schema'],
  checkpoint10: ['checkpoint10_bootstrap'],
  checkpoint14: ['restored_before', 'fresh_final', 'restored_after'],
  auth: [],
});

function serviceFixture(suite, config) {
  if (process.env.CAP_PREDEPLOY02_SERVICE !== '1') return null;
  assertRunner();
  assert.ok(Object.hasOwn(children, suite));
  const database = `cap_predeploy02_${suite}`;
  Object.assign(config, serviceConfig, { database });
  const allowed = [database, ...children[suite]];
  let admin;
  let owned = false;
  async function verify(db) {
    const row = (await db.query(`SELECT current_database() db, current_user usr,
      current_setting('server_version_num')::int version,
      current_setting('cap.predeploy02', true) marker,
      current_setting('data_directory') directory`)).rows[0];
    assert.equal(row.db, db === admin ? control : database);
    assert.equal(row.usr, serviceConfig.user);
    assert.equal(row.version, 160015);
    if (db === admin) assert.equal(row.marker, 'synthetic-only');
    assert.equal(row.directory, '/var/lib/postgresql/data');
  }
  return {
    async start() {
      admin = new Pool(serviceConfig);
      await verify(admin);
      const existing = (await admin.query('SELECT datname FROM pg_database WHERE datname = ANY($1::text[])', [allowed])).rows;
      assert.equal(existing.length, 0, 'No se reutilizan bases existentes');
      await admin.query(`CREATE DATABASE "${database}"`);
      owned = true;
    },
    verify,
    async close() {
      try {
        if (owned) {
          await verify(admin);
          for (const name of allowed) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        }
      } finally { if (admin) await admin.end(); }
    },
  };
}

module.exports = { assertRunner, evidenceDirectory, serviceFixture, serviceConfig };
