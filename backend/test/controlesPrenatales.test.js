const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { verificarPermiso } = require('../src/middleware/permisos');
const {
  controlCreateSchema,
  controlUpdateSchema,
} = require('../src/validations/controles.schemas');
const { ocultarDatosVih } = require('../src/utils/datosSensibles');
const { HttpError } = require('../src/utils/httpError');
const privateAuditService = require('../src/services/auditService');

const SERVICE_PATH = require.resolve('../src/services/controlesPrenatalesService');
const REPOSITORY_PATH = require.resolve('../src/repositories/controlesPrenatalesRepository');
const APPOINTMENTS_REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const POOL_PATH = require.resolve('../src/db/pool');

const ACTOR = {
  usuario: {
    id: 83,
    username: 'control.pruebas',
    rol: 'personal_salud',
    permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'],
  },
  headers: { 'user-agent': 'node:test' },
  ip: '127.0.0.1',
};

const VALID_CONTROL = {
  numero_control: 1,
  fecha: '2026-06-15',
  motivo_consulta: 'Control prenatal ficticio',
  edad_gestacional_semanas: 24,
  pa_sistolica: 118,
  pa_diastolica: 76,
  frecuencia_cardiaca: 80,
  frecuencia_respiratoria: 18,
  temperatura: 36.7,
  peso_kg: 62.5,
  talla_cm: 158,
  fcf: 145,
};

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

function strictMock(overrides, label) {
  return new Proxy(overrides, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property === 'symbol') return target[property];
      return async () => {
        throw new Error(`Llamada inesperada a ${label}.${String(property)}`);
      };
    },
  });
}

async function withService({ repository = {}, appointments = {}, audit, pregnancies = {} }, callback) {
  const repositoryWithTransaction = {
    enTransaccion: async (operation) => operation({ transaction: true }),
    ...repository,
  };
  const restore = [
    cacheModule(REPOSITORY_PATH, strictMock(repositoryWithTransaction, 'controlesRepository')),
    cacheModule(APPOINTMENTS_REPOSITORY_PATH, strictMock({
      existeRelacionConControl: async () => false,
      listarProgramadasVigentesPorEmbarazo: async () => [],
      obtenerUltimaPorControl: async () => null,
      ...appointments,
    }, 'citasRepository')),
    cacheModule(AUDIT_PATH, {
      registrarEventoPrivado: audit || (async () => {}),
    }),
    cacheModule(PREGNANCIES_PATH, {
      requerirEmbarazoId: pregnancies.requerirEmbarazoId || ((embarazoId) => {
        if (!embarazoId) {
          throw new HttpError(400, 'embarazo_id es obligatorio', {
            code: 'EMBARAZO_ID_REQUIRED',
          });
        }
        return embarazoId;
      }),
      resolverEmbarazoParaLectura: pregnancies.resolverEmbarazoParaLectura || (async () => {
        throw new Error('Llamada inesperada a resolverEmbarazoParaLectura');
      }),
      validarEmbarazoActivo: pregnancies.validarEmbarazoActivo
        || pregnancies.validarEmbarazoEditable
        || (async () => {
          throw new Error('Llamada inesperada a validarEmbarazoActivo');
        }),
      validarEmbarazoEditable: pregnancies.validarEmbarazoEditable || (async () => {
        throw new Error('Llamada inesperada a validarEmbarazoEditable');
      }),
    }),
  ];
  const previousService = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];

  try {
    return await callback(require(SERVICE_PATH));
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previousService) require.cache[SERVICE_PATH] = previousService;
    for (const restoreModule of restore.reverse()) restoreModule();
  }
}

async function withRepositoryPool(pool, callback) {
  const restorePool = cacheModule(POOL_PATH, pool);
  const previousRepository = require.cache[REPOSITORY_PATH];
  delete require.cache[REPOSITORY_PATH];

  try {
    return await callback(require(REPOSITORY_PATH));
  } finally {
    delete require.cache[REPOSITORY_PATH];
    if (previousRepository) require.cache[REPOSITORY_PATH] = previousRepository;
    restorePool();
  }
}

function invokeMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve()));
  });
}

function closedPregnancyError() {
  return new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
    code: 'PREGNANCY_READ_ONLY',
  });
}

function privateAuditRecorder({ fail = false, failAt = null } = {}) {
  const events = [];
  const databases = [];
  let attempts = 0;
  const repository = {
    async insertarEvento(event, db) {
      attempts += 1;
      databases.push(db);
      if (fail || attempts === failAt) throw new Error('audit insert failed');
      events.push(event);
    },
  };
  return {
    events,
    databases,
    audit(req, event, options = {}) {
      return privateAuditService.registrarEventoPrivado(req, event, {
        ...options,
        repository,
      });
    },
  };
}

test('acepta un control prenatal valido', () => {
  assert.equal(controlCreateSchema.safeParse(VALID_CONTROL).success, true);
});

test('actualizacion conserva NULL explicito de cita para aplicar la regla de cancelacion', () => {
  assert.deepEqual(controlUpdateSchema.parse({ cita_siguiente: null }), {
    cita_siguiente: null,
  });
  assert.deepEqual(controlUpdateSchema.parse({ cita_siguiente: '' }), {
    cita_siguiente: null,
  });
  assert.deepEqual(controlUpdateSchema.parse({ cita_siguiente: '2026-09-17' }), {
    cita_siguiente: '2026-09-17',
  });
});

test('rechaza numero de control y fecha obligatorios faltantes', () => {
  const result = controlCreateSchema.safeParse({ motivo_consulta: 'Sin datos obligatorios' });
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path.join('.')).sort(),
    ['fecha', 'numero_control']
  );
});

test('crea un control y atribuye escritura y auditoria al actor autenticado', async () => {
  const calls = [];
  const created = { id: 301, paciente_id: 41, embarazo_id: 91, ...VALID_CONTROL };

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async (embarazoId, numeroControl) => {
        calls.push(['buscar-numero', embarazoId, numeroControl]);
        return null;
      },
      upsert: async (args) => {
        calls.push(['upsert', args]);
        return created;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async (args) => {
        calls.push(['validar-embarazo', args]);
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
    audit: async (req, event, options) => calls.push(['auditoria', req, event, options]),
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_CONTROL,
      req: ACTOR,
    }), created);

    const upsert = calls.find(([name]) => name === 'upsert')[1];
    assert.equal(upsert.data.paciente_id, 41);
    assert.equal(upsert.data.embarazo_id, 91);
    assert.equal(upsert.data.registrado_por, ACTOR.usuario.id);
    assert.equal(upsert.data.updated_by, ACTOR.usuario.id);
    assert.match(upsert.data.hora, /^\d{2}:\d{2}$/);
    const audit = calls.find(([name]) => name === 'auditoria');
    assert.equal(audit[1], ACTOR);
    assert.equal(audit[2].accion, 'crear');
    assert.deepEqual(audit[2].contexto, {
      categoria: 'clinica',
      entidad: 'control_prenatal',
      evento: 'crear',
    });
    assert.equal(audit[3].obligatorio, true);
    assert.equal(audit[3].db.transaction, true);
  });
});

