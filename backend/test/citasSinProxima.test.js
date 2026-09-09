const assert = require('node:assert/strict');
const test = require('node:test');

const POOL_PATH = require.resolve('../src/db/pool');
const REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const SERVICE_PATH = require.resolve('../src/services/citasPrenatalesService');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');

const ACTOR = { usuario: { id: 83, permisos: ['pacientes.ver', 'controles.editar'] } };

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

async function withRepository(pool, callback) {
  const restore = cacheModule(POOL_PATH, pool);
  const previous = require.cache[REPOSITORY_PATH];
  delete require.cache[REPOSITORY_PATH];
  try {
    return await callback(require(REPOSITORY_PATH));
  } finally {
    delete require.cache[REPOSITORY_PATH];
    if (previous) require.cache[REPOSITORY_PATH] = previous;
    restore();
  }
}

async function withService({ repository = {}, validate, audit }, callback) {
  const client = { transaction: 'cap-67' };
  const restore = [
    cacheModule(REPOSITORY_PATH, {
      enTransaccion: async (operation) => operation(client),
      ...repository,
    }),
    cacheModule(AUDIT_PATH, { registrarEventoPrivado: audit || (async () => {}) }),
    cacheModule(PREGNANCIES_PATH, {
      requerirEmbarazoId: (value) => value,
      resolverEmbarazoParaLectura: async () => ({ id: 91 }),
      validarEmbarazoEditable: async () => ({ id: 91 }),
      validarEmbarazoActivo: validate || (async () => ({ id: 91, estado: 'activo' })),
    }),
  ];
  const previous = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];
  try {
    return await callback(require(SERVICE_PATH), client);
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previous) require.cache[SERVICE_PATH] = previous;
    for (const restoreModule of restore.reverse()) restoreModule();
  }
}

test('cola incluye solo embarazos activos con control y sin programada vigente', async () => {
  let sql;
  const rows = [{ paciente_id: 41, embarazo_id: 91, motivo: 'ultimo_control_sin_cita' }];
  await withRepository({
    async query(value) {
      sql = value;
      return { rows };
    },
  }, async (repository) => {
    assert.deepEqual(await repository.listarSinProximaCita(), rows);
  });

  assert.match(sql, /WHERE e\.estado = 'activo'/);
  assert.match(sql, /JOIN LATERAL[\s\S]*FROM controles_prenatales/);
  assert.match(sql, /NOT EXISTS[\s\S]*vigente\.estado = 'programada'/);
  assert.match(sql, /vigente\.control_cumplimiento_id IS NULL/);
  assert.match(sql, /'cita_cancelada'/);
  assert.match(sql, /'ultimo_control_sin_cita'/);
  assert.match(sql, /'sin_cita_previa'/);
  assert.doesNotMatch(sql, /no_expediente|cui|telefono|direccion/i);
});

test('asignar bloquea embarazo, revalida cola y crea una raiz desde el ultimo control', async () => {
  const order = [];
  const audits = [];
  const created = {
    id: 801, embarazo_id: 91, control_origen_id: 501,
    reprogramada_desde_id: null, fecha_programada: '2030-09-20', estado: 'programada',
  };

  await withService({
    validate: async ({ pacienteId, embarazoId, db, bloquear }) => {
      order.push('embarazo');
      assert.deepEqual([pacienteId, embarazoId, db.transaction, bloquear], [41, 91, 'cap-67', true]);
    },
    repository: {
      listarProgramadasVigentesPorEmbarazo: async (_id, _db, options) => {
        order.push('vigente');
        assert.deepEqual(options, { bloquear: true });
        return [];
      },
      obtenerUltimoControlElegible: async (_id, _db, options) => {
        order.push('control');
        assert.deepEqual(options, { bloquear: true });
        return { id: 501, embarazo_id: 91 };
      },
      obtenerUltimaPorControl: async () => {
        order.push('historial');
        return null;
      },
      crearProgramadaDesdeControl: async (args) => {
        order.push('crear');
        assert.deepEqual(args, {
          embarazoId: 91,
          controlOrigenId: 501,
          fechaProgramada: '2030-09-20',
          usuarioId: 83,
        });
        return created;
      },
    },
    audit: async (_req, event, options) => {
      order.push('auditar');
      audits.push(event);
      assert.equal(options.obligatorio, true);
    },
  }, async (service) => {
    assert.deepEqual(await service.asignarCita({
      pacienteId: 41,
      embarazoId: 91,
      fechaProgramada: '2030-09-20',
      req: ACTOR,
    }), { cita: created, idempotente: false });
  });

  assert.deepEqual(order, ['embarazo', 'vigente', 'control', 'historial', 'crear', 'auditar']);
  assert.equal(audits[0].contexto.evento, 'crear');
  assert.equal(audits[0].metadata.motivo_codigo, 'cita_asignada_desde_ultimo_control');
});

