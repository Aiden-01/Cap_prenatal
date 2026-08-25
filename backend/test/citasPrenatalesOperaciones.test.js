const assert = require('node:assert/strict');
const test = require('node:test');

const SERVICE_PATH = require.resolve('../src/services/citasPrenatalesService');
const REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');

const ACTOR = {
  usuario: { id: 83, permisos: ['pacientes.ver', 'controles.editar'] },
  headers: { 'user-agent': 'node:test' },
  ip: '127.0.0.1',
};

const PROGRAMADA = Object.freeze({
  id: 701,
  embarazo_id: 91,
  control_origen_id: 302,
  control_cumplimiento_id: null,
  reprogramada_desde_id: null,
  fecha_programada: '2030-09-10',
  estado: 'programada',
});

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

function strictMock(overrides, label) {
  return new Proxy(overrides, {
    get(target, property) {
      if (property in target || typeof property === 'symbol') return target[property];
      return async () => { throw new Error(`Llamada inesperada a ${label}.${String(property)}`); };
    },
  });
}

async function withService({ repository = {}, audit, pregnancies = {} }, callback) {
  const client = { transaction: 'appointment-operation' };
  const restore = [
    cacheModule(REPOSITORY_PATH, strictMock({
      enTransaccion: async (operation) => operation(client),
      ...repository,
    }, 'citasRepository')),
    cacheModule(AUDIT_PATH, {
      registrarEventoPrivado: audit || (async () => {}),
    }),
    cacheModule(PREGNANCIES_PATH, {
      requerirEmbarazoId: (value) => {
        if (!value) {
          const error = new Error('embarazo_id es obligatorio');
          error.statusCode = 400;
          error.code = 'EMBARAZO_ID_REQUIRED';
          throw error;
        }
        return value;
      },
      resolverEmbarazoParaLectura: pregnancies.resolverEmbarazoParaLectura || (async () => ({
        id: 91, paciente_id: 41, estado: 'activo',
      })),
      validarEmbarazoEditable: pregnancies.validarEmbarazoEditable || (async () => ({
        id: 91, paciente_id: 41, estado: 'activo',
      })),
    }),
  ];
  const previousService = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];
  try {
    return await callback(require(SERVICE_PATH), client);
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previousService) require.cache[SERVICE_PATH] = previousService;
    for (const restoreModule of restore.reverse()) restoreModule();
  }
}