test('lista controles del embarazo seleccionado, incluido uno historico', async () => {
  const historical = { id: 88, paciente_id: 41, estado: 'cerrado' };
  const controls = [{ id: 201, embarazo_id: 88, numero_control: 1 }];
  let selection;

  await withService({
    repository: {
      listarPorEmbarazo: async (embarazoId) => {
        assert.equal(embarazoId, historical.id);
        return controls;
      },
    },
    pregnancies: {
      resolverEmbarazoParaLectura: async (args) => {
        selection = args;
        return historical;
      },
    },
  }, async (service) => {
    assert.equal(await service.listarControles(41, 88), controls);
    assert.deepEqual(selection, { pacienteId: 41, embarazoId: 88 });
  });
});

for (const estado of ['activo', 'puerperio', 'cerrado']) {
  test(`consulta un control de embarazo ${estado} sin generar auditoria`, async () => {
    const control = { id: 201, paciente_id: 41, embarazo_id: 88, numero_control: 1 };
    let selection;
    let audits = 0;

    await withService({
      repository: { obtenerPorId: async (id) => id === 201 ? control : null },
      pregnancies: {
        resolverEmbarazoParaLectura: async (args) => {
          selection = args;
          return { id: 88, paciente_id: 41, estado };
        },
      },
      audit: async () => { audits += 1; },
    }, async (service) => {
      assert.equal(await service.obtenerControl({ pacienteId: 41, embarazoId: 88, id: 201 }), control);
      assert.deepEqual(selection, { pacienteId: 41, embarazoId: 88 });
      assert.equal(audits, 0);
    });
  });
}

test('rechaza consultar un control desde un embarazo seleccionado distinto', async () => {
  const control = { id: 201, paciente_id: 41, embarazo_id: 88, numero_control: 1 };
  let selection;
  let audits = 0;

  await withService({
    repository: { obtenerPorId: async () => control },
    pregnancies: {
      resolverEmbarazoParaLectura: async (args) => {
        selection = args;
        return { id: 88, paciente_id: 41, estado: 'cerrado' };
      },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    await assert.rejects(
      service.obtenerControl({ pacienteId: 41, embarazoId: 91, id: 201 }),
      (error) => error.statusCode === 404
        && error.message === 'Control no encontrado en el embarazo seleccionado'
    );
    assert.deepEqual(selection, { pacienteId: 41, embarazoId: 88 });
    assert.equal(audits, 0);
  });
});

test('un control nuevo con cita_siguiente crea una cita programada en la misma transaccion', async () => {
  const client = { transaction: 'control-and-appointment' };
  const control = {
    id: 302,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_CONTROL,
    cita_siguiente: '2026-07-13',
  };
  let appointmentArgs;

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async (_args, db) => {
        assert.equal(db, client);
        return control;
      },
    },
    appointments: {
      crearProgramadaDesdeControl: async (args, db) => {
        appointmentArgs = args;
        assert.equal(db, client);
        return { id: 701, estado: 'programada', ...args };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
      req: ACTOR,
    }), control);
  });

  assert.deepEqual(appointmentArgs, {
    embarazoId: 91,
    controlOrigenId: 302,
    fechaProgramada: '2026-07-13',
    usuarioId: ACTOR.usuario.id,
  });
});

test('el siguiente control cumple la unica cita vigente y puede crear la proxima atomicamente', async () => {
  const client = { transaction: 'fulfillment-and-next' };
  const vigente = {
    id: 700,
    embarazo_id: 91,
    control_origen_id: 299,
    fecha_programada: '2026-06-14',
    estado: 'programada',
    control_cumplimiento_id: null,
  };
  const control = {
    id: 302,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_CONTROL,
    numero_control: 2,
    cita_siguiente: '2026-07-13',
  };
  const order = [];
  const audits = [];

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorNumeroYEmbarazo: async () => {
        order.push('buscar-control');
        return null;
      },
      upsert: async (_args, db) => {
        order.push('crear-control');
        assert.equal(db, client);
        return control;
      },
    },
    appointments: {
      listarProgramadasVigentesPorEmbarazo: async (embarazoId, db, options) => {
        order.push('resolver-cita-vigente');
        assert.deepEqual([embarazoId, db, options], [91, client, { bloquear: true }]);
        return [vigente];
      },
      marcarAtendida: async (args, db) => {
        order.push('cumplir-cita');
        assert.deepEqual(args, {
          citaId: 700,
          embarazoId: 91,
          controlCumplimientoId: 302,
          usuarioId: ACTOR.usuario.id,
        });
        assert.equal(db, client);
        return { ...vigente, estado: 'atendida', control_cumplimiento_id: 302 };
      },
      crearProgramadaDesdeControl: async (args, db) => {
        order.push('crear-proxima-cita');
        assert.deepEqual(args, {
          embarazoId: 91,
          controlOrigenId: 302,
          fechaProgramada: '2026-07-13',
          usuarioId: ACTOR.usuario.id,
        });
        assert.equal(db, client);
        return { id: 701, estado: 'programada' };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => {
        order.push('validar-embarazo');
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
    audit: async (_req, event, options) => {
      order.push(`auditar-${event.contexto.entidad}`);
      audits.push(event);
      assert.equal(options.db, client);
      assert.equal(options.obligatorio, true);
    },
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body: { ...VALID_CONTROL, numero_control: 2, cita_siguiente: '2026-07-13' },
      req: ACTOR,
    }), control);
  });

  assert.deepEqual(order, [
    'validar-embarazo',
    'buscar-control',
    'resolver-cita-vigente',
    'crear-control',
    'cumplir-cita',
    'auditar-cita_prenatal',
    'crear-proxima-cita',
    'auditar-control_prenatal',
  ]);
  assert.equal(audits[0].contexto.evento, 'atender');
  assert.deepEqual(audits[0].cambios.nuevos, {
    estado_cita: 'atendida',
    control_cumplimiento_id: 302,
  });
});

test('sin cita vigente el control se crea normalmente y no intenta cumplimiento', async () => {
  let fulfillmentWrites = 0;
  const control = { id: 303, paciente_id: 41, embarazo_id: 91, ...VALID_CONTROL };
  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async () => control,
    },
    appointments: {
      listarProgramadasVigentesPorEmbarazo: async () => [],
      marcarAtendida: async () => { fulfillmentWrites += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41, embarazoId: 91, body: VALID_CONTROL, req: ACTOR,
    }), control);
  });
  assert.equal(fulfillmentWrites, 0);
});

test('varias citas vigentes fallan de forma segura antes de crear el control', async () => {
  let controlWrites = 0;
  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async () => { controlWrites += 1; },
    },
    appointments: {
      listarProgramadasVigentesPorEmbarazo: async () => [
        { id: 700, estado: 'programada' },
        { id: 701, estado: 'programada' },
      ],
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 41, embarazoId: 91, body: VALID_CONTROL, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'CITAS_VIGENTES_AMBIGUAS'
    );
  });
  assert.equal(controlWrites, 0);
});