test('tras cancelacion crea continuacion hija y conserva intacto el registro historico', async () => {
  const cancelada = {
    id: 701, embarazo_id: 91, control_origen_id: 501,
    fecha_programada: '2030-09-10', estado: 'cancelada',
  };
  let continuationArgs;
  await withService({
    repository: {
      listarProgramadasVigentesPorEmbarazo: async () => [],
      obtenerUltimoControlElegible: async () => ({ id: 501, embarazo_id: 91 }),
      obtenerUltimaPorControl: async () => cancelada,
      crearProgramadaComoContinuacion: async (args) => {
        continuationArgs = args;
        return {
          id: 702,
          embarazo_id: 91,
          control_origen_id: 501,
          reprogramada_desde_id: 701,
          fecha_programada: '2030-09-20',
          estado: 'programada',
        };
      },
    },
  }, async (service) => {
    await service.asignarCita({
      pacienteId: 41, embarazoId: 91, fechaProgramada: '2030-09-20', req: ACTOR,
    });
  });

  assert.equal(continuationArgs.citaAnterior, cancelada);
  assert.equal(cancelada.estado, 'cancelada');
});

test('rechaza sin efectos embarazo sin control, con cita vigente o que ya no esta activo', async () => {
  await withService({
    repository: {
      listarProgramadasVigentesPorEmbarazo: async () => [],
      obtenerUltimoControlElegible: async () => null,
    },
  }, async (service) => {
    await assert.rejects(service.asignarCita({
      pacienteId: 41, embarazoId: 91, fechaProgramada: '2030-09-20', req: ACTOR,
    }), (error) => error.code === 'CITA_REQUIERE_CONTROL_ORIGEN');
  });

  await withService({
    repository: { listarProgramadasVigentesPorEmbarazo: async () => [{ id: 800 }] },
  }, async (service) => {
    await assert.rejects(service.asignarCita({
      pacienteId: 41, embarazoId: 91, fechaProgramada: '2030-09-20', req: ACTOR,
    }), (error) => error.code === 'CITA_PROGRAMADA_VIGENTE');
  });

  await withService({
    validate: async () => {
      const error = new Error('No hay embarazo activo');
      error.statusCode = 409;
      error.code = 'NO_ACTIVE_PREGNANCY';
      throw error;
    },
  }, async (service) => {
    await assert.rejects(service.asignarCita({
      pacienteId: 41, embarazoId: 91, fechaProgramada: '2030-09-20', req: ACTOR,
    }), (error) => error.code === 'NO_ACTIVE_PREGNANCY');
  });
});

test('constraint de cita programada convierte carrera concurrente en conflicto estable', async () => {
  await withService({
    repository: {
      enTransaccion: async () => {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint = 'ux_citas_programada_embarazo';
        throw error;
      },
    },
  }, async (service) => {
    await assert.rejects(service.asignarCita({
      pacienteId: 41, embarazoId: 91, fechaProgramada: '2030-09-20', req: ACTOR,
    }), (error) => error.statusCode === 409 && error.code === 'CITA_PROGRAMADA_VIGENTE');
  });
});
