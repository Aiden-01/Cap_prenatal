const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/notasClinicasService');
const { buildAuditPayload } = require('../src/services/audit/auditDiffBuilder');

const snapshot = { tipo: 'externo', usuario_id: null, nombre_completo: 'Profesional sintético',
  cargo_id: null, cargo_nombre: 'Cargo declarado', cargo_codigo: 'MED',
};
const body = { tipo: 'nota_evolucion', contenido: 'Narrativa sintética reservada',
  responsable: { tipo: 'externo', nombre_completo: snapshot.nombre_completo, cargo_codigo: 'MED' },
  clave_idempotencia: '11111111-1111-4111-8111-111111111111' };

function escenario({ permisos = ['pacientes.ver', 'notas_evolucion.registrar'], auditFailure = false } = {}) {
  let row = null;
  const db = {};
  const events = [], calls = [];
  const req = { usuario: { id: 1 } };
  const dependencies = {
    registrarEventoPrivado: async (_req, event, opts) => {
      assert.equal(opts.db, db); assert.equal(opts.obligatorio, true);
      if (auditFailure) throw new Error('synthetic audit failure'); events.push(event);
    },
    autoriaClinicaService: {
      conContextoClinico: async ({ db: client }, fn) => {
        assert.equal(client, db); return fn({ actor: { id: 1 }, permisos, db });
      },
      prepararAutoriaClinica: async ({ db: client, accion, responsable }) => {
        assert.equal(client, db); calls.push({ accion, responsable });
        return accion === 'finalizar_captura' ? { finalizador_usuario_id: 1 }
          : { responsable: snapshot, capturista_usuario_id: 1 };
      },
    },
    notasClinicasRepository: {
      enTransaccion: async fn => {
        const old = row ? structuredClone(row) : null;
        try { return await fn(db); } catch (err) { row = old; throw err; }
      },
      obtenerPaciente: async () => ({ id: 10 }),
      obtenerPacientePdf: async () => ({ id: 10, nombres: 'Paciente sintética', apellidos: 'Prueba', no_expediente: 'SYN-120' }),
      obtenerPorClaveIdempotencia: async () => row,
      crear: async data => (row = { id: 7, ...data, estado: 'borrador', version: 1,
        finalizador_usuario_id: null, finalizada_at: null }),
      obtenerPorId: async () => row,
      actualizarBorrador: async data => (row = { ...row, ...data, version: row.version + 1 }),
      finalizarCaptura: async ({ finalizadorUsuarioId }) => (row = { ...row,
        estado: 'captura_finalizada', version: row.version + 1, finalizador_usuario_id: finalizadorUsuarioId }),
      listarPorPaciente: async ({ tipos }) => ({ data: row && tipos.includes(row.tipo) ? [row] : [], total: row ? 1 : 0, pagina: 1, limite: 20 }),
    },
  };
  const crear = input => service.crearBorrador({ pacienteId: 10, body: input ?? body, req, dependencies });
  return { crear, req, dependencies, events, calls, get row() { return row; },
    setRow: value => { row = value; } };
}

test('PDF de nota usa permiso del tipo almacenado, pertenencia y mínimo de paciente en el mismo contexto', async () => {
  const env = escenario({ permisos: ['pacientes.ver', 'notas_evolucion.registrar', 'notas_evolucion.ver'] });
  await env.crear();
  const result = await service.obtenerNotaParaPdf({ pacienteId: 10, notaId: 7, req: env.req, dependencies: env.dependencies });
  assert.equal(result.nota.contenido, body.contenido); assert.equal(result.paciente.no_expediente, 'SYN-120');
  assert.ok(!Object.hasOwn(result.nota, 'solicitud_hash'));
  await assert.rejects(service.obtenerNotaParaPdf({ pacienteId: 11, notaId: 7, req: env.req, dependencies: env.dependencies }), { code: 'NOTA_NO_ENCONTRADA' });
  const registrar = escenario(); await registrar.crear();
  await assert.rejects(service.obtenerNotaParaPdf({ pacienteId: 10, notaId: 7, req: registrar.req, dependencies: registrar.dependencies }), { code: 'PERMISO_REQUERIDO' });
  env.setRow({ ...env.row, tipo: 'nota_enfermeria' });
  await assert.rejects(service.obtenerNotaParaPdf({ pacienteId: 10, notaId: 7, req: env.req, dependencies: env.dependencies }), { code: 'PERMISO_REQUERIDO' });
});

test('PDF obtiene la referencia real del control y excluye campos personales ajenos al documento', async () => {
  const env = escenario({ permisos: ['pacientes.ver', 'notas_evolucion.registrar', 'notas_evolucion.ver'] });
  await env.crear();
  env.setRow({ ...env.row, embarazo_id: 11, control_prenatal_id: 903 });
  let lookups = 0;
  env.dependencies.notasClinicasRepository.obtenerPacientePdf = async (id, _db, reference) => {
    lookups++; assert.equal(id, 10); assert.deepEqual(reference, { controlId: 903, embarazoId: 11 });
    return { id: 10, nombres: 'Paciente sintética', apellidos: 'Prueba', no_expediente: 'SYN-120',
      control_numero: 2, control_fecha: '2026-10-20', email: 'DATO-EXCLUIDO', capturista_nombre_actual: 'NOMBRE-ACTUAL-EXCLUIDO' };
  };
  const result = await service.obtenerNotaParaPdf({ pacienteId: 10, notaId: 7, req: env.req, dependencies: env.dependencies });
  assert.equal(lookups, 1);
  assert.deepEqual(result.control, { numero: 2, fecha: '2026-10-20' });
  assert.deepEqual(Object.keys(result.paciente), ['id', 'nombres', 'apellidos', 'no_expediente']);
  assert.ok(!JSON.stringify(result).includes('EXCLUIDO'));
});

