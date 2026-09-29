const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Client, Pool } = require('pg');
const { migrate } = require('../src/db/migrate');

const postgresTest = process.env.RUN_PACIENTES_TEMP_POSTGRES === '1' ? test : test.skip;
const bin = process.env.PACIENTES_POSTGRES_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '/usr/bin');
const executable = (name) => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const run = (name, args) => execFileSync(executable(name), args, { stdio: 'ignore', timeout: 60000 });

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function sqlFromRepository(method) {
  const source = fs.readFileSync(path.join(__dirname, '../src/repositories/pacientesRepository.js'), 'utf8');
  const match = source.match(new RegExp(`async function ${method}\\([\\s\\S]*?pool\\.query\\(\\s*\x60([\\s\\S]*?)\x60`));
  assert.ok(match, `No se encontró el SQL de ${method}`);
  assert.equal(match[1].includes('${'), false, 'La consulta debe permanecer estática');
  return match[1].replace(/\\\\/g, '\\');
}

function oldSql() {
  return fs.readFileSync(path.join(__dirname, 'fixtures/pacientesListadoBaseline.sql'), 'utf8')
    .replace(/^\uFEFF/, '');
}

// COUNT OLD del mismo checkpoint; el total también forma parte del contrato.
const OLD_COUNT_SQL = `SELECT COUNT(*) FROM pacientes
     WHERE nombres ILIKE $1 OR apellidos ILIKE $1
        OR no_expediente ILIKE $1 OR cui ILIKE $1`;

async function patient(db, key, {
  names = `Nombre${key}`, surnames = `Apellido${key}`,
  file = `SYN-${String(key).padStart(6, '0')}`,
  cui = String(3000000000000 + Number(key)), fallbackRisk = false,
} = {}) {
  const { rows } = await db.query(
    `INSERT INTO pacientes (no_expediente, cui, nombres, apellidos, tiene_ficha_riesgo)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [file, cui, names, surnames, fallbackRisk]
  );
  return rows[0].id;
}

async function pregnancy(db, patientId, number, state, risk = null) {
  const { rows } = await db.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio)
     VALUES ($1, $2, $3, '2025-01-01') RETURNING id`,
    [patientId, number, state]
  );
  if (risk !== null) {
    await db.query(
      `INSERT INTO fichas_riesgo_obstetrico
       (paciente_id, embarazo_id, fecha, muerte_fetal_neonatal_previa)
       VALUES ($1, $2, '2025-02-01', $3)`,
      [patientId, rows[0].id, risk]
    );
  }
  return rows[0].id;
}

async function response(db, listSql, countSql, { search = '', limit = 20, offset = 0 }) {
  // listarPacientes conserva la búsqueda libre como un único patrón para los cuatro campos.
  const q = `%${search}%`;
  const [data, count] = await Promise.all([
    db.query(listSql, [q, limit, offset]),
    db.query(countSql, [q]),
  ]);
  return { data: data.rows, total: Number(count.rows[0].count) };
}

