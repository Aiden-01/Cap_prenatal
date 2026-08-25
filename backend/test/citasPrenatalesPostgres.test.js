const assert = require('node:assert/strict');
const test = require('node:test');
const { Client, Pool } = require('pg');

const { assertSchemaCompatible } = require('../src/db/schemaCompatibility');
const { migrate } = require('../src/db/migrate');

const integrationEnabled = process.env.RUN_POSTGRES_CITAS === '1';
const postgresTest = integrationEnabled ? test : test.skip;

function assertTemporaryClusterTarget(connectionString) {
  assert.equal(
    process.env.CITAS_TEMP_CLUSTER,
    '1',
    'La prueba exige confirmacion explicita de cluster PostgreSQL temporal'
  );
  const url = new URL(connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname),
    'El cluster temporal debe estar en loopback'
  );
  return url;
}

function quoteDatabase(databaseName) {
  assert.match(databaseName, /^cap_citas_[a-z0-9_]{1,48}$/);
  return `"${databaseName}"`;
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function expectPgCode(operation, code) {
  await assert.rejects(operation, (error) => error.code === code);
}

postgresTest('014 protege invariantes de citas en PostgreSQL temporal', async (t) => {
  const connectionString = process.env.CITAS_TEST_DATABASE_URL;
  assert.ok(connectionString, 'Falta CITAS_TEST_DATABASE_URL');
  const baseUrl = assertTemporaryClusterTarget(connectionString);
  const databaseName = `cap_citas_${process.pid}_${Date.now()}`.slice(0, 58);
  const admin = new Client({
    connectionString: baseUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteDatabase(databaseName)}`);

  try {
    const url = databaseUrl(baseUrl, databaseName);
    const migration = await migrate({
      db: new Pool({ connectionString: url, connectionTimeoutMillis: 5000 }),
      logger: { log() {}, error() {} },
      setExitCode() {},
    });
    assert.equal(migration.ok, true);

    const db = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await db.connect();
    try {
      await assertSchemaCompatible(db);
      const migrationRows = await db.query(
        `SELECT COUNT(*)::integer AS total
         FROM schema_migrations
         WHERE filename = '014_citas_prenatales.sql'`
      );
      assert.equal(migrationRows.rows[0].total, 1);

      const role = await db.query(
        `INSERT INTO roles (nombre, descripcion)
         VALUES ('citas_pruebas', 'Rol sintetico de prueba')
         RETURNING id`
      );
      const user = await db.query(
        `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
         VALUES ('Operador Sintetico', 'citas.sintetico', 'hash-sintetico', $1)
         RETURNING id`,
        [role.rows[0].id]
      );
      const patients = await db.query(
        `INSERT INTO pacientes (no_expediente, nombres, apellidos, registrado_por)
         VALUES
           ('CITAS-SYN-01', 'Paciente', 'Sintetica Uno', $1),
           ('CITAS-SYN-02', 'Paciente', 'Sintetica Dos', $1)
         RETURNING id`,
        [user.rows[0].id]
      );
      const pregnancies = await db.query(
        `INSERT INTO embarazos (
           paciente_id, numero_embarazo, estado, fecha_inicio, registrado_por
         ) VALUES
           ($1, 1, 'activo', '2026-01-01', $3),
           ($2, 1, 'activo', '2026-01-01', $3)
         RETURNING id, paciente_id`,
        [patients.rows[0].id, patients.rows[1].id, user.rows[0].id]
      );
      const firstPregnancy = pregnancies.rows[0].id;
      const secondPregnancy = pregnancies.rows[1].id;
      const controls = await db.query(
        `INSERT INTO controles_prenatales (
           paciente_id, embarazo_id, numero_control, fecha, cita_siguiente,
           registrado_por, updated_by
         ) VALUES
           ($1, $3, 1, '2026-06-01', '2026-06-15', $5, $5),
           ($1, $3, 2, '2026-06-15', '2026-07-01', $5, $5),
           ($1, $3, 3, '2026-07-01', '2026-07-15', $5, $5),
           ($1, $3, 4, '2026-07-15', '2026-08-01', $5, $5),
           ($2, $4, 1, '2026-06-01', '2026-06-15', $5, $5)
         RETURNING id, embarazo_id, numero_control`,
        [
          patients.rows[0].id,
          patients.rows[1].id,
          firstPregnancy,
          secondPregnancy,
          user.rows[0].id,
        ]
      );
      const [origin, fulfillment, thirdOrigin, fourthOrigin, otherPregnancyOrigin] = controls.rows;

      await t.test('no hay backfill ni trigger sobre cita_siguiente historica', async () => {
        const count = await db.query('SELECT COUNT(*)::integer AS total FROM citas_prenatales');
        assert.equal(count.rows[0].total, 0);
      });

      const inserted = await db.query(
        `INSERT INTO citas_prenatales (
           embarazo_id, fecha_programada, estado, control_origen_id,
           registrado_por, updated_by
         ) VALUES ($1, '2026-06-15', 'programada', $2, $3, $3)
         RETURNING *`,
        [firstPregnancy, origin.id, user.rows[0].id]
      );
      const appointment = inserted.rows[0];

      await t.test('crea programada con embarazo, origen y trazabilidad', async () => {
        assert.equal(appointment.embarazo_id, firstPregnancy);
        assert.equal(appointment.control_origen_id, origin.id);
        assert.equal(appointment.estado, 'programada');
        assert.equal(appointment.registrado_por, user.rows[0].id);
        assert.equal(appointment.updated_by, user.rows[0].id);
        assert.ok(appointment.created_at);
        assert.ok(appointment.updated_at);
      });

      await t.test('rechaza estado fuera del catalogo', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id
             ) VALUES ($1, '2026-07-01', 'ausente', $2)`,
            [firstPregnancy, fulfillment.id]
          ),
          '23514'
        );
      });

      await t.test('rechaza control de origen perteneciente a otro embarazo', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id
             ) VALUES ($1, '2026-07-01', 'programada', $2)`,
            [secondPregnancy, fulfillment.id]
          ),
          '23503'
        );
      });

      await t.test('rechaza una segunda cita para el mismo control de origen', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id
             ) VALUES ($1, '2026-07-01', 'programada', $2)`,
            [firstPregnancy, origin.id]
          ),
          '23505'
        );
      });

      await t.test('cumplimiento exige atendida, otro control y mismo embarazo', async () => {
        await expectPgCode(
          db.query(
            `UPDATE citas_prenatales
             SET control_cumplimiento_id = $1
             WHERE id = $2`,
            [fulfillment.id, appointment.id]
          ),
          '23514'
        );
        await expectPgCode(
          db.query(
            `UPDATE citas_prenatales
             SET estado = 'atendida', control_cumplimiento_id = $1
             WHERE id = $2`,
            [origin.id, appointment.id]
          ),
          '23514'
        );
        await expectPgCode(
          db.query(
            `UPDATE citas_prenatales
             SET estado = 'atendida', control_cumplimiento_id = $1
             WHERE id = $2`,
            [otherPregnancyOrigin.id, appointment.id]
          ),
          '23503'
        );
        const fulfilled = await db.query(
          `UPDATE citas_prenatales
           SET estado = 'atendida', control_cumplimiento_id = $1
           WHERE id = $2
           RETURNING estado, control_cumplimiento_id`,
          [fulfillment.id, appointment.id]
        );
        assert.deepEqual(fulfilled.rows[0], {
          estado: 'atendida',
          control_cumplimiento_id: fulfillment.id,
        });
      });

      await t.test('un control no puede cumplir dos citas', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id,
               control_cumplimiento_id
             ) VALUES ($1, '2026-07-15', 'atendida', $2, $3)`,
            [firstPregnancy, thirdOrigin.id, fulfillment.id]
          ),
          '23505'
        );
      });

      const reprogramRoot = await db.query(
        `INSERT INTO citas_prenatales (
           embarazo_id, fecha_programada, estado, control_origen_id,
           registrado_por, updated_by
         ) VALUES ($1, '2026-07-15', 'programada', $2, $3, $3)
         RETURNING *`,
        [firstPregnancy, thirdOrigin.id, user.rows[0].id]
      );

      await t.test('solo permite una cita programada vigente por embarazo', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id
             ) VALUES ($1, '2026-08-01', 'programada', $2)`,
            [firstPregnancy, fourthOrigin.id]
          ),
          '23505'
        );
      });

      await db.query(
        `UPDATE citas_prenatales
         SET estado = 'reprogramada', updated_by = $2
         WHERE id = $1`,
        [reprogramRoot.rows[0].id, user.rows[0].id]
      );

      await t.test('reprogramacion no puede cruzar embarazos', async () => {
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id,
               reprogramada_desde_id
             ) VALUES ($1, '2026-07-15', 'programada', $2, $3)`,
            [secondPregnancy, otherPregnancyOrigin.id, reprogramRoot.rows[0].id]
          ),
          '23503'
        );
      });

      const replacement = await db.query(
        `INSERT INTO citas_prenatales (
           embarazo_id, fecha_programada, estado, control_origen_id,
           reprogramada_desde_id
         ) VALUES ($1, '2026-07-15', 'programada', $2, $3)
         RETURNING id, embarazo_id, control_origen_id, reprogramada_desde_id, estado`,
        [firstPregnancy, thirdOrigin.id, reprogramRoot.rows[0].id]
      );

      await t.test('reprogramacion conserva origen, queda vinculada y no admite circularidad ni ramas', async () => {
        assert.ok(replacement.rows[0].id);
        assert.equal(replacement.rows[0].embarazo_id, firstPregnancy);
        assert.equal(replacement.rows[0].control_origen_id, thirdOrigin.id);
        assert.equal(replacement.rows[0].reprogramada_desde_id, reprogramRoot.rows[0].id);
        assert.equal(replacement.rows[0].estado, 'programada');
        await expectPgCode(
          db.query(
            `UPDATE citas_prenatales
             SET reprogramada_desde_id = id
             WHERE id = $1`,
            [replacement.rows[0].id]
          ),
          '23514'
        );
        await expectPgCode(
          db.query(
            `INSERT INTO citas_prenatales (
               embarazo_id, fecha_programada, estado, control_origen_id,
               reprogramada_desde_id
             ) VALUES ($1, '2026-07-22', 'cancelada', $2, $3)`,
            [firstPregnancy, thirdOrigin.id, reprogramRoot.rows[0].id]
          ),
          '23505'
        );
      });

      await t.test('un control relacionado no puede eliminarse dejando la cita huerfana', async () => {
        await expectPgCode(
          db.query('DELETE FROM controles_prenatales WHERE id = $1', [origin.id]),
          '23503'
        );
      });
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(databaseName)} WITH (FORCE)`);
    await admin.end();
  }
});
