const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararAutoriaClinica } = require('../src/services/autoriaClinicaService');
const { profesionalesQuerySchema } = require('../src/validations/profesionales.schemas');

const ahora = new Date('2026-10-22T16:00:00Z');
const externo = { tipo: 'externo', nombre_completo: 'Profesional sintético', cargo: 'Cargo declarado',
  especialidad: null, clasificacion_profesional: 'medico' };

function escenario({ permisos = [], rol = 'personal_salud', clase = 'no_clinico', activo = true,
  cargoActivo = true, revocada = false, sessionUsuarioId = 1, expired = false } = {}) {
  const db = {};
  const calls = [];
  const personas = new Map([[1, { id: 1, rol, activo, nombre_completo: 'Capturista sintético',
    cargo_id: 80, cargo_nombre: 'Nombre editable', cargo_activo: cargoActivo,
    clasificacion_profesional: clase, especialidad_id: null, especialidad_nombre: null }],
  [2, { id: 2, rol: 'personal_salud', activo: true, nombre_completo: 'Médico sintético',
    cargo_id: 91, cargo_nombre: 'Sin referencia al título', cargo_activo: true,
    clasificacion_profesional: 'medico', especialidad_id: 10, especialidad_nombre: 'Especialidad sintética' }]]);
  const req = { usuario: { id: 1, rol: 'director', permisos: ['ordenes_medicas.emitir'] },
    authSession: { id: 'synthetic-session', usuario_id: 1 }, body: { capturista_usuario_id: 2 } };
  const dependencies = {
    clock: () => ahora, getSessionConfig: () => ({ idleTimeoutMinutes: 15 }),
    profesionalesRepository: {
      async obtenerActor(id, connection) { assert.equal(connection, db); calls.push('usuario'); return personas.get(id); },
      async obtenerParaAutoria(id, connection) { assert.equal(connection, db); calls.push('responsable'); return personas.get(id); },
    },
    authSessionsRepository: {
      async obtenerConUsuarioPorId(_id, connection, opts) {
        assert.equal(connection, db); assert.equal(opts.bloquear, true); calls.push('sesion');
        return { usuario_id: sessionUsuarioId, activo, revoked_at: revocada ? ahora : null,
          last_activity_at: ahora, absolute_expires_at: new Date(ahora.getTime() + (expired ? -1000 : 3600000)) };
      },
    },
    permisosRepository: {
      async enTransaccion(fn) { calls.push('BEGIN'); const result = await fn(db); calls.push('COMMIT'); return result; },
      async listarCodigosPorUsuario(id, connection) { assert.equal(connection, db); assert.equal(id, 1); calls.push('permisos'); return permisos; },
    },
  };
  const preparar = (args = {}) => prepararAutoriaClinica({ tipoDocumento: 'orden_medica', accion: 'transcribir',
    responsable: { tipo: 'usuario', usuario_id: 2 }, req, dependencies, ...args });
  return { req, dependencies, preparar, calls, personas, db };
}

test('digitador transcribe a otro médico sin adquirir su identidad ni permiso de emisión', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir'] });
  const result = await env.preparar();
  assert.equal(result.capturista_usuario_id, 1);
  assert.equal(result.responsable.usuario_id, 2);
  assert.equal(result.responsable.clasificacion_profesional, 'medico');
  assert.equal(result.emisor_usuario_id, undefined);
  assert.equal(result.finalizador_usuario_id, undefined);
  assert.equal(result.firma, 'manuscrita'); assert.equal(result.validacion_clinica, false);
  assert.equal(result.responsable.rol, undefined);
  assert.deepEqual(env.calls, ['BEGIN', 'usuario', 'sesion', 'permisos', 'responsable', 'COMMIT']);
  await assert.rejects(env.preparar({ accion: 'emitir' }), { code: 'PERMISO_REQUERIDO' });
});

test('permisos del cliente/rol declarado no sustituyen permisos actuales del servidor', async () => {
  const env = escenario({ rol: 'director' });
  await assert.rejects(env.preparar(), { code: 'PERMISO_REQUERIDO' });
});

for (const caso of [{ activo: false }, { revocada: true }, { expired: true }, { sessionUsuarioId: 2 }]) {
  test(`sesión no operativa se rechaza: ${JSON.stringify(caso)}`, async () => {
    const env = escenario({ permisos: ['ordenes_medicas.transcribir'], ...caso });
    await assert.rejects(env.preparar(), { statusCode: 401 });
    assert.ok(!env.calls.includes('responsable'));
  });
}

test('sin contexto autenticado no se resuelven IDs enviados libremente', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir'] });
  for (const req of [{}, { usuario: { id: 1 } }, { usuario: { id: 1 }, authSession: { id: 'x', usuario_id: 2 } }]) {
    await assert.rejects(env.preparar({ req }), { statusCode: 401 });
  }
  assert.deepEqual(env.calls, []);
});

