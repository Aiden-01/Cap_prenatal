const test = require('node:test');
const assert = require('node:assert/strict');
const { querySchema, bodySchema } = require('../src/validations/seguimientoNotas.schemas');
const { buildAuditPayload } = require('../src/services/audit/auditDiffBuilder');

test('seguimiento valida lotes acotados y rechaza campos manipulables', () => {
  assert.deepEqual(querySchema.parse({ embarazo_id: '11', controles_ids: '1,2,1' }), { embarazo_id: 11, controles_ids: [1, 2] });
  for (const controles_ids of ['0', '-1', '1 OR 1=1', '1,', '', Array.from({ length: 101 }, (_, index) => index + 1).join(',')]) {
    assert.equal(querySchema.safeParse({ embarazo_id: '11', controles_ids }).success, false);
  }
  const body = { embarazo_id: 11, tipo: 'nota_evolucion', version: 1, responsable: { tipo: 'usuario', usuario_id: 2 } };
  assert.equal(bodySchema.safeParse(body).success, true);
  for (const field of ['confirmado_por', 'capturista_usuario_id', 'estado', 'contenido', 'responsable_snapshot']) {
    assert.equal(bodySchema.safeParse({ ...body, [field]: 1 }).success, false);
  }
});

test('auditoría de seguimiento admite solo metadatos controlados y rechaza identidad/narrativa', () => {
  const payload = buildAuditPayload({ next: { version: 2, contenido: 'Narrativa reservada', nombre_completo: 'Persona reservada' },
    metadata: { tipo_nota: 'nota_enfermeria', resultado: 'exitoso' } },
  { context: { categoria: 'clinica', entidad: 'control_prenatal', evento: 'seguimiento_nota_confirmado' } });
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.includes('nota_enfermeria')); assert.ok(serialized.includes('version'));
  assert.equal(serialized.includes('Narrativa reservada'), false); assert.equal(serialized.includes('Persona reservada'), false);
});

test('reintentos externos reutilizan snapshots actuales y anteriores a 030 sin reescribirlos', async () => {
  const { confirmar } = require('../src/services/seguimientoNotasService');
  const now = new Date('2026-10-25T16:00:00Z');
  for (const cargo of [{ cargo_codigo: 'MED' }, { clasificacion_profesional: 'medico', especialidad_nombre: 'Historia conservada' }]) {
    const snapshot = { tipo: 'externo', usuario_id: null, nombre_completo: 'Externo sintético',
      cargo_id: null, cargo_nombre: 'Título histórico sin renombrar', ...cargo };
    const before = structuredClone(snapshot);
    const dependencies = {
      clock: () => now, getSessionConfig: () => ({ idleTimeoutMinutes: 15 }),
      repository: { enTransaccion: fn => fn({}), bloquear: async () => ({ version: 2 }),
        obtenerRequerimiento: async () => ({ responsable_snapshot: snapshot }),
        agregar: () => assert.fail('Un reintento no vuelve a insertar') },
      notas: { obtenerControl: async () => ({ paciente_id: 1, embarazo_id: 11 }) },
      validarEmbarazoEditable: async () => {},
      profesionalesRepository: { obtenerActor: async () => ({ id: 1, activo: true, rol: 'personal_salud' }) },
      permisosRepository: { listarCodigosPorUsuario: async () => ['pacientes.ver', 'notas_evolucion.ver', 'notas_evolucion.registrar'] },
      authSessionsRepository: { obtenerConUsuarioPorId: async () => ({ usuario_id: 1, activo: true,
        last_activity_at: now, absolute_expires_at: new Date(now.getTime() + 3600000) }) },
    };
    const args = { pacienteId: 1, controlId: 3, req: { usuario: { id: 1 }, authSession: { id: 'synthetic', usuario_id: 1 } }, dependencies,
      body: { embarazo_id: 11, version: 1, tipo: 'nota_evolucion', responsable: { tipo: 'externo', nombre_completo: 'Externo sintético', cargo_codigo: 'MED' } } };
    assert.deepEqual(await confirmar(args), { reutilizada: true, tipo: 'nota_evolucion' });
    await assert.rejects(confirmar({ ...args, body: { ...args.body, responsable: { ...args.body.responsable, cargo_codigo: 'AE' } } }), { code: 'SEGUIMIENTO_YA_CONFIRMADO' });
    assert.deepEqual(snapshot, before);
  }
});