test('borrador y replay no exponen contenido, snapshot ni huella a quien solo registra', async () => {
  const env = escenario();
  const created = await env.crear();
  assert.equal(created.reutilizada, false); assert.equal(created.nota.version, 1);
  const repeated = await env.crear(); assert.equal(repeated.reutilizada, true);
  for (const result of [created.nota, repeated.nota]) {
    for (const key of ['contenido', 'responsable_snapshot', 'solicitud_hash', 'clave_idempotencia']) assert.ok(!Object.hasOwn(result, key));
  }
  assert.equal(env.events.length, 1); assert.equal(env.calls.length, 1);
  await assert.rejects(service.obtenerNota({ pacienteId: 10, notaId: 7, req: env.req, dependencies: env.dependencies }), { code: 'PERMISO_REQUERIDO' });
  await assert.rejects(env.crear({ ...body, contenido: 'Otra solicitud' }), { code: 'NOTA_IDEMPOTENCIA_CONFLICT' });
});

test('fallo de auditoría obligatoria revierte creación y no registra narrativa en el evento', async () => {
  const env = escenario({ auditFailure: true });
  await assert.rejects(env.crear(), /synthetic audit failure/); assert.equal(env.row, null);
  const good = escenario(); await good.crear();
  const serialized = JSON.stringify(good.events);
  for (const text of [body.contenido, snapshot.nombre_completo, snapshot.cargo_nombre, 'solicitud_hash', body.clave_idempotencia]) {
    assert.equal(serialized.includes(text), false);
  }
  const event = good.events[0];
  const audit = buildAuditPayload({ previous: event.cambios.anteriores,
    next: event.cambios.nuevos, metadata: event.metadata }, { context: event.contexto });
  assert.equal(JSON.stringify(audit).includes('nota_evolucion'), true);
});

test('edición de contenido conserva snapshot histórico y capturista sin resolver otra identidad', async () => {
  const env = escenario(); await env.crear();
  const original = structuredClone(env.row.responsable_snapshot);
  const updated = await service.actualizarBorrador({ pacienteId: 10, notaId: 7,
    body: { version: 1, contenido: 'Texto sintético editado' }, req: env.req, dependencies: env.dependencies });
  assert.equal(updated.version, 2); assert.equal(env.row.capturista_usuario_id, 1);
  assert.deepEqual(env.row.responsable_snapshot, original); assert.equal(env.calls.length, 1);
  await assert.rejects(service.actualizarBorrador({ pacienteId: 10, notaId: 7,
    body: { version: 1, contenido: 'Sobrescritura' }, req: env.req, dependencies: env.dependencies }), { code: 'NOTA_VERSION_CONFLICT' });
});

test('finalizar requiere mínimos, respeta versión y solo agrega identidad del finalizador', async () => {
  const env = escenario({ permisos: ['pacientes.ver', 'notas_evolucion.registrar', 'notas_evolucion.finalizar_captura'] });
  await env.crear();
  await assert.rejects(service.finalizarCaptura({ pacienteId: 10, notaId: 7, body: { version: 1 }, req: env.req, dependencies: env.dependencies }), { code: 'NOTA_INCOMPLETA' });
  env.setRow({ ...env.row, fecha_atencion: '2026-10-20', hora_atencion: '09:30:00' });
  const original = structuredClone(env.row);
  const result = await service.finalizarCaptura({ pacienteId: 10, notaId: 7, body: { version: 1 }, req: env.req, dependencies: env.dependencies });
  assert.equal(result.estado, 'captura_finalizada'); assert.equal(result.version, 2);
  assert.deepEqual(env.row.responsable_snapshot, original.responsable_snapshot);
  assert.equal(env.row.capturista_usuario_id, original.capturista_usuario_id);
  assert.equal(env.calls.at(-1).responsable, undefined);
  await assert.rejects(service.actualizarBorrador({ pacienteId: 10, notaId: 7, body: { version: 2, contenido: 'No permitido' }, req: env.req, dependencies: env.dependencies }), { code: 'NOTA_FINALIZADA' });
});

test('listado y detalle usan tipo almacenado y nunca convierten registrar en permiso de lectura', async () => {
  const env = escenario({ permisos: ['pacientes.ver', 'notas_evolucion.registrar', 'notas_enfermeria.ver'] });
  await env.crear();
  const list = await service.listarNotas({ pacienteId: 10, req: env.req, dependencies: env.dependencies });
  assert.deepEqual(list.data, []);
  await assert.rejects(service.listarNotas({ pacienteId: 10, query: { tipo: 'nota_evolucion' }, req: env.req, dependencies: env.dependencies }), { code: 'PERMISO_REQUERIDO' });
  await assert.rejects(service.obtenerNota({ pacienteId: 11, notaId: 7, req: env.req, dependencies: env.dependencies }), { code: 'NOTA_NO_ENCONTRADA' });
});

test('pacientes.ver es obligatorio incluso con permiso de registrar del tipo', async () => {
  const env = escenario({ permisos: ['notas_evolucion.registrar'] });
  await assert.rejects(env.crear(), { code: 'PERMISO_REQUERIDO' }); assert.equal(env.row, null);
});
