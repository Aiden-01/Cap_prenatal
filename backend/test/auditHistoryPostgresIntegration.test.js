const assert = require('node:assert/strict');
const test = require('node:test');

const {
  APPLY_CONFIRMATION,
  quoteQualifiedIdentifier,
  runAuditHistoryMigration,
} = require('../src/services/audit/auditHistoryMigration');

const enabled = process.env.RUN_POSTGRES_INTEGRATION === '1';
const isolatedTest = enabled ? test : test.skip;

function assertIsolatedTarget(tableName) {
  if (String(tableName).toLowerCase() === 'public.auditoria_eventos') {
    throw new Error('La integración histórica no puede apuntar a public.auditoria_eventos');
  }
  if (!String(tableName).toLowerCase().startsWith('pg_temp.')) {
    throw new Error('La integración histórica requiere una tabla temporal pg_temp');
  }
}

isolatedTest('integración PostgreSQL aislada: update, idempotencia y rollback', async () => {
  const pool = require('../src/db/pool');
  const client = await pool.connect();
  const temporaryName = `audit_history_synthetic_${process.pid}`;
  const tableName = `pg_temp.${temporaryName}`;
  assertIsolatedTarget(tableName);
  const quotedTable = quoteQualifiedIdentifier(tableName);
  const quotedTemporaryName = quoteQualifiedIdentifier(temporaryName);

  try {
    await client.query(`CREATE TEMP TABLE ${quotedTemporaryName} (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER,
      accion VARCHAR(30) NOT NULL,
      modulo VARCHAR(80),
      entidad_afectada VARCHAR(80),
      id_entidad TEXT,
      tabla VARCHAR(80) NOT NULL,
      registro_id TEXT,
      paciente_id INTEGER,
      embarazo_id INTEGER,
      datos_anteriores JSONB,
      datos_nuevos JSONB,
      ip VARCHAR(80),
      user_agent TEXT,
      descripcion TEXT,
      fecha_hora TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    ) ON COMMIT PRESERVE ROWS`);

    const insert = `INSERT INTO ${quotedTable} (
      accion, modulo, entidad_afectada, id_entidad, tabla, registro_id,
      paciente_id, embarazo_id, datos_anteriores, datos_nuevos,
      ip, user_agent, descripcion
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`;

    await client.query(insert, [
      'actualizar', 'pacientes', 'paciente', '41', 'pacientes', '41', 41, 81,
      null,
      { politica_version: 1, campos_sensibles_modificados: ['nombres'], resultado: 'exitoso' },
      null, null, 'actualizar',
    ]);
    await client.query(insert, [
      'crear', 'pacientes', 'paciente', '42', 'pacientes', '42', 42, 82,
      null,
      { nombres: 'Persona sintética', cui: '0000000000000', created_at: '2026-01-01' },
      '192.0.2.10', 'Synthetic Browser/1.0', 'Creación legacy sintética',
    ]);
    await client.query(insert, [
      'logout', 'autenticacion', 'usuario', 'cuenta.sintetica', 'usuarios',
      'cuenta.sintetica', null, null, null, null,
      '192.0.2.11', 'Synthetic Browser/2.0', 'Logout legacy sintético',
    ]);

    const applyOptions = {
      client,
      mode: 'apply',
      backupConfirmed: true,
      confirmation: APPLY_CONFIRMATION,
      tableName,
    };
    const first = await runAuditHistoryMigration(applyOptions);
    assert.equal(first.statistics.total_filas, 3);
    assert.equal(first.statistics.clasificacion.A, 1);
    assert.equal(first.statistics.clasificacion.B, 1);
    assert.equal(first.statistics.clasificacion.C, 1);
    assert.equal(first.statistics.filas_modificadas, 2);
    assert.equal(first.statistics.aserciones, 'ok');

    const second = await runAuditHistoryMigration(applyOptions);
    assert.equal(second.statistics.clasificacion.A, 3);
    assert.equal(second.statistics.filas_modificadas, 0);

    const rollbackInsert = await client.query(`${insert} RETURNING id`, [
      'actualizar', 'pacientes', 'paciente', '43', 'pacientes', '43', 43, 83,
      { telefono: '5550100' }, { telefono: '5550101' },
      '192.0.2.12', 'Synthetic Browser/3.0', 'Cambio legacy sintético',
    ]);
    const rollbackId = rollbackInsert.rows[0].id;
    await assert.rejects(runAuditHistoryMigration({
      ...applyOptions,
      testHooks: {
        beforePersistedValidation() {
          throw new Error('Fallo sintético posterior a UPDATE');
        },
      },
    }), (error) => error.code === 'AUDIT_HISTORY_MIGRATION_FAILED'
      && error.stage === 'test_hook');

    const rolledBack = await client.query(
      `SELECT datos_anteriores, ip, descripcion FROM ${quotedTable} WHERE id = $1`,
      [rollbackId]
    );
    assert.deepEqual(rolledBack.rows[0].datos_anteriores, { telefono: '5550100' });
    assert.equal(rolledBack.rows[0].ip, '192.0.2.12');
    assert.equal(rolledBack.rows[0].descripcion, 'Cambio legacy sintético');
  } finally {
    await client.query(`DROP TABLE IF EXISTS ${quotedTable}`);
    client.release();
    await pool.end();
  }
});

test('la integración aborta si recibe public.auditoria_eventos', () => {
  assert.throws(
    () => assertIsolatedTarget('public.auditoria_eventos'),
    /no puede apuntar a public\.auditoria_eventos/
  );
});
