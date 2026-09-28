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
    titulo: 'Registró información', modulo: 'Vacunas', categoria: 'Cambios de información', resultado: 'completado',
  });
  assert.equal(event.modulo, 'pacientes');
  assert.deepEqual(presentAuditHistoryEvent({ tipo: 'login_fallido', modulo: 'autenticacion' }), {
    titulo: 'Intentó iniciar sesión con credenciales incorrectas', modulo: 'Acceso y sesiones', categoria: 'Acceso y seguridad', resultado: 'fallido',
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
  const fallback = { titulo: 'Realizó una acción no identificada', modulo: 'Módulo no identificado', categoria: 'Otros eventos', resultado: 'no_disponible' };
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
    titulo: 'Generó un documento PDF', modulo: 'Documentos', categoria: 'Documentos y exportaciones', resultado: 'completado',
  });
  assert.equal(row.accion, 'generar_pdf');
  assert.equal(result.items[0].tipo, 'generar_pdf');
  assert.ok(!JSON.stringify(result).includes('secreto'));
  const unknownService = createAuditHistoryService({ repository: { listar: async () => [{
    ...row, accion: 'secreto', modulo: 'secreto', entidad_afectada: 'secreto',
  }] } });
  assert.deepEqual((await unknownService.listar({})).items[0].presentacion, {
    titulo: 'Realizó una acción no identificada', modulo: 'Módulo no identificado', categoria: 'Otros eventos', resultado: 'no_disponible',
  });
});

// Tuplas emitidas por authService y sessionService; no se inspeccionan sus payloads.
for (const [tipo, entidad, evento, titulo, resultado] of [
  ['login', 'usuario', 'login_exitoso', 'Inició sesión', 'completado'],
  ['logout', 'usuario', 'logout', 'Cerró sesión', 'completado'],
  ['logout', 'usuario', 'logout_all', 'Cerró sesión', 'completado'],
  ['login_fallido', 'usuario', 'login_fallido', 'Intentó iniciar sesión con credenciales incorrectas', 'fallido'],
  ['login_usuario_inactivo', 'usuario', 'login_usuario_inactivo', 'Intentó acceder con una cuenta inactiva', 'acceso_denegado'],
  ['estado', 'sesion', 'sesion_creada', 'Creó una sesión', 'completado'],
  ['estado', 'sesion', 'sesion_revocada', 'Revocó una sesión', 'completado'],
  ['estado', 'usuario', 'sesiones_revocadas', 'Revocó las sesiones de una cuenta', 'completado'],
  ['estado', 'sesion', 'sesion_inactiva', 'Finalizó una sesión por inactividad', 'completado'],
  ['estado', 'sesion', 'sesion_expirada', 'Finalizó una sesión por vencimiento', 'completado'],
  ['estado', 'sesion', 'reutilizacion_refresh_detectada', 'Detectó un intento de reutilización de sesión', 'registrado'],
  // La descripcion especifica de acceso tambien prevalece si la accion es generica.
  ['estado', 'usuario', 'login_exitoso', 'Inició sesión', 'completado'],
  ['estado', 'usuario', 'logout', 'Cerró sesión', 'completado'],
  ['estado', 'usuario', 'logout_all', 'Cerró sesión', 'completado'],
]) {
  test(`acceso: ${tipo}/${entidad}/${evento}`, () => {
    assert.deepEqual(presentAuditHistoryEvent({ tipo, entidad, modulo: 'autenticacion', evento }), {
      titulo, modulo: 'Acceso y sesiones', categoria: 'Acceso y seguridad', resultado,
    });
  });
}

for (const [productor, entidad, modulo, visibleModule, titulo] of [
  ['paso a puerperio', 'embarazo', 'pacientes', 'Embarazos', 'Cambió el estado de un embarazo'],
  ['cierre de embarazo', 'embarazo', 'pacientes', 'Embarazos', 'Cambió el estado de un embarazo'],
  ['primer control de puerperio', 'embarazo', 'pacientes', 'Embarazos', 'Cambió el estado de un embarazo'],
  ['desactivar comunidad', 'comunidad', 'comunidades', 'Comunidades', 'Cambió el estado de una comunidad'],
  ['reactivar comunidad', 'comunidad', 'comunidades', 'Comunidades', 'Cambió el estado de una comunidad'],
]) {
  test(`estado contextual: ${productor}`, () => {
    assert.deepEqual(presentAuditHistoryEvent({ tipo: 'estado', entidad, modulo, evento: 'cambiar_estado' }), {
      titulo, modulo: visibleModule, categoria: 'Cambios de información', resultado: 'registrado',
    });
  });
}

