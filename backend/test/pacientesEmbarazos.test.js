const assert = require('node:assert/strict');
const test = require('node:test');

const { verificarPermiso } = require('../src/middleware/permisos');
const { normalizeError } = require('../src/middleware/errorHandler');
const {
  pacienteCreateSchema,
} = require('../src/validations/pacientes.schemas');
const { HttpError } = require('../src/utils/httpError');

const SERVICE_PATH = require.resolve('../src/services/pacientesService');
const REPOSITORY_PATH = require.resolve('../src/repositories/pacientesRepository');
const COMMUNITIES_PATH = require.resolve('../src/repositories/comunidadesRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const POOL_PATH = require.resolve('../src/db/pool');

const ACTOR = {
  usuario: {
    id: 73,
    username: 'personal.pruebas',
    rol: 'personal_salud',
    permisos: ['pacientes.ver', 'pacientes.crear', 'pacientes.editar'],
  },
  headers: { 'user-agent': 'node:test' },
  ip: '127.0.0.1',
};

const VALID_PATIENT = {
  no_expediente: 'EXP-PRUEBA-001',
  cui: '1234567890101',
  nombres: 'Ana Prueba',
  apellidos: 'Control Mock',
  fecha_nacimiento: '1994-04-12',
  fur: '2026-01-10',
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

async function withPacientesService({ repository = {}, communities = {}, audit, pregnancies = {} }, callback) {
  const restore = [
    cacheModule(REPOSITORY_PATH, strictMock(repository, 'pacientesRepository')),
    cacheModule(COMMUNITIES_PATH, strictMock(communities, 'comunidadesRepository')),
    cacheModule(AUDIT_PATH, {
      registrarEvento: audit || (async () => {}),
    }),
    cacheModule(PREGNANCIES_PATH, {
      resolverEmbarazoParaLectura: pregnancies.resolverEmbarazoParaLectura || (async () => {
        throw new Error('Llamada inesperada a resolverEmbarazoParaLectura');
      }),
      requerirEmbarazoId: pregnancies.requerirEmbarazoId || ((embarazoId) => {
        if (!embarazoId) {
          throw new HttpError(400, 'embarazo_id es obligatorio', {
            code: 'EMBARAZO_ID_REQUIRED',
          });
        }
        return embarazoId;
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

function invokeMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve()));
  });
}

test('acepta los datos obligatorios de una paciente valida', () => {
  const result = pacienteCreateSchema.safeParse(VALID_PATIENT);
  assert.equal(result.success, true);
});

test('rechaza datos obligatorios faltantes al crear una paciente', () => {
  const result = pacienteCreateSchema.safeParse({ cui: VALID_PATIENT.cui });
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path.join('.')).sort(),
    ['apellidos', 'no_expediente', 'nombres']
  );
});

test('usuario sin permiso de pacientes recibe 403', async () => {
  await assert.rejects(
    invokeMiddleware(
      verificarPermiso('pacientes.ver'),
      { usuario: { id: ACTOR.usuario.id, permisos: [] } }
    ),
    (error) => error.statusCode === 403 && error.code === 'PERMISO_REQUERIDO'
  );
});

test('crea una paciente valida y su embarazo inicial con el actor autenticado', async () => {
  const calls = [];
  const patient = { id: 41, ...VALID_PATIENT };
  const pregnancy = { id: 91, paciente_id: patient.id, estado: 'activo' };

  await withPacientesService({
    repository: {
      existeCui: async (cui) => {
        calls.push(['existeCui', cui]);
        return false;
      },
      insertarPaciente: async (data) => {
        calls.push(['insertarPaciente', data]);
        return patient;
      },
      existeEmbarazoActivo: async (pacienteId) => {
        calls.push(['existeEmbarazoActivo', pacienteId]);
        return false;
      },
      crearEmbarazoInicial: async (args) => {
        calls.push(['crearEmbarazoInicial', args]);
        return pregnancy;
      },
    },
    audit: async (req, event) => calls.push(['auditoria', req, event]),
  }, async (service) => {
    const result = await service.crearPaciente({ body: VALID_PATIENT, req: ACTOR });

    assert.deepEqual(result, {
      id: patient.id,
      no_expediente: patient.no_expediente,
      cui: patient.cui,
      nombres: patient.nombres,
      apellidos: patient.apellidos,
    });
    assert.equal(calls.find(([name]) => name === 'insertarPaciente')[1].registrado_por, ACTOR.usuario.id);
    assert.deepEqual(calls.find(([name]) => name === 'crearEmbarazoInicial')[1], {
      pacienteId: patient.id,
      fur: VALID_PATIENT.fur,
      fpp: '2026-10-17',
      usuarioId: ACTOR.usuario.id,
    });
    const audits = calls.filter(([name]) => name === 'auditoria');
    assert.equal(audits.length, 2);
    assert.ok(audits.every(([, req]) => req === ACTOR));
    assert.deepEqual(audits.map(([, , event]) => event.tabla), ['pacientes', 'embarazos']);
  });
});

test('consulta una paciente existente', async () => {
  const patient = { id: 41, nombres: 'Ana Prueba', apellidos: 'Control Mock' };
  await withPacientesService({
    repository: { obtenerPorId: async (id) => String(id) === '41' ? patient : null },
  }, async (service) => {
    assert.equal(await service.obtenerPaciente(41), patient);
  });
});

test('actualiza una paciente y atribuye el cambio al actor autenticado', async () => {
  const before = { id: 41, ...VALID_PATIENT };
  let updateArgs;
  let auditArgs;

  await withPacientesService({
    repository: {
      obtenerPorId: async () => before,
      actualizarPaciente: async (...args) => {
        updateArgs = args;
        return {
          paciente: { ...before, telefono: '55550000' },
          rowCount: 1,
        };
      },
    },
    audit: async (...args) => { auditArgs = args; },
  }, async (service) => {
    assert.deepEqual(
      await service.actualizarPaciente({
        id: before.id,
        body: { telefono: '55550000' },
        req: ACTOR,
      }),
      { message: 'Paciente actualizado' }
    );
    assert.equal(updateArgs[0], before.id);
    assert.deepEqual(updateArgs[1], { telefono: '55550000' });
    assert.deepEqual(updateArgs[2], ['telefono']);
    assert.equal(updateArgs[3], ACTOR.usuario.id);
    assert.equal(auditArgs[0], ACTOR);
    assert.equal(auditArgs[1].tabla, 'pacientes');
  });
});

test('evita crear asociaciones de embarazo para una paciente inexistente', async () => {
  let writes = 0;
  await withPacientesService({
    repository: {
      obtenerPorId: async () => null,
      cerrarEmbarazosEnSeguimiento: async () => { writes += 1; },
      insertarNuevoEmbarazo: async () => { writes += 1; },
    },
  }, async (service) => {
    await assert.rejects(
      service.nuevoEmbarazo({ id: 9999, body: {}, req: ACTOR }),
      (error) => error.statusCode === 404 && error.message === 'Paciente no encontrado'
    );
    assert.equal(writes, 0);
  });
});

test('conserva la regla actual de duplicados para CUI y numero de expediente', async () => {
  await withPacientesService({
    repository: { existeCui: async () => true },
  }, async (service) => {
    await assert.rejects(
      service.crearPaciente({ body: VALID_PATIENT, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'CONFLICT'
    );
  });

  const dbError = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint: 'pacientes_no_expediente_key',
  });
  const normalized = normalizeError(dbError);
  assert.equal(normalized.statusCode, 409);
  assert.equal(normalized.code, 'DUPLICATE_RESOURCE');
  assert.equal(normalized.message, 'Ya existe un expediente con ese numero');
});

test('impide insertar un embarazo si el contrato detecta otro activo', async () => {
  const order = [];
  await withPacientesService({
    repository: {
      obtenerPorId: async () => ({ id: 41 }),
      cerrarEmbarazosEnSeguimiento: async () => {
        order.push('cerrar-seguimiento');
        return [];
      },
      existeEmbarazoActivo: async () => {
        order.push('comprobar-activo');
        return true;
      },
      obtenerSiguienteNumeroEmbarazo: async () => {
        order.push('siguiente-numero');
        return 2;
      },
      insertarNuevoEmbarazo: async () => {
        order.push('insertar');
        return { id: 92 };
      },
    },
  }, async (service) => {
    await assert.rejects(
      service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'ACTIVE_PREGNANCY_EXISTS'
    );
    assert.deepEqual(order, ['cerrar-seguimiento', 'comprobar-activo']);
  });
});

test('crea un nuevo embarazo cuando el anterior ya esta cerrado', async () => {
  const order = [];
  const created = { id: 92, paciente_id: 41, numero_embarazo: 2, estado: 'activo' };
  await withPacientesService({
    repository: {
      obtenerPorId: async () => ({ id: 41, fur: null, fpp: null }),
      cerrarEmbarazosEnSeguimiento: async () => {
        order.push('cerrar-seguimiento');
        return [];
      },
      existeEmbarazoActivo: async () => {
        order.push('comprobar-activo');
        return false;
      },
      obtenerSiguienteNumeroEmbarazo: async () => {
        order.push('siguiente-numero');
        return 2;
      },
      insertarNuevoEmbarazo: async (args) => {
        order.push('insertar');
        assert.equal(args.numeroEmbarazo, 2);
        assert.equal(args.usuarioId, ACTOR.usuario.id);
        return created;
      },
      sincronizarPacienteConEmbarazo: async () => {
        order.push('sincronizar');
        return { id: 41 };
      },
    },
  }, async (service) => {
    assert.equal(
      await service.nuevoEmbarazo({ id: 41, body: { fur: '2026-03-01' }, req: ACTOR }),
      created
    );
    assert.deepEqual(order, [
      'cerrar-seguimiento',
      'comprobar-activo',
      'siguiente-numero',
      'insertar',
      'sincronizar',
    ]);
  });
});

test('selecciona y permite leer un embarazo historico cerrado', async () => {
  const closed = { id: 88, paciente_id: 41, numero_embarazo: 1, estado: 'cerrado' };
  let selectionArgs;

  await withPacientesService({
    repository: {
      obtenerExpedienteCompleto: async (patientId, pregnancyId) => ({
        paciente: { id: patientId },
        embarazos: [closed],
        embarazo_consultado: pregnancyId,
      }),
      obtenerEmbarazoActual: async () => ({
        id: 92,
        paciente_id: 41,
        numero_embarazo: 2,
        estado: 'activo',
      }),
    },
    pregnancies: {
      resolverEmbarazoParaLectura: async (args) => {
        selectionArgs = args;
        return closed;
      },
    },
  }, async (service) => {
    const expediente = await service.expedienteCompleto(41, 88);
    assert.deepEqual(selectionArgs, { pacienteId: 41, embarazoId: 88 });
    assert.equal(expediente.embarazo_seleccionado, closed);
    assert.equal(expediente.embarazo_activo, closed);
    assert.equal(expediente.is_read_only, true);
    assert.equal(expediente.is_embarazo_actual, false);
  });
});

test('impide escrituras sobre un embarazo cerrado', async () => {
  let writes = 0;
  await withPacientesService({
    repository: {
      pasarEmbarazoAPuerperio: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => {
        throw new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
          code: 'PREGNANCY_READ_ONLY',
        });
      },
    },
  }, async (service) => {
    await assert.rejects(
      service.pasarAPuerperio({ id: 41, embarazoId: 88, body: {}, req: ACTOR }),
      (error) => error.statusCode === 409 && error.code === 'PREGNANCY_READ_ONLY'
    );
    assert.equal(writes, 0);
  });
});

