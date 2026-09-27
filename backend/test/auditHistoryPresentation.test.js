const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTIONS, MODULES } = require('../src/validations/auditoria.schemas');
const { ACTION_PRESENTATION, MODULE_LABELS, presentAuditHistoryEvent } = require('../src/services/audit/auditHistoryPresentation');
const { createAuditHistoryService } = require('../src/services/auditHistoryService');

test('acciones conocidas producen los textos solicitados', () => {
  const examples = {
    login_fallido: 'Intentó iniciar sesión con credenciales incorrectas',
    login_usuario_inactivo: 'Intentó acceder con una cuenta inactiva',
    generar_pdf: 'Generó un documento PDF', exportar: 'Exportó información',
    crear: 'Registró información', actualizar: 'Actualizó información', eliminar: 'Eliminó información',
    login: 'Inició sesión', logout: 'Cerró sesión', estado: 'Cambió un estado', consultar: 'Consultó información',
  };
  for (const [tipo, titulo] of Object.entries(examples)) {
    assert.equal(presentAuditHistoryEvent({ tipo, modulo: 'usuarios' }).titulo, titulo);
  }
  assert.deepEqual(Object.keys(ACTION_PRESENTATION).sort(), [...ACTIONS].sort());
  assert.deepEqual(Object.keys(MODULE_LABELS).sort(), [...MODULES].sort());
});
test('deriva modulo visible y categoria sin alterar codigos', () => {
  const event = Object.freeze({ tipo: 'crear', modulo: 'pacientes', entidad: 'vacuna' });
  assert.deepEqual(presentAuditHistoryEvent(event), {
    titulo: 'Registró información', modulo: 'Vacunas', categoria: 'Cambios de información',
  });
  assert.equal(event.modulo, 'pacientes');
  assert.deepEqual(presentAuditHistoryEvent({ tipo: 'login_fallido', modulo: 'autenticacion' }), {
    titulo: 'Intentó iniciar sesión con credenciales incorrectas', modulo: 'Acceso y sesiones', categoria: 'Acceso y seguridad',
  });
  assert.equal(presentAuditHistoryEvent({ tipo: 'exportar', modulo: 'reportes' }).categoria, 'Documentos y exportaciones');
  assert.equal(presentAuditHistoryEvent({ tipo: 'consultar', modulo: 'automatizaciones' }).categoria, 'Consultas');
  for (const [entidad, label] of [['embarazo', 'Embarazos'], ['controles_prenatales', 'Controles prenatales'],
    ['cita_prenatal', 'Citas prenatales'], ['fichas_riesgo_obstetrico', 'Riesgo obstétrico'],
    ['planes_parto', 'Plan de parto'], ['puerperio', 'Puerperio'], ['morbilidad', 'Morbilidad']]) {
    assert.equal(presentAuditHistoryEvent({ tipo: 'actualizar', modulo: 'pacientes', entidad }).modulo, label);
  }
  // La entidad clinica no reemplaza un modulo diferente conocido.
  assert.equal(presentAuditHistoryEvent({ tipo: 'generar_pdf', modulo: 'documentos', entidad: 'vacuna' }).modulo, 'Documentos');
});
test('fallback seguro no incorpora entradas desconocidas ni propiedades del prototipo', () => {
  const fallback = { titulo: 'Realizó una acción no identificada', modulo: 'Módulo no identificado', categoria: 'Otros eventos' };
  for (const code of ['desconocido', '<script>secreto</script>', '__proto__', 'constructor', 'toString', null, {}, ['login']]) {
    assert.deepEqual(presentAuditHistoryEvent({ tipo: code, modulo: code, entidad: code }), fallback);
  }
  assert.deepEqual(presentAuditHistoryEvent(null), fallback);
  assert.deepEqual(presentAuditHistoryEvent(), fallback);
  assert.equal(presentAuditHistoryEvent({ tipo: 'crear', modulo: 'pacientes', entidad: 'dato libre' }).modulo, 'Pacientes');
});
test('endpoint integra presentacion sin exponer payloads ni modificar filas', async () => {
  const row = Object.freeze({ id: '9', fecha: null, accion: 'generar_pdf', modulo: 'documentos',
    entidad_afectada: 'documento', usuario_id: null, datos_nuevos: { diagnostico: 'secreto' }, descripcion: 'secreto' });
  const service = createAuditHistoryService({ repository: { listar: async () => [row] } });
  const result = await service.listar({});
  assert.deepEqual(result.items[0].presentacion, {
    titulo: 'Generó un documento PDF', modulo: 'Documentos', categoria: 'Documentos y exportaciones',
  });
  assert.equal(row.accion, 'generar_pdf');
  assert.equal(result.items[0].tipo, 'generar_pdf');
  assert.ok(!JSON.stringify(result).includes('secreto'));
  const unknownService = createAuditHistoryService({ repository: { listar: async () => [{
    ...row, accion: 'secreto', modulo: 'secreto', entidad_afectada: 'secreto',
  }] } });
  assert.deepEqual((await unknownService.listar({})).items[0].presentacion, {
    titulo: 'Realizó una acción no identificada', modulo: 'Módulo no identificado', categoria: 'Otros eventos',
  });
});
