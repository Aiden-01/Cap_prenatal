const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client, Pool } = require('pg');
const { applyMigration, discoverMigrationFiles, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');

const filename = '021_integridad_paciente_embarazo.sql';
const sql = fs.readFileSync(path.join(__dirname, '../src/db/migrations', filename), 'utf8');
const tables = ['controles_prenatales', 'vacunas_paciente', 'controles_puerperio',
  'morbilidad_embarazo', 'planes_parto', 'fichas_riesgo_obstetrico'];
const enabled = process.env.RUN_POSTGRES_PATIENT_PREGNANCY === '1';
const pgTest = enabled ? test : test.skip;
const diagnosticSql = fs.readFileSync(path.join(__dirname,
  '../src/db/diagnostics/paciente_embarazo_mismatches.sql'), 'utf8');

test('schema y 021 comparten exactamente el bloque de integridad', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  assert.ok(schema.trimEnd().endsWith(sql.trimEnd()));
});

async function isolated(callback) {
  assert.equal(process.env.PATIENT_PREGNANCY_TEMP_CLUSTER, '1');
  const url = new URL(process.env.PATIENT_PREGNANCY_TEST_DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1');
  const name = `cap_pair_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const db = new Client({ connectionString: url.toString() });
  try {
    await db.connect();
    await callback(db, url.toString());
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

async function pre021(db) {
  const baseline = execFileSync('git', ['show',
    'a921871a403100a7fad086fc562c7f09a804969e:backend/src/db/schema.sql'],
  { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
  await db.query(baseline);
  for (const migration of discoverMigrationFiles().filter(m => m.filename < '021_')) {
    await applyMigration({ db, filename: migration.filename,
      sql: fs.readFileSync(migration.path, 'utf8') });
  }
}

async function fixtures(db) {
  await db.query(`INSERT INTO pacientes(id,no_expediente,nombres,apellidos)
    VALUES (10,'SYN10','Sintetica','A'),(20,'SYN20','Sintetica','B');
    INSERT INTO embarazos(id,paciente_id,numero_embarazo) VALUES(80,10,1),(90,20,1)`);
}

function insert(table, patient, pregnancy) {
  const extra = table === 'vacunas_paciente'
    ? ",tipo_vacuna,momento,fecha_dosis" : ',fecha';
  const values = table === 'vacunas_paciente'
    ? ",'influenza','previo_embarazo','2026-01-01'" : ",'2026-01-01'";
  const number = table === 'controles_prenatales' ? ',numero_control'
    : table === 'controles_puerperio' ? ',numero_atencion' : '';
  return `INSERT INTO ${table}(paciente_id,embarazo_id${extra}${number})
    VALUES(${patient},${pregnancy === null ? 'NULL' : pregnancy}${values}${number ? ',1' : ''}) RETURNING id`;
}

pgTest('pre-021 válida: seis tablas, nueve operaciones por tabla y cambio del padre', async t => {
  await isolated(async db => {
    await pre021(db);
    const inventory = await db.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename,indexname`, [[...tables, 'embarazos']]);
    t.diagnostic('Inventario pre-021: ' + JSON.stringify(inventory.rows));
    const columns = await db.query(`SELECT table_name,column_name,is_nullable
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name=ANY($1) AND column_name IN ('paciente_id','embarazo_id')`, [tables]);
    assert.equal(columns.rowCount, 12);
    assert.ok(columns.rows.every(r => r.is_nullable === (r.column_name === 'embarazo_id' ? 'YES' : 'NO')));
    const originalFks = await db.query(`SELECT conrelid::regclass::text AS tabla, conname,
      pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid::regclass::text=ANY($1) AND contype='f'
      AND confrelid IN ('embarazos'::regclass,'pacientes'::regclass)`, [tables]);
    assert.equal(originalFks.rowCount, 12);
    assert.ok(originalFks.rows.every(r => r.definition.endsWith('ON DELETE CASCADE')));
    t.diagnostic('FK pre-021: ' + JSON.stringify(originalFks.rows));
    await fixtures(db);
    await applyMigration({ db, filename, sql });
    await assertSchemaCompatible(db);
    assert.equal(await applyMigration({ db, filename, sql }), false);
    const constraints = await db.query(`SELECT conname, convalidated FROM pg_constraint
      WHERE conname LIKE '%_embarazo_paciente_fkey'`);
    assert.equal(constraints.rowCount, 6);
    assert.ok(constraints.rows.every(r => r.convalidated));
    for (const table of tables) {
      await t.test(table, async () => {
        const correct = await db.query(insert(table, 10, 80));
        const id = correct.rows[0].id;
        await assert.rejects(db.query(insert(table, 10, 90)),
          { code: '23503', constraint: table + '_embarazo_paciente_fkey' });
        await assert.rejects(db.query(insert(table, 10, 999)), { code: '23503' });
        await assert.rejects(db.query(insert(table, 999, 90)), { code: '23503' });
        await db.query(insert(table, 10, null));
        await assert.rejects(db.query(`UPDATE ${table} SET paciente_id=20 WHERE id=$1`, [id]), { code: '23503' });
        await assert.rejects(db.query(`UPDATE ${table} SET embarazo_id=90 WHERE id=$1`, [id]), { code: '23503' });
        await assert.rejects(db.query("UPDATE embarazos SET paciente_id=20,numero_embarazo=2,estado='cerrado' WHERE id=80"), { code: '23503' });
        await db.query('BEGIN');
        await db.query('DELETE FROM embarazos WHERE id=80');
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE embarazo_id=80`)).rowCount, 0);
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE embarazo_id IS NULL`)).rowCount, 1);
        await db.query('ROLLBACK');
        await db.query('BEGIN');
        await db.query('DELETE FROM pacientes WHERE id=10');
        assert.equal((await db.query(`SELECT * FROM ${table} WHERE paciente_id=10`)).rowCount, 0);
        await db.query('ROLLBACK');
        await db.query(`DELETE FROM ${table}`);
      });
    }
  });
});

