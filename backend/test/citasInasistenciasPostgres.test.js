const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Client, Pool } = require('pg');
const express = require('express');

const { applyMigration, checksum, discoverMigrationFiles, migrate } = require('../src/db/migrate');
const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const citasRepository = require('../src/repositories/citasPrenatalesRepository');

const enabled = process.env.RUN_POSTGRES_CITAS_INASISTENCIAS === '1';
const postgresTest = enabled ? test : test.skip;
const baseUrl = process.env.CITAS_INASISTENCIAS_TEST_DATABASE_URL;

function safeBaseUrl() {
  assert.equal(process.env.CITAS_INASISTENCIAS_TEMP_CLUSTER, '1');
  assert.ok(baseUrl);
  const url = new URL(baseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname));
  return url;
}

function dbUrl(name) {
  const url = safeBaseUrl();
  url.pathname = `/${name}`;
  return url.toString();
}

async function withDatabase(prefix, callback) {
  const name = `cap_${prefix}_${process.pid}_${Date.now()}`.slice(0, 60);
  assert.match(name, /^cap_[a-z0-9_]+$/);
  const admin = new Client({ connectionString: safeBaseUrl().toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  try {
    await callback(dbUrl(name), name);
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

async function installCurrent(url) {
  const result = await migrate({
    db: new Pool({ connectionString: url }),
    logger: { log() {}, error() {} },
    setExitCode() {},
  });
  assert.equal(result.ok, true, result.error?.message);
}

async function installPre017(url) {
  const db = new Client({ connectionString: url });
  await db.connect();
  const oldSchema = execFileSync('git', [
    'show',
    '7f80554d85d79945502248efa7b122b6d1d54578^:backend/src/db/schema.sql',
  ], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
  });
  await db.query(oldSchema);
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const migration of discoverMigrationFiles().filter(({ filename }) => filename < '017_')) {
    const sql = fs.readFileSync(migration.path, 'utf8');
    await applyMigration({ db, filename: migration.filename, sql });
  }
  return db;
}

async function actor(db, suffix) {
  const role = await db.query(
    `INSERT INTO roles (nombre, descripcion) VALUES ($1, 'prueba') RETURNING id`,
    [`rol_${suffix}`]
  );
  const user = await db.query(
    `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
     VALUES ('Operador', $1, 'hash', $2) RETURNING id`,
    [`user_${suffix}`, role.rows[0].id]
  );
  return user.rows[0].id;
}

async function pregnancy(db, userId, suffix) {
  const patient = await db.query(
    `INSERT INTO pacientes (no_expediente, nombres, apellidos, registrado_por)
     VALUES ($1, 'Paciente', $2, $3) RETURNING id`,
    [`EXP-${suffix}`, suffix, userId]
  );
  const result = await db.query(
    `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio, registrado_por)
     VALUES ($1, 1, 'activo', '2025-01-01', $2) RETURNING id`,
    [patient.rows[0].id, userId]
  );
  return { patientId: patient.rows[0].id, pregnancyId: result.rows[0].id };
}

async function control(db, ids, number, date, userId) {
  const result = await db.query(
    `INSERT INTO controles_prenatales
       (paciente_id, embarazo_id, numero_control, fecha, registrado_por, updated_by)
     VALUES ($1, $2, $3, $4::date, $5, $5) RETURNING id`,
    [ids.patientId, ids.pregnancyId, number, date, userId]
  );
  return result.rows[0].id;
}

async function appointment(db, ids, originId, date, state = 'programada', fulfillmentId = null) {
  const result = await db.query(
    `INSERT INTO citas_prenatales
       (embarazo_id, fecha_programada, estado, control_origen_id, control_cumplimiento_id)
     VALUES ($1, $2::date, $3, $4, $5) RETURNING id`,
    [ids.pregnancyId, date, state, originId, fulfillmentId]
  );
  return result.rows[0].id;
}

async function apply017(db) {
  const filename = '017_citas_inasistencias.sql';
  const migrationPath = path.join(__dirname, '../src/db/migrations', filename);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  return applyMigration({ db, filename, sql });
}

postgresTest('017 aplica limpia, es idempotente y schemaCompatibility acepta el resultado', async () => {
  await withDatabase('clean017', async (url) => {
    await installCurrent(url);
    const db = new Pool({ connectionString: url });
    await assertSchemaCompatible(db);
    const rows = await db.query('SELECT filename FROM schema_migrations ORDER BY filename');
    assert.equal(rows.rows.at(-1).filename, '017_citas_inasistencias.sql');
    const second = await migrate({ db, logger: { log() {}, error() {} }, setExitCode() {} });
    assert.equal(second.ok, true);
  });
});

postgresTest('017 ejecuta backfill A-F sobre estructura 016', async () => {
  await withDatabase('backfillaf', async (url) => {
    const db = await installPre017(url);
    try {
      const userId = await actor(db, 'af');
      const expected = {};
      for (const key of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const ids = await pregnancy(db, userId, key);
        const origin = await control(db, ids, 1, '2025-01-01', userId);
        if (key === 'B') expected.Bcontrol = await control(db, ids, 2, '2025-02-02', userId);
        if (key === 'C') await control(db, ids, 2, '2025-02-10', userId);
        if (key === 'F') {
          const fulfillment = await control(db, ids, 2, '2025-02-06', userId);
          expected[key] = await appointment(db, ids, origin, '2025-02-06', 'atendida', fulfillment);
        } else {
          const states = { D: 'reprogramada', E: 'cancelada' };
          expected[key] = await appointment(db, ids, origin, `2025-02-0${'ABCDEF'.indexOf(key) + 1}`, states[key]);
        }
      }
      await apply017(db);
      const result = await db.query(
        `SELECT id::text, estado, control_cumplimiento_id::text FROM citas_prenatales ORDER BY id`
      );
      const byId = new Map(result.rows.map((row) => [row.id, row]));
      assert.equal(byId.get(String(expected.A)).estado, 'inasistente');
      assert.deepEqual(byId.get(String(expected.B)), {
        id: String(expected.B), estado: 'atendida', control_cumplimiento_id: String(expected.Bcontrol),
      });
      assert.equal(byId.get(String(expected.C)).estado, 'inasistente');
      assert.equal(byId.get(String(expected.D)).estado, 'reprogramada');
      assert.equal(byId.get(String(expected.E)).estado, 'cancelada');
      assert.equal(byId.get(String(expected.F)).estado, 'atendida');
    } finally { await db.end(); }
  });
});

for (const scenario of ['G', 'H']) {
  postgresTest(`017 falla de forma segura en backfill ${scenario}`, async () => {
    await withDatabase(`backfill${scenario.toLowerCase()}`, async (url) => {
      const db = await installPre017(url);
      try {
        const userId = await actor(db, scenario.toLowerCase());
        const ids = await pregnancy(db, userId, scenario);
        const origin = await control(db, ids, 1, '2025-01-01', userId);
        const target = await appointment(db, ids, origin, '2025-03-01');
        const matching = await control(db, ids, 2, '2025-03-01', userId);
        if (scenario === 'G') {
          await control(db, ids, 3, '2025-03-01', userId);
        } else {
          const otherOrigin = await control(db, ids, 3, '2025-01-02', userId);
          await appointment(db, ids, otherOrigin, '2025-02-01', 'atendida', matching);
        }
        await assert.rejects(apply017(db), /ambiguos|ya cumple otra cita/);
        const row = await db.query('SELECT estado FROM citas_prenatales WHERE id = $1', [target]);
        assert.equal(row.rows[0].estado, 'programada');
        const column = await db.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_name='citas_prenatales' AND column_name='seguimiento_inasistencia_desde_id'`
        );
        assert.equal(column.rowCount, 0);
      } finally { await db.end(); }
    });
  });
}

postgresTest('constraints nuevas de 017 se aplican con inserts y updates reales', async () => {
  await withDatabase('constraints017', async (url) => {
    await installCurrent(url);
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      const userId = await actor(db, 'constraints');
      const first = await pregnancy(db, userId, 'C1');
      const second = await pregnancy(db, userId, 'C2');
      const origin1 = await control(db, first, 1, '2025-01-01', userId);
      const origin2 = await control(db, second, 1, '2025-01-01', userId);
      const missed = await appointment(db, first, origin1, '2025-02-01', 'inasistente');
      const missed2 = await appointment(db, second, origin2, '2025-02-01', 'inasistente');
      const child = await db.query(
        `INSERT INTO citas_prenatales
          (embarazo_id, fecha_programada, estado, control_origen_id, seguimiento_inasistencia_desde_id)
         VALUES ($1,'2025-02-10','programada',$2,$3) RETURNING id`,
        [first.pregnancyId, origin1, missed]
      );
      await assert.rejects(db.query(
        `UPDATE citas_prenatales SET seguimiento_inasistencia_desde_id=id WHERE id=$1`, [child.rows[0].id]
      ), (error) => error.code === '23514');
      await assert.rejects(db.query(
        `UPDATE citas_prenatales SET reprogramada_desde_id=$1 WHERE id=$2`, [missed, child.rows[0].id]
      ), (error) => error.code === '23514');
      await assert.rejects(db.query(
        `UPDATE citas_prenatales SET seguimiento_inasistencia_desde_id=$1 WHERE id=$2`, [missed2, child.rows[0].id]
      ), (error) => error.code === '23503');
      await assert.rejects(db.query(
        `INSERT INTO citas_prenatales
          (embarazo_id,fecha_programada,estado,control_origen_id,seguimiento_inasistencia_desde_id)
         VALUES ($1,'2025-02-11','cancelada',$2,$3)`, [first.pregnancyId, origin1, missed]
      ), (error) => error.code === '23505');
      await assert.rejects(db.query(
        `INSERT INTO citas_prenatales (embarazo_id,fecha_programada,estado,control_origen_id)
         VALUES ($1,'2025-02-12','desconocida',$2)`, [second.pregnancyId, origin2]
      ), (error) => error.code === '23514');
      const indexes = await db.query(
        `SELECT indexname,indexdef FROM pg_indexes WHERE tablename='citas_prenatales'
         AND indexname IN ('ux_citas_control_origen_raiz','ux_citas_programada_embarazo') ORDER BY indexname`
      );
      assert.match(indexes.rows[0].indexdef, /seguimiento_inasistencia_desde_id IS NULL/);
      assert.match(indexes.rows[1].indexdef, /estado.*programada/);
    } finally { await db.end(); }
  });
});

postgresTest('advisory lock real excluye otra instancia y la materializacion es idempotente', async () => {
  await withDatabase('locking017', async (url) => {
    await installCurrent(url);
    process.env.DB_HOST = new URL(url).hostname;
    process.env.DB_PORT = new URL(url).port;
    process.env.DB_NAME = new URL(url).pathname.slice(1);
    process.env.DB_USER = 'postgres';
    process.env.DB_PASSWORD = 'temporal-only';
    process.env.DB_SSL = 'false';
    const poolPath = require.resolve('../src/db/pool');
    delete require.cache[poolPath];
    for (const modulePath of ['../src/repositories/citasPrenatalesRepository', '../src/services/citasInasistenciasService']) {
      delete require.cache[require.resolve(modulePath)];
    }
    const repository = require('../src/repositories/citasPrenatalesRepository');
    const service = require('../src/services/citasInasistenciasService');
    const db = new Client({ connectionString: url });
    await db.connect();
    const userId = await actor(db, 'lock');
    const ids = await pregnancy(db, userId, 'LOCK');
    const origin = await control(db, ids, 1, '2025-01-01', userId);
    const citaId = await appointment(db, ids, origin, '2025-02-01');
    const blocker = new Client({ connectionString: url });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(701202601)');
    const omitted = await service.materializarGlobal({ fechaOperativa: '2025-02-02' });
    assert.equal(omitted.omitido_por_bloqueo, true);
    await blocker.query('ROLLBACK');
    await blocker.end();
    const { createAutomatizacionesController } = require('../src/controllers/automatizacionesController');
    const { createAutomatizacionesRouter } = require('../src/routes/automatizaciones');
    const { errorHandler } = require('../src/middleware/errorHandler');
    const key = 'temporary_Automation_Key_0123456789abcdef';
    const app = express();
    app.use('/api/automatizaciones', createAutomatizacionesRouter({
      config: {
        active: true, enabled: true, allowedCidrs: ['127.0.0.1/32'],
        currentHash: crypto.createHash('sha256').update(key).digest('hex'), nextHash: '',
        rateLimitMax: 100, rateLimitWindowMs: 900000, startOffsetDays: 1,
        timezone: 'America/Guatemala', windowDays: 1,
      },
      controllers: createAutomatizacionesController({ appointmentsService: service }),
      resolveOrigin: () => '127.0.0.1',
    }));
    app.use(errorHandler);
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const endpoint = `http://127.0.0.1:${server.address().port}/api/automatizaciones/v1/inasistencias/materializar`;
    const denied = await fetch(endpoint, { method: 'POST' });
    assert.equal(denied.status, 401);
    const firstResponse = await fetch(endpoint, {
      method: 'POST', headers: { 'X-CAP-Automation-Key': key },
    });
    assert.equal(firstResponse.status, 200);
    assert.equal((await firstResponse.json()).total_procesado, 1);
    const secondResponse = await fetch(endpoint, {
      method: 'POST', headers: { 'X-CAP-Automation-Key': key },
    });
    assert.equal(secondResponse.status, 200);
    assert.equal((await secondResponse.json()).total_procesado, 0);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const row = await db.query('SELECT estado FROM citas_prenatales WHERE id=$1', [citaId]);
    assert.equal(row.rows[0].estado, 'inasistente');
    await db.end();
    await repository.enTransaccion(async () => {});
    await require('../src/db/pool').end();
  });
});

postgresTest('dos reconciliaciones concurrentes producen un solo cumplimiento y rollback atomico', async () => {
  await withDatabase('reconcile017', async (url) => {
    await installCurrent(url);
    const setup = new Client({ connectionString: url });
    await setup.connect();
    const userId = await actor(setup, 'reconcile');
    const ids = await pregnancy(setup, userId, 'RECON');
    const origin = await control(setup, ids, 1, '2025-01-01', userId);
    const firstControl = await control(setup, ids, 2, '2025-02-01', userId);
    const secondControl = await control(setup, ids, 3, '2025-02-01', userId);
    const citaId = await appointment(setup, ids, origin, '2025-02-01', 'inasistente');
    const reconcile = async (controlId) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE citas_prenatales SET estado='atendida', control_cumplimiento_id=$2
           WHERE id=$1 AND estado='inasistente' AND control_cumplimiento_id IS NULL RETURNING id`,
          [citaId, controlId]
        );
        await client.query('COMMIT');
        return result.rowCount;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { await client.end(); }
    };
    const results = await Promise.all([reconcile(firstControl), reconcile(secondControl)]);
    assert.equal(results.reduce((sum, value) => sum + value, 0), 1);
    const stored = await setup.query(
      'SELECT estado,control_cumplimiento_id FROM citas_prenatales WHERE id=$1', [citaId]
    );
    assert.equal(stored.rows[0].estado, 'atendida');
    assert.ok([firstControl, secondControl].includes(stored.rows[0].control_cumplimiento_id));

    const rollbackIds = await pregnancy(setup, userId, 'ROLLBACK');
    const rollbackOrigin = await control(setup, rollbackIds, 1, '2025-01-01', userId);
    const rollbackCita = await appointment(setup, rollbackIds, rollbackOrigin, '2025-02-01');
    await setup.query(`CREATE FUNCTION fail_cita_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entidad_afectada='cita_prenatal' THEN RAISE EXCEPTION 'audit failure'; END IF;
      RETURN NEW; END $$`);
    await setup.query(`CREATE TRIGGER fail_cita_audit BEFORE INSERT ON auditoria_eventos
      FOR EACH ROW EXECUTE FUNCTION fail_cita_audit()`);
    process.env.DB_HOST = new URL(url).hostname;
    process.env.DB_PORT = new URL(url).port;
    process.env.DB_NAME = new URL(url).pathname.slice(1);
    process.env.DB_USER = 'postgres'; process.env.DB_PASSWORD = 'temporary'; process.env.DB_SSL = 'false';
    for (const modulePath of ['../src/db/pool', '../src/repositories/citasPrenatalesRepository',
      '../src/repositories/auditRepository', '../src/services/auditService',
      '../src/services/citasInasistenciasService']) delete require.cache[require.resolve(modulePath)];
    const service = require('../src/services/citasInasistenciasService');
    await assert.rejects(service.materializarGlobal({ fechaOperativa: '2025-02-02' }), /audit failure/);
    const rolledBack = await setup.query('SELECT estado FROM citas_prenatales WHERE id=$1', [rollbackCita]);
    assert.equal(rolledBack.rows[0].estado, 'programada');
    await require('../src/db/pool').end();
    await setup.end();
  });
});

postgresTest('la fecha operativa Guatemala es estable entre TZ y no vence la cita del dia', async () => {
  await withDatabase('timezone017', async (url) => {
    await installCurrent(url);
    const db = new Client({ connectionString: url });
    await db.connect();
    const guatemalaToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const userId = await actor(db, 'timezone');
    const ids = await pregnancy(db, userId, 'TZ');
    const origin = await control(db, ids, 1, '2025-01-01', userId);
    const citaId = await appointment(db, ids, origin, guatemalaToday);
    const target = new URL(url);
    const script = [
      "const service=require('./src/services/citasInasistenciasService')",
      "const pool=require('./src/db/pool')",
      "service.materializarGlobal().then(r=>console.log(JSON.stringify(r))).finally(()=>pool.end())",
    ].join(';');
    for (const timezone of ['UTC', 'America/Guatemala', 'Asia/Tokyo']) {
      const output = execFileSync(process.execPath, ['-e', script], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
        env: {
          ...process.env, TZ: timezone, DB_HOST: target.hostname, DB_PORT: target.port,
          DB_NAME: target.pathname.slice(1), DB_USER: 'postgres', DB_PASSWORD: 'temporary',
          DB_SSL: 'false',
        },
      });
      const result = JSON.parse(output.trim().split(/\r?\n/).at(-1));
      assert.equal(result.total_procesado, 0, timezone);
    }
    const stored = await db.query('SELECT estado FROM citas_prenatales WHERE id=$1', [citaId]);
    assert.equal(stored.rows[0].estado, 'programada');
    await db.end();
  });
});

postgresTest('calendario calcula seguimiento pendiente y derivado con semantica real', async () => {
  await withDatabase('calendarfollowup', async (url) => {
    await installCurrent(url);
    const db = new Client({ connectionString: url });
    await db.connect();
    try {
      const userId = await actor(db, 'calendar_followup');
      const rowsByKey = {};
      for (const key of ['pending', 'derived', 'control', 'closed', 'rescheduled']) {
        const ids = await pregnancy(db, userId, `CAL-${key}`);
        if (key === 'closed') {
          await db.query("UPDATE embarazos SET estado='cerrado' WHERE id=$1", [ids.pregnancyId]);
        }
        const origin = await control(db, ids, 1, '2025-01-01', userId);
        const state = key === 'rescheduled' ? 'reprogramada' : 'inasistente';
        const root = await appointment(db, ids, origin, '2025-02-01', state);
        if (key === 'derived') {
          await db.query(
            `INSERT INTO citas_prenatales
              (embarazo_id,fecha_programada,estado,control_origen_id,seguimiento_inasistencia_desde_id)
             VALUES ($1,'2025-02-10','programada',$2,$3)`,
            [ids.pregnancyId, origin, root]
          );
        }
        if (key === 'control') await control(db, ids, 2, '2025-02-05', userId);
        if (key === 'rescheduled') {
          await db.query(
            `INSERT INTO citas_prenatales
              (embarazo_id,fecha_programada,estado,control_origen_id,reprogramada_desde_id)
             VALUES ($1,'2025-02-12','programada',$2,$3)`,
            [ids.pregnancyId, origin, root]
          );
        }
        rowsByKey[key] = String(root);
      }
      const rows = await citasRepository.listarCalendarioPorRango({
        desde: '2025-02-01', hasta: '2025-02-28',
      }, db);
      const byId = new Map(rows.map((row) => [row.id, row]));
      assert.equal(byId.get(rowsByKey.pending).follow_up_pending, true);
      assert.equal(byId.get(rowsByKey.pending).follow_up_date, null);
      assert.equal(byId.get(rowsByKey.derived).follow_up_pending, false);
      assert.equal(byId.get(rowsByKey.derived).follow_up_date, '2025-02-10');
      assert.equal(byId.get(rowsByKey.control).follow_up_pending, false);
      assert.equal(byId.get(rowsByKey.control).follow_up_date, null);
      assert.equal(byId.get(rowsByKey.closed).follow_up_pending, false);
      assert.equal(byId.get(rowsByKey.rescheduled).follow_up_pending, false);
      assert.equal(byId.get(rowsByKey.rescheduled).follow_up_date, null);
      assert.equal(byId.get(rowsByKey.rescheduled).rescheduled_to, '2025-02-12');
    } finally { await db.end(); }
  });
});