test('finalizar captura solo identifica al finalizador, sin reatribuir atención ni firmar', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.finalizar_captura'] });
  const result = await env.preparar({ accion: 'finalizar_captura', responsable: undefined });
  assert.deepEqual(result, { tipo_documento: 'orden_medica', firma: 'manuscrita',
    validacion_clinica: false, finalizador_usuario_id: 1 });
  await assert.rejects(env.preparar({ accion: 'finalizar_captura' }), { code: 'RESPONSABLE_NO_MODIFICABLE' });
  assert.ok(!env.calls.includes('responsable'));
});

test('responsable externo conserva snapshot manual y no obtiene cuenta/acceso', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir', 'ordenes_medicas.emitir'] });
  const result = await env.preparar({ responsable: externo });
  assert.equal(result.responsable.usuario_id, null);
  assert.equal(result.responsable.cargo_id, null);
  assert.equal(result.responsable.cargo_nombre, externo.cargo);
  assert.equal(result.capturista_usuario_id, 1);
  await assert.rejects(env.preparar({ responsable: externo, accion: 'emitir' }), { code: 'EMISION_PROPIA_REQUERIDA' });
  await assert.rejects(env.preparar({ responsable: { ...externo, usuario_id: 2 } }), { code: 'RESPONSABLE_INVALIDO' });
});

test('emitir exige médico responsable propio; selección ajena nunca hereda identidad', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.emitir'], clase: 'medico' });
  const result = await env.preparar({ accion: 'emitir', responsable: { tipo: 'autenticado' } });
  assert.equal(result.responsable.usuario_id, 1); assert.equal(result.emisor_usuario_id, 1);
  assert.equal(result.capturista_usuario_id, undefined);
  await assert.rejects(env.preparar({ accion: 'emitir' }), { code: 'EMISION_PROPIA_REQUERIDA' });
});

for (const clase of ['enfermeria_ae', 'enfermeria_ep', 'no_clinico', 'sin_clasificar']) {
  test(`${clase} no puede emitir una orden aunque tenga permiso funcional`, async () => {
    const env = escenario({ permisos: ['ordenes_medicas.emitir'], clase });
    await assert.rejects(env.preparar({ accion: 'emitir', responsable: { tipo: 'autenticado' } }),
      { code: 'ATRIBUCION_CLINICA_REQUERIDA' });
  });
}

for (const clase of ['enfermeria_ae', 'enfermeria_ep']) {
  test(`${clase} es responsable de nota de enfermería y no de nota médica`, async () => {
    const env = escenario({ permisos: ['notas_enfermeria.registrar', 'notas_evolucion.registrar'], clase });
    const args = { tipoDocumento: 'nota_enfermeria', accion: 'registrar', responsable: { tipo: 'autenticado' } };
    const result = await env.preparar(args);
    assert.equal(result.responsable.usuario_id, 1);
    await assert.rejects(env.preparar({ ...args, tipoDocumento: 'nota_evolucion' }), { code: 'ATRIBUCION_CLINICA_REQUERIDA' });
  });
}

test('director oculto, responsable inactivo y cargo inactivo no son seleccionables', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir'], rol: 'admin' });
  for (const override of [{ rol: 'director' }, { activo: false }, { cargo_activo: false }]) {
    const original = env.personas.get(2); env.personas.set(2, { ...original, ...override });
    await assert.rejects(env.preparar(), { code: 'PROFESIONAL_NO_DISPONIBLE' });
    env.personas.set(2, original);
  }
});

test('la política comparte la transacción del futuro documento sin abrir otra', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir'] });
  await env.preparar({ db: env.db });
  assert.ok(!env.calls.includes('BEGIN')); assert.ok(!env.calls.includes('COMMIT'));
});

test('tipos/acciones desconocidos y responsabilidad con metadatos de acceso se rechazan', async () => {
  const env = escenario({ permisos: ['ordenes_medicas.transcribir'] });
  for (const args of [{ tipoDocumento: '__proto__' }, { tipoDocumento: 'nota_enfermeria', accion: 'emitir' },
    { accion: 'firmar' }]) await assert.rejects(env.preparar(args), { code: 'ACCION_CLINICA_INVALIDA' });
  await assert.rejects(env.preparar({ responsable: { tipo: 'usuario', usuario_id: 2, capturista_usuario_id: 2 } }),
    { code: 'RESPONSABLE_INVALIDO' });
});

test('directorio tiene límites estrictos y no admite consultas de información privada', () => {
  assert.deepEqual(profesionalesQuerySchema.parse({}), { buscar: '', pagina: 1, limite: 20 });
  for (const query of [{ limite: '51' }, { limite: '0' }, { pagina: '-1' }, { incluir_inactivos: true },
    { rol: 'director' }, { clasificacion_profesional: 'no_clinico' }, { buscar: '\u0000' }]) {
    assert.equal(profesionalesQuerySchema.safeParse(query).success, false);
  }
});
