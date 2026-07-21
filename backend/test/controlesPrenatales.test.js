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

async function withService({ repository = {}, audit, pregnancies = {} }, callback) {
  const repositoryWithTransaction = {
    enTransaccion: async (operation) => operation({ transaction: true }),
    ...repository,
  };
  const restore = [
    cacheModule(REPOSITORY_PATH, strictMock(repositoryWithTransaction, 'controlesRepository')),
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

test('el repositorio mantiene bloqueo, validacion y upsert en una sola sentencia', async () => {
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
  assert.match(calls[0].sql, /WITH embarazo_editable AS/);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[0].sql, /INSERT INTO controles_prenatales/);
  assert.match(calls[0].sql, /ON CONFLICT \(embarazo_id, numero_control\) DO UPDATE/);
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

test('actualizacion privada registra solo nombres de signos, cita y laboratorios modificados', async () => {
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
    cita_siguiente: '2026-07-08',
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
      'cita_siguiente',
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
    /62\.50|63\.2|118|121|2026-07-01|2026-07-08|88 mg\/dL|99 mg\/dL|negativo|positivo|updated_at/
  );
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
