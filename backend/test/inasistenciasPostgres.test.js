const assert = require('node:assert/strict');
const test = require('node:test');
const { Client, Pool } = require('pg');

const { migrate } = require('../src/db/migrate');
const { createAutomatizacionesRepository } = require('../src/repositories/automatizacionesRepository');
const { createAutomatizacionesService } = require('../src/services/automatizacionesService');

const integrationEnabled = process.env.RUN_POSTGRES_INASISTENCIAS === '1';
const postgresTest = integrationEnabled ? test : test.skip;

function assertTemporaryClusterTarget(connectionString) {
  assert.equal(
    process.env.INASISTENCIAS_TEMP_CLUSTER,
    '1',
    'La prueba exige confirmacion explicita de PostgreSQL temporal'
  );
  const url = new URL(connectionString);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname),
    'PostgreSQL temporal debe estar en loopback'
  );
  return url;
}

function quoteDatabase(databaseName) {
  assert.match(databaseName, /^cap_inasistencias_[a-z0-9_]{1,40}$/);
  return `"${databaseName}"`;
}

function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

postgresTest('015 y consulta semanal funcionan sobre PostgreSQL temporal con datos sinteticos', async (t) => {
  const connectionString = process.env.INASISTENCIAS_TEST_DATABASE_URL;
  assert.ok(connectionString, 'Falta INASISTENCIAS_TEST_DATABASE_URL');
  const baseUrl = assertTemporaryClusterTarget(connectionString);
  const databaseName = `cap_inasistencias_${process.pid}_${Date.now()}`.slice(0, 58);
  const admin = new Client({
    connectionString: baseUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
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
      const migrationRows = await db.query(
        `SELECT filename, applied_at
         FROM schema_migrations
         WHERE filename IN ('014_citas_prenatales.sql', '015_automatizacion_despachos.sql')
         ORDER BY filename`
      );
      assert.deepEqual(
        migrationRows.rows.map(({ filename }) => filename),
        ['014_citas_prenatales.sql', '015_automatizacion_despachos.sql']
      );
      const cutoverAt = migrationRows.rows[0].applied_at;

      const role = await db.query(
        `INSERT INTO roles (nombre, descripcion)
         VALUES ('inasistencias_pruebas', 'Rol sintetico de prueba')
         RETURNING id`
      );
      const user = await db.query(
        `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
         VALUES ('Operador Sintetico', 'inasistencias.sintetico', 'hash-sintetico', $1)
         RETURNING id`,
        [role.rows[0].id]
      );
      const community = await db.query(
        `INSERT INTO comunidades (
           nombre, territorio, sector, lat, lng, activo, created_by, updated_by
         ) VALUES ('Comunidad Sintetica', 1, 'A', 16.0000000, -89.0000000, TRUE, $1, $1)
         RETURNING id`,
        [user.rows[0].id]
      );

      const cases = [
        { key: 'missed', first: 'Incluida', last: 'Uno', state: 'activo', date: '2026-08-19', appointment: 'programada' },
        { key: 'attended', first: 'Atendida', last: 'Dos', state: 'activo', date: '2026-08-18', appointment: 'atendida' },
        { key: 'future', first: 'Futura', last: 'Tres', state: 'activo', date: '2026-08-25', appointment: 'programada' },
        { key: 'cancelled', first: 'Cancelada', last: 'Cuatro', state: 'activo', date: '2026-08-20', appointment: 'cancelada' },
        { key: 'rescheduled', first: 'Reprogramada', last: 'Cinco', state: 'activo', date: '2026-08-21', appointment: 'reprogramada' },
        { key: 'outside', first: 'Fuera', last: 'Seis', state: 'activo', date: '2026-08-16', appointment: 'programada' },
        { key: 'precutover', first: 'Historica', last: 'Siete', state: 'activo', date: '2026-08-22', appointment: 'programada', beforeCutover: true },
        { key: 'closed', first: 'Cerrada', last: 'Ocho', state: 'cerrado', date: '2026-08-23', appointment: 'programada' },
        { key: 'nextweek', first: 'Reintento', last: 'Nueve', state: 'activo', date: '2026-08-27', appointment: 'programada' },
      ];

      for (let index = 0; index < cases.length; index += 1) {
        const entry = cases[index];
        const patient = await db.query(
          `INSERT INTO pacientes (
             no_expediente, nombres, apellidos, telefono, comunidad_id, registrado_por
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            `INA-SYN-${String(index + 1).padStart(2, '0')}`,
            `${entry.first} Nombre`,
            `${entry.last} Apellido`,
            `5555-${String(1000 + index)}`,
            community.rows[0].id,
            user.rows[0].id,
          ]
        );
        const pregnancy = await db.query(
          `INSERT INTO embarazos (
             paciente_id, numero_embarazo, estado, fecha_inicio, registrado_por
           ) VALUES ($1, 1, $2, '2026-01-01', $3)
           RETURNING id`,
          [patient.rows[0].id, entry.state, user.rows[0].id]
        );
        const controls = await db.query(
          `INSERT INTO controles_prenatales (
             paciente_id, embarazo_id, numero_control, fecha, cita_siguiente,
             registrado_por, updated_by
           ) VALUES
             ($1, $2, 1, '2026-08-01', $3, $4, $4),
             ($1, $2, 2, '2026-08-24', NULL, $4, $4)
           RETURNING id, numero_control`,
          [patient.rows[0].id, pregnancy.rows[0].id, entry.date, user.rows[0].id]
        );
        const origin = controls.rows.find(({ numero_control: number }) => number === 1).id;
        const fulfillment = entry.appointment === 'atendida'
          ? controls.rows.find(({ numero_control: number }) => number === 2).id
          : null;
        await db.query(
          `INSERT INTO citas_prenatales (
             embarazo_id, fecha_programada, estado, control_origen_id,
             control_cumplimiento_id, registrado_por, updated_by, created_at
           ) VALUES (
             $1, $2::date, $3, $4, $5, $6, $6,
             CASE WHEN $7::boolean
               THEN $8::timestamptz - INTERVAL '1 second'
               ELSE $8::timestamptz + INTERVAL '1 second'
             END
           )`,
          [
            pregnancy.rows[0].id,
            entry.date,
            entry.appointment,
            origin,
            fulfillment,
            user.rows[0].id,
            Boolean(entry.beforeCutover),
            cutoverAt,
          ]
        );
      }

      const repository = createAutomatizacionesRepository(db);
      const service = createAutomatizacionesService({
        repository,
        now: () => new Date('2026-08-24T14:00:00.000Z'),
        createDispatchToken: () => 'a'.repeat(43),
      });

      await t.test('mezcla incluye solo vencida programada, sin control, activa y posterior al corte', async () => {
        const result = await service.consultarInasistenciasSemanales({
          desde: '2026-08-17',
          hasta: '2026-08-23',
        });
        assert.equal(result.total, 1);
        assert.deepEqual(result.appointments, [{
          date: '2026-08-19',
          first_name: 'Incluida',
          last_name: 'Uno',
          phone: '5555-1000',
          community: 'Comunidad Sintetica',
        }]);
        assert.deepEqual(result.range, { from: '2026-08-17', to: '2026-08-23' });
        assert.equal(result.cutoff_at, new Date(cutoverAt).toISOString());
        assert.doesNotMatch(
          JSON.stringify(result),
          /cui|expediente|direccion|paciente_id|embarazo_id|control_id|diagnostico/i
        );
      });

      await t.test('otra ventana sin casos devuelve contrato total cero', async () => {
        const result = await service.consultarInasistenciasSemanales({
          desde: '2026-08-03',
          hasta: '2026-08-09',
        });
        assert.equal(result.total, 0);
        assert.deepEqual(result.appointments, []);
        assert.equal(result.dispatch.status, 'preview');
      });

      await t.test('reserva real bloquea doble ejecucion, confirma y evita reenvio', async () => {
        const prepared = await service.prepararDespachoInasistencias();
        assert.equal(prepared.dispatch.status, 'ready');
        assert.equal(prepared.total, 1);

        await assert.rejects(
          service.prepararDespachoInasistencias(),
          (error) => error.code === 'AUTOMATION_DISPATCH_UNCERTAIN'
        );

        const confirmed = await service.confirmarDespachoInasistencias({
          dispatchToken: prepared.dispatch.token,
        });
        assert.deepEqual(confirmed.dispatch, { status: 'sent', idempotent: false });

        const duplicate = await service.prepararDespachoInasistencias();
        assert.equal(duplicate.dispatch.status, 'already_processed');

        const stored = await db.query(
          `SELECT tipo, estado, total_registros, numero_intento
           FROM automatizacion_despachos
           WHERE periodo_desde = '2026-08-17' AND periodo_hasta = '2026-08-23'`
        );
        assert.deepEqual(stored.rows, [{
          tipo: 'inasistencias_semanales',
          estado: 'enviado',
          total_registros: 1,
          numero_intento: 1,
        }]);
      });

      await t.test('resolucion manual permite replay solo tras confirmar que no hubo entrega', async () => {
        let tokenIndex = 0;
        const replayService = createAutomatizacionesService({
          repository,
          now: () => new Date('2026-08-31T14:00:00.000Z'),
          createDispatchToken: () => [
            'b'.repeat(43),
            'c'.repeat(43),
          ][tokenIndex++],
        });
        const prepared = await replayService.prepararDespachoInasistencias();
        assert.equal(prepared.total, 2);
        assert.equal(prepared.dispatch.token, 'b'.repeat(43));

        const resolved = await replayService.resolverDespachoInasistencias({
          desde: '2026-08-24',
          hasta: '2026-08-30',
          resolucion: 'reintentar',
          motivoCodigo: 'entrega_no_realizada_confirmada',
        });
        assert.equal(resolved.dispatch.status, 'reintento_autorizado');

        const replay = await replayService.prepararDespachoInasistencias();
        assert.equal(replay.dispatch.token, 'c'.repeat(43));
        const stored = await db.query(
          `SELECT estado, numero_intento
           FROM automatizacion_despachos
           WHERE periodo_desde = '2026-08-24' AND periodo_hasta = '2026-08-30'`
        );
        assert.deepEqual(stored.rows, [{ estado: 'reservado', numero_intento: 2 }]);
      });

      await t.test('tabla de idempotencia no contiene columnas clinicas ni destinatarios', async () => {
        const columns = await db.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'automatizacion_despachos'
           ORDER BY ordinal_position`
        );
        const serialized = columns.rows.map(({ column_name }) => column_name).join(' ');
        assert.doesNotMatch(
          serialized,
          /paciente|embarazo|cita_id|nombre|telefono|comunidad|correo|destinatario|contenido/
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
