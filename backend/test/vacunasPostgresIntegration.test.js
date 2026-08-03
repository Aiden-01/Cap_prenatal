const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const postgresTest = process.env.RUN_POSTGRES_INTEGRATION === '1' ? test : test.skip;

postgresTest('matriz VAX-5 usa restricciones PostgreSQL reales sin persistir fixtures', async () => {
  const pool = require('../src/db/pool');
  const client = await pool.connect();
  let transactionStarted = false;

  async function expectPgError(operation, code) {
    await client.query('SAVEPOINT vax5_expected_error');
    try {
      await operation();
      assert.fail(`Se esperaba error PostgreSQL ${code}`);
    } catch (error) {
      assert.equal(error.code, code);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT vax5_expected_error');
      await client.query('RELEASE SAVEPOINT vax5_expected_error');
    }
  }

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const migrationRows = await client.query(
      `SELECT filename
       FROM schema_migrations
       WHERE filename LIKE '009_%'
          OR filename LIKE '010_%'
          OR filename LIKE '011_%'
          OR filename LIKE '012_%'
       ORDER BY filename`
    );
    assert.deepEqual(migrationRows.rows.map(({ filename }) => filename), [
      '009_vax2_reglas_vacunas.sql',
      '010_vax31_historias_parciales.sql',
      '011_vax4_influenza_aplicaciones_independientes.sql',
      '012_vax5_correccion_final.sql',
    ]);
    const structure = await client.query(
      `SELECT
         (SELECT convalidated FROM pg_constraint
          WHERE conrelid = 'vacunas_paciente'::regclass
            AND conname = 'vacunas_paciente_fecha_clinica_check') AS fecha_validada,
         to_regclass('public.ux_vacunas_embarazo_dosis') AS indice_generico,
         to_regclass('public.ux_vacunas_td_paciente_posicion') IS NOT NULL AS indice_td,
         to_regclass('public.ux_vacunas_spr_sr_paciente_posicion') IS NOT NULL AS indice_sr,
         to_regclass('public.ux_vacunas_tdap_embarazo') IS NOT NULL AS indice_tdap,
         (SELECT COUNT(*)::integer
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (table_name ILIKE '%temporada%'
              OR column_name ILIKE '%temporada%'
              OR table_name ILIKE '%influenza%'
              OR column_name ILIKE '%influenza%')) AS estructuras_temporada`
    );
    assert.deepEqual(structure.rows[0], {
      fecha_validada: true,
      indice_generico: null,
      indice_td: true,
      indice_sr: true,
      indice_tdap: true,
      estructuras_temporada: 0,
    });
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const patient = await client.query(
      `INSERT INTO pacientes (no_expediente, nombres, apellidos)
       VALUES ($1, 'Paciente', 'Sintetica VAX5')
       RETURNING id`,
      [`VAX5-${suffix}`]
    );
    const patientId = patient.rows[0].id;
    const pregnancy = await client.query(
      `INSERT INTO embarazos (
         paciente_id, numero_embarazo, estado, fur, fecha_inicio
       ) VALUES ($1, 1, 'activo', '2026-01-01', '2026-01-01')
       RETURNING id`,
      [patientId]
    );
    const pregnancyId = pregnancy.rows[0].id;
    const insert = (type, moment, dose, date) => client.query(
      `INSERT INTO vacunas_paciente (
         paciente_id, embarazo_id, tipo_vacuna, momento, numero_dosis, fecha_dosis
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, tipo_vacuna, numero_dosis, fecha_dosis`,
      [patientId, pregnancyId, type, moment, dose, date]
    );

    await insert('td', 'durante_embarazo', 3, '2026-08-01');
    await insert('td', 'previo_embarazo', 1, '2025-12-01');
    await expectPgError(
      () => insert('td', 'durante_embarazo', 3, '2026-09-01'),
      '23505'
    );

    await insert('spr_sr', 'previo_embarazo', 2, '2025-11-01');
    await expectPgError(
      () => insert('spr_sr', 'postparto_aborto', 2, '2026-10-01'),
      '23505'
    );

    await insert('tdap', 'previo_embarazo', 1, '2025-10-01');
    await insert('tdap', 'durante_embarazo', 1, '2026-05-21');
    await expectPgError(
      () => insert('tdap', 'postparto_aborto', 1, '2026-10-01'),
      '23505'
    );

    const influenza = [];
    for (const date of ['2026-03-01', '2026-03-01', '2026-09-01']) {
      influenza.push((await insert('influenza', 'durante_embarazo', 1, date)).rows[0]);
    }
    assert.equal(new Set(influenza.map(({ id }) => id)).size, 3);

    await expectPgError(
      () => insert('td', 'durante_embarazo', 6, '2026-09-01'),
      '23514'
    );
    await expectPgError(
      () => insert('spr_sr', 'previo_embarazo', 3, '2025-09-01'),
      '23514'
    );
    await expectPgError(
      () => insert('influenza', 'durante_embarazo', 2, '2026-09-01'),
      '23514'
    );
    await expectPgError(
      () => insert('td_tdap', 'durante_embarazo', 1, '2026-09-01'),
      '23514'
    );
    await expectPgError(
      () => insert('influenza', 'durante_embarazo', 1, null),
      '23514'
    );

    const editedId = influenza[1].id;
    const untouchedId = influenza[0].id;
    await client.query(
      `UPDATE vacunas_paciente SET fecha_dosis = '2026-04-01' WHERE id = $1`,
      [editedId]
    );
    await client.query('DELETE FROM vacunas_paciente WHERE id = $1', [influenza[2].id]);
    const finalInfluenza = await client.query(
      `SELECT id, fecha_dosis::text AS fecha_dosis
       FROM vacunas_paciente
       WHERE paciente_id = $1 AND tipo_vacuna = 'influenza'
       ORDER BY id`,
      [patientId]
    );
    assert.equal(finalInfluenza.rows.length, 2);
    assert.equal(
      finalInfluenza.rows.find(({ id }) => id === editedId).fecha_dosis,
      '2026-04-01'
    );
    assert.equal(
      finalInfluenza.rows.find(({ id }) => id === untouchedId).fecha_dosis,
      '2026-03-01'
    );
  } finally {
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  }
});
