const pool = require('../db/pool');

async function obtenerPacientePorId(pacienteId) {
  const { rows } = await pool.query(
    'SELECT * FROM pacientes WHERE id = $1',
    [pacienteId]
  );
  return rows[0] || null;
}

async function resolverEmbarazoParaPdf({ pacienteId, embarazoId = null }) {
  const { rows } = await pool.query(
    `SELECT e.*
     FROM embarazos e
     WHERE e.paciente_id = $1
       AND ($2::integer IS NULL OR e.id = $2)
     ORDER BY
       CASE e.estado WHEN 'activo' THEN 1 WHEN 'puerperio' THEN 2 ELSE 3 END,
       e.numero_embarazo DESC
     LIMIT 1`,
    [pacienteId, embarazoId]
  );
  return rows[0] || null;
}

async function obtenerControlConPaciente({ id, pacienteId, embarazoId = null }) {
  const { rows } = await pool.query(
    `SELECT c.*, p.nombres, p.apellidos, p.no_expediente
     FROM controles_prenatales c
     JOIN pacientes p ON p.id = c.paciente_id
     LEFT JOIN embarazos e ON e.id = c.embarazo_id
     WHERE c.id = $1 AND c.paciente_id = $2
       AND (c.embarazo_id IS NULL OR e.paciente_id = p.id)
       AND ($3::integer IS NULL OR c.embarazo_id = $3)`,
    [id, pacienteId, embarazoId]
  );

  return rows[0] || null;
}

async function obtenerFichaMspasData({ pacienteId, embarazoId }) {
  if (!embarazoId) {
    return {
      controles: [],
      puerperio: [],
      riesgo: null,
      planParto: null,
      vacunas: [],
      morbilidad: [],
    };
  }

  const [controlesRes, puerperioRes, riesgoRes, planPartoRes, vacunasRes, morbilidadRes] = await Promise.all([
    pool.query(
      `SELECT c.*
       FROM controles_prenatales c
       JOIN embarazos e ON e.id = c.embarazo_id
       WHERE c.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY c.numero_control
       LIMIT 5`,
      [embarazoId, pacienteId]
    ),
    pool.query(
      `SELECT cp.*
       FROM controles_puerperio cp
       JOIN embarazos e ON e.id = cp.embarazo_id
       WHERE cp.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY cp.numero_atencion`,
      [embarazoId, pacienteId]
    ),
    pool.query(
      `SELECT fr.*
       FROM fichas_riesgo_obstetrico fr
       JOIN embarazos e ON e.id = fr.embarazo_id
       WHERE fr.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY fr.fecha DESC
       LIMIT 1`,
      [embarazoId, pacienteId]
    ),
    pool.query(
      `SELECT pp.*
       FROM planes_parto pp
       JOIN embarazos e ON e.id = pp.embarazo_id
       WHERE pp.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY pp.fecha DESC
       LIMIT 1`,
      [embarazoId, pacienteId]
    ),
    pool.query(
      `SELECT vp.*
       FROM vacunas_paciente vp
       JOIN embarazos e ON e.id = vp.embarazo_id
       WHERE vp.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY vp.tipo_vacuna, vp.momento, vp.numero_dosis`,
      [embarazoId, pacienteId]
    ),
    pool.query(
      `SELECT m.*,
              COALESCE(NULLIF(BTRIM(m.nombre_cargo_atiende), ''), u.nombre_completo) AS persona_atiende_pdf
       FROM morbilidad_embarazo m
       JOIN embarazos e ON e.id = m.embarazo_id
       LEFT JOIN usuarios u ON u.id = m.registrado_por
       WHERE m.embarazo_id = $1 AND e.paciente_id = $2
       ORDER BY m.fecha ASC, m.hora ASC NULLS LAST, m.id ASC`,
      [embarazoId, pacienteId]
    ),
  ]);

  return {
    controles: controlesRes.rows,
    puerperio: puerperioRes.rows,
    riesgo: riesgoRes.rows[0] || null,
    planParto: planPartoRes.rows[0] || null,
    vacunas: vacunasRes.rows,
    morbilidad: morbilidadRes.rows,
  };
}

async function obtenerFichaRiesgoData({ pacienteId, embarazoId }) {
  if (!embarazoId) return { riesgo: null };

  const { rows } = await pool.query(
    `SELECT fr.*
     FROM fichas_riesgo_obstetrico fr
     JOIN embarazos e ON e.id = fr.embarazo_id
     WHERE fr.embarazo_id = $1 AND e.paciente_id = $2
     ORDER BY fr.fecha DESC
     LIMIT 1`,
    [embarazoId, pacienteId]
  );

  return { riesgo: rows[0] || null };
}

async function obtenerPlanPartoData({ pacienteId, embarazoId }) {
  if (!embarazoId) return { plan: null };

  const { rows } = await pool.query(
    `SELECT pp.*
     FROM planes_parto pp
     JOIN embarazos e ON e.id = pp.embarazo_id
     WHERE pp.embarazo_id = $1 AND e.paciente_id = $2
     ORDER BY pp.fecha DESC
     LIMIT 1`,
    [embarazoId, pacienteId]
  );

  return { plan: rows[0] || null };
}

module.exports = {
  obtenerControlConPaciente,
  obtenerFichaMspasData,
  obtenerFichaRiesgoData,
  obtenerPacientePorId,
  obtenerPlanPartoData,
  resolverEmbarazoParaPdf,
};
