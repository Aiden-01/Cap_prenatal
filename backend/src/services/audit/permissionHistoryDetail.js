// Solo deltas del productor conocido; nunca interpretar snapshots legacy.
function permissionHistoryDetail(row) {
  if (row.modulo !== 'permisos' || row.entidad_afectada !== 'usuario_permisos'
    || row.accion !== 'actualizar' || row.evento_codigo !== 'permisos_reemplazados') return [];
  const added = row.permisos_agregados ?? [];
  const removed = row.permisos_retirados ?? [];
  const catalog = new Set(Array.isArray(row.catalogo_permisos) ? row.catalogo_permisos : []);
  const valid = (values) => Array.isArray(values) && values.length <= 200
    && values.every((code) => typeof code === 'string' && code.length <= 100
      && /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(code) && catalog.has(code))
    && new Set(values).size === values.length;
  if (!valid(added) || !valid(removed) || added.some((code) => removed.includes(code))) return [];
  return [...added.map((codigo) => ({ codigo, anterior: false, nuevo: true })),
    ...removed.map((codigo) => ({ codigo, anterior: true, nuevo: false }))]
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
module.exports = { permissionHistoryDetail };
