const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Client, Pool } = require('pg');
const { migrate } = require('../src/db/migrate');
const { createReportesRepository } = require('../src/repositories/reportesRepository');

const postgresTest = process.env.RUN_CENSO_TEMP_POSTGRES === '1' ? test : test.skip;
const bin = process.env.CENSO_POSTGRES_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '/usr/bin');
const executable = (name) => path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const run = (name, args) => execFileSync(executable(name), args, { stdio: 'ignore', timeout: 60000 });
const oldSql = fs.readFileSync(path.join(__dirname, 'fixtures/censoPrimerControlBaseline.sql'), 'utf8');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function currentSql() {
  let captured;
  await createReportesRepository({
    async query(sql) { captured = sql; return { rows: [] }; },
  }).obtenerRowsCensoPrimerControl('2025-01-01', '2025-12-31');
  return captured;
}

async function addPatient(db, name, options = {}) {
  const { rows } = await db.query(`
    INSERT INTO pacientes (no_expediente, nombres, apellidos, fecha_nacimiento,
      comunidad, comunidad_id, fur, fpp, pueblo, gestas_previas, partos_vaginales, cesareas, abortos)
    VALUES ($1, $2, $3, '2000-01-01', $4, $5, '2024-09-01', '2025-06-01',
      'maya', 2, 1, 1, 1) RETURNING id`,
  [`SYN-CENSO-${name}`, name, options.surname || name, options.community || null,
    options.communityId || null]);
  return rows[0].id;
}

async function addPregnancy(db, patientId, number, state = 'activo', options = {}) {
  const { rows } = await db.query(`
    INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fur, fpp)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`,
  [patientId, number, state, options.fur === undefined ? '2025-01-01' : options.fur,
    options.fpp === undefined ? '2025-10-01' : options.fpp]);
  return rows[0].id;
}

async function addControl(db, patientId, pregnancyId, number, date, weeks = null) {
  await db.query(`INSERT INTO controles_prenatales
    (paciente_id, embarazo_id, numero_control, fecha, edad_gestacional_semanas)
    VALUES ($1, $2, $3, $4, $5)`, [patientId, pregnancyId, number, date, weeks]);
}

async function compare(db, newSql, name, dates) {
  const oldRows = (await db.query(oldSql, dates)).rows;
  const newRows = (await db.query(newSql, dates)).rows;
  assert.deepEqual(newRows, oldRows, `${name}: filas, campos y orden OLD/NEW`);
  return oldRows;
}

