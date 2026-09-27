// Textos de interfaz derivados exclusivamente de codigos controlados.
// No recibe ni interpreta descripciones libres, payloads o datos clinicos.
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
function lookup(mapping, code) {
  return typeof code === 'string' && Object.hasOwn(mapping, code) ? mapping[code] : undefined;
}
function presentAuditHistoryEvent(event = {}) {
  const { tipo, modulo, entidad } = event || {};
  const action = lookup(ACTION_PRESENTATION, tipo) || UNKNOWN_ACTION;
  const visibleModule = (modulo === 'pacientes' && lookup(CLINICAL_ENTITY_LABELS, entidad))
    || lookup(MODULE_LABELS, modulo) || 'Módulo no identificado';
  return { titulo: action.titulo, modulo: visibleModule, categoria: action.categoria };
}
module.exports = { ACTION_PRESENTATION, MODULE_LABELS, presentAuditHistoryEvent };
