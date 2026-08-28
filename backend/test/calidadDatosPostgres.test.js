const assert = require('node:assert/strict');
const test = require('node:test');
const { Client, Pool } = require('pg');

const { migrate } = require('../src/db/migrate');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const {
  createAutomatizacionesService,
} = require('../src/services/automatizacionesService');

const integrationEnabled = process.env.RUN_POSTGRES_QUALITY === '1';
const postgresTest = integrationEnabled ? test : test.skip;

function assertTemporaryClusterTarget(connectionString) {
  assert.equal(process.env.QUALITY_TEMP_CLUSTER, '1', 'La prueba exige PostgreSQL temporal');
  const url = new URL(connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname),
    'PostgreSQL temporal debe estar en loopback'
  );
  return url;
}

function quoteDatabase(databaseName) {
  assert.match(databaseName, /^cap_quality_[a-z0-9_]{1,44}$/);
  return `"${databaseName}"`;
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function configuredConnectionString() {
  if (process.env.QUALITY_TEST_DATABASE_URL) return process.env.QUALITY_TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgresql://localhost');
  url.hostname = process.env.DB_HOST || 'localhost';
  url.port = process.env.DB_PORT || '5432';
  url.username = process.env.DB_USER || '';
  url.password = process.env.DB_PASSWORD || '';
  url.pathname = `/${process.env.DB_NAME || ''}`;
  return url.toString();
}

postgresTest('watchdog detecta solo inconsistencias objetivas sobre PostgreSQL temporal', async () => {
  const connectionString = configuredConnectionString();
  const baseUrl = assertTemporaryClusterTarget(connectionString);
  const databaseName = `cap_quality_${process.pid}_${Date.now()}`.slice(0, 56);
  const admin = new Client({ connectionString: baseUrl.toString(), connectionTimeoutMillis: 5000 });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteDatabase(databaseName)}`);

  try {
    const url = databaseUrl(baseUrl, databaseName);
    const migrationPool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    const migration = await migrate({
      db: migrationPool,
      logger: { log() {}, error() {} },
      setExitCode() {},
    });
    assert.equal(migration.ok, true);

    const db = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      const role = await db.query(
        `INSERT INTO roles (nombre, descripcion)
         VALUES ('quality_pruebas', 'Rol sintetico') RETURNING id`
      );
      const user = await db.query(
        `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
         VALUES ('Operador Quality Sintetico', 'quality.sintetico', 'hash-sintetico', $1)
         RETURNING id`,
        [role.rows[0].id]
      );

      async function createPatient(expediente, nombres = 'Paciente Sintetica') {
        const result = await db.query(
          `INSERT INTO pacientes (no_expediente, nombres, apellidos, registrado_por)
           VALUES ($1, $2, 'Apellido Sintetico', $3) RETURNING id`,
          [expediente, nombres, user.rows[0].id]
        );
        return result.rows[0].id;
      }

      async function createPregnancy(patientId, number, state = 'activo') {
        const result = await db.query(
          `INSERT INTO embarazos (
             paciente_id, numero_embarazo, estado, fur, fecha_inicio, fecha_cierre, registrado_por
           ) VALUES (
             $1, $2, $3::varchar(15), '2026-03-01', '2026-03-01',
             CASE WHEN $3::text = 'cerrado' THEN '2026-08-01'::date ELSE NULL END,
             $4
           ) RETURNING id`,
          [patientId, number, state, user.rows[0].id]
        );
        return result.rows[0].id;
      }

      const validPatient = await createPatient('QUALITY-VALID-01');
      const validPregnancy = await createPregnancy(validPatient, 1);
      await db.query(
        `INSERT INTO controles_prenatales (
           paciente_id, embarazo_id, numero_control, fecha, registrado_por
         ) VALUES ($1, $2, 1, CURRENT_DATE, $3)`,
        [validPatient, validPregnancy, user.rows[0].id]
      );
      await db.query(
        `INSERT INTO vacunas_paciente (
           paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis, fecha_dosis, registrado_por
         ) VALUES ($1, NULL, 'td', 'previo_embarazo', 1, '2025-01-01', $2)`,
        [validPatient, user.rows[0].id]
      );

      const repository = createAutomatizacionesRepository(db);
      const initial = await repository.obtenerResumenCalidadDatos();
      assert.ok(initial.every(({ total }) => Number(total) === 0));

      await createPatient('QUALITY-BLANK-01', '');

      await db.query(
        `INSERT INTO morbilidad_embarazo (paciente_id, embarazo_id, fecha, registrado_por)
         VALUES ($1, NULL, CURRENT_DATE, $2)`,
        [validPatient, user.rows[0].id]
      );

      const otherPatient = await createPatient('QUALITY-OTHER-01');
      await db.query(
        `INSERT INTO morbilidad_embarazo (paciente_id, embarazo_id, fecha, registrado_por)
         VALUES ($1, $2, CURRENT_DATE, $3)`,
        [otherPatient, validPregnancy, user.rows[0].id]
      );

      await createPregnancy(validPatient, 2, 'puerperio');

      await db.query(
        `INSERT INTO controles_prenatales (
           paciente_id, embarazo_id, numero_control, fecha, registrado_por
         ) VALUES ($1, $2, 2, CURRENT_DATE + 1, $3)`,
        [validPatient, validPregnancy, user.rows[0].id]
      );

      const closedPatient = await createPatient('QUALITY-CLOSED-01');
      const closedPregnancy = await createPregnancy(closedPatient, 1, 'cerrado');
      const originControl = await db.query(
        `INSERT INTO controles_prenatales (
           paciente_id, embarazo_id, numero_control, fecha, registrado_por
         ) VALUES ($1, $2, 1, '2026-07-01', $3) RETURNING id`,
        [closedPatient, closedPregnancy, user.rows[0].id]
      );
      await db.query(
        `INSERT INTO citas_prenatales (
           embarazo_id, control_origen_id, fecha_programada, estado, registrado_por, updated_by
         ) VALUES ($1, $2, '2026-09-01', 'programada', $3, $3)`,
        [closedPregnancy, originControl.rows[0].id, user.rows[0].id]
      );

      const detected = await repository.obtenerResumenCalidadDatos();
      assert.deepEqual(
        Object.fromEntries(detected.map(({ codigo, total }) => [codigo, Number(total)])),
        {
          patient_required_identity_missing: 1,
          pregnancy_link_missing: 1,
          pregnancy_patient_mismatch: 1,
          concurrent_open_pregnancies: 1,
          future_prenatal_control: 1,
          scheduled_appointment_closed_pregnancy: 1,
        }
      );

      const service = createAutomatizacionesService({
        repository,
        now: () => new Date('2026-08-31T15:00:00.000Z'),
        createDispatchToken: () => 'P'.repeat(43),
      });
      const prepared = await service.prepararWatchdogCalidadDatos();
      assert.equal(prepared.total, 6);
      assert.equal(prepared.categories.length, 6);
      assert.equal(prepared.dispatch.status, 'ready');
      await service.confirmarWatchdogCalidadDatos({ dispatchToken: prepared.dispatch.token });
      assert.equal((await service.prepararWatchdogCalidadDatos()).dispatch.status, 'already_processed');

      const stored = await db.query(
        `SELECT tipo, estado, total_registros, numero_intento
         FROM automatizacion_despachos
         WHERE periodo_desde = '2026-08-24' AND periodo_hasta = '2026-08-30'`
      );
      assert.deepEqual(stored.rows, [{
        tipo: 'weekly_data_quality_watchdog',
        estado: 'enviado',
        total_registros: 6,
        numero_intento: 1,
      }]);
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(databaseName)} WITH (FORCE)`);
    await admin.end();
  }
});
