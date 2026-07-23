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
      summary AS (
        SELECT
          lc.cita_siguiente AS fecha_proxima_cita,
          COUNT(*)::integer AS total
        FROM latest_control lc
        CROSS JOIN bounds b
        WHERE lc.rn = 1
          AND lc.cita_siguiente IS NOT NULL
          AND lc.cita_siguiente >= b.fecha_desde
          AND lc.cita_siguiente < b.fecha_hasta_exclusiva
        GROUP BY lc.cita_siguiente
      )
      SELECT
        b.fecha_desde,
        b.fecha_hasta_exclusiva - 1 AS fecha_hasta,
        s.fecha_proxima_cita,
        COALESCE(s.total, 0)::integer AS total
      FROM bounds b
      LEFT JOIN summary s ON TRUE
      ORDER BY s.fecha_proxima_cita ASC NULLS LAST`,
      [offsetDays, windowDays]
    );
    return rows;
  }

  return {
    obtenerResumenProximasCitas,
  };
}

const repository = createAutomatizacionesRepository();

module.exports = {
  ...repository,
  createAutomatizacionesRepository,
};
