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

async function withPacientesRepository(pool, callback) {
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
      obtenerEmbarazoEnSeguimiento: async (pacienteId) => {
        calls.push(['obtenerEmbarazoEnSeguimiento', pacienteId]);
        return null;
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

test('GET de expediente sin embarazo es repetible, solo lectura y devuelve contrato estable', async () => {
  let reads = 0;
  let audits = 0;
  const emptyRecord = {
    paciente: { id: 41, nombres: 'Ana', apellidos: 'Sin embarazo' },
    embarazos: [],
    embarazo_activo: null,
    controles_prenatales: [],
    controles_puerperio: [],
    morbilidad: [],
    ficha_riesgo: null,
    plan_parto: null,
    vacunas: [],
    referencias: [],
  };

  await withPacientesService({
    repository: {
      obtenerExpedienteCompleto: async (pacienteId, embarazoId) => {
        reads += 1;
        assert.equal(pacienteId, 41);
        assert.equal(embarazoId, null);
        return emptyRecord;
      },
      obtenerEmbarazoActual: async (pacienteId) => {
        assert.equal(pacienteId, 41);
        return null;
      },
    },
    audit: async () => { audits += 1; },
    pregnancies: {
      resolverEmbarazoParaLectura: async ({ pacienteId, embarazoId }) => {
        assert.equal(pacienteId, 41);
        assert.equal(embarazoId, null);
        return null;
      },
    },
  }, async (service) => {
    const first = await service.expedienteCompleto(41);
    const second = await service.expedienteCompleto(41);

    assert.deepEqual(first, second);
    assert.equal(first.paciente, emptyRecord.paciente);
    assert.deepEqual(first.embarazos, []);
    assert.deepEqual(first.controles_prenatales, []);
    assert.deepEqual(first.controles_puerperio, []);
    assert.deepEqual(first.morbilidad, []);
    assert.deepEqual(first.vacunas, []);
    assert.deepEqual(first.referencias, []);
    assert.equal(first.ficha_riesgo, null);
    assert.equal(first.plan_parto, null);
    assert.equal(first.embarazo_seleccionado, null);
    assert.equal(first.embarazo_actual, null);
    assert.equal(first.embarazo_activo, null);
    assert.equal(first.is_read_only, false);
    assert.equal(first.is_embarazo_actual, false);
    assert.equal(reads, 2);
    assert.equal(audits, 0);
  });
});

test('GET de expediente para paciente inexistente devuelve 404 sin intentar escrituras ni auditoria', async () => {
  let audits = 0;
  await withPacientesService({
    repository: {
      obtenerExpedienteCompleto: async () => ({
        paciente: null,
        embarazos: [],
      }),
      obtenerEmbarazoActual: async () => null,
    },
    audit: async () => { audits += 1; },
    pregnancies: { resolverEmbarazoParaLectura: async () => null },
  }, async (service) => {
    await assert.rejects(
      service.expedienteCompleto(9999),
      (error) => error.statusCode === 404 && error.message === 'Paciente no encontrado'
    );
    assert.equal(audits, 0);
  });
});

test('repositorio de expediente con embarazo null ejecuta exclusivamente SELECT', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === 'SELECT * FROM pacientes WHERE id = $1') {
        return { rows: [{ id: 41, updated_at: 'sin-cambios' }] };
      }
      return { rows: [] };
    },
  };

  await withPacientesRepository(pool, async (repository) => {
    const first = await repository.obtenerExpedienteCompleto(41, null);
    const second = await repository.obtenerExpedienteCompleto(41, null);
    assert.deepEqual(first, second);
    assert.equal(first.paciente.updated_at, 'sin-cambios');
    assert.equal(first.embarazo_activo, null);
    assert.deepEqual(first.embarazos, []);
    assert.deepEqual(first.controles_prenatales, []);
    assert.deepEqual(first.controles_puerperio, []);
  });

  assert.equal(queries.length, 20);
  assert.ok(queries.every(({ sql }) => /^\s*SELECT\b/i.test(sql)));
  assert.equal(queries.some(({ sql }) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql)), false);
  const selectedPregnancyQueries = queries.filter(({ sql }) => (
    /WHERE id = \$1/.test(sql) || /WHERE embarazo_id = \$1/.test(sql)
  ));
  assert.ok(selectedPregnancyQueries.some(({ params }) => params?.[0] === null));
});

