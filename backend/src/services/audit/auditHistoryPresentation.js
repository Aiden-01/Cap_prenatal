// Textos de interfaz derivados exclusivamente de codigos controlados.
// Solo reconoce descripciones por coincidencia exacta con una allowlist.
// No interpreta texto libre, payloads o datos clinicos.
const ACTION_PRESENTATION = Object.freeze({
  login: Object.freeze({ titulo: 'Inició sesión', categoria: 'Acceso y seguridad' }),
  logout: Object.freeze({ titulo: 'Cerró sesión', categoria: 'Acceso y seguridad' }),
  login_fallido: Object.freeze({ titulo: 'Intentó iniciar sesión con credenciales incorrectas', categoria: 'Acceso y seguridad' }),
  login_usuario_inactivo: Object.freeze({ titulo: 'Intentó acceder con una cuenta inactiva', categoria: 'Acceso y seguridad' }),
  generar_pdf: Object.freeze({ titulo: 'Generó un documento PDF', categoria: 'Documentos y exportaciones' }),
  exportar: Object.freeze({ titulo: 'Exportó información', categoria: 'Documentos y exportaciones' }),
  crear: Object.freeze({ titulo: 'Registró información', categoria: 'Cambios de información' }),
  actualizar: Object.freeze({ titulo: 'Actualizó información', categoria: 'Cambios de información' }),
  eliminar: Object.freeze({ titulo: 'Eliminó información', categoria: 'Cambios de información' }),
  estado: Object.freeze({ titulo: 'Cambió un estado', categoria: 'Cambios de información' }),
  consultar: Object.freeze({ titulo: 'Consultó información', categoria: 'Consultas' }),
});
const MODULE_LABELS = Object.freeze({
  autenticacion: 'Acceso y sesiones', usuarios: 'Usuarios', permisos: 'Permisos',
  documentos: 'Documentos', reportes: 'Reportes', automatizaciones: 'Automatizaciones',
  pacientes: 'Pacientes', comunidades: 'Comunidades', controles_prenatales: 'Controles prenatales',
  citas_prenatales: 'Citas prenatales', puerperio: 'Puerperio', vacunas: 'Vacunas',
  morbilidad: 'Morbilidad', riesgo_obstetrico: 'Riesgo obstétrico',
  plan_parto: 'Plan de parto', referencias: 'Referencias', general: 'General',
});
const CLINICAL_ENTITY_LABELS = Object.freeze({
  paciente: 'Pacientes', pacientes: 'Pacientes', embarazo: 'Embarazos', embarazos: 'Embarazos',
  control_prenatal: 'Controles prenatales', controles_prenatales: 'Controles prenatales',
  cita_prenatal: 'Citas prenatales', citas_prenatales: 'Citas prenatales',
  riesgo_obstetrico: 'Riesgo obstétrico', fichas_riesgo_obstetrico: 'Riesgo obstétrico',
  vacuna: 'Vacunas', vacunas_paciente: 'Vacunas',
  morbilidad: 'Morbilidad', morbilidad_embarazo: 'Morbilidad',
  plan_parto: 'Plan de parto', planes_parto: 'Plan de parto',
  puerperio: 'Puerperio', controles_puerperio: 'Puerperio',
});
const UNKNOWN_ACTION = Object.freeze({
  titulo: 'Realizó una acción no identificada', categoria: 'Otros eventos',
});
const AUTH_ENTITIES = Object.freeze(['usuario', 'usuarios', 'sesion', 'auth_sessions']);
const SESSION_ENTITIES = Object.freeze(['sesion', 'auth_sessions']);
const USER_ENTITIES = Object.freeze(['usuario', 'usuarios']);
const APPOINTMENT_ENTITIES = Object.freeze(['cita_prenatal', 'citas_prenatales']);
// Las reglas incluyen contexto: un codigo conocido en otra entidad no basta.
const SPECIFIC_EVENTS = Object.freeze([
  { eventos: ['login_exitoso'], tipos: ['estado'], modulos: ['autenticacion'], entidades: AUTH_ENTITIES,
    titulo: 'Inició sesión', categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones', resultado: 'completado' },
  { eventos: ['logout', 'logout_all'], tipos: ['estado'], modulos: ['autenticacion'], entidades: AUTH_ENTITIES,
    titulo: 'Cerró sesión', categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones', resultado: 'completado' },
  ...[
    ['sesion_creada', 'Creó una sesión', 'completado'],
    // Esta misma descripcion tambien se produce al revocar por cuenta inactiva.
    ['sesion_revocada', 'Revocó una sesión', 'completado'],
    ['sesion_inactiva', 'Finalizó una sesión por inactividad', 'completado'],
    ['sesion_expirada', 'Finalizó una sesión por vencimiento', 'completado'],
    ['reutilizacion_refresh_detectada', 'Detectó un intento de reutilización de sesión', 'registrado'],
  ].map(([evento, titulo, resultado]) => ({ eventos: [evento], tipos: ['estado'],
    modulos: ['autenticacion'], entidades: SESSION_ENTITIES,
    titulo, categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones', resultado })),
  { eventos: ['sesiones_revocadas'], tipos: ['estado'], modulos: ['autenticacion'], entidades: USER_ENTITIES,
    titulo: 'Revocó las sesiones de una cuenta', categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones', resultado: 'completado' },
  ...[
    ['usuario_activado', 'Activó una cuenta de usuario'],
    ['usuario_desactivado', 'Desactivó una cuenta de usuario'],
  ].map(([evento, titulo]) => ({ eventos: [evento], tipos: ['actualizar', 'estado'],
    modulos: ['usuarios'], entidades: USER_ENTITIES,
    titulo, categoria: 'Acceso y seguridad', modulo: 'Usuarios', resultado: 'completado' })),
  ...[
    ['materializar_inasistencia', 'Registró una inasistencia'],
    ['materializar_asistencia', 'Registró la asistencia a una cita'],
    ['reconciliar_asistencia_tardia', 'Actualizó la asistencia a una cita'],
    ['atender', 'Registró la atención de una cita'],
    ['cancelar', 'Canceló una cita prenatal'],
    ['reprogramar', 'Reprogramó una cita prenatal'],
  ].map(([evento, titulo]) => ({ eventos: [evento], tipos: ['actualizar', 'estado'],
    modulos: ['pacientes', 'citas_prenatales'], entidades: APPOINTMENT_ENTITIES,
    titulo, categoria: 'Cambios de información', modulo: 'Citas prenatales', resultado: 'completado' })),
].map(Object.freeze));
const DESCRIPTION_CODES = Object.freeze([...new Set(SPECIFIC_EVENTS.flatMap(({ eventos }) => eventos))]);
const STATE_ENTITIES = Object.freeze([
  { entidades: ['embarazo', 'embarazos'], modulos: ['pacientes'], titulo: 'Cambió el estado de un embarazo',
    categoria: 'Cambios de información', modulo: 'Embarazos' },
  { entidades: ['comunidad', 'comunidades'], modulos: ['comunidades'], titulo: 'Cambió el estado de una comunidad',
    categoria: 'Cambios de información', modulo: 'Comunidades' },
  { entidades: USER_ENTITIES, modulos: ['usuarios'], titulo: 'Cambió el estado de una cuenta de usuario',
    categoria: 'Acceso y seguridad', modulo: 'Usuarios' },
  { entidades: SESSION_ENTITIES, modulos: ['autenticacion'], titulo: 'Cambió el estado de una sesión',
    categoria: 'Acceso y seguridad', modulo: 'Acceso y sesiones' },
  { entidades: APPOINTMENT_ENTITIES, modulos: ['pacientes', 'citas_prenatales'], titulo: 'Cambió el estado de una cita prenatal',
    categoria: 'Cambios de información', modulo: 'Citas prenatales' },
].map(Object.freeze));
function lookup(mapping, code) {
  return typeof code === 'string' && Object.hasOwn(mapping, code) ? mapping[code] : undefined;
}
function resultForAction(tipo) {
  if (tipo === 'login_fallido') return 'fallido';
  if (tipo === 'login_usuario_inactivo') return 'acceso_denegado';
  if (['crear', 'actualizar', 'eliminar', 'login', 'logout', 'generar_pdf', 'exportar'].includes(tipo)) return 'completado';
  if (['estado', 'consultar'].includes(tipo)) return 'registrado';
  return 'no_disponible';
}
function presentAuditHistoryEvent(event = {}) {
  const { tipo, modulo, entidad, evento } = event || {};
  const action = lookup(ACTION_PRESENTATION, tipo) || UNKNOWN_ACTION;
  // La accion explicita de acceso prevalece incluso sobre descripciones incompatibles.
  if (['login', 'logout', 'login_fallido', 'login_usuario_inactivo'].includes(tipo)) {
    return { ...action, modulo: 'Acceso y sesiones', resultado: resultForAction(tipo) };
  }
  const specific = SPECIFIC_EVENTS.find((rule) => rule.tipos.includes(tipo)
    && rule.modulos.includes(modulo) && rule.entidades.includes(entidad) && rule.eventos.includes(evento));
  const contextual = specific || (tipo === 'estado' && STATE_ENTITIES.find((rule) =>
    rule.modulos.includes(modulo) && rule.entidades.includes(entidad)));
  if (contextual) {
    return { titulo: contextual.titulo, modulo: contextual.modulo, categoria: contextual.categoria,
      resultado: contextual.resultado || resultForAction(tipo) };
  }
  const visibleModule = (modulo === 'pacientes' && lookup(CLINICAL_ENTITY_LABELS, entidad))
    || lookup(MODULE_LABELS, modulo) || 'Módulo no identificado';
  return { titulo: action.titulo, modulo: visibleModule, categoria: action.categoria, resultado: resultForAction(tipo) };
}
module.exports = { ACTION_PRESENTATION, MODULE_LABELS, DESCRIPTION_CODES, presentAuditHistoryEvent };