test('fallo de cumplimiento o de nueva cita aborta la operacion antes de la auditoria final', async () => {
  for (const failure of ['cumplimiento', 'nueva-cita']) {
    const calls = [];
    await withService({
      repository: {
        obtenerPorNumeroYEmbarazo: async () => null,
        upsert: async () => ({
          id: 302, paciente_id: 41, embarazo_id: 91,
          ...VALID_CONTROL, cita_siguiente: '2026-07-13',
        }),
      },
      appointments: {
        listarProgramadasVigentesPorEmbarazo: async () => [{
          id: 700, embarazo_id: 91, estado: 'programada', control_cumplimiento_id: null,
        }],
        marcarAtendida: async () => {
          calls.push('cumplimiento');
          if (failure === 'cumplimiento') return null;
          return { id: 700, estado: 'atendida', control_cumplimiento_id: 302 };
        },
        crearProgramadaDesdeControl: async () => {
          calls.push('nueva-cita');
          throw new Error('new appointment failed');
        },
      },
      pregnancies: {
        validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
      },
      audit: async (_req, event) => calls.push(`audit-${event.contexto.entidad}`),
    }, async (service) => {
      await assert.rejects(
        service.crearControl({
          pacienteId: 41,
          embarazoId: 91,
          body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
          req: ACTOR,
        }),
        failure === 'cumplimiento'
          ? (error) => error.code === 'CITA_CUMPLIMIENTO_CONFLICTO'
          : /new appointment failed/
      );
    });
    assert.equal(calls.includes('audit-control_prenatal'), false);
    if (failure === 'cumplimiento') assert.deepEqual(calls, ['cumplimiento']);
    else assert.deepEqual(calls, ['cumplimiento', 'audit-cita_prenatal', 'nueva-cita']);
  }
});

test('un control nuevo sin cita_siguiente no crea una cita prenatal', async () => {
  let appointments = 0;
  const control = { id: 303, paciente_id: 41, embarazo_id: 91, ...VALID_CONTROL };

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async () => control,
    },
    appointments: {
      crearProgramadaDesdeControl: async () => { appointments += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_CONTROL,
      req: ACTOR,
    }), control);
  });

  assert.equal(appointments, 0);
});

test('reintentar un control ya persistido no duplica su cita', async () => {
  let state = null;
  let writes = 0;
  let appointments = 0;

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => state,
      upsert: async ({ data }) => {
        writes += 1;
        state = { id: 304, ...data };
        return state;
      },
    },
    appointments: {
      crearProgramadaDesdeControl: async () => { appointments += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    const request = {
      pacienteId: 41,
      embarazoId: 91,
      body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
      req: ACTOR,
    };
    assert.equal(await service.crearControl(request), state);
    assert.equal(await service.crearControl(request), state);
  });

  assert.equal(writes, 1);
  assert.equal(appointments, 1);
});

test('un fallo al crear la cita revierte el control dentro de la misma transaccion', async () => {
  let state = null;
  let rolledBack = false;

  await withService({
    repository: {
      enTransaccion: async (operation) => {
        try {
          return await operation({ transaction: 'appointment-rollback' });
        } catch (error) {
          state = null;
          rolledBack = true;
          throw error;
        }
      },
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async ({ data }) => {
        state = { id: 305, ...data };
        return state;
      },
    },
    appointments: {
      crearProgramadaDesdeControl: async () => {
        throw new Error('appointment insert failed');
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({
        pacienteId: 41,
        embarazoId: 91,
        body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
        req: ACTOR,
      }),
      /appointment insert failed/
    );
  });

  assert.equal(rolledBack, true);
  assert.equal(state, null);
});

test('un control historico no crea cita ni permite convertir una edicion en reprogramacion', async () => {
  const before = {
    id: 306,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_CONTROL,
    cita_siguiente: null,
  };
  let writes = 0;
  let appointments = 0;

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => before,
      upsert: async () => { writes += 1; },
    },
    appointments: {
      crearProgramadaDesdeControl: async () => { appointments += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({
        pacienteId: 41,
        embarazoId: 91,
        body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_REPROGRAMACION_REQUERIDA'
    );
  });

  assert.equal(writes, 0);
  assert.equal(appointments, 0);
});

test('actualiza un control existente según los campos enviados', async () => {
  const before = { id: 301, paciente_id: 41, embarazo_id: 91, peso_kg: 62.5 };
  const updated = { ...before, peso_kg: 63.2, updated_by: ACTOR.usuario.id };
  let updateArgs;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async (args) => {
        updateArgs = args;
        return updated;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.equal(await service.actualizarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: { peso_kg: 63.2 },
      req: ACTOR,
    }), updated);
    assert.deepEqual(updateArgs, {
      id: 301,
      embarazoId: 91,
      data: { peso_kg: 63.2 },
      campos: ['peso_kg'],
      updatedBy: ACTOR.usuario.id,
      pacienteId: 41,
    });
  });
});

test('consulta de control informa la ultima cita estructurada sin exponer su historial completo', async () => {
  const control = { id: 201, paciente_id: 41, embarazo_id: 88, numero_control: 1 };
  const cita = {
    id: 702,
    embarazo_id: 88,
    control_origen_id: 201,
    fecha_programada: '2026-09-24',
    estado: 'programada',
    reprogramada_desde_id: 701,
    registrado_por: 83,
  };

  await withService({
    repository: { obtenerPorId: async () => control },
    appointments: { obtenerUltimaPorControl: async () => cita },
    pregnancies: {
      resolverEmbarazoParaLectura: async () => ({ id: 88, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.deepEqual(await service.obtenerControl({ pacienteId: 41, embarazoId: 88, id: 201 }), {
      ...control,
      cita_estructurada: {
        id: 702,
        fecha_programada: '2026-09-24',
        estado: 'programada',
      },
    });
  });
});

test('CAP-56 no bloquea la edicion actual de un control existente en puerperio', async () => {
  const before = { id: 301, paciente_id: 41, embarazo_id: 91, peso_kg: 62.5 };
  const updated = { ...before, peso_kg: 63.2, updated_by: ACTOR.usuario.id };
  let validations = 0;
  let updates = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => {
        updates += 1;
        return updated;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => {
        validations += 1;
        return { id: 91, paciente_id: 41, estado: 'puerperio' };
      },
    },
  }, async (service) => {
    assert.equal(await service.actualizarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: { peso_kg: 63.2 },
      req: ACTOR,
    }), updated);
  });

  assert.equal(validations, 1);
  assert.equal(updates, 1);
});