test('evita crear asociaciones de embarazo para una paciente inexistente', async () => {
  let writes = 0;
  const client = { transaction: true };
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => callback(client),
      obtenerPacienteParaActualizar: async (_id, db) => {
        assert.equal(db, client);
        return null;
      },
      insertarNuevoEmbarazo: async () => { writes += 1; },
      sincronizarPacienteConEmbarazo: async () => { writes += 1; },
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

test('POST bloquea la paciente y rechaza un embarazo activo sin cerrarlo ni escribir', async () => {
  const order = [];
  const client = { transaction: true };
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => {
        order.push('transaccion');
        return callback(client);
      },
      obtenerPacienteParaActualizar: async (id, db) => {
        order.push('bloquear-paciente');
        assert.equal(id, 41);
        assert.equal(db, client);
        return { id: 41 };
      },
      obtenerEmbarazoEnSeguimiento: async (pacienteId, embarazoIdExcluir, db) => {
        order.push('comprobar-activo');
        assert.equal(pacienteId, 41);
        assert.equal(embarazoIdExcluir, null);
        assert.equal(db, client);
        return { id: 91, estado: 'activo' };
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
    assert.deepEqual(order, ['transaccion', 'bloquear-paciente', 'comprobar-activo']);
  });
});

test('POST rechaza un embarazo nuevo mientras el anterior esta en puerperio', async () => {
  const order = [];
  const client = { transaction: true };
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => callback(client),
      obtenerPacienteParaActualizar: async (_id, db) => {
        order.push('bloquear-paciente');
        assert.equal(db, client);
        return { id: 41 };
      },
      obtenerEmbarazoEnSeguimiento: async (_pacienteId, _embarazoIdExcluir, db) => {
        order.push('comprobar-seguimiento');
        assert.equal(db, client);
        return { id: 91, estado: 'puerperio' };
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
      (error) => error.statusCode === 409
        && error.code === 'PUERPERIUM_PREGNANCY_EXISTS'
        && error.message.includes('Complete y cierre el puerperio')
    );
    assert.deepEqual(order, ['bloquear-paciente', 'comprobar-seguimiento']);
  });
});

test('POST crea, sincroniza y audita obligatoriamente usando la misma transaccion', async () => {
  const order = [];
  const created = { id: 92, paciente_id: 41, numero_embarazo: 2, estado: 'activo' };
  const patient = { id: 41, fur: null, fpp: null };
  const updatedPatient = { ...patient, fur: '2026-03-01', fpp: '2026-12-06' };
  const client = { transaction: true };
  const audits = [];
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => {
        order.push('begin');
        const result = await callback(client);
        order.push('commit');
        return result;
      },
      obtenerPacienteParaActualizar: async (id, db) => {
        order.push('lock');
        assert.equal(id, 41);
        assert.equal(db, client);
        return patient;
      },
      obtenerEmbarazoEnSeguimiento: async (_pacienteId, _embarazoIdExcluir, db) => {
        order.push('comprobar-activo');
        assert.equal(db, client);
        return null;
      },
      obtenerSiguienteNumeroEmbarazo: async (_pacienteId, db) => {
        order.push('siguiente-numero');
        assert.equal(db, client);
        return 2;
      },
      insertarNuevoEmbarazo: async (args, db) => {
        order.push('insertar');
        assert.equal(args.numeroEmbarazo, 2);
        assert.equal(args.usuarioId, ACTOR.usuario.id);
        assert.equal(db, client);
        return created;
      },
      sincronizarPacienteConEmbarazo: async (_args, db) => {
        order.push('sincronizar');
        assert.equal(db, client);
        return updatedPatient;
      },
    },
    audit: async (req, event, options) => {
      order.push(`auditar-${event.tabla}`);
      audits.push({ req, event, options });
    },
  }, async (service) => {
    assert.equal(
      await service.nuevoEmbarazo({ id: 41, body: { fur: '2026-03-01' }, req: ACTOR }),
      created
    );
    assert.deepEqual(order, [
      'begin',
      'lock',
      'comprobar-activo',
      'siguiente-numero',
      'insertar',
      'sincronizar',
      'auditar-embarazos',
      'auditar-pacientes',
      'commit',
    ]);
    assert.equal(audits.length, 2);
    assert.ok(audits.every(({ req }) => req === ACTOR));
    assert.ok(audits.every(({ options }) => options.db === client && options.obligatorio === true));
    assert.equal(audits[0].event.embarazoId, created.id);
    assert.equal(audits[1].event.datosAnteriores, patient);
    assert.equal(audits[1].event.datosNuevos, updatedPatient);
  });
});