test('realiza la transicion de activo a puerperio', async () => {
  const active = { id: 91, paciente_id: 41, estado: 'activo' };
  const puerperium = { ...active, estado: 'puerperio' };
  let transitionArgs;

  await withPacientesService({
    repository: {
      pasarEmbarazoAPuerperio: async (args) => {
        transitionArgs = args;
        return puerperium;
      },
    },
    pregnancies: { validarEmbarazoEditable: async () => active },
  }, async (service) => {
    assert.equal(await service.pasarAPuerperio({
      id: 41,
      embarazoId: 91,
      body: { fecha_parto: '2026-07-01', observaciones: 'Parto ficticio' },
      req: ACTOR,
    }), puerperium);
    assert.deepEqual(transitionArgs, {
      pacienteId: 41,
      embarazoId: 91,
      fechaCierre: '2026-07-01',
      observaciones: 'Parto ficticio',
      updatedBy: ACTOR.usuario.id,
    });
  });
});

test('cierra un embarazo en puerperio', async () => {
  const puerperium = { id: 91, paciente_id: 41, estado: 'puerperio' };
  const closed = { ...puerperium, estado: 'cerrado' };
  let closeArgs;

  await withPacientesService({
    repository: {
      cerrarEmbarazoEnSeguimiento: async (args) => {
        closeArgs = args;
        return closed;
      },
    },
    pregnancies: { validarEmbarazoEditable: async () => puerperium },
  }, async (service) => {
    assert.equal(await service.cerrarEmbarazo({
      id: 41,
      embarazoId: 91,
      body: { fecha_cierre: '2026-07-10' },
      req: ACTOR,
    }), closed);
    assert.deepEqual(closeArgs, {
      pacienteId: 41,
      embarazoId: 91,
      fechaCierre: '2026-07-10',
      observaciones: undefined,
      updatedBy: ACTOR.usuario.id,
    });
  });
});

test('valida que embarazo_id pertenezca a la paciente indicada', async () => {
  const previousPool = require.cache[POOL_PATH];
  const previousPregnancies = require.cache[PREGNANCIES_PATH];
  const queries = [];
  cacheModule(POOL_PATH, {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });
  delete require.cache[PREGNANCIES_PATH];

  try {
    const { validarEmbarazoEditable } = require(PREGNANCIES_PATH);
    await assert.rejects(
      validarEmbarazoEditable({ pacienteId: 41, embarazoId: 777 }),
      (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
    );
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /WHERE id = \$1 AND paciente_id = \$2/);
    assert.deepEqual(queries[0].params, [777, 41]);
  } finally {
    delete require.cache[PREGNANCIES_PATH];
    if (previousPregnancies) require.cache[PREGNANCIES_PATH] = previousPregnancies;
    if (previousPool) require.cache[POOL_PATH] = previousPool;
    else delete require.cache[POOL_PATH];
  }
});