for (const estado of ['activo', 'puerperio', 'cerrado']) {
  test(`crear control exige embarazo activo y evita efectos parciales en estado ${estado}`, async () => {
    const calls = [];
    const created = { id: 301, paciente_id: 41, embarazo_id: 91, ...VALID_CONTROL };

    await withService({
      repository: {
        obtenerPorNumeroYEmbarazo: async () => {
          calls.push('buscar-control');
          return null;
        },
        upsert: async () => {
          calls.push('insertar-control');
          return created;
        },
      },
      appointments: {
        listarProgramadasVigentesPorEmbarazo: async () => {
          calls.push('buscar-citas');
          return [];
        },
        crearProgramadaDesdeControl: async () => {
          calls.push('crear-cita');
          return { id: 701 };
        },
      },
      pregnancies: {
        validarEmbarazoActivo: async () => {
          calls.push('validar-embarazo-activo');
          if (estado !== 'activo') {
            throw new HttpError(409, 'No hay embarazo activo para registrar controles prenatales', {
              code: 'NO_ACTIVE_PREGNANCY',
            });
          }
          return { id: 91, paciente_id: 41, estado };
        },
      },
      audit: async () => calls.push('auditoria'),
    }, async (service) => {
      const request = {
        pacienteId: 41,
        embarazoId: 91,
        body: { ...VALID_CONTROL, cita_siguiente: '2026-07-13' },
        req: ACTOR,
      };

      if (estado === 'activo') {
        assert.equal(await service.crearControl(request), created);
        assert.deepEqual(calls, [
          'validar-embarazo-activo',
          'buscar-control',
          'buscar-citas',
          'insertar-control',
          'crear-cita',
          'auditoria',
        ]);
        return;
      }

      await assert.rejects(
        service.crearControl(request),
        (error) => error.statusCode === 409 && error.code === 'NO_ACTIVE_PREGNANCY'
      );
      assert.deepEqual(calls, ['validar-embarazo-activo']);
    });
  });
}

test('NULL a fecha actualiza el ultimo control y crea su cita estructurada atomicamente', async () => {
  const client = { transaction: 'control-appointment-create' };
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  const updated = { ...before, cita_siguiente: '2026-09-17', updated_by: ACTOR.usuario.id };
  const appointment = {
    id: 701,
    embarazo_id: 91,
    control_origen_id: 301,
    fecha_programada: '2026-09-17',
    estado: 'programada',
  };
  const calls = [];

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorId: async (_id, db, options) => {
        calls.push(['control', db, options]);
        return before;
      },
      existeControlPosterior: async (args, db) => {
        calls.push(['posterior', args, db]);
        return false;
      },
      actualizar: async (args, db) => {
        calls.push(['actualizar', args, db]);
        return updated;
      },
    },
    appointments: {
      obtenerUltimaPorControl: async (args, db, options) => {
        calls.push(['origen', args, db, options]);
        return null;
      },
      listarProgramadasVigentesPorEmbarazo: async (embarazoId, db, options) => {
        calls.push(['vigentes', embarazoId, db, options]);
        return [];
      },
      crearProgramadaDesdeControl: async (args, db) => {
        calls.push(['crear-cita', args, db]);
        return appointment;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async (args) => {
        calls.push(['embarazo', args]);
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
    audit: async (_req, event, options) => calls.push(['auditoria', event, options]),
  }, async (service) => {
    assert.equal(await service.actualizarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: { cita_siguiente: '2026-09-17' },
      req: ACTOR,
    }), updated);
  });

  const updateCall = calls.find(([name]) => name === 'actualizar');
  assert.deepEqual(updateCall[1].data, { cita_siguiente: '2026-09-17' });
  assert.equal(updateCall[2], client);
  const appointmentCall = calls.find(([name]) => name === 'crear-cita');
  assert.deepEqual(appointmentCall[1], {
    embarazoId: 91,
    controlOrigenId: 301,
    fechaProgramada: '2026-09-17',
    usuarioId: ACTOR.usuario.id,
  });
  assert.equal(appointmentCall[2], client);
  const auditCalls = calls.filter(([name]) => name === 'auditoria');
  assert.equal(auditCalls.length, 2);
  assert.deepEqual(auditCalls.map(([, event]) => event.contexto), [
    { categoria: 'clinica', entidad: 'control_prenatal', evento: 'actualizar' },
    { categoria: 'clinica', entidad: 'cita_prenatal', evento: 'crear' },
  ]);
  assert.ok(auditCalls.every(([, , options]) => options.db === client && options.obligatorio));
});

for (const estadoCita of ['programada', 'reprogramada', 'cancelada', 'atendida']) {
  test(`edicion clinica conserva cita estructurada ${estadoCita} cuando recibe su misma fecha`, async () => {
    const before = {
      id: 301,
      paciente_id: 41,
      embarazo_id: 91,
      numero_control: 2,
      fecha: '2026-06-15',
      motivo_consulta: 'Anterior',
      cita_siguiente: null,
    };
    const cita = {
      id: 701,
      embarazo_id: 91,
      control_origen_id: 301,
      fecha_programada: '2026-09-17',
      estado: estadoCita,
    };
    const calls = [];

    await withService({
      repository: {
        obtenerPorId: async () => before,
        actualizar: async ({ data, campos }) => {
          calls.push(['actualizar', data, campos]);
          return { ...before, ...data };
        },
      },
      appointments: {
        obtenerUltimaPorControl: async (args, _db, options) => {
          calls.push(['consultar-cita', args, options]);
          return cita;
        },
      },
      pregnancies: {
        validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
      },
      audit: async () => calls.push(['auditoria']),
    }, async (service) => {
      const result = await service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: {
          motivo_consulta: 'Actualizado',
          cita_siguiente: '2026-09-17',
        },
        req: ACTOR,
      });
      assert.equal(result.motivo_consulta, 'Actualizado');
    });

    assert.deepEqual(calls.find(([name]) => name === 'actualizar'), [
      'actualizar',
      { motivo_consulta: 'Actualizado' },
      ['motivo_consulta'],
    ]);
    assert.equal(calls.filter(([name]) => name === 'consultar-cita').length, 1);
    assert.equal(calls.filter(([name]) => name === 'auditoria').length, 1);
  });
}

test('cambio indirecto de cita estructurada rechaza tambien el cambio clinico atomicamente', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    motivo_consulta: 'Anterior',
    cita_siguiente: '2026-09-17',
  };
  let updates = 0;
  let audits = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => { updates += 1; },
    },
    appointments: {
      obtenerUltimaPorControl: async () => ({
        id: 702,
        embarazo_id: 91,
        control_origen_id: 301,
        fecha_programada: '2026-09-24',
        estado: 'programada',
        reprogramada_desde_id: 701,
      }),
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: {
          motivo_consulta: 'No debe persistir',
          cita_siguiente: '2026-10-01',
        },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_REPROGRAMACION_REQUERIDA'
    );
  });

  assert.equal(updates, 0);
  assert.equal(audits, 0);
});

