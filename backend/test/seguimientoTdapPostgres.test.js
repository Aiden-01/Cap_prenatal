const assert = require('node:assert/strict');
const test = require('node:test');
const { Client, Pool } = require('pg');

const { migrate } = require('../src/db/migrate');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const {
  classifyTdapCandidates,
  createAutomatizacionesService,
  createTdapDispatchToken,
} = require('../src/services/automatizacionesService');

const integrationEnabled = process.env.RUN_POSTGRES_TDAP === '1';
const postgresTest = integrationEnabled ? test : test.skip;
const PERIOD = Object.freeze({ desde: '2026-08-24', hasta: '2026-08-30' });

function assertTemporaryClusterTarget(connectionString) {
  assert.equal(process.env.TDAP_TEMP_CLUSTER, '1', 'La prueba exige PostgreSQL temporal');
  const url = new URL(connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname),
    'PostgreSQL temporal debe estar en loopback'
  );
  return url;
}

function quoteDatabase(databaseName) {
  assert.match(databaseName, /^cap_tdap_[a-z0-9_]{1,48}$/);
  return `"${databaseName}"`;
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function configuredConnectionString() {
  if (process.env.TDAP_TEST_DATABASE_URL) return process.env.TDAP_TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL('postgresql://localhost');
  url.hostname = process.env.DB_HOST || 'localhost';
  url.port = process.env.DB_PORT || '5432';
  url.username = process.env.DB_USER || '';
  url.password = process.env.DB_PASSWORD || '';
  url.pathname = `/${process.env.DB_NAME || ''}`;
  return url.toString();
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function furForThreshold(value) {
  return shiftDate(value, -140);
}

postgresTest('seguimiento Tdap filtra territorio, embarazo actual y umbral sobre PostgreSQL temporal', async () => {
  const connectionString = configuredConnectionString();
  const baseUrl = assertTemporaryClusterTarget(connectionString);
  const databaseName = `cap_tdap_${process.pid}_${Date.now()}`.slice(0, 58);
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
         VALUES ('tdap_pruebas', 'Rol sintetico') RETURNING id`
      );
      const user = await db.query(
        `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
         VALUES ('Operador Tdap Sintetico', 'tdap.sintetico', 'hash-sintetico', $1)
         RETURNING id`,
        [role.rows[0].id]
      );
      const community = await db.query(
        `INSERT INTO comunidades (
           nombre, territorio, sector, lat, lng, activo, created_by, updated_by
         ) VALUES ('Comunidad Tdap Sintetica', 1, 'A', 16, -89, TRUE, $1, $1)
         RETURNING id`,
        [user.rows[0].id]
      );

      async function createCase({
        key,
        first,
        municipio = 'El Chal',
        estado = 'activo',
        threshold = '2026-08-24',
        currentTdap = false,
        previousTdap = false,
        extraVaccines = false,
      }) {
        const patient = await db.query(
          `INSERT INTO pacientes (
             no_expediente, nombres, apellidos, municipio, comunidad_id, registrado_por
           ) VALUES ($1, $2, 'Apellido Sintetico', $3, $4, $5) RETURNING id`,
          [`TDAP-SYN-${key}`, `${first} Segundo`, municipio, community.rows[0].id, user.rows[0].id]
        );
        let previousPregnancyId = null;
        let currentPregnancyNumber = 1;
        if (previousTdap) {
          const previous = await db.query(
            `INSERT INTO embarazos (
               paciente_id, numero_embarazo, estado, fur, fecha_inicio, fecha_cierre, registrado_por
             ) VALUES ($1, 1, 'cerrado', '2024-01-01', '2024-01-01', '2024-10-01', $2)
             RETURNING id`,
            [patient.rows[0].id, user.rows[0].id]
          );
          previousPregnancyId = previous.rows[0].id;
          currentPregnancyNumber = 2;
          await db.query(
            `INSERT INTO vacunas_paciente (
               paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis,
               fecha_dosis, registrado_por
             ) VALUES ($1, $2, 'tdap', 'durante_embarazo', 1, '2024-06-01', $3)`,
            [patient.rows[0].id, previousPregnancyId, user.rows[0].id]
          );
        }
        const current = await db.query(
          `INSERT INTO embarazos (
             paciente_id, numero_embarazo, estado, fur, fecha_inicio, registrado_por
           ) VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
          [
            patient.rows[0].id,
            currentPregnancyNumber,
            estado,
            furForThreshold(threshold),
            user.rows[0].id,
          ]
        );
        if (currentTdap) {
          await db.query(
            `INSERT INTO vacunas_paciente (
               paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis,
               fecha_dosis, registrado_por
             ) VALUES ($1, $2, 'tdap', 'durante_embarazo', 1, $3, $4)`,
            [patient.rows[0].id, current.rows[0].id, threshold, user.rows[0].id]
          );
        }
        if (extraVaccines) {
          await db.query(
            `INSERT INTO vacunas_paciente (
               paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis,
               fecha_dosis, registrado_por
             ) VALUES
               ($1, $2, 'td', 'durante_embarazo', 1, '2026-06-01', $3),
               ($1, $2, 'influenza', 'durante_embarazo', 1, '2026-07-01', $3)`,
            [patient.rows[0].id, current.rows[0].id, user.rows[0].id]
          );
        }
      }

      await createCase({ key: 'A', first: 'Lunes', threshold: '2026-08-24' });
      await createCase({ key: 'B', first: 'OtroMunicipio', municipio: 'Dolores' });
      await createCase({ key: 'C', first: 'Cerrada', estado: 'cerrado' });
      await createCase({ key: 'D', first: 'Puerperio', estado: 'puerperio' });
      await createCase({ key: 'E', first: 'TdapActual', currentTdap: true });
      await createCase({ key: 'F', first: 'TdapAnterior', previousTdap: true });
      await createCase({ key: 'G', first: 'MenorVeinte', threshold: '2026-09-01' });
      await createCase({ key: 'H', first: 'PendienteAntigua', threshold: '2026-08-01' });
      await createCase({ key: 'I', first: 'Domingo', threshold: '2026-08-30' });
      await createCase({ key: 'J', first: 'OtrasVacunas', extraVaccines: true });

      const repository = createAutomatizacionesRepository(db);
      const rows = await repository.obtenerCandidatasTdapElChal();
      const report = classifyTdapCandidates(rows, { period: PERIOD, asOf: '2026-08-31' });

      assert.deepEqual(
        report.newOpportunities.map((row) => row.first_name).sort(),
        ['Domingo', 'Lunes', 'OtrasVacunas', 'TdapAnterior']
      );
      assert.deepEqual(
        report.pending.map((row) => row.first_name).sort(),
        ['PendienteAntigua']
      );
      const serialized = JSON.stringify(report);
      assert.doesNotMatch(
        serialized,
        /OtroMunicipio|Cerrada|Puerperio|TdapActual|MenorVeinte|paciente_id|embarazo_id|cui|expediente/i
      );

      const service = createAutomatizacionesService({
        repository,
        now: () => new Date('2026-08-31T14:00:00.000Z'),
        createTdapToken: (snapshotHash) => createTdapDispatchToken(
          snapshotHash,
          () => Buffer.alloc(16, 7)
        ),
      });
      const prepared = await service.prepararDespachoTdap();
      assert.equal(prepared.new_opportunities.total, 4);
      assert.equal(prepared.pending.total, 1);
      await service.generarSeguimientoTdapExcel({ dispatchToken: prepared.dispatch.token });
      await service.confirmarDespachoTdap({ dispatchToken: prepared.dispatch.token });
      assert.equal((await service.prepararDespachoTdap()).dispatch.status, 'already_processed');

      const stored = await db.query(
        `SELECT tipo, estado, total_registros, numero_intento
         FROM automatizacion_despachos
         WHERE periodo_desde = '2026-08-24' AND periodo_hasta = '2026-08-30'`
      );
      assert.deepEqual(stored.rows, [{
        tipo: 'seguimiento_tdap_el_chal',
        estado: 'enviado',
        total_registros: 5,
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
