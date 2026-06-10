const pool = require('../db/pool');

async function obtenerControlConPaciente(id) {
  const { rows } = await pool.query(
    `SELECT c.*, p.nombres, p.apellidos, p.no_expediente
     FROM controles_prenatales c
     JOIN pacientes p ON p.id = c.paciente_id
     WHERE c.id = $1`,
    [id]
  );

  return rows[0] || null;
}

async function obtenerFichaMspasData({ pacienteId, embarazoId }) {
  const [pacienteRes, embarazoRes, controlesRes, puerperioRes, riesgoRes, planPartoRes, vacunasRes] = await Promise.all([
    pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
    pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoId]),
    pool.query(
      'SELECT * FROM controles_prenatales WHERE embarazo_id = $1 ORDER BY numero_control LIMIT 5',
      [embarazoId]
    ),
    pool.query(
      'SELECT * FROM controles_puerperio WHERE embarazo_id = $1 ORDER BY numero_atencion',
      [embarazoId]
    ),
    pool.query(
      'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    ),
    pool.query(
      'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    ),
    pool.query(
      'SELECT * FROM vacunas_paciente WHERE embarazo_id = $1 ORDER BY tipo_vacuna, momento, numero_dosis',
      [embarazoId]
    ),
  ]);

  return {
    paciente: pacienteRes.rows[0] || null,
    embarazo: embarazoRes.rows[0] || null,
    controles: controlesRes.rows,
    puerperio: puerperioRes.rows,
    riesgo: riesgoRes.rows[0] || null,
    planParto: planPartoRes.rows[0] || null,
    vacunas: vacunasRes.rows,
  };
}

async function obtenerFichaRiesgoData({ pacienteId, embarazoId }) {
  const [pacienteRes, embarazoRes, riesgoRes] = await Promise.all([
    pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
    pool.query('SELECT * FROM embarazos WHERE id = $1', [embarazoId]),
    pool.query(
      'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    ),
  ]);

  return {
    paciente: pacienteRes.rows[0] || null,
    embarazo: embarazoRes.rows[0] || null,
    riesgo: riesgoRes.rows[0] || null,
  };
}

async function obtenerPlanPartoData({ pacienteId, embarazoId }) {
  const [pacienteRes, planRes] = await Promise.all([
    pool.query('SELECT * FROM pacientes WHERE id = $1', [pacienteId]),
    pool.query(
      'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    ),
  ]);

  return {
    paciente: pacienteRes.rows[0] || null,
    plan: planRes.rows[0] || null,
  };
}

module.exports = {
  obtenerControlConPaciente,
  obtenerFichaMspasData,
  obtenerFichaRiesgoData,
  obtenerPlanPartoData,
};
