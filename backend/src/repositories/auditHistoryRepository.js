const pool = require('../db/pool');
const { MODULES, ENTITIES } = require('../validations/auditoria.schemas');

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
      const { rows } = await db.query(`SELECT ae.id::text AS id, ae.accion,
        CASE WHEN ae.modulo = ANY($1::text[]) THEN ae.modulo ELSE 'desconocido' END AS modulo,
        CASE WHEN ae.entidad_afectada = ANY($2::text[]) THEN ae.entidad_afectada ELSE 'desconocida' END AS entidad_afectada,
        ae.usuario_id, u.username, u.nombre_completo,
        to_char(COALESCE(ae.fecha_hora, ae.created_at) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha
        FROM auditoria_eventos ae LEFT JOIN usuarios u ON u.id = ae.usuario_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY COALESCE(ae.fecha_hora, ae.created_at) DESC NULLS LAST, ae.id DESC
        LIMIT 26`, params);
      return rows;
    },
  };
}
module.exports = { createAuditHistoryRepository };
