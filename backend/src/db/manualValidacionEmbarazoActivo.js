const pool = require('./pool');

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const pacienteResult = await client.query(
      `INSERT INTO pacientes (no_expediente, nombres, apellidos)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`TEST-EMB-ACTIVO-${Date.now()}`, 'Validacion', 'Embarazo Activo']
    );
    const pacienteId = pacienteResult.rows[0].id;

    const primerEmbarazo = await client.query(
      `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio)
       VALUES ($1, 1, 'activo', CURRENT_DATE)
       RETURNING id`,
      [pacienteId]
    );
    const primerEmbarazoId = primerEmbarazo.rows[0].id;
    console.log('OK: crear primer embarazo activo funciona');

    await client.query('SAVEPOINT segundo_activo');
    try {
      await client.query(
        `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio)
         VALUES ($1, 2, 'activo', CURRENT_DATE)`,
        [pacienteId]
      );
      throw new Error('FALLO: se permitio crear un segundo embarazo activo');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT segundo_activo');
      if (err.code !== '23505' || err.constraint !== 'ux_embarazo_activo_paciente') {
        throw err;
      }
      console.log('OK: crear segundo embarazo activo para la misma paciente falla');
    }

    await client.query(
      `UPDATE embarazos
       SET estado = 'cerrado', fecha_cierre = CURRENT_DATE
       WHERE id = $1`,
      [primerEmbarazoId]
    );

    await client.query(
      `INSERT INTO embarazos (paciente_id, numero_embarazo, estado, fecha_inicio)
       VALUES ($1, 2, 'activo', CURRENT_DATE)
       RETURNING id`,
      [pacienteId]
    );
    console.log('OK: cerrar embarazo y crear uno nuevo funciona');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
