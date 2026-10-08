// These rules mirror backend routes; roles never grant implicit permissions.
export const ACCESS = {
  home: {},
  patients: { all: ['pacientes.ver'] },
  newPatient: { all: ['pacientes.crear'] },
  editPatient: { all: ['pacientes.ver', 'pacientes.editar'] },
  newControl: { all: ['pacientes.ver', 'controles.crear'] },
  editControl: { all: ['pacientes.ver', 'controles.editar'] },
  riskForm: { all: ['pacientes.ver'], any: ['controles.crear', 'controles.editar'] },
  planForm: { all: ['pacientes.ver', 'controles.crear', 'controles.editar'] },
  reports: { all: ['reportes.ver'] },
  exportReports: { all: ['reportes.exportar'] },
  riskMap: { all: ['mapa_riesgo.ver'] },
  users: { roles: ['admin', 'director'] },
  communities: { roles: ['director'] },
  history: { roles: ['admin', 'director'], all: ['auditoria.ver'] },
};

export function hasPermission(user, permission) {
  return Boolean(user?.permisos?.includes(permission));
}

export function canAccess(user, rule) {
  if (!user || !rule) return false;
  return (!rule.roles || rule.roles.includes(user.rol))
    && (!rule.all || rule.all.every(permission => hasPermission(user, permission)))
    && (!rule.any || rule.any.some(permission => hasPermission(user, permission)));
}

export const MODULES = [
  { label: 'Inicio', path: '/dashboard', access: ACCESS.home },
  { label: 'Pacientes', path: '/pacientes', access: ACCESS.patients },
  { label: 'Nueva', path: '/nuevo', access: ACCESS.newPatient },
  { label: 'Reportes', path: '/reportes', access: ACCESS.reports },
  { label: 'Mapa de Riesgo', path: '/mapa-riesgo', access: ACCESS.riskMap },
  { label: 'Comunidades', path: '/comunidades', access: ACCESS.communities },
  { label: 'Usuarios', path: '/usuarios', access: ACCESS.users },
  { label: 'Historial', path: '/historial', access: ACCESS.history },
];

export function availableModules(user) {
  return MODULES.filter(module => canAccess(user, module.access));
}

// Invalidate mounted dashboard requests/data on account or permission changes,
// while keeping it stable when only the session activity timestamp changes.
export function accessIdentity(user) {
  return JSON.stringify([user?.id, user?.rol, [...(user?.permisos || [])].sort()]);
}