test('edicion clinica sin cita_siguiente no consulta ni muta citas', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    motivo_consulta: 'Anterior',
    cita_siguiente: '2026-09-17',
  };
  let appointmentReads = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async ({ data }) => ({ ...before, ...data }),
    },
    appointments: {
      obtenerUltimaPorControl: async () => {
        appointmentReads += 1;
        return null;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'puerperio' }),
    },
  }, async (service) => {
    const updated = await service.actualizarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: { motivo_consulta: 'Actualizado en puerperio' },
      req: ACTOR,
    });
    assert.equal(updated.motivo_consulta, 'Actualizado en puerperio');
  });

  assert.equal(appointmentReads, 0);
});

test('retry equivalente de NULL a fecha no duplica la cita estructurada', async () => {
  let state = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let updates = 0;
  let appointments = 0;
  let audits = 0;

  await withService({
    repository: {
      obtenerPorId: async () => state,
      existeControlPosterior: async () => false,
      actualizar: async ({ data }) => {
        updates += 1;
        state = { ...state, ...data };
        return state;
      },
    },
    appointments: {
      obtenerUltimaPorControl: async () => null,
      listarProgramadasVigentesPorEmbarazo: async () => [],
      crearProgramadaDesdeControl: async () => {
        appointments += 1;
        return {
          id: 701,
          embarazo_id: 91,
          control_origen_id: 301,
          fecha_programada: state.cita_siguiente,
          estado: 'programada',
        };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    const request = {
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: { cita_siguiente: '2026-09-17' },
      req: ACTOR,
    };
    await service.actualizarControl(request);
    await service.actualizarControl(request);
  });

  assert.equal(updates, 1);
  assert.equal(appointments, 1);
  assert.equal(audits, 2);
});

test('NULL a fecha rechaza un control con controles prenatales posteriores', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let writes = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      existeControlPosterior: async () => true,
      actualizar: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-09-17' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_CONTROL_NO_ES_ULTIMO'
    );
  });

  assert.equal(writes, 0);
});

test('NULL a fecha rechaza otra cita programada vigente para el embarazo', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let writes = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      existeControlPosterior: async () => false,
      actualizar: async () => { writes += 1; },
    },
    appointments: {
      obtenerUltimaPorControl: async () => null,
      listarProgramadasVigentesPorEmbarazo: async () => [{ id: 700, estado: 'programada' }],
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-09-17' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_PROGRAMADA_VIGENTE'
    );
  });

  assert.equal(writes, 0);
});

test('NULL a fecha distinta rechaza cambiar una cita estructurada ya originada por el control', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let writes = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      existeControlPosterior: async () => false,
      actualizar: async () => { writes += 1; },
    },
    appointments: {
      obtenerUltimaPorControl: async () => ({
        id: 701,
        control_origen_id: 301,
        fecha_programada: '2026-09-10',
        estado: 'programada',
      }),
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-09-17' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_REPROGRAMACION_REQUERIDA'
    );
  });

  assert.equal(writes, 0);
});

test('fecha a NULL sigue exigiendo cancelar la cita estructurada', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: '2026-09-17',
  };
  let writes = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: null },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_CANCELACION_REQUERIDA'
    );
  });

  assert.equal(writes, 0);
});

test('fallo al crear la cita revierte el cambio NULL a fecha', async () => {
  const original = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let state = { ...original };
  let rolledBack = false;
  let audits = 0;

  await withService({
    repository: {
      enTransaccion: async (operation) => {
        try {
          return await operation({ transaction: 'appointment-create-rollback' });
        } catch (error) {
          state = { ...original };
          rolledBack = true;
          throw error;
        }
      },
      obtenerPorId: async () => state,
      existeControlPosterior: async () => false,
      actualizar: async ({ data }) => {
        state = { ...state, ...data };
        return state;
      },
    },
    appointments: {
      obtenerUltimaPorControl: async () => null,
      listarProgramadasVigentesPorEmbarazo: async () => [],
      crearProgramadaDesdeControl: async () => {
        throw new Error('appointment insert failed');
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-09-17' },
        req: ACTOR,
      }),
      /appointment insert failed/
    );
  });

  assert.equal(rolledBack, true);
  assert.deepEqual(state, original);
  assert.equal(audits, 0);
});

test('NULL a fecha mantiene aislamiento por paciente y embarazo antes de crear cita', async () => {
  const wrongPregnancyControl = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 92,
    numero_control: 2,
    fecha: '2026-06-15',
    cita_siguiente: null,
  };
  let appointmentCalls = 0;

  await withService({
    repository: {
      obtenerPorId: async () => wrongPregnancyControl,
    },
    appointments: {
      crearProgramadaDesdeControl: async () => { appointmentCalls += 1; },
    },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-09-17' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 404
    );
  });

  assert.equal(appointmentCalls, 0);
});

test('elimina un control existente según la regla actual', async () => {
  const before = { id: 301, paciente_id: 41, embarazo_id: 91 };
  let deleteArgs;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      eliminar: async (args) => {
        deleteArgs = args;
        return { control: before, rowCount: 1 };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    assert.deepEqual(await service.eliminarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      req: ACTOR,
    }), { message: 'Control eliminado' });
    assert.deepEqual(deleteArgs, { id: 301, embarazoId: 91, pacienteId: 41 });
  });
});

test('rechaza crear controles cuando la paciente no existe', async () => {
  let repositoryCalls = 0;
  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => { repositoryCalls += 1; },
      upsert: async () => { repositoryCalls += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => {
        throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
          code: 'PREGNANCY_NOT_FOUND',
        });
      },
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 9999, embarazoId: 91, body: VALID_CONTROL, req: ACTOR }),
      (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
    );
    assert.equal(repositoryCalls, 0);
  });
});

test('valida que embarazo_id pertenezca a la paciente indicada', async () => {
  let validationArgs;
  await withService({
    pregnancies: {
      validarEmbarazoEditable: async (args) => {
        validationArgs = args;
        throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
          code: 'PREGNANCY_NOT_FOUND',
        });
      },
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 41, embarazoId: 777, body: VALID_CONTROL, req: ACTOR }),
      (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
    );
    assert.equal(validationArgs.pacienteId, 41);
    assert.equal(validationArgs.embarazoId, 777);
    assert.equal(validationArgs.bloquear, true);
    assert.equal(validationArgs.db.transaction, true);
  });
});

for (const operation of ['crear', 'actualizar', 'eliminar']) {
  test(`impide ${operation} controles en un embarazo cerrado`, async () => {
    let writes = 0;
    const before = { id: 301, paciente_id: 41, embarazo_id: 88 };
    const repository = operation === 'crear'
      ? {
        obtenerPorNumeroYEmbarazo: async () => null,
        upsert: async () => { writes += 1; },
      }
      : {
        obtenerPorId: async () => before,
        actualizar: async () => { writes += 1; },
        eliminar: async () => { writes += 1; },
      };

    await withService({
      repository,
      pregnancies: { validarEmbarazoEditable: async () => { throw closedPregnancyError(); } },
    }, async (service) => {
      const request = {
        pacienteId: 41,
        embarazoId: 88,
        id: 301,
        body: operation === 'actualizar' ? { peso_kg: 64 } : VALID_CONTROL,
        req: ACTOR,
      };
      const promise = operation === 'crear'
        ? service.crearControl(request)
        : operation === 'actualizar'
          ? service.actualizarControl(request)
          : service.eliminarControl(request);

      await assert.rejects(
        promise,
        (error) => error.statusCode === 409 && error.code === 'PREGNANCY_READ_ONLY'
      );
      assert.equal(writes, 0);
    });
  });
}

