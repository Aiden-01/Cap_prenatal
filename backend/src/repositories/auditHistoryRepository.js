const pool = require('../db/pool');
const { MODULES, ENTITIES } = require('../validations/auditoria.schemas');
const { DESCRIPTION_CODES } = require('../services/audit/auditHistoryPresentation');

function createAuditHistoryRepository({ db = pool } = {}) {
  return {
    async listarUsuarios() {
      const { rows } = await db.query(`SELECT id, username, nombre_completo
        FROM usuarios ORDER BY nombre_completo, id`);
      return rows;
    },
    async listar(filters, cursor) {
      const params = [MODULES, ENTITIES];
      const bind = (value) => { params.push(value); return `$${params.length}`; };
      const where = [];
      if (filters.tipo) where.push(`ae.accion = ${bind(filters.tipo)}`);
      if (filters.usuario_id) where.push(`ae.usuario_id = ${bind(filters.usuario_id)}::integer`);
      if (filters.modulo) where.push(`ae.modulo = ${bind(filters.modulo)}`);
      if (filters.desde) where.push(`COALESCE(ae.fecha_hora, ae.created_at) >=
        (${bind(filters.desde)}::date::timestamp AT TIME ZONE 'America/Guatemala')`);
      if (filters.hasta) where.push(`COALESCE(ae.fecha_hora, ae.created_at) <
        ((${bind(filters.hasta)}::date + 1)::timestamp AT TIME ZONE 'America/Guatemala')`);
      if (filters.q) {
        const pattern = bind(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`(u.username ILIKE ${pattern} ESCAPE '\\'
          OR u.nombre_completo ILIKE ${pattern} ESCAPE '\\'
          OR ae.accion ILIKE ${pattern} ESCAPE '\\'
          OR ae.id::text ILIKE ${pattern} ESCAPE '\\'
          OR (ae.modulo = ANY($1::text[]) AND ae.modulo ILIKE ${pattern} ESCAPE '\\')
          OR (ae.entidad_afectada = ANY($2::text[]) AND ae.entidad_afectada ILIKE ${pattern} ESCAPE '\\'))`);
      }
      if (cursor) {
        const id = bind(cursor.id);
        if (cursor.fecha === null) {
          where.push(`COALESCE(ae.fecha_hora, ae.created_at) IS NULL AND ae.id < ${id}::bigint`);
        } else {
          const date = bind(cursor.fecha);
          where.push(`((COALESCE(ae.fecha_hora, ae.created_at), ae.id) < (${date}::timestamptz, ${id}::bigint)
            OR COALESCE(ae.fecha_hora, ae.created_at) IS NULL)`);
        }
      }
      // La descripcion libre nunca sale de la base: solo se proyectan codigos exactos.
      const descriptionCodes = bind(DESCRIPTION_CODES);
      const { rows } = await db.query(`SELECT ae.id::text AS id, ae.accion,
        CASE WHEN ae.modulo = ANY($1::text[]) THEN ae.modulo ELSE 'desconocido' END AS modulo,
        CASE WHEN ae.entidad_afectada = ANY($2::text[]) THEN ae.entidad_afectada ELSE 'desconocida' END AS entidad_afectada,
        CASE WHEN ae.descripcion = ANY(${descriptionCodes}::text[]) THEN ae.descripcion ELSE NULL END AS evento_codigo,
        ae.usuario_id, u.username, u.nombre_completo,
        CASE WHEN ae.modulo = 'permisos' THEN ARRAY(SELECT codigo FROM permisos) ELSE NULL END AS catalogo_permisos,
        CASE WHEN ae.modulo = 'permisos' AND ae.entidad_afectada = 'usuario_permisos'
          AND ae.tabla = 'usuario_permisos' AND ae.descripcion = 'permisos_reemplazados'
          AND ae.accion = 'actualizar' AND ae.datos_nuevos->>'politica_version' = '1'
          THEN ae.datos_nuevos->'cambios'->'permisos_agregados' ELSE NULL END AS permisos_agregados,
        CASE WHEN ae.modulo = 'permisos' AND ae.entidad_afectada = 'usuario_permisos'
          AND ae.tabla = 'usuario_permisos' AND ae.descripcion = 'permisos_reemplazados'
          AND ae.accion = 'actualizar' AND ae.datos_nuevos->>'politica_version' = '1'
          THEN ae.datos_nuevos->'cambios'->'permisos_retirados' ELSE NULL END AS permisos_retirados,
        objetivo.id AS usuario_objetivo_id,
        objetivo.username AS usuario_objetivo_username,
        objetivo.nombre_completo AS usuario_objetivo_nombre_completo,
        to_char(COALESCE(ae.fecha_hora, ae.created_at) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha
        FROM auditoria_eventos ae LEFT JOIN usuarios u ON u.id = ae.usuario_id
        -- Solo el productor conocido usa estos identificadores como ID de usuario.
        -- No interpretar IDs de concesiones legacy ni identificadores discordantes.
        LEFT JOIN usuarios objetivo ON ae.modulo = 'permisos'
          AND ae.entidad_afectada = 'usuario_permisos' AND ae.tabla = 'usuario_permisos'
          AND ae.descripcion = 'permisos_reemplazados'
          AND (ae.id_entidad IS NULL OR ae.registro_id IS NULL OR ae.id_entidad = ae.registro_id)
          AND objetivo.id::text = COALESCE(ae.id_entidad, ae.registro_id)
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY COALESCE(ae.fecha_hora, ae.created_at) DESC NULLS LAST, ae.id DESC
        LIMIT 26`, params);
      return rows;
    },
  };
}
module.exports = { createAuditHistoryRepository };