postgresTest('censo primer control conserva contrato OLD/NEW en PostgreSQL temporal', {
  timeout: 300000,
}, async () => {
  // Siempre crea su propio clúster: no lee DATABASE_URL ni toca datos externos.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-censo-test-'));
  const data = path.join(root, 'data');
  const port = await freePort();
  const config = { host: '127.0.0.1', port, user: 'censo_test', database: 'postgres' };
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
    const index = await db.query(`SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'ux_controles_embarazo_numero'`);
    assert.match(index.rows[0]?.indexdef || '', /UNIQUE INDEX.*\(embarazo_id, numero_control\)/);
    const community = await db.query(`INSERT INTO comunidades (nombre, territorio, sector, lat, lng)
      VALUES ('Catálogo sintético', 1, 'A', 16.8, -89.9) RETURNING id`);
    const communityId = community.rows[0].id;
    const p1 = await addPatient(db, 'Dentro', { communityId, community: 'Texto alterno' });
    const p2 = await addPatient(db, 'Fuera', { community: 'Legado' });
    const p3 = await addPatient(db, 'Inicio');
    const p4 = await addPatient(db, 'Fin');
    const p5 = await addPatient(db, 'Posterior');
    const p6 = await addPatient(db, 'Multi', { surname: 'A-Primera' });
    const p7 = await addPatient(db, 'SinEmbarazo');
    const p8 = await addPatient(db, 'Orden', { surname: 'A-Primera' });
    const p9 = await addPatient(db, 'Puerperio');
    const pregnancies = [];
    for (const p of [p1, p2, p3, p4, p5, p6, p8]) {
      pregnancies.push(await addPregnancy(db, p, 1, p === p2 ? 'cerrado' : 'activo'));
    }
    const secondPregnancy = await addPregnancy(db, p6, 2, 'cerrado');
    const fallbackPregnancy = await addPregnancy(db, p9, 1, 'puerperio', { fur: null, fpp: null });
    await addControl(db, p1, pregnancies[0], 1, '2025-06-15', 17);
    await addControl(db, p1, pregnancies[0], 2, '2025-06-22');
    await addControl(db, p2, pregnancies[1], 1, '2024-12-31');
    await addControl(db, p3, pregnancies[2], 1, '2025-01-01');
    await addControl(db, p4, pregnancies[3], 1, '2025-12-31');
    await addControl(db, p5, pregnancies[4], 1, '2024-12-31');
    await addControl(db, p5, pregnancies[4], 2, '2025-07-01');
    await addControl(db, p5, pregnancies[4], 3, '2025-08-01');
    await addControl(db, p6, pregnancies[5], 1, '2025-06-15');
    await addControl(db, p6, secondPregnancy, 1, '2025-06-15');
    await addControl(db, p8, pregnancies[6], 1, '2025-06-15');
    await addControl(db, p9, fallbackPregnancy, 1, '2025-09-01');
    await addControl(db, p7, null, 1, '2025-06-15');
    await addControl(db, p7, null, 1, '2025-06-16');
    await db.query(`INSERT INTO fichas_riesgo_obstetrico
      (paciente_id, embarazo_id, fecha, muerte_fetal_neonatal_previa)
      VALUES ($1, $2, '2025-06-15', TRUE)`, [p1, pregnancies[0]]);
    const newSql = await currentSql();
    const year = await compare(db, newSql, '2025', ['2025-01-01', '2025-12-31']);
    assert.equal(year.length, 7);
    assert.deepEqual(year.map((r) => [r.id, r.numero_embarazo]),
      [[p3, 1], [p6, 1], [p6, 2], [p8, 1], [p1, 1], [p9, 1], [p4, 1]]);
    assert.deepEqual(Object.keys(year[0]), [
      'id', 'numero_embarazo', 'estado_embarazo', 'no_expediente', 'cui',
      'nombre_completo', 'edad', 'etnia', 'comunidad', 'fur', 'fpp',
      'fecha_primer_control', 'semanas_gestacion', 'gestas', 'partos',
      'abortos', 'tiene_riesgo',
    ]);
    assert.equal(year.some((r) => r.id === p5 || r.id === p7), false);
    assert.equal(year.find((r) => r.id === p1).comunidad, 'Catálogo sintético');
    assert.equal(year.find((r) => r.id === p1).tiene_riesgo, true);
    assert.equal(year.find((r) => r.id === p1).no_expediente, 'SYN-CENSO-Dentro');
    assert.equal(year.find((r) => r.id === p1).semanas_gestacion, 17);
    assert.deepEqual([year.find((r) => r.id === p1).gestas,
      year.find((r) => r.id === p1).partos, year.find((r) => r.id === p1).abortos], [2, 2, 1]);
    const fallback = year.find((r) => r.id === p9);
    assert.equal(fallback.estado_embarazo, 'puerperio');
    assert.equal(fallback.fur.toISOString().slice(0, 10), '2024-09-01');
    assert.equal(fallback.fpp.toISOString().slice(0, 10), '2025-06-01');
    assert.equal(fallback.semanas_gestacion, 52);
    assert.equal(year.find((r) => r.id === p3).fecha_primer_control.toISOString().slice(0, 10), '2025-01-01');
    assert.equal(year.find((r) => r.id === p4).fecha_primer_control.toISOString().slice(0, 10), '2025-12-31');
    assert.equal(year.filter((r) => r.id === p6).length, 2);
    assert.equal(year.find((r) => r.id === p8).tiene_riesgo, false);
    await compare(db, newSql, 'inicio', ['2025-01-01', '2025-01-01']);
    await compare(db, newSql, 'fin', ['2025-12-31', '2025-12-31']);
    const broad = await compare(db, newSql, 'amplio', ['2024-01-01', '2026-12-31']);
    assert.equal(broad.find((r) => r.id === p2).estado_embarazo, 'cerrado');
    assert.equal(broad.find((r) => r.id === p2).comunidad, 'Legado');
    assert.equal((await compare(db, newSql, 'vacio', ['2030-01-01', '2030-01-31'])).length, 0);
    await assert.rejects(addControl(db, p1, pregnancies[0], 1, '2025-06-20'),
      (error) => error.code === '23505');
  } finally {
    if (db) await db.end().catch(() => {});
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    const safeRoot = path.resolve(root);
    assert.ok(safeRoot.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(safeRoot).startsWith('cap-censo-test-'));
    fs.rmSync(safeRoot, { recursive: true, force: true });
  }
});
