const pool = require('../db/pool');

async function obtenerRowsCensoGeneral(desde, hasta) {
  const { rows } = await pool.query(
    `SELECT
      p.id,
      p.no_expediente,
      p.no_expediente                  AS no_historia_clinica,
      p.cui,
      p.nombres,
      p.apellidos,
      p.nombres || ' ' || p.apellidos AS nombre_completo,
      DATE_PART('year', AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
      p.pueblo                        AS grupo_etnico,
      p.pueblo                        AS etnia,
      p.municipio,
      p.comunidad,
      COALESCE(e.fur, p.fur)          AS fur,
      COALESCE(e.fpp, p.fpp)          AS fpp,
      COALESCE(e.fpp, p.fpp)          AS fecha_probable_parto,
      p.gestas_previas                AS no_embarazos,
      p.gestas_previas,
      p.partos_vaginales + p.cesareas AS no_partos,
      p.partos_vaginales + p.cesareas AS partos,
      p.cesareas                      AS no_cesareas,
      p.abortos                       AS no_abortos,
      p.abortos,
      p.nacidos_vivos                 AS hijos_vivos,
      p.muertos_antes_1sem + p.muertos_despues_1sem AS hijos_muertos,
      EXTRACT(WEEK FROM AGE(CURRENT_DATE, COALESCE(e.fur, p.fur)))::INTEGER AS semanas_gestacion,
      EXTRACT(WEEK FROM AGE(CURRENT_DATE, COALESCE(e.fur, p.fur)))::INTEGER AS semanas,
      COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
      COALESCE(r.tiene_riesgo, FALSE) AS riesgo,
      p.created_at
    FROM pacientes p
    LEFT JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    WHERE DATE(p.created_at) BETWEEN $1 AND $2
    ORDER BY p.apellidos ASC, p.nombres ASC`,
    [desde, hasta]
  );

  return rows;
}

async function obtenerRowsCensoPrimerControl(desde, hasta) {
  const { rows } = await pool.query(
    `WITH primer_control AS (
      SELECT DISTINCT ON (c.embarazo_id)
        c.id,
        c.paciente_id,
        c.embarazo_id,
        c.numero_control,
        c.fecha,
        c.edad_gestacional_semanas
      FROM controles_prenatales c
      WHERE c.numero_control = 1
      ORDER BY c.embarazo_id, c.fecha ASC, c.id ASC
    )
    SELECT
      p.id,
      pc.id                            AS control_id,
      pc.embarazo_id,
      e.numero_embarazo,
      pc.fecha                         AS fecha_primer_control,
      p.no_expediente,
      p.no_expediente                  AS no_historia_clinica,
      p.cui,
      p.nombres,
      p.apellidos,
      p.nombres || ' ' || p.apellidos AS nombre_completo,
      DATE_PART('year', AGE(pc.fecha, p.fecha_nacimiento))::INTEGER AS edad,
      p.pueblo                        AS grupo_etnico,
      p.pueblo                        AS etnia,
      p.municipio,
      p.comunidad,
      COALESCE(e.fur, p.fur)          AS fur,
      COALESCE(e.fpp, p.fpp)          AS fpp,
      COALESCE(e.fpp, p.fpp)          AS fecha_probable_parto,
      p.gestas_previas                AS no_embarazos,
      p.gestas_previas                AS gestas_previas,
      p.partos_vaginales + p.cesareas AS no_partos,
      p.partos_vaginales + p.cesareas AS partos,
      p.cesareas                      AS no_cesareas,
      p.abortos                       AS no_abortos,
      p.abortos,
      p.nacidos_vivos                 AS hijos_vivos,
      p.muertos_antes_1sem + p.muertos_despues_1sem AS hijos_muertos,
      COALESCE(
        pc.edad_gestacional_semanas,
        EXTRACT(WEEK FROM AGE(pc.fecha, COALESCE(e.fur, p.fur)))::INTEGER
      )                               AS semanas_gestacion,
      COALESCE(
        pc.edad_gestacional_semanas,
        EXTRACT(WEEK FROM AGE(pc.fecha, COALESCE(e.fur, p.fur)))::INTEGER
      )                               AS semanas,
      COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
      COALESCE(r.tiene_riesgo, FALSE) AS riesgo,
      pc.fecha                        AS created_at
    FROM primer_control pc
    JOIN embarazos e ON e.id = pc.embarazo_id
    JOIN pacientes p ON p.id = pc.paciente_id
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    WHERE pc.fecha BETWEEN $1 AND $2
    ORDER BY pc.fecha ASC, p.apellidos ASC, p.nombres ASC`,
    [desde, hasta]
  );

  return rows;
}

