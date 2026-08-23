const pool = require('../db/pool');

function createAutomatizacionesRepository(db = pool) {
  async function obtenerResumenProximasCitas({ offsetDays, windowDays }) {
    const { rows } = await db.query(
      `WITH bounds AS (
        SELECT
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date
            + $1::integer AS fecha_desde,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date
            + $1::integer + $2::integer AS fecha_hasta_exclusiva
      ),
      latest_control AS (
        SELECT
          c.embarazo_id,
          c.paciente_id,
          c.cita_siguiente,
          ROW_NUMBER() OVER (
            PARTITION BY c.embarazo_id
            ORDER BY c.fecha DESC, c.numero_control DESC, c.id DESC
          ) AS rn
        FROM controles_prenatales c
        JOIN embarazos e
          ON e.id = c.embarazo_id
         AND e.paciente_id = c.paciente_id
         AND e.estado = 'activo'
        WHERE c.embarazo_id IS NOT NULL
      ),
      appointments AS (
        SELECT
          lc.cita_siguiente AS fecha_proxima_cita,
          SPLIT_PART(TRIM(p.nombres), ' ', 1) AS primer_nombre,
          SPLIT_PART(TRIM(p.apellidos), ' ', 1) AS primer_apellido,
          COALESCE(p.telefono, '') AS telefono,
          COALESCE(com.nombre, p.comunidad, '') AS comunidad
        FROM latest_control lc
        JOIN pacientes p ON p.id = lc.paciente_id
        LEFT JOIN comunidades com ON com.id = p.comunidad_id
        CROSS JOIN bounds b
        WHERE lc.rn = 1
          AND lc.cita_siguiente IS NOT NULL
          AND lc.cita_siguiente >= b.fecha_desde
          AND lc.cita_siguiente < b.fecha_hasta_exclusiva
      )
      SELECT
        b.fecha_desde,
        b.fecha_hasta_exclusiva - 1 AS fecha_hasta,
        a.fecha_proxima_cita,
        a.primer_nombre,
        a.primer_apellido,
        a.telefono,
        a.comunidad
      FROM bounds b
      LEFT JOIN appointments a ON TRUE
      ORDER BY
        a.fecha_proxima_cita ASC NULLS LAST,
        a.primer_apellido ASC NULLS LAST,
        a.primer_nombre ASC NULLS LAST`,
      [offsetDays, windowDays]
    );
    return rows;
  }

  async function obtenerResumenCensoPrimerControl({ desde, hasta }) {
    const { rows } = await db.query(
      `WITH primer_control AS (
        SELECT DISTINCT ON (c.embarazo_id)
          c.embarazo_id,
          c.fecha
        FROM controles_prenatales c
        WHERE c.numero_control = 1
        ORDER BY c.embarazo_id, c.fecha ASC, c.id ASC
      )
      SELECT
        $1::date AS fecha_desde,
        $2::date AS fecha_hasta,
        COUNT(*)::integer AS total
      FROM primer_control pc
      WHERE pc.fecha BETWEEN $1::date AND $2::date`,
      [desde, hasta]
    );
    return rows;
  }

  return {
    obtenerResumenCensoPrimerControl,
    obtenerResumenProximasCitas,
  };
}

const repository = createAutomatizacionesRepository();

module.exports = {
  ...repository,
  createAutomatizacionesRepository,
};