test('un embarazo cerrado permite crear un embarazo nuevo', async () => {
  const client = { transaction: true };
  let inserts = 0;
  const embarazos = [{ id: 90, paciente_id: 41, estado: 'cerrado' }];
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => callback(client),
      obtenerPacienteParaActualizar: async () => ({ id: 41 }),
      obtenerEmbarazoEnSeguimiento: async () => (
        embarazos.find(({ estado }) => ['activo', 'puerperio'].includes(estado)) || null
      ),
      obtenerSiguienteNumeroEmbarazo: async () => 2,
      insertarNuevoEmbarazo: async () => {
        inserts += 1;
        return { id: 92, paciente_id: 41, numero_embarazo: 2, estado: 'activo' };
      },
      sincronizarPacienteConEmbarazo: async () => ({ id: 41 }),
    },
  }, async (service) => {
    const result = await service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR });
    assert.equal(result.estado, 'activo');
    assert.equal(inserts, 1);
  });
});

test('una paciente sin embarazos permite crear el primero', async () => {
  const client = { transaction: true };
  let nextNumberCalls = 0;
  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => callback(client),
      obtenerPacienteParaActualizar: async () => ({ id: 41 }),
      obtenerEmbarazoEnSeguimiento: async () => null,
      obtenerSiguienteNumeroEmbarazo: async () => {
        nextNumberCalls += 1;
        return 1;
      },
      insertarNuevoEmbarazo: async ({ numeroEmbarazo }) => ({
        id: 91,
        paciente_id: 41,
        numero_embarazo: numeroEmbarazo,
        estado: 'activo',
      }),
      sincronizarPacienteConEmbarazo: async () => ({ id: 41 }),
    },
  }, async (service) => {
    const result = await service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR });
    assert.equal(result.numero_embarazo, 1);
    assert.equal(nextNumberCalls, 1);
  });
});

test('violacion de unicidad del embarazo activo se traduce al error de dominio', async () => {
  const client = { transaction: true };
  let audits = 0;
  const duplicate = Object.assign(new Error('duplicate active pregnancy'), {
    code: '23505',
    constraint: 'ux_embarazo_activo_paciente',
  });

  await withPacientesService({
    repository: {
      enTransaccion: async (callback) => callback(client),
      obtenerPacienteParaActualizar: async () => ({ id: 41 }),
      obtenerEmbarazoEnSeguimiento: async () => null,
      obtenerSiguienteNumeroEmbarazo: async () => 2,
      insertarNuevoEmbarazo: async () => { throw duplicate; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    await assert.rejects(
      service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR }),
      (error) => error.statusCode === 409
        && error.code === 'ACTIVE_PREGNANCY_EXISTS'
        && error.message.includes('ya tiene un embarazo activo')
    );
    assert.equal(audits, 0);
  });
});