pgTest('mismatch previo en cada tabla: 021 revierte DDL, registro y conserva filas', async t => {
  for (const table of tables) {
    await t.test(table, async () => isolated(async db => {
      await pre021(db);
      await fixtures(db);
      await db.query(insert(table, 10, 90));
      const counts = (await db.query(diagnosticSql)).rows;
      assert.equal(counts.length, 6);
      assert.ok(counts.every(r => Number(r.mismatches) === (r.tabla === table ? 1 : 0)));
      await assert.rejects(applyMigration({ db, filename, sql }), { code: '23503' });
      assert.equal((await db.query(`SELECT * FROM ${table} WHERE paciente_id=10 AND embarazo_id=90`)).rowCount, 1);
      assert.equal((await db.query('SELECT * FROM pacientes')).rowCount, 2);
      assert.equal((await db.query('SELECT * FROM embarazos')).rowCount, 2);
      assert.equal((await db.query('SELECT * FROM schema_migrations WHERE filename=$1', [filename])).rowCount, 0);
      assert.equal((await db.query(`SELECT * FROM pg_constraint WHERE conname='embarazos_id_paciente_key'
        OR conname LIKE '%_embarazo_paciente_fkey'`)).rowCount, 0);
    }));
  }
});

pgTest('instalación nueva: migrate completo y segunda ejecución compatibles', async () => {
  await isolated(async (db, url) => {
    for (let i = 0; i < 2; i++) {
      const result = await migrate({ db: new Pool({ connectionString: url }),
        logger: { log() {}, error() {} }, setExitCode() {} });
      assert.equal(result.ok, true, result.error?.message);
      await assertSchemaCompatible(db);
    }
    const constraints = await db.query(`SELECT convalidated FROM pg_constraint
      WHERE conname LIKE '%_embarazo_paciente_fkey'`);
    assert.equal(constraints.rowCount, 6);
    assert.ok(constraints.rows.every(r => r.convalidated));
  });
});
