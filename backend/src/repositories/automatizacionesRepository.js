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
      appointments AS (
        SELECT
          cp.fecha_programada AS fecha_proxima_cita,
          SPLIT_PART(TRIM(p.nombres), ' ', 1) AS primer_nombre,
          SPLIT_PART(TRIM(p.apellidos), ' ', 1) AS primer_apellido,
          COALESCE(p.telefono, '') AS telefono,
          COALESCE(com.nombre, p.comunidad, '') AS comunidad
        FROM citas_prenatales cp
        JOIN embarazos e
          ON e.id = cp.embarazo_id
         AND e.estado = 'activo'
        JOIN pacientes p ON p.id = e.paciente_id
        LEFT JOIN comunidades com ON com.id = p.comunidad_id
        CROSS JOIN bounds b
        WHERE cp.estado = 'programada'
          AND cp.control_cumplimiento_id IS NULL
          AND cp.fecha_programada >= b.fecha_desde
          AND cp.fecha_programada < b.fecha_hasta_exclusiva
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

  async function obtenerCorteConfiableCitas(queryable = db) {
    const { rows } = await queryable.query(
      `SELECT applied_at
       FROM schema_migrations
       WHERE filename = '014_citas_prenatales.sql'`
    );
    return rows[0]?.applied_at || null;
  }

  async function obtenerInasistenciasSemanales({ desde, hasta, corteAt }, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT
         cp.fecha_programada AS fecha_cita,
         SPLIT_PART(TRIM(p.nombres), ' ', 1) AS primer_nombre,
         SPLIT_PART(TRIM(p.apellidos), ' ', 1) AS primer_apellido,
         COALESCE(p.telefono, '') AS telefono,
         COALESCE(com.nombre, p.comunidad, '') AS comunidad
       FROM citas_prenatales cp
       JOIN embarazos e
         ON e.id = cp.embarazo_id
        AND e.estado = 'activo'
       JOIN pacientes p ON p.id = e.paciente_id
       LEFT JOIN comunidades com ON com.id = p.comunidad_id
       WHERE cp.fecha_programada BETWEEN $1::date AND $2::date
         AND cp.estado = 'programada'
         AND cp.control_cumplimiento_id IS NULL
         AND cp.created_at >= $3::timestamptz
       ORDER BY
         cp.fecha_programada ASC,
         primer_apellido ASC,
         primer_nombre ASC`,
      [desde, hasta, corteAt]
    );
    return rows;
  }

  async function obtenerDespacho({ tipo, desde, hasta }, queryable = db, {
    bloquear = false,
  } = {}) {
    const { rows } = await queryable.query(
      `SELECT *
       FROM automatizacion_despachos
       WHERE tipo = $1
         AND periodo_desde = $2::date
         AND periodo_hasta = $3::date${bloquear ? '\n       FOR UPDATE' : ''}`,
      [tipo, desde, hasta]
    );
    return rows[0] || null;
  }

  async function crearDespacho({
    tipo,
    desde,
    hasta,
    estado,
    tokenHash = null,
    total,
  }, queryable = db) {
    const { rows } = await queryable.query(
      `INSERT INTO automatizacion_despachos (
         tipo, periodo_desde, periodo_hasta, estado, token_hash,
         total_registros, reservado_at
       ) VALUES (
         $1, $2::date, $3::date, $4::varchar(24), $5, $6,
         CASE WHEN $4::text = 'reservado' THEN NOW() ELSE NULL END
       )
       ON CONFLICT (tipo, periodo_desde, periodo_hasta) DO NOTHING
       RETURNING *`,
      [tipo, desde, hasta, estado, tokenHash, total]
    );
    return rows[0] || null;
  }

  async function renovarDespacho({ despachoId, tokenHash, total }, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE automatizacion_despachos
       SET estado = 'reservado',
           token_hash = $2,
           total_registros = $3,
           numero_intento = numero_intento + 1,
           motivo_resolucion = NULL,
           reservado_at = NOW(),
           enviado_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND estado = 'reintento_autorizado'
       RETURNING *`,
      [despachoId, tokenHash, total]
    );
    return rows[0] || null;
  }

  async function marcarDespachoSinResultados({ despachoId }, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE automatizacion_despachos
       SET estado = 'sin_resultados',
           token_hash = NULL,
           total_registros = 0,
           motivo_resolucion = NULL,
           reservado_at = NULL,
           enviado_at = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND estado = 'reintento_autorizado'
       RETURNING *`,
      [despachoId]
    );
    return rows[0] || null;
  }

  async function obtenerDespachoPorTokenHash({ tipo, tokenHash }, queryable = db, {
    bloquear = false,
  } = {}) {
    const { rows } = await queryable.query(
      `SELECT *
       FROM automatizacion_despachos
       WHERE tipo = $1
         AND token_hash = $2${bloquear ? '\n       FOR UPDATE' : ''}`,
      [tipo, tokenHash]
    );
    return rows[0] || null;
  }

  async function marcarDespachoEnviado({ despachoId }, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE automatizacion_despachos
       SET estado = 'enviado',
           enviado_at = COALESCE(enviado_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
         AND estado IN ('reservado', 'enviado')
       RETURNING *`,
      [despachoId]
    );
    return rows[0] || null;
  }

  async function resolverDespacho({
    despachoId,
    estado,
    motivoCodigo,
  }, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE automatizacion_despachos
       SET estado = $2::varchar(24),
           token_hash = CASE WHEN $2::text = 'reintento_autorizado' THEN NULL ELSE token_hash END,
           motivo_resolucion = $3,
           enviado_at = CASE WHEN $2::text = 'enviado' THEN COALESCE(enviado_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
         AND estado = 'reservado'
       RETURNING *`,
      [despachoId, estado, motivoCodigo]
    );
    return rows[0] || null;
  }

  async function enTransaccion(callback) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    crearDespacho,
    enTransaccion,
    marcarDespachoEnviado,
    marcarDespachoSinResultados,
    obtenerCorteConfiableCitas,
    obtenerDespacho,
    obtenerDespachoPorTokenHash,
    obtenerInasistenciasSemanales,
    obtenerResumenCensoPrimerControl,
    obtenerResumenProximasCitas,
    renovarDespacho,
    resolverDespacho,
  };
}

const repository = createAutomatizacionesRepository();

module.exports = {
  ...repository,
  createAutomatizacionesRepository,
};