test('un numero repetido aplica el upsert actual y audita una actualizacion', async () => {
  const before = { id: 301, paciente_id: 41, embarazo_id: 91, numero_control: 2, peso_kg: 60 };
  const after = { ...before, peso_kg: 61 };
  let event;

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async (embarazoId, numeroControl) => {
        assert.deepEqual([embarazoId, numeroControl], [91, 2]);
        return before;
      },
      upsert: async () => after,
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async (_req, auditEvent) => { event = auditEvent; },
  }, async (service) => {
    assert.equal(await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body: { ...VALID_CONTROL, numero_control: 2, peso_kg: 61 },
      req: ACTOR,
    }), after);
    assert.equal(event.accion, 'actualizar');
    assert.deepEqual(event.contexto, {
      categoria: 'clinica',
      entidad: 'control_prenatal',
      evento: 'actualizar',
    });
    assert.ok(event.cambios.anteriores);
    assert.ok(event.cambios.nuevos);
    assert.equal('datosAnteriores' in event, false);
  });
});

test('valida el rango actual del numero de control', () => {
  assert.equal(controlCreateSchema.safeParse({ ...VALID_CONTROL, numero_control: 0 }).success, false);
  assert.equal(controlCreateSchema.safeParse({ ...VALID_CONTROL, numero_control: 21 }).success, false);
  assert.equal(controlCreateSchema.safeParse({ ...VALID_CONTROL, numero_control: 20 }).success, true);
});

test('valida fechas y rangos clinicos existentes', () => {
  const invalidCases = [
    { fecha: '2999-01-01' },
    { fecha: '2026-02-30' },
    { edad_gestacional_semanas: 46 },
    { pa_sistolica: 49 },
    { pa_diastolica: 161 },
    { frecuencia_cardiaca: 221 },
    { frecuencia_respiratoria: 4 },
    { temperatura: 45.1 },
    { peso_kg: 19.9 },
    { talla_cm: 231 },
    { fcf: 59 },
  ];

  for (const override of invalidCases) {
    assert.equal(
      controlCreateSchema.safeParse({ ...VALID_CONTROL, ...override }).success,
      false,
      `Debia rechazar ${JSON.stringify(override)}`
    );
  }
  assert.equal(controlUpdateSchema.safeParse({ temperatura: 37.2, fcf: 160 }).success, true);
});

test('oculta datos VIH sin controles.ver_vih', () => {
  const control = {
    id: 301,
    vih_realizado: true,
    vih_resultado: 'negativo',
    vih_resultado_valor: 'dato sensible ficticio',
    vdrl_resultado: 'negativo',
  };
  assert.deepEqual(ocultarDatosVih(control, ['pacientes.ver']), {
    id: 301,
    vdrl_resultado: 'negativo',
  });
});

test('muestra datos VIH con controles.ver_vih', () => {
  const control = { id: 301, vih_realizado: true, vih_resultado: 'negativo' };
  assert.equal(ocultarDatosVih(control, ['controles.ver_vih']), control);
});

for (const permission of ['controles.crear', 'controles.editar']) {
  test(`usuario sin ${permission} recibe 403`, async () => {
    await assert.rejects(
      invokeMiddleware(verificarPermiso(permission), {
        usuario: { id: ACTOR.usuario.id, permisos: ['pacientes.ver'] },
      }),
      (error) => error.statusCode === 403 && error.code === 'PERMISO_REQUERIDO'
    );
  });
}

test('un fallo de escritura no genera auditoria ni una segunda escritura parcial', async () => {
  const calls = [];
  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => {
        calls.push('lectura-previa');
        return null;
      },
      upsert: async () => {
        calls.push('escritura-atomica');
        throw new Error('fallo simulado durante upsert');
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => {
        calls.push('validar-embarazo');
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
    audit: async () => calls.push('auditoria'),
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 41, embarazoId: 91, body: VALID_CONTROL, req: ACTOR }),
      /fallo simulado durante upsert/
    );
    assert.deepEqual(calls, ['validar-embarazo', 'lectura-previa', 'escritura-atomica']);
  });
});

test('el repositorio restringe el upsert atomico a un embarazo activo', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      throw new Error('fallo SQL simulado');
    },
  };

  await withRepositoryPool(pool, async (repository) => {
    await assert.rejects(
      repository.upsert({
        data: {
          paciente_id: 41,
          embarazo_id: 91,
          numero_control: 1,
          fecha: '2026-06-15',
          updated_by: ACTOR.usuario.id,
        },
        updateFields: ['fecha'],
      }),
      /fallo SQL simulado/
    );
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WITH embarazo_activo AS/);
  assert.match(calls[0].sql, /estado = 'activo'/);
  assert.doesNotMatch(calls[0].sql, /puerperio/);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[0].sql, /INSERT INTO controles_prenatales/);
  assert.match(calls[0].sql, /ON CONFLICT \(embarazo_id, numero_control\) DO UPDATE/);
});

test('el repositorio bloquea el control y detecta controles posteriores del mismo embarazo', async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT EXISTS/.test(sql)) return { rows: [{ existe: true }] };
      return { rows: [{ id: 301, embarazo_id: 91 }] };
    },
  };

  await withRepositoryPool(pool, async (repository) => {
    const control = await repository.obtenerPorId(301, pool, { bloquear: true });
    const existePosterior = await repository.existeControlPosterior({
      embarazoId: 91,
      controlId: 301,
      numeroControl: 2,
      fecha: '2026-06-15',
    }, pool);

    assert.equal(control.id, 301);
    assert.equal(existePosterior, true);
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM controles_prenatales/);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(calls[0].params, [301]);
  assert.match(calls[1].sql, /embarazo_id = \$1/);
  assert.match(calls[1].sql, /numero_control > \$3/);
  assert.match(calls[1].sql, /fecha > \$4/);
  assert.deepEqual(calls[1].params, [91, 301, 2, '2026-06-15']);
});

test('confirma el orden y la revalidacion frente a una carrera concurrente', async () => {
  const order = [];
  let validations = 0;

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => {
        order.push('buscar-numero');
        return null;
      },
      upsert: async () => {
        order.push('upsert-bloqueado');
        return null;
      },
    },
    pregnancies: {
      requerirEmbarazoId: (embarazoId) => {
        order.push('requerir-embarazo');
        return embarazoId;
      },
      validarEmbarazoEditable: async () => {
        validations += 1;
        order.push(`validar-embarazo-${validations}`);
        if (validations === 2) throw closedPregnancyError();
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 41, embarazoId: 91, body: VALID_CONTROL, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'PREGNANCY_READ_ONLY'
    );
    assert.deepEqual(order, [
      'requerir-embarazo',
      'validar-embarazo-1',
      'buscar-numero',
      'upsert-bloqueado',
      'validar-embarazo-2',
    ]);
  });
});

