export const HISTORY_TYPES = [
  ['login', 'Inicio de sesión'], ['logout', 'Cierre de sesión'],
  ['login_fallido', 'Intento de acceso fallido'], ['login_usuario_inactivo', 'Cuenta inactiva'],
  ['crear', 'Registro'], ['actualizar', 'Actualización'], ['eliminar', 'Eliminación'],
  ['estado', 'Cambio de estado'], ['consultar', 'Consulta'],
  ['generar_pdf', 'Documento PDF'], ['exportar', 'Exportación'],
];
export const HISTORY_MODULES = [
  ['autenticacion', 'Acceso y sesiones'], ['usuarios', 'Usuarios'], ['permisos', 'Permisos'],
  ['documentos', 'Documentos'], ['reportes', 'Reportes'], ['automatizaciones', 'Automatizaciones'],
  ['pacientes', 'Expedientes clínicos'], ['comunidades', 'Comunidades'],
  ['controles_prenatales', 'Controles prenatales (histórico)'], ['citas_prenatales', 'Citas prenatales (histórico)'],
  ['puerperio', 'Puerperio (histórico)'], ['vacunas', 'Vacunas (histórico)'],
  ['morbilidad', 'Morbilidad (histórico)'], ['riesgo_obstetrico', 'Riesgo obstétrico (histórico)'],
  ['plan_parto', 'Plan de parto (histórico)'], ['referencias', 'Referencias (histórico)'], ['general', 'General'],
];
export const EMPTY_HISTORY_FILTERS = { q: '', tipo: '', usuario_id: '', modulo: '', desde: '', hasta: '' };
export function historyParams(filters, cursor) {
  return { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])),
    ...(cursor ? { cursor } : {}) };
}
export function historyResult(tipo) {
  if (tipo === 'login_fallido') return { label: 'Fallido', tone: 'failed' };
  if (tipo === 'login_usuario_inactivo') return { label: 'Acceso denegado', tone: 'failed' };
  if (['crear', 'actualizar', 'eliminar', 'login', 'logout', 'generar_pdf', 'exportar'].includes(tipo)) {
    return { label: 'Completado', tone: 'success' };
  }
  if (['estado', 'consultar'].includes(tipo)) return { label: 'Registrado', tone: 'neutral' };
  return { label: 'No disponible', tone: 'neutral' };
}
export function historyDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return { date: 'Fecha no disponible', time: '' };
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
  };
}
export function historyInitials(name) {
  return (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}
export function historyActivity(item) {
  return {
    date: historyDate(item.fecha), result: historyResult(item.tipo),
    title: item.presentacion?.titulo || 'Actividad no identificada',
    module: item.presentacion?.modulo || 'Módulo no identificado',
    user: item.usuario?.nombre_completo || 'Usuario no disponible',
    initials: historyInitials(item.usuario?.nombre_completo),
  };
}