test('reprograma atomicamente, conserva origen y crea una unica hija trazable', async () => {
  const order = [];
  const events = [];
  const reprogramada = { ...PROGRAMADA, estado: 'reprogramada' };
  const hija = {
    ...PROGRAMADA,
    id: 702,
    fecha_programada: '2030-09-17',
    reprogramada_desde_id: PROGRAMADA.id,
  };

  await withService({
    repository: {
      obtenerPorIdYEmbarazo: async (id, embarazoId, db, options) => {
        order.push('bloquear-original');
        assert.deepEqual([id, embarazoId, options], [701, 91, { bloquear: true }]);
        assert.equal(db.transaction, 'appointment-operation');
        return PROGRAMADA;
      },
      marcarReprogramada: async (args, db) => {
        order.push('marcar-reprogramada');
        assert.deepEqual(args, { citaId: 701, embarazoId: 91, usuarioId: 83 });
        assert.equal(db.transaction, 'appointment-operation');
        return reprogramada;
      },
      crearHijaReprogramada: async (args, db) => {
        order.push('crear-hija');
        assert.equal(args.citaAnterior, PROGRAMADA);
        assert.equal(args.citaAnterior.control_origen_id, PROGRAMADA.control_origen_id);
        assert.equal(args.fechaProgramada, '2030-09-17');
        assert.equal(db.transaction, 'appointment-operation');
        return hija;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async ({ pacienteId, embarazoId, db, bloquear }) => {
        order.push('validar-embarazo');
        assert.deepEqual([pacienteId, embarazoId, db.transaction, bloquear], [41, 91, 'appointment-operation', true]);
      },
    },
    audit: async (_req, event, options) => {
      order.push('auditar');
      events.push(event);
      assert.equal(options.db.transaction, 'appointment-operation');
      assert.equal(options.obligatorio, true);
    },
  }, async (service) => {
    const result = await service.reprogramarCita({
      pacienteId: 41,
      embarazoId: 91,
      citaId: 701,
      fechaProgramada: '2030-09-17',
      req: ACTOR,
    });
    assert.deepEqual(result, { cita_anterior: reprogramada, cita_nueva: hija });
  });

  assert.deepEqual(order, [
    'validar-embarazo',
    'bloquear-original',
    'marcar-reprogramada',
    'crear-hija',
    'auditar',
  ]);
  assert.equal(events[0].contexto.evento, 'reprogramar');
  assert.deepEqual(events[0].cambios.nuevos, {
    estado_cita: 'reprogramada',
    fecha_programada: '2030-09-10',
    cita_nueva_id: 702,
  });
});

for (const [estado, accion] of [
  ['atendida', 'reprogramar'],
  ['cancelada', 'reprogramar'],
  ['reprogramada', 'reprogramar'],
  ['atendida', 'cancelar'],
  ['reprogramada', 'cancelar'],
]) {
  test(`rechaza ${accion} una cita ${estado} sin escribir ni auditar`, async () => {
    let writes = 0;
    let audits = 0;
    await withService({
      repository: {
        obtenerPorIdYEmbarazo: async () => ({
          ...PROGRAMADA,
          estado,
          control_cumplimiento_id: estado === 'atendida' ? 401 : null,
        }),
        marcarReprogramada: async () => { writes += 1; },
        crearHijaReprogramada: async () => { writes += 1; },
        marcarCancelada: async () => { writes += 1; },
      },
      audit: async () => { audits += 1; },
    }, async (service) => {
      const operation = accion === 'reprogramar'
        ? service.reprogramarCita({
          pacienteId: 41, embarazoId: 91, citaId: 701,
          fechaProgramada: '2030-09-17', req: ACTOR,
        })
        : service.cancelarCita({
          pacienteId: 41, embarazoId: 91, citaId: 701, req: ACTOR,
        });
      await assert.rejects(
        operation,
        (error) => error.statusCode === 409 && error.code === 'CITA_TRANSICION_INVALIDA'
      );
    });
    assert.equal(writes, 0);
    assert.equal(audits, 0);
  });
}

test('reprogramacion rechaza fecha igual y fecha pasada antes de cambiar estado', async () => {
  for (const fechaProgramada of ['2030-09-10', '2020-01-01']) {
    let writes = 0;
    await withService({
      repository: {
        obtenerPorIdYEmbarazo: async () => PROGRAMADA,
        marcarReprogramada: async () => { writes += 1; },
      },
    }, async (service) => {
      await assert.rejects(
        service.reprogramarCita({
          pacienteId: 41, embarazoId: 91, citaId: 701, fechaProgramada, req: ACTOR,
        }),
        (error) => error.statusCode === 400
          && ['CITA_FECHA_SIN_CAMBIO', 'CITA_FECHA_PASADA'].includes(error.code)
      );
    });
    assert.equal(writes, 0);
  }
});

test('evita IDOR al no encontrar la cita dentro del embarazo seleccionado', async () => {
  let writes = 0;
  await withService({
    repository: {
      obtenerPorIdYEmbarazo: async (id, embarazoId) => {
        assert.deepEqual([id, embarazoId], [999, 91]);
        return null;
      },
      marcarCancelada: async () => { writes += 1; },
    },
  }, async (service) => {
    await assert.rejects(
      service.cancelarCita({ pacienteId: 41, embarazoId: 91, citaId: 999, req: ACTOR }),
      (error) => error.statusCode === 404 && error.code === 'CITA_NOT_FOUND'
    );
  });
  assert.equal(writes, 0);
});

test('cancelacion conserva el registro, audita y una repeticion es idempotente', async () => {
  let current = PROGRAMADA;
  let updates = 0;
  let audits = 0;
  await withService({
    repository: {
      obtenerPorIdYEmbarazo: async () => current,
      marcarCancelada: async () => {
        updates += 1;
        current = { ...PROGRAMADA, estado: 'cancelada' };
        return current;
      },
    },
    audit: async (_req, event, options) => {
      audits += 1;
      assert.equal(event.contexto.evento, 'cancelar');
      assert.deepEqual(event.cambios, {
        anteriores: { estado_cita: 'programada' },
        nuevos: { estado_cita: 'cancelada' },
      });
      assert.equal(options.obligatorio, true);
    },
  }, async (service) => {
    assert.deepEqual(await service.cancelarCita({
      pacienteId: 41, embarazoId: 91, citaId: 701, req: ACTOR,
    }), { cita: current, idempotente: false });
    assert.deepEqual(await service.cancelarCita({
      pacienteId: 41, embarazoId: 91, citaId: 701, req: ACTOR,
    }), { cita: current, idempotente: true });
  });
  assert.equal(updates, 1);
  assert.equal(audits, 1);
});

test('un fallo al crear la hija o auditar aborta la transaccion', async () => {
  for (const failure of ['child', 'audit']) {
    const state = { original: 'programada', children: 0 };
    let rolledBack = false;
    await withService({
      repository: {
        enTransaccion: async (operation) => {
          const snapshot = { ...state };
          try {
            return await operation({ transaction: `rollback-${failure}` });
          } catch (error) {
            Object.assign(state, snapshot);
            rolledBack = true;
            throw error;
          }
        },
        obtenerPorIdYEmbarazo: async () => PROGRAMADA,
        marcarReprogramada: async () => {
          state.original = 'reprogramada';
          return { ...PROGRAMADA, estado: 'reprogramada' };
        },
        crearHijaReprogramada: async () => {
          if (failure === 'child') throw new Error('child insert failed');
          state.children += 1;
          return { ...PROGRAMADA, id: 702, estado: 'programada', reprogramada_desde_id: 701 };
        },
      },
      audit: async () => {
        if (failure === 'audit') throw new Error('audit insert failed');
      },
    }, async (service) => {
      await assert.rejects(service.reprogramarCita({
        pacienteId: 41, embarazoId: 91, citaId: 701,
        fechaProgramada: '2030-09-17', req: ACTOR,
      }), new RegExp(`${failure} .* failed`));
    });
    assert.equal(rolledBack, true);
    assert.deepEqual(state, { original: 'programada', children: 0 });
  }
});

test('consulta vigente devuelve cero o una cita y falla ante ambiguedad', async () => {
  for (const [rows, expected] of [[[], null], [[PROGRAMADA], PROGRAMADA]]) {
    await withService({
      repository: { listarProgramadasVigentesPorEmbarazo: async () => rows },
    }, async (service) => {
      assert.equal(await service.obtenerCitaVigente({ pacienteId: 41, embarazoId: 91 }), expected);
    });
  }
  await withService({
    repository: { listarProgramadasVigentesPorEmbarazo: async () => [PROGRAMADA, { ...PROGRAMADA, id: 702 }] },
  }, async (service) => {
    await assert.rejects(
      service.obtenerCitaVigente({ pacienteId: 41, embarazoId: 91 }),
      (error) => error.statusCode === 409 && error.code === 'CITAS_VIGENTES_AMBIGUAS'
    );
  });
});