for (const [entidad, modulo, evento, titulo, categoria, visibleModule] of [
  ['usuario', 'usuarios', 'usuario_activado', 'Activó una cuenta de usuario', 'Acceso y seguridad', 'Usuarios'],
  ['usuario', 'usuarios', 'usuario_desactivado', 'Desactivó una cuenta de usuario', 'Acceso y seguridad', 'Usuarios'],
  ['cita_prenatal', 'pacientes', 'materializar_inasistencia', 'Registró una inasistencia', 'Cambios de información', 'Citas prenatales'],
  ['cita_prenatal', 'pacientes', 'materializar_asistencia', 'Registró la asistencia a una cita', 'Cambios de información', 'Citas prenatales'],
  ['cita_prenatal', 'pacientes', 'reconciliar_asistencia_tardia', 'Actualizó la asistencia a una cita', 'Cambios de información', 'Citas prenatales'],
  ['cita_prenatal', 'pacientes', 'atender', 'Registró la atención de una cita', 'Cambios de información', 'Citas prenatales'],
  ['cita_prenatal', 'pacientes', 'cancelar', 'Canceló una cita prenatal', 'Cambios de información', 'Citas prenatales'],
  ['cita_prenatal', 'pacientes', 'reprogramar', 'Reprogramó una cita prenatal', 'Cambios de información', 'Citas prenatales'],
]) {
  test(`transicion especifica: ${evento}`, () => {
    for (const tipo of ['actualizar', 'estado']) {
      assert.deepEqual(presentAuditHistoryEvent({ tipo, entidad, modulo, evento }), {
        titulo, modulo: visibleModule, categoria, resultado: 'completado',
      });
    }
  });
}

test('acciones explicitas de acceso prevalecen y descripciones fuera de contexto no reclasifican', () => {
  assert.equal(presentAuditHistoryEvent({ tipo: 'login', evento: 'logout', modulo: 'usuarios' }).titulo, 'Inició sesión');
  assert.equal(presentAuditHistoryEvent({ tipo: 'logout', evento: 'login_exitoso', modulo: 'usuarios' }).titulo, 'Cerró sesión');
  for (const event of [
    { tipo: 'estado', entidad: 'embarazo', modulo: 'pacientes', evento: 'logout' },
    { tipo: 'estado', entidad: 'embarazo', modulo: 'pacientes', evento: 'usuario_desactivado' },
  ]) assert.equal(presentAuditHistoryEvent(event).titulo, 'Cambió el estado de un embarazo');
  assert.equal(presentAuditHistoryEvent({ tipo: 'crear', entidad: 'usuario', modulo: 'usuarios', evento: 'usuario_desactivado' }).titulo, 'Registró información');
});

test('estado sin contexto conserva fallback seguro y nunca interpreta texto libre ni JSON', () => {
  for (const evento of [null, undefined, '', 'logout texto libre', 'cerró sesión', 'LOGOUT',
    '__proto__', 'constructor', 'toString', ['logout'], { evento: 'logout' }, '{"evento":"logout"}']) {
    assert.deepEqual(presentAuditHistoryEvent({ tipo: 'estado', modulo: 'general', entidad: 'desconocida', evento,
      datos_nuevos: { evento: 'logout', resultado: 'exitoso', diagnostico: 'secreto' }, ip: '192.0.2.1' }), {
      titulo: 'Cambió un estado', modulo: 'General', categoria: 'Cambios de información', resultado: 'registrado',
    });
    assert.equal(presentAuditHistoryEvent({ tipo: 'estado', modulo: 'autenticacion', entidad: 'sesion', evento }).titulo,
      'Cambió el estado de una sesión');
  }
});

test('servicio usa solo el codigo proyectado, conserva acciones y excluye campos internos', async () => {
  const rows = [
    { accion: 'estado', modulo: 'autenticacion', entidad_afectada: 'usuario', evento_codigo: 'logout' },
    { accion: 'actualizar', modulo: 'usuarios', entidad_afectada: 'usuario', evento_codigo: 'usuario_desactivado' },
    { accion: 'actualizar', modulo: 'pacientes', entidad_afectada: 'cita_prenatal', evento_codigo: 'materializar_inasistencia' },
  ].map((row, index) => Object.freeze({ ...row, id: String(index + 1), fecha: null, usuario_id: null,
    descripcion: 'texto libre secreto', ip: '192.0.2.1', user_agent: 'secreto', datos_anteriores: { secreto: true },
    datos_nuevos: { diagnostico: 'secreto' }, paciente_id: 42, embarazo_id: 7 }));
  const service = createAuditHistoryService({ repository: { listar: async () => rows } });
  const result = await service.listar({});
  assert.deepEqual(result.items.map(({ presentacion }) => presentacion.titulo),
    ['Cerró sesión', 'Desactivó una cuenta de usuario', 'Registró una inasistencia']);
  assert.deepEqual(result.items.map(({ tipo }) => tipo), ['estado', 'actualizar', 'actualizar']);
  assert.ok(result.items.every(({ presentacion }) => presentacion.resultado === 'completado'));
  assert.doesNotMatch(JSON.stringify(result), /secreto|192\.0\.2\.1|descripcion|evento_codigo|datos_nuevos|paciente_id|embarazo_id/);
});