test('dos POST concurrentes simulados no evaden la regla de seguimiento unico', async () => {
  let transactionTail = Promise.resolve();
  let active = false;
  let inserts = 0;
  let audits = 0;
  const client = { transaction: true };

  await withPacientesService({
    repository: {
      async enTransaccion(callback) {
        const previous = transactionTail;
        let release;
        transactionTail = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
          return await callback(client);
        } finally {
          release();
        }
      },
      obtenerPacienteParaActualizar: async () => ({ id: 41 }),
      obtenerEmbarazoEnSeguimiento: async () => (
        active ? { id: 91, estado: 'activo' } : null
      ),
      obtenerSiguienteNumeroEmbarazo: async () => 1,
      insertarNuevoEmbarazo: async () => {
        inserts += 1;
        active = true;
        return { id: 91, paciente_id: 41, numero_embarazo: 1, estado: 'activo' };
      },
      sincronizarPacienteConEmbarazo: async () => ({ id: 41 }),
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    const results = await Promise.allSettled([
      service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR }),
      service.nuevoEmbarazo({ id: 41, body: {}, req: ACTOR }),
    ]);

    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejected = results.find(({ status }) => status === 'rejected');
    assert.equal(rejected.reason.statusCode, 409);
    assert.equal(rejected.reason.code, 'ACTIVE_PREGNANCY_EXISTS');
    assert.equal(inserts, 1);
    assert.equal(audits, 2);
  });
});

test('repositorio abre transaccion, bloquea paciente y confirma al completar', async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (String(sql).startsWith('SELECT * FROM pacientes')) {
        return { rows: [{ id: 41 }] };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };

  await withPacientesRepository({ connect: async () => client }, async (repository) => {
    const result = await repository.enTransaccion(async (db) => {
      assert.equal(db, client);
      return repository.obtenerPacienteParaActualizar(41, db);
    });
    assert.deepEqual(result, { id: 41 });
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /SELECT \* FROM pacientes WHERE id = \$1 FOR UPDATE/);
  assert.deepEqual(calls[1].params, [41]);
  assert.equal(calls[2].sql, 'COMMIT');
  assert.equal(released, true);
});

test('repositorio revierte y libera la conexion cuando falla la creacion', async () => {
  const calls = [];
  let released = false;
  const expected = new Error('audit failed');
  const client = {
    async query(sql) {
      calls.push(sql);
      return { rows: [] };
    },
    release() { released = true; },
  };

  await withPacientesRepository({ connect: async () => client }, async (repository) => {
    await assert.rejects(
      repository.enTransaccion(async () => { throw expected; }),
      (error) => error === expected
    );
  });

  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
  assert.equal(released, true);
});

test('repositorio considera activo y puerperio como estados que bloquean otro embarazo', async () => {
  const calls = [];
  const blockingPregnancy = { id: 91, estado: 'puerperio' };
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [blockingPregnancy] };
    },
  };

  await withPacientesRepository(pool, async (repository) => {
    assert.equal(await repository.obtenerEmbarazoEnSeguimiento(41), blockingPregnancy);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /estado IN \('activo', 'puerperio'\)/);
  assert.deepEqual(calls[0].params, [41]);
});

test('helpers de lectura de embarazo no ejecutan DML cuando no hay registros', async () => {
  const previousPregnancies = require.cache[PREGNANCIES_PATH];
  const queries = [];
  const restorePool = cacheModule(POOL_PATH, {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  });
  delete require.cache[PREGNANCIES_PATH];

  try {
    const pregnancies = require(PREGNANCIES_PATH);
    assert.equal(await pregnancies.obtenerEmbarazoActivoId(41), null);
    assert.equal(await pregnancies.obtenerEmbarazoVisibleId(41), null);
    assert.equal(queries.length, 2);
    assert.ok(queries.every(({ sql }) => /^\s*SELECT\b/i.test(sql)));
  } finally {
    delete require.cache[PREGNANCIES_PATH];
    if (previousPregnancies) require.cache[PREGNANCIES_PATH] = previousPregnancies;
    restorePool();
  }
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
