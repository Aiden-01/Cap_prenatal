const pool = require('../db/pool');

const GT_TODAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date";

function createReportesRepository(db = pool) {
  async function obtenerRowsCensoPrimerControl(desde, hasta) {
    const { rows } = await db.query(
      `WITH primer_control AS (
        SELECT DISTINCT ON (c.embarazo_id)
          c.id,
          c.paciente_id,
          c.embarazo_id,
          c.fecha,
          c.edad_gestacional_semanas
        FROM controles_prenatales c
        WHERE c.numero_control = 1
        ORDER BY c.embarazo_id, c.fecha ASC, c.id ASC
      )
      SELECT
        p.id,
        e.numero_embarazo,
        e.estado                         AS estado_embarazo,
        p.no_expediente,
        p.cui,
        p.nombres || ' ' || p.apellidos AS nombre_completo,
        DATE_PART('year', AGE(pc.fecha, p.fecha_nacimiento))::INTEGER AS edad,
        p.pueblo                        AS etnia,
        COALESCE(com.nombre, p.comunidad) AS comunidad,
        COALESCE(e.fur, p.fur)          AS fur,
        COALESCE(e.fpp, p.fpp)          AS fpp,
        pc.fecha                        AS fecha_primer_control,
        COALESCE(
          pc.edad_gestacional_semanas,
          CASE
            WHEN COALESCE(e.fur, p.fur) IS NOT NULL
              AND COALESCE(e.fur, p.fur) <= pc.fecha
            THEN FLOOR((pc.fecha - COALESCE(e.fur, p.fur)) / 7.0)::INTEGER
            ELSE NULL
          END
        )                               AS semanas_gestacion,
        COALESCE(p.gestas_previas, 0)   AS gestas,
        COALESCE(p.partos_vaginales, 0) + COALESCE(p.cesareas, 0) AS partos,
        COALESCE(p.abortos, 0)          AS abortos,
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo
      FROM primer_control pc
      JOIN embarazos e ON e.id = pc.embarazo_id
      JOIN pacientes p ON p.id = pc.paciente_id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      WHERE pc.fecha BETWEEN $1::date AND $2::date
      ORDER BY pc.fecha ASC, p.apellidos ASC, p.nombres ASC, e.numero_embarazo ASC`,
      [desde, hasta]
    );

    return rows;
  }

  async function obtenerRowsCensoGeneral() {
    const { rows } = await db.query(`
      SELECT
        p.id,
        e.numero_embarazo,
        e.estado                         AS estado_embarazo,
        e.fecha_inicio,
        p.no_expediente,
        p.cui,
        p.nombres || ' ' || p.apellidos AS nombre_completo,
        DATE_PART('year', AGE(${GT_TODAY_SQL}, p.fecha_nacimiento))::INTEGER AS edad,
        p.pueblo                        AS etnia,
        COALESCE(com.nombre, p.comunidad) AS comunidad,
        COALESCE(e.fur, p.fur)          AS fur,
        COALESCE(e.fpp, p.fpp)          AS fpp,
        CASE
          WHEN COALESCE(e.fur, p.fur) IS NOT NULL
            AND COALESCE(e.fur, p.fur) <= ${GT_TODAY_SQL}
          THEN FLOOR((${GT_TODAY_SQL} - COALESCE(e.fur, p.fur)) / 7.0)::INTEGER
          ELSE NULL
        END                             AS semanas_gestacion,
        COALESCE(p.gestas_previas, 0)   AS gestas,
        COALESCE(p.partos_vaginales, 0) + COALESCE(p.cesareas, 0) AS partos,
        COALESCE(p.abortos, 0)          AS abortos,
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo
      FROM embarazos e
      JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      WHERE e.estado = 'activo'
      ORDER BY p.apellidos ASC, p.nombres ASC, e.numero_embarazo ASC
    `);
    return rows;
  }

  async function obtenerEstadisticasBase() {
    const [
      totalPacientes,
      embarazosActivos,
      pacientesConRiesgo,
      controlesEsteMes,
      proximasCitas,
    ] = await Promise.all([
      db.query('SELECT COUNT(*) FROM pacientes'),
      db.query("SELECT COUNT(*) FROM embarazos WHERE estado = 'activo'"),
      db.query(
        `SELECT COUNT(*)
         FROM fichas_riesgo_obstetrico r
         JOIN embarazos e ON e.id = r.embarazo_id
         WHERE r.tiene_riesgo = TRUE AND e.estado = 'activo'`
      ),
      db.query(`
        SELECT COUNT(*) FROM controles_prenatales
        WHERE fecha >= DATE_TRUNC('month', ${GT_TODAY_SQL})::date
          AND fecha < (DATE_TRUNC('month', ${GT_TODAY_SQL}) + INTERVAL '1 month')::date
      `),
      db.query(`
        SELECT
          p.id,
          p.nombres || ' ' || p.apellidos AS nombre,
          p.no_expediente,
          c.cita_siguiente,
          c.numero_control
        FROM controles_prenatales c
        JOIN embarazos e ON e.id = c.embarazo_id AND e.estado = 'activo'
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.cita_siguiente BETWEEN ${GT_TODAY_SQL} AND ${GT_TODAY_SQL} + 7
        ORDER BY c.cita_siguiente ASC, p.apellidos ASC, p.nombres ASC
        LIMIT 15
      `),
    ]);

    return {
      totalPacientes: totalPacientes.rows[0],
      embarazosActivos: embarazosActivos.rows[0],
      pacientesConRiesgo: pacientesConRiesgo.rows[0],
      controlesEsteMes: controlesEsteMes.rows[0],
      proximasCitas: proximasCitas.rows,
    };
  }

  async function obtenerPacientesConRiesgo() {
    const { rows } = await db.query(`
      SELECT
        p.id,
        p.nombres || ' ' || p.apellidos AS nombre,
        p.no_expediente,
        DATE_PART('year', AGE(${GT_TODAY_SQL}, p.fecha_nacimiento))::INTEGER AS edad,
        COALESCE(com.nombre, p.comunidad) AS comunidad,
        COALESCE(e.fpp, p.fpp) AS fpp,
        CASE
          WHEN COALESCE(e.fur, p.fur) IS NOT NULL
            AND COALESCE(e.fur, p.fur) <= ${GT_TODAY_SQL}
          THEN FLOOR((${GT_TODAY_SQL} - COALESCE(e.fur, p.fur)) / 7.0)::INTEGER
          ELSE NULL
        END AS semanas_actuales,
        (COALESCE(r.updated_at, r.created_at) AT TIME ZONE 'America/Guatemala')::date
          AS fecha_evaluacion_riesgo,
        r.tiene_riesgo
      FROM embarazos e
      JOIN pacientes p ON p.id = e.paciente_id
      JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      WHERE e.estado = 'activo' AND r.tiene_riesgo = TRUE
      ORDER BY p.apellidos ASC, p.nombres ASC
    `);
    return rows;
  }

  async function obtenerProximasAParir() {
    const { rows } = await db.query(`
      SELECT
        p.id,
        p.nombres || ' ' || p.apellidos AS nombre,
        p.no_expediente,
        p.telefono,
        COALESCE(com.nombre, p.comunidad) AS comunidad,
        COALESCE(e.fpp, p.fpp) AS fpp,
        (COALESCE(e.fpp, p.fpp) - ${GT_TODAY_SQL})::INTEGER AS dias_restantes,
        CASE
          WHEN COALESCE(e.fur, p.fur) IS NOT NULL
            AND COALESCE(e.fur, p.fur) <= ${GT_TODAY_SQL}
          THEN FLOOR((${GT_TODAY_SQL} - COALESCE(e.fur, p.fur)) / 7.0)::INTEGER
          ELSE NULL
        END AS semanas_actuales,
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
        ultimo.numero_control AS ultimo_control
      FROM embarazos e
      JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      LEFT JOIN LATERAL (
        SELECT c.numero_control
        FROM controles_prenatales c
        WHERE c.embarazo_id = e.id
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT 1
      ) ultimo ON TRUE
      WHERE e.estado = 'activo'
        AND COALESCE(e.fpp, p.fpp) IS NOT NULL
        AND COALESCE(e.fpp, p.fpp)
          BETWEEN ${GT_TODAY_SQL} AND ${GT_TODAY_SQL} + 30
      ORDER BY COALESCE(e.fpp, p.fpp) ASC, p.apellidos ASC, p.nombres ASC
    `);
    return rows;
  }

  async function obtenerSinControlReciente() {
    const { rows } = await db.query(`
      SELECT
        p.id,
        p.nombres || ' ' || p.apellidos AS nombre,
        p.no_expediente,
        p.telefono,
        COALESCE(com.nombre, p.comunidad) AS comunidad,
        COALESCE(e.fpp, p.fpp) AS fpp,
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
        ultimo.fecha AS ultimo_control_fecha,
        ultimo.numero_control AS ultimo_control_numero,
        CASE
          WHEN ultimo.fecha IS NULL THEN NULL
          ELSE (${GT_TODAY_SQL} - ultimo.fecha)::INTEGER
        END AS dias_sin_control,
        CASE
          WHEN ultimo.fecha IS NULL THEN 'nunca_control'
          ELSE 'control_atrasado'
        END AS estado_seguimiento
      FROM embarazos e
      JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      LEFT JOIN LATERAL (
        SELECT c.fecha, c.numero_control
        FROM controles_prenatales c
        WHERE c.embarazo_id = e.id
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT 1
      ) ultimo ON TRUE
      WHERE e.estado = 'activo'
        AND (COALESCE(e.fpp, p.fpp) IS NULL OR COALESCE(e.fpp, p.fpp) >= ${GT_TODAY_SQL})
        AND (ultimo.fecha IS NULL OR (${GT_TODAY_SQL} - ultimo.fecha)::INTEGER > 28)
      ORDER BY ultimo.fecha ASC NULLS FIRST, p.apellidos ASC, p.nombres ASC
    `);
    return rows;
  }

  async function obtenerResumenPorComunidad() {
    const { rows } = await db.query(`
      SELECT
        COALESCE(com.nombre, 'Sin comunidad catalogada') AS comunidad,
        com.territorio,
        com.sector,
        COUNT(*)::INTEGER AS embarazos_activos,
        COUNT(*) FILTER (WHERE COALESCE(r.tiene_riesgo, FALSE) = TRUE)::INTEGER
          AS con_riesgo,
        COUNT(*) FILTER (
          WHERE COALESCE(e.fpp, p.fpp)
            BETWEEN ${GT_TODAY_SQL} AND ${GT_TODAY_SQL} + 30
        )::INTEGER AS proximas_a_parir,
        COUNT(*) FILTER (
          WHERE (COALESCE(e.fpp, p.fpp) IS NULL OR COALESCE(e.fpp, p.fpp) >= ${GT_TODAY_SQL})
            AND (
              ultimo.fecha IS NULL
              OR (${GT_TODAY_SQL} - ultimo.fecha)::INTEGER > 28
            )
        )::INTEGER AS sin_control_reciente
      FROM embarazos e
      JOIN pacientes p ON p.id = e.paciente_id
      LEFT JOIN comunidades com ON com.id = p.comunidad_id
      LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      LEFT JOIN LATERAL (
        SELECT c.fecha
        FROM controles_prenatales c
        WHERE c.embarazo_id = e.id
        ORDER BY c.fecha DESC, c.id DESC
        LIMIT 1
      ) ultimo ON TRUE
      WHERE e.estado = 'activo'
      GROUP BY com.id, com.nombre, com.territorio, com.sector
      ORDER BY com.territorio NULLS LAST, com.sector NULLS LAST, comunidad ASC
    `);
    return rows;
  }

  return {
    obtenerRowsCensoGeneral,
    obtenerRowsCensoPrimerControl,
    obtenerEstadisticasBase,
    obtenerPacientesConRiesgo,
    obtenerProximasAParir,
    obtenerSinControlReciente,
    obtenerResumenPorComunidad,
  };
}

module.exports = {
  ...createReportesRepository(pool),
  createReportesRepository,
  GT_TODAY_SQL,
};
