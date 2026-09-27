export function canViewHistory(usuario) {
  return ['director', 'admin'].includes(usuario?.rol)
    && Boolean(usuario?.permisos?.includes('auditoria.ver'));
}
