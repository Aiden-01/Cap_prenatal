// Permisos funcionales: una concesión nunca acredita una profesión.
const PERMISOS_CLINICOS = Object.freeze([
  'notas_evolucion.ver',
  'notas_evolucion.registrar',
  'notas_evolucion.finalizar_captura',
  'notas_enfermeria.ver',
  'notas_enfermeria.registrar',
  'notas_enfermeria.finalizar_captura',
  'ordenes_medicas.ver',
  'ordenes_medicas.transcribir',
  'ordenes_medicas.finalizar_captura',
  'ordenes_medicas.emitir',
]);
const PREFIJOS_CLINICOS = Object.freeze(['notas_evolucion.', 'notas_enfermeria.', 'ordenes_medicas.']);
const PERMISO_GESTION_CATALOGOS = 'catalogos_profesionales.gestionar';
const CLASIFICACIONES_PROFESIONALES = Object.freeze([
  'sin_clasificar', 'medico', 'enfermeria_ae', 'enfermeria_ep', 'no_clinico',
]);

function esPermisoClinico(codigo) {
  return typeof codigo === 'string' && PREFIJOS_CLINICOS.some(prefijo => codigo.startsWith(prefijo));
}

function filtrarPermisosAutomaticos(codigos) {
  return codigos.filter(codigo => !esPermisoClinico(codigo));
}

module.exports = {
  CLASIFICACIONES_PROFESIONALES,
  PERMISOS_CLINICOS,
  PERMISO_GESTION_CATALOGOS,
  PREFIJOS_CLINICOS,
  esPermisoClinico,
  filtrarPermisosAutomaticos,
};