async function obtenerEstadisticasBase() {
  const [
    totalPacientes,
    pacientesConRiesgo,
    controlesEsteMes,
    proximasCitas,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM pacientes'),
    pool.query(
      `SELECT COUNT(*)
       FROM fichas_riesgo_obstetrico r
       JOIN embarazos e ON e.id = r.embarazo_id
       WHERE r.tiene_riesgo = TRUE AND e.estado = 'activo'`
    ),
    pool.query(`
      SELECT COUNT(*) FROM controles_prenatales
      WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR  FROM fecha) = EXTRACT(YEAR  FROM CURRENT_DATE)
    `),
    pool.query(`
      SELECT
        p.id,
        p.nombres || ' ' || p.apellidos AS nombre,
        p.no_expediente,
        c.cita_siguiente,
        c.numero_control
      FROM controles_prenatales c
      JOIN embarazos e ON e.id = c.embarazo_id AND e.estado = 'activo'
      JOIN pacientes p ON p.id = c.paciente_id
      WHERE c.cita_siguiente BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      ORDER BY c.cita_siguiente ASC
      LIMIT 15
    `),
  ]);

  return {
    totalPacientes: totalPacientes.rows[0],
    pacientesConRiesgo: pacientesConRiesgo.rows[0],
    controlesEsteMes: controlesEsteMes.rows[0],
    proximasCitas: proximasCitas.rows,
  };
}

async function obtenerPacientesConRiesgo() {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.nombres || ' ' || p.apellidos AS nombre,
      p.no_expediente,
      p.cui,
      DATE_PART('year', AGE(CURRENT_DATE, p.fecha_nacimiento))::INTEGER AS edad,
      COALESCE(e.fur, p.fur) AS fur,
      r.tiene_riesgo
    FROM pacientes p
    JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    WHERE r.tiene_riesgo = TRUE
    ORDER BY p.apellidos ASC, p.nombres ASC
  `);
  return rows;
}

async function obtenerProximasAParir() {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.nombres || ' ' || p.apellidos       AS nombre,
      p.no_expediente,
      p.telefono,
      p.comunidad,
      p.municipio,
      COALESCE(e.fpp, p.fpp)                 AS fpp,
      (COALESCE(e.fpp, p.fpp) - CURRENT_DATE)::INTEGER AS dias_restantes,
      COALESCE(r.tiene_riesgo, FALSE)        AS tiene_riesgo,
      (
        SELECT MAX(c.numero_control)
        FROM controles_prenatales c
        WHERE c.embarazo_id = e.id
      )                                      AS ultimo_control
    FROM pacientes p
    JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    WHERE COALESCE(e.fpp, p.fpp) IS NOT NULL
      AND COALESCE(e.fpp, p.fpp) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    ORDER BY COALESCE(e.fpp, p.fpp) ASC
  `);
  return rows;
}

async function obtenerSinControlReciente() {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.nombres || ' ' || p.apellidos        AS nombre,
      p.no_expediente,
      p.telefono,
      p.comunidad,
      p.municipio,
      COALESCE(e.fur, p.fur)                  AS fur,
      COALESCE(e.fpp, p.fpp)                  AS fpp,
      COALESCE(r.tiene_riesgo, FALSE)         AS tiene_riesgo,
      MAX(c.fecha)                            AS ultimo_control_fecha,
      MAX(c.numero_control)                   AS ultimo_control_numero,
      (CURRENT_DATE - MAX(c.fecha))::INTEGER  AS dias_sin_control
    FROM pacientes p
    JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    LEFT JOIN controles_prenatales c ON c.embarazo_id = e.id
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    WHERE
      (COALESCE(e.fpp, p.fpp) IS NULL OR COALESCE(e.fpp, p.fpp) >= CURRENT_DATE)
    GROUP BY p.id, p.nombres, p.apellidos, p.no_expediente,
             p.telefono, p.comunidad, p.municipio,
             COALESCE(e.fur, p.fur), COALESCE(e.fpp, p.fpp), r.tiene_riesgo
    HAVING
      MAX(c.fecha) IS NULL
      OR (CURRENT_DATE - MAX(c.fecha))::INTEGER > 28
    ORDER BY dias_sin_control DESC NULLS FIRST
  `);
  return rows;
}

module.exports = {
  obtenerRowsCensoGeneral,
  obtenerRowsCensoPrimerControl,
  obtenerEstadisticasBase,
  obtenerPacientesConRiesgo,
  obtenerProximasAParir,
  obtenerSinControlReciente,
};
