const { createHash } = require('node:crypto');
const { AppError } = require('../utils/appError');
const { isRealIsoDate } = require('../validations/reportes.schemas');
const { ACTIONS, MODULES, ENTITIES } = require('../validations/auditoria.schemas');
const { createAuditHistoryRepository } = require('../repositories/auditHistoryRepository');
const { presentAuditHistoryEvent } = require('./audit/auditHistoryPresentation');

function fingerprint(query) {
  return createHash('sha256').update(JSON.stringify(
    ['q', 'tipo', 'usuario_id', 'modulo', 'desde', 'hasta'].map((key) => query[key] ?? null)
  )).digest('hex');
}
function validTimestamp(value) {
  if (value === null) return true;
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/.test(value)
    && value >= '0001-01-01' && isRealIsoDate(value.slice(0, 10));
}
function decodeCursor(value, query) {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error();
    const cursor = JSON.parse(bytes.toString('utf8'));
    if (!cursor || Object.keys(cursor).sort().join(',') !== 'fecha,filtros,id,v'
      || cursor.v !== 1 || cursor.filtros !== fingerprint(query)
      || typeof cursor.id !== 'string' || !/^[1-9]\d{0,18}$/.test(cursor.id)
      || BigInt(cursor.id) > 9223372036854775807n || !validTimestamp(cursor.fecha)) throw new Error();
    return cursor;
  } catch {
    throw new AppError(400, 'Cursor invalido o incompatible con los filtros', { code: 'AUDIT_CURSOR_INVALID' });
  }
}
function createAuditHistoryService({ repository = createAuditHistoryRepository() } = {}) {
  return {
    async listarUsuarios() {
      const rows = await repository.listarUsuarios();
      return rows.map(({ id, username, nombre_completo }) => ({ id, username, nombre_completo }));
    },
    async listar(query) {
      const cursor = query.cursor ? decodeCursor(query.cursor, query) : null;
      const rows = await repository.listar(query, cursor);
      const page = rows.slice(0, 25);
      const hasMore = rows.length > 25;
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: String(row.id), fecha: row.fecha,
          tipo: ACTIONS.includes(row.accion) ? row.accion : 'desconocido',
          modulo: MODULES.includes(row.modulo) ? row.modulo : 'desconocido',
          entidad: ENTITIES.includes(row.entidad_afectada) ? row.entidad_afectada : 'desconocida',
          presentacion: presentAuditHistoryEvent({
            tipo: row.accion, modulo: row.modulo, entidad: row.entidad_afectada,
          }),
          usuario: row.usuario_id == null ? null : {
            id: row.usuario_id, username: row.username, nombre_completo: row.nombre_completo,
          },
        })),
        next_cursor: hasMore ? Buffer.from(JSON.stringify({
          v: 1, fecha: last.fecha, id: String(last.id), filtros: fingerprint(query),
        })).toString('base64url') : null,
        has_more: hasMore,
      };
    },
  };
}
module.exports = { createAuditHistoryService, decodeCursor };