test('creacion privada conserva solo campos e identificadores internos', async () => {
  const recorder = privateAuditRecorder();
  const client = { transaction: 'control-create' };
  const body = {
    ...VALID_CONTROL,
    motivo_consulta: 'Observacion clinica sintetica',
    glicemia_realizada: true,
    glicemia_resultado: '91 mg/dL',
    hematologia_realizada: true,
    hematologia_resultado: 'Hemoglobina 12.4',
    vih_realizado: true,
    vih_resultado: 'positivo',
    otros_lab: 'Laboratorio sintetico',
    dato_ignorado: { cookie: 'cookie-control', token: 'token-control' },
  };

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorNumeroYEmbarazo: async (_pregnancyId, _number, db) => {
        assert.equal(db, client);
        return null;
      },
      upsert: async ({ data }, db) => {
        assert.equal(db, client);
        return { id: 301, ...data, created_at: '2026-06-15T10:00:00Z' };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async (args) => {
        assert.equal(args.db, client);
        assert.equal(args.bloquear, true);
        return { id: 91, paciente_id: 41, estado: 'activo' };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    await service.crearControl({
      pacienteId: 41,
      embarazoId: 91,
      body,
      req: { ...ACTOR, body: { ...body, cui: '1234567890101', nombres: 'Nombre oculto' } },
    });
  });

  assert.equal(recorder.events.length, 1);
  assert.deepEqual(recorder.databases, [client]);
  const event = recorder.events[0];
  assert.equal(event.entidadAfectada, 'control_prenatal');
  assert.equal(event.idEntidad, 301);
  assert.equal(event.pacienteId, 41);
  assert.equal(event.embarazoId, 91);
  assert.equal(event.datosNuevos.politica_version, 1);
  assert.equal(event.datosNuevos.resultado, 'exitoso');
  assert.ok(event.datosNuevos.campos_registrados.includes('peso_kg'));
  assert.ok(event.datosNuevos.campos_registrados.includes('pa_sistolica'));
  assert.ok(event.datosNuevos.campos_registrados.includes('vih_resultado'));
  assert.ok(event.datosNuevos.campos_registrados.includes('glicemia_resultado'));
  assert.equal(event.datosNuevos.campos_registrados.includes('created_at'), false);
  assert.equal(event.datosNuevos.campos_registrados.includes('registrado_por'), false);
  assert.equal(event.datosNuevos.campos_registrados.includes('updated_by'), false);
  assert.doesNotMatch(
    JSON.stringify(event),
    /Observacion clinica sintetica|91 mg\/dL|Hemoglobina 12\.4|positivo|Laboratorio sintetico|1234567890101|Nombre oculto|cookie-control|token-control|62\.5|118|76|145/
  );
});

test('actualizacion privada registra solo nombres de signos y laboratorios modificados', async () => {
  const recorder = privateAuditRecorder();
  const client = { transaction: 'control-update' };
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    peso_kg: '62.50',
    pa_sistolica: 118,
    cita_siguiente: '2026-07-01',
    glicemia_resultado: '88 mg/dL',
    vih_resultado: 'negativo',
    updated_at: '2026-06-01T00:00:00Z',
  };
  const body = {
    peso_kg: 63.2,
    pa_sistolica: 121,
    cita_siguiente: '2026-07-01',
    glicemia_resultado: '99 mg/dL',
    vih_resultado: 'positivo',
    updated_at: 'valor ignorado',
  };
  const req = {
    ...ACTOR,
    usuario: {
      ...ACTOR.usuario,
      permisos: [...ACTOR.usuario.permisos, 'controles.ver_vih'],
    },
    body,
  };

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorId: async (_id, db) => {
        assert.equal(db, client);
        return before;
      },
      actualizar: async ({ data }, db) => {
        assert.equal(db, client);
        return { ...before, ...data, updated_at: '2026-06-16T00:00:00Z' };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: recorder.audit,
  }, async (service) => {
    await service.actualizarControl({ pacienteId: 41, embarazoId: 91, id: 301, body, req });
  });

  assert.equal(recorder.events.length, 1);
  assert.deepEqual(recorder.events[0].datosNuevos, {
    campos_sensibles_modificados: [
      'glicemia_resultado',
      'pa_sistolica',
      'peso_kg',
      'vih_resultado',
    ],
    politica_version: 1,
    resultado: 'exitoso',
  });
  assert.doesNotMatch(
    JSON.stringify(recorder.events[0]),
    /62\.50|63\.2|118|121|2026-07-01|88 mg\/dL|99 mg\/dL|negativo|positivo|updated_at/
  );
});

test('editar cita_siguiente exige el flujo formal de CITAS-01B', async () => {
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    cita_siguiente: '2026-07-01',
  };
  let updates = 0;
  let audits = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => { updates += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { cita_siguiente: '2026-07-08' },
        req: ACTOR,
      }),
      (error) => error.statusCode === 409 && error.code === 'CITA_REPROGRAMACION_REQUERIDA'
    );
  });

  assert.equal(updates, 0);
  assert.equal(audits, 0);
});

