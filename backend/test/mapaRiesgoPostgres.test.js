const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Client, Pool } = require('pg');
const { migrate } = require('../src/db/migrate');

const enabled = process.env.RUN_MAPA_TEMP_POSTGRES === '1';
const postgresTest = enabled ? test : test.skip;
const bin = process.env.MAPA_POSTGRES_BIN || (process.platform === 'win32'
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

function baselineSql() {
  return fs.readFileSync(path.join(__dirname, 'fixtures/mapaRiesgoBaseline.sql'), 'utf8')
    .replace(/^\uFEFF/, '');
}

function currentSql() {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/mapa.js'), 'utf8');
  const match = source.match(/pool\.query\(`([\s\S]*?)`\)/);
  assert.ok(match, 'No se encontró el SQL de GET /mapa/riesgo');
  // La consulta del repositorio es un template literal estático, sin ${...}.
  assert.equal(match[1].includes('${'), false);
  return match[1].replace(/\\\\/g, '\\');
}

async function community(db, name, { active = true } = {}) {
  const { rows } = await db.query(
    `INSERT INTO comunidades (nombre, territorio, sector, lat, lng, activo)
     VALUES ($1, 4, 'B', 16.5, -89.5, $2) RETURNING id`, [name, active]
  );
  return rows[0].id;
}

async function patient(db, key, {
  communityId = null, communityText = null, municipality = 'El Chal',
  pregnancyState = 'activo', risk = true,
} = {}) {
  const { rows } = await db.query(
    `INSERT INTO pacientes (no_expediente, nombres, apellidos, municipio, comunidad, comunidad_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [`SYN-MAPA-${key}`, `Nombre${key}`, `Apellido${key}`, municipality, communityText, communityId]
  );
  const id = rows[0].id;
  const pregnancy = await db.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio)
     VALUES ($1, 1, $2, '2025-01-01') RETURNING id`, [id, pregnancyState]
  );
  if (risk !== null) {
    await db.query(
      `INSERT INTO fichas_riesgo_obstetrico
       (paciente_id, embarazo_id, fecha, muerte_fetal_neonatal_previa)
       VALUES ($1, $2, '2025-02-01', $3)`, [id, pregnancy.rows[0].id, risk]
    );
  }
  return { id, pregnancyId: pregnancy.rows[0].id };
}

function byName(rows, name) {
  const row = rows.find((item) => item.nombre === name);
  assert.ok(row, `Falta comunidad ${name}`);
  return row;
}

function patientIds(row) {
  return row.pacientes_riesgo.map((item) => item.paciente_id);
}

postgresTest('mapa actual caracteriza asignaciones y conserva igualdad OLD/NEW en PostgreSQL real', {
  timeout: 120000,
}, async () => {
  // No acepta DATABASE_URL: siempre crea un clúster vacío en un directorio temporal.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-mapa-test-'));
  const data = path.join(root, 'data');
  const port = await freePort();
  const config = { host: '127.0.0.1', port, user: 'mapa_test', database: 'postgres' };
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
    db = new Client(config); await db.connect();

    const ids = {
      direct: await community(db, 'CP43 Directa'),
      legacy: await community(db, 'CP43 Legacy'),
      aliasA: await community(db, 'CP43 Alias Uno'),
      aliasB: await community(db, 'CP43 Alias Dos'),
      empty: await community(db, 'CP43 Vacia'),
      inactiveWithRisk: await community(db, 'CP43 Inactiva Con Riesgo', { active: false }),
      inactiveEmpty: await community(db, 'CP43 Inactiva Vacia', { active: false }),
      accented: await community(db, 'CP43 álamos'),
    };
    await db.query(`INSERT INTO comunidades_aliases (comunidad_id, alias) VALUES
      ($1, 'Coincide'), ($1, 'Coincide '), ($1, 'Parcial'), ($2, 'Coincide')`,
    [ids.aliasA, ids.aliasB]);

    const direct = await patient(db, 'DIRECTO', { communityId: ids.direct, communityText: 'Coincide' });
    const direct2 = await patient(db, 'DIRECTO2', { communityId: ids.direct, communityText: null });
    await patient(db, 'DIRECTO-SIN-RIESGO', { communityId: ids.direct, risk: false });
    await patient(db, 'DIRECTO-SIN-FICHA', { communityId: ids.direct, risk: null });
    await patient(db, 'DIRECTO-CERRADO', { communityId: ids.direct, pregnancyState: 'cerrado' });
    await patient(db, 'FUERA', { communityId: ids.direct, municipality: 'Otro municipio' });
    const exact = await patient(db, 'EXACTO', { communityText: ' cp43 legacy ' });
    const alias = await patient(db, 'ALIAS', { communityText: 'Coincide' });
    const partial = await patient(db, 'PARCIAL', { communityText: 'Zona Parcial Sur' });
    const ambiguous = await patient(db, 'AMBIGUO', { communityText: 'Zona Coincide Parcial' });
    await patient(db, 'SIN-TEXTO', { communityText: '   ' });
    await patient(db, 'FUERA-LEGACY', { communityText: 'Coincide', municipality: 'Otro municipio' });
    const inactive = await patient(db, 'INACTIVA', { communityId: ids.inactiveWithRisk });
    const accented = await patient(db, 'ACENTO', { communityText: 'cp43 alamos' });

    const oldRows = (await db.query(baselineSql())).rows;
    const newRows = (await db.query(currentSql())).rows;
    assert.deepEqual(newRows, oldRows, 'Comparación completa de todos los campos y JSON por comunidad');
    const directRow = byName(oldRows, 'CP43 Directa');
    assert.equal(directRow.total_riesgo, 2);
    assert.deepEqual(patientIds(directRow).sort((a,b)=>a-b), [direct.id, direct2.id].sort((a,b)=>a-b));
    assert.equal(directRow.pacientes_riesgo[0].expediente.startsWith('SYN-MAPA-'), true);
    assert.ok(directRow.pacientes_riesgo.every((item) => item.embarazo_id));
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 Legacy')), [exact.id]);
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 Alias Uno')).sort((a,b)=>a-b),
      [alias.id, partial.id, ambiguous.id].sort((a,b)=>a-b));
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 Alias Dos')).sort((a,b)=>a-b),
      [alias.id, ambiguous.id].sort((a,b)=>a-b));
    assert.equal(byName(oldRows, 'CP43 Alias Uno').total_riesgo, 3);
    assert.equal(byName(oldRows, 'CP43 Alias Dos').total_riesgo, 2);
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 Vacia')), []);
    assert.equal(byName(oldRows, 'CP43 Vacia').total_riesgo, 0);
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 Inactiva Con Riesgo')), [inactive.id]);
    assert.equal(oldRows.some((row) => row.nombre === 'CP43 Inactiva Vacia'), false);
    assert.deepEqual(patientIds(byName(oldRows, 'CP43 álamos')), [accented.id]);
    assert.equal(oldRows.length, 48); // 41 del catálogo + 8 nuevas - 1 inactiva vacía
  } finally {
    if (db) await db.end().catch(() => {});
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    assert.ok(path.basename(root).startsWith('cap-mapa-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