postgresTest('listado conserva respuesta completa OLD/NEW en PostgreSQL temporal', {
  timeout: 120000,
}, async () => {
  // Nunca usa DATABASE_URL: este clúster y sus pacientes son nuevos y sintéticos.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-pacientes-test-'));
  const data = path.join(root, 'data');
  const port = await freePort();
  const config = { host: '127.0.0.1', port, user: 'pacientes_test', database: 'postgres' };
  let started = false;
  let db;
  try {
    run('initdb', ['-D', data, '-U', config.user, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    const migration = await migrate({ db: new Pool(config),
      logger: { log() {}, error() {} }, setExitCode() {} });
    assert.equal(migration.ok, true, migration.error?.message);
    db = new Client(config);
    await db.connect();

    for (let key = 1; key <= 80; key += 1) await patient(db, key);
    const riskPatient = await patient(db, 101, { names: 'Aaa', surnames: 'Riesgo' });
    const noPregnancy = await patient(db, 102, { names: 'Aab', surnames: 'Sin embarazo', fallbackRisk: true });
    const activePatient = await patient(db, 103, { names: 'Aac', surnames: 'Activa' });
    const puerperiumPatient = await patient(db, 104, { names: 'Aad', surnames: 'Puerperio' });
    const tie1 = await patient(db, 105, { names: 'Empate', surnames: 'Igual' });
    const tie2 = await patient(db, 106, { names: 'Empate', surnames: 'Igual' });
    await patient(db, 107, { names: 'Mariana', surnames: 'Paredes' });
    await patient(db, 108, { names: 'Otro', surnames: 'Paredes' });
    const exactFile = await patient(db, 109, { file: 'SYN-000123', names: 'Zeta', surnames: 'Exacta' });
    const containingFile = await patient(db, 110, { file: 'PRE-SYN-000123-POST', names: 'Zeta', surnames: 'Contiene' });
    await pregnancy(db, riskPatient, 1, 'activo', true);
    await pregnancy(db, activePatient, 1, 'activo', false);
    await pregnancy(db, activePatient, 2, 'cerrado', true);
    await pregnancy(db, puerperiumPatient, 1, 'puerperio', true);
    await pregnancy(db, puerperiumPatient, 2, 'cerrado', false);

    const current = sqlFromRepository('listar');
    const currentCount = sqlFromRepository('contar');
    const cases = [
      { name: 'primera página', limit: 10, offset: 0 },
      { name: 'OFFSET profundo', limit: 10, offset: 65 },
      { name: 'menos de LIMIT filas', limit: 20, offset: 85 },
      { name: 'empate dentro de página', limit: 15, offset: 0 },
      { name: 'empate en límite de página', limit: 5, offset: 0 },
      { name: 'página fuera de rango', limit: 10, offset: 200 },
      { name: 'búsqueda vacía', search: '', limit: 25, offset: 0 },
      { name: 'nombre parcial', search: 'Mari', limit: 10, offset: 0 },
      { name: 'apellido parcial', search: 'Pared', limit: 10, offset: 0 },
      { name: 'expediente parcial', search: '00012', limit: 10, offset: 0 },
      { name: 'expediente completo como búsqueda libre', search: 'SYN-000123', limit: 10, offset: 0 },
      { name: 'CUI', search: String(3000000000101), limit: 10, offset: 0 },
      { name: 'otros LIMIT/OFFSET', limit: 3, offset: 4 },
    ];
    for (const scenario of cases) {
      const oldResult = await response(db, oldSql(), OLD_COUNT_SQL, scenario);
      const newResult = await response(db, current, currentCount, scenario);
      assert.deepEqual(newResult, oldResult, scenario.name);
      if (scenario.name === 'página fuera de rango') {
        assert.deepEqual(oldResult.data, []);
        assert.equal(oldResult.total, 90);
      }
      if (scenario.name === 'expediente completo como búsqueda libre') {
        assert.deepEqual(oldResult.data.map((row) => row.id).sort((a, b) => a - b),
          [exactFile, containingFile].sort((a, b) => a - b));
        assert.equal(oldResult.total, 2);
      }
      if (scenario.name === 'empate dentro de página') {
        const ids = oldResult.data.map((row) => row.id);
        assert.ok(ids.includes(tie1) && ids.includes(tie2));
      }
      if (scenario.name === 'primera página') {
        const byId = (id) => oldResult.data.find((row) => row.id === id);
        assert.equal(byId(riskPatient).tiene_riesgo, true);
        assert.equal(byId(noPregnancy).embarazo_id, null);
        assert.equal(byId(noPregnancy).tiene_riesgo, true);
        assert.equal(byId(activePatient).embarazo_estado, 'activo');
        assert.equal(byId(activePatient).tiene_riesgo, false);
        assert.equal(byId(puerperiumPatient).embarazo_estado, 'puerperio');
        assert.equal(byId(puerperiumPatient).tiene_riesgo, true);
      }
    }
  } finally {
    if (db) await db.end().catch(() => {});
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    assert.ok(path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    assert.ok(path.basename(root).startsWith('cap-pacientes-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