test('no elimina un control que participa en una cita prenatal', async () => {
  const before = { id: 301, paciente_id: 41, embarazo_id: 91 };
  let deletes = 0;

  await withService({
    repository: {
      obtenerPorId: async () => before,
      eliminar: async () => { deletes += 1; },
    },
    appointments: {
      existeRelacionConControl: async ({ controlId, embarazoId }) => {
        assert.deepEqual([controlId, embarazoId], [301, 91]);
        return true;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
  }, async (service) => {
    await assert.rejects(
      service.eliminarControl({ pacienteId: 41, embarazoId: 91, id: 301, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'CONTROL_RELACIONADO_CON_CITA'
    );
  });

  assert.equal(deletes, 0);
});

test('equivalencias numericas, fechas y vacios no producen DML ni auditoria', async () => {
  let updates = 0;
  let audits = 0;
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    peso_kg: '62.50',
    pa_sistolica: '118',
    cita_siguiente: '2026-07-01',
    motivo_consulta: null,
  };

  await withService({
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => {
        updates += 1;
        return null;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.equal(service.valoresControlEquivalentes('62.50', 62.5), true);
    assert.equal(service.valoresControlEquivalentes(null, ''), true);
    assert.equal(await service.actualizarControl({
      pacienteId: 41,
      embarazoId: 91,
      id: 301,
      body: {
        peso_kg: 62.5,
        pa_sistolica: 118,
        cita_siguiente: '2026-07-01',
        motivo_consulta: '',
      },
      req: ACTOR,
    }), before);
  });

  assert.equal(updates, 0);
  assert.equal(audits, 0);
});

test('fallo de auditoria revierte control nuevo y laboratorios embebidos', async () => {
  const recorder = privateAuditRecorder({ fail: true });
  const client = { transaction: 'control-create-rollback' };
  let persisted = null;
  let rolledBack = false;

  await withService({
    repository: {
      enTransaccion: async (operation) => {
        try {
          return await operation(client);
        } catch (error) {
          persisted = null;
          rolledBack = true;
          throw error;
        }
      },
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async ({ data }) => {
        persisted = { id: 301, ...data };
        return persisted;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: recorder.audit,
  }, async (service) => {
    await assert.rejects(
      service.crearControl({
        pacienteId: 41,
        embarazoId: 91,
        body: {
          ...VALID_CONTROL,
          glicemia_resultado: '97 mg/dL',
          vih_resultado: 'negativo',
        },
        req: ACTOR,
      }),
      /audit insert failed/
    );
  });

  assert.equal(rolledBack, true);
  assert.equal(persisted, null);
  assert.equal(recorder.events.length, 0);
  assert.deepEqual(recorder.databases, [client]);
});

test('fallo de auditoria revierte actualizacion clinica sin dejar evento', async () => {
  const recorder = privateAuditRecorder({ fail: true });
  const original = { id: 301, paciente_id: 41, embarazo_id: 91, peso_kg: 62.5 };
  let state = { ...original };
  let rolledBack = false;

  await withService({
    repository: {
      enTransaccion: async (operation) => {
        try {
          return await operation({ transaction: 'control-update-rollback' });
        } catch (error) {
          state = { ...original };
          rolledBack = true;
          throw error;
        }
      },
      obtenerPorId: async () => state,
      actualizar: async ({ data }) => {
        state = { ...state, ...data };
        return state;
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: recorder.audit,
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { peso_kg: 64.1 },
        req: ACTOR,
      }),
      /audit insert failed/
    );
  });

  assert.equal(rolledBack, true);
  assert.deepEqual(state, original);
  assert.equal(recorder.events.length, 0);
});

test('eliminacion privada registra campos eliminados sin snapshot clinico', async () => {
  const recorder = privateAuditRecorder();
  const client = { transaction: 'control-delete' };
  const before = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 1,
    peso_kg: 62.5,
    vih_resultado: 'negativo',
    observaciones: 'fuera del modelo',
    created_at: '2026-06-15T00:00:00Z',
    updated_by: 83,
  };

  await withService({
    repository: {
      enTransaccion: async (operation) => operation(client),
      obtenerPorId: async () => before,
      eliminar: async (_args, db) => {
        assert.equal(db, client);
        return { control: before, rowCount: 1 };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: recorder.audit,
  }, async (service) => {
    await service.eliminarControl({ pacienteId: 41, embarazoId: 91, id: 301, req: ACTOR });
  });

  assert.deepEqual(recorder.events[0].datosNuevos, {
    campos_eliminados: ['numero_control', 'peso_kg', 'vih_resultado'],
    politica_version: 1,
    resultado: 'exitoso',
  });
  assert.doesNotMatch(JSON.stringify(recorder.events[0]), /62\.5|negativo|2026-06-15|updated_by/);
});

test('fallo de auditoria revierte la eliminacion del control', async () => {
  const recorder = privateAuditRecorder({ fail: true });
  const original = {
    id: 301,
    paciente_id: 41,
    embarazo_id: 91,
    numero_control: 1,
    vih_resultado: 'negativo',
  };
  let state = { ...original };
  let rolledBack = false;

  await withService({
    repository: {
      enTransaccion: async (operation) => {
        try {
          return await operation({ transaction: 'control-delete-rollback' });
        } catch (error) {
          state = { ...original };
          rolledBack = true;
          throw error;
        }
      },
      obtenerPorId: async () => state,
      eliminar: async () => {
        const removed = state;
        state = null;
        return { control: removed, rowCount: 1 };
      },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => ({ id: 91, paciente_id: 41, estado: 'activo' }),
    },
    audit: recorder.audit,
  }, async (service) => {
    await assert.rejects(
      service.eliminarControl({ pacienteId: 41, embarazoId: 91, id: 301, req: ACTOR }),
      /audit insert failed/
    );
  });

  assert.equal(rolledBack, true);
  assert.deepEqual(state, original);
  assert.equal(recorder.events.length, 0);
});

test('embarazo incorrecto o cerrado no produce escritura ni auditoria exitosa', async () => {
  const recorder = privateAuditRecorder();
  let writes = 0;
  const wrongPregnancyControl = { id: 301, paciente_id: 41, embarazo_id: 92, peso_kg: 62.5 };

  await withService({
    repository: {
      obtenerPorId: async () => wrongPregnancyControl,
      actualizar: async () => { writes += 1; },
    },
    audit: recorder.audit,
  }, async (service) => {
    await assert.rejects(
      service.actualizarControl({
        pacienteId: 41,
        embarazoId: 91,
        id: 301,
        body: { peso_kg: 63 },
        req: ACTOR,
      }),
      (error) => error.statusCode === 404
    );
  });

  await withService({
    repository: {
      obtenerPorNumeroYEmbarazo: async () => null,
      upsert: async () => { writes += 1; },
    },
    pregnancies: { validarEmbarazoEditable: async () => { throw closedPregnancyError(); } },
    audit: recorder.audit,
  }, async (service) => {
    await assert.rejects(
      service.crearControl({ pacienteId: 41, embarazoId: 88, body: VALID_CONTROL, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'PREGNANCY_READ_ONLY'
    );
  });

  assert.equal(writes, 0);
  assert.equal(recorder.events.length, 0);
});

test('repositorio confirma o revierte y siempre libera el cliente', async () => {
  const histories = [];
  const clients = [0, 1].map((index) => {
    const history = [];
    histories.push(history);
    return {
      query: async (sql) => { history.push(sql); },
      release: () => history.push('RELEASE'),
      index,
    };
  });
  let connection = 0;

  await withRepositoryPool({ connect: async () => clients[connection++] }, async (repository) => {
    assert.equal(await repository.enTransaccion(async (client) => client.index), 0);
    await assert.rejects(
      repository.enTransaccion(async () => { throw new Error('clinical write failed'); }),
      /clinical write failed/
    );
  });

  assert.deepEqual(histories[0], ['BEGIN', 'COMMIT', 'RELEASE']);
  assert.deepEqual(histories[1], ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('productor de controles no conserva escritor legado ni payload crudo', () => {
  const source = fs.readFileSync(SERVICE_PATH, 'utf8');
  assert.match(source, /registrarEventoPrivado/);
  assert.doesNotMatch(source, /registrarEvento\s*:/);
  assert.doesNotMatch(source, /datosAnteriores|datosNuevos/);
  assert.doesNotMatch(source, /req\.body/);
  assert.doesNotMatch(source, /cambios:\s*\{\s*anteriores:\s*before,\s*nuevos:\s*control/s);
});
