const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const privateAuditService = require('../src/services/auditService');
const { HttpError } = require('../src/utils/httpError');

const RISK_SERVICE_PATH = require.resolve('../src/services/riesgoService');
const RISK_REPOSITORY_PATH = require.resolve('../src/repositories/riesgoRepository');
const VACCINE_SERVICE_PATH = require.resolve('../src/services/vacunasService');
const VACCINE_REPOSITORY_PATH = require.resolve('../src/repositories/vacunasRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const POOL_PATH = require.resolve('../src/db/pool');

const ACTOR = {
  usuario: {
    id: 83,
    username: 'clinica.pruebas',
    rol: 'personal_salud',
    permisos: ['pacientes.ver', 'controles.crear', 'controles.editar', 'controles.ver_vih'],
  },
  headers: {
    authorization: 'Bearer secreto-sintetico',
    cookie: 'sesion=sintetica',
    'user-agent': 'node:test',
  },
  ip: '127.0.0.1',
};

const VALID_VACCINE = {
  tipo_vacuna: 'td_tdap',
  momento: 'durante_embarazo',
  numero_dosis: 1,
  fecha_dosis: '2026-06-15',
  advertencia_similar: 'Dato de interfaz que no se persiste',
  token: 'secreto-anidado',
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

async function withClinicalService(kind, {
  repository = {},
  audit,
  pregnancies = {},
} = {}, callback) {
  const isRisk = kind === 'risk';
  const servicePath = isRisk ? RISK_SERVICE_PATH : VACCINE_SERVICE_PATH;
  const repositoryPath = isRisk ? RISK_REPOSITORY_PATH : VACCINE_REPOSITORY_PATH;
  const repositoryLabel = isRisk ? 'riesgoRepository' : 'vacunasRepository';
  const repositoryWithTransaction = {
    enTransaccion: async (operation) => operation({ transaction: true, kind }),
    ...repository,
  };
  const restore = [
    cacheModule(repositoryPath, strictMock(repositoryWithTransaction, repositoryLabel)),
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
      resolverEmbarazoParaLectura: pregnancies.resolverEmbarazoParaLectura || (async ({
        pacienteId,
        embarazoId,
      }) => ({ id: embarazoId || 91, paciente_id: pacienteId, estado: 'activo' })),
      validarEmbarazoEditable: pregnancies.validarEmbarazoEditable || (async ({
        pacienteId,
        embarazoId,
      }) => ({ id: embarazoId, paciente_id: pacienteId, estado: 'activo' })),
    }),
  ];
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];

  try {
    return await callback(require(servicePath));
  } finally {
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    for (const restoreModule of restore.reverse()) restoreModule();
  }
}

async function withRepositoryPool(repositoryPath, pool, callback) {
  const restorePool = cacheModule(POOL_PATH, pool);
  const previousRepository = require.cache[repositoryPath];
  delete require.cache[repositoryPath];
  try {
    return await callback(require(repositoryPath));
  } finally {
    delete require.cache[repositoryPath];
    if (previousRepository) require.cache[repositoryPath] = previousRepository;
    restorePool();
  }
}

function privateAuditRecorder({ fail = false } = {}) {
  const events = [];
  const databases = [];
  const repository = {
    async insertarEvento(event, db) {
      databases.push(db);
      if (fail) throw new Error('audit insert failed');
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

function completeRisk(service, overrides = {}) {
  const factorFields = new Set(service.RISK_FACTOR_FIELDS);
  const row = Object.fromEntries(service.RIESGO_FIELDS.map((field) => [
    field,
    factorFields.has(field) || field === 'migrante' ? false : null,
  ]));
  return {
    ...row,
    fecha: '2026-06-15',
    tiene_riesgo: false,
    ...overrides,
  };
}

function privatePayload(event, expected) {
  assert.equal(event.entidadAfectada, expected.entity);
  assert.equal(event.tabla, expected.table);
  assert.equal(event.accion, expected.action);
  assert.equal(event.idEntidad, expected.id);
  assert.equal(event.pacienteId, 41);
  assert.equal(event.embarazoId, expected.pregnancyId ?? 91);
  assert.equal(event.datosAnteriores, null);
  assert.equal(event.ip, null);
  assert.equal(event.userAgent, null);
  assert.equal(event.datosNuevos.politica_version, 1);
  assert.equal(event.datosNuevos.resultado, 'exitoso');
  return event.datosNuevos;
}

function closedPregnancyError() {
  return new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
    code: 'PREGNANCY_READ_ONLY',
  });
}

test('riesgo crea evento privado con nombres de campos y sin valores clinicos o personales', async () => {
  const recorder = privateAuditRecorder();
  let inserted;

  await withClinicalService('risk', {
    repository: {
      obtenerPorEmbarazo: async () => null,
      insertar: async (data) => {
        inserted = data;
        return { id: 501, ...data, tiene_riesgo: true };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    const body = completeRisk(service, {
      telefono: '5555-0101',
      nombre_esposo_conviviente: 'Persona Sintetica',
      diabetes: true,
      otra_enfermedad_severa: true,
      otra_enfermedad_descripcion: 'Texto clinico sintetico confidencial',
      cui: '2999999999999',
      no_expediente: 'EXP-SINTETICO',
      token: 'token-en-body',
    });
    const result = await service.guardarFichaRiesgo({
      pacienteId: 41,
      embarazoId: 91,
      body,
      req: ACTOR,
    });
    assert.equal(result.id, 501);
    assert.equal(inserted.registrado_por, ACTOR.usuario.id);
    assert.equal(inserted.updated_by, ACTOR.usuario.id);
  });

  assert.equal(recorder.events.length, 1);
  assert.equal(recorder.databases[0].transaction, true);
  const payload = privatePayload(recorder.events[0], {
    entity: 'riesgo_obstetrico',
    table: 'fichas_riesgo_obstetrico',
    action: 'crear',
    id: 501,
  });
  assert.ok(payload.campos_registrados.includes('factores_riesgo'));
  assert.ok(payload.campos_registrados.includes('tiene_riesgo'));
  assert.ok(payload.campos_registrados.includes('otra_enfermedad_descripcion'));
  assert.equal(payload.campos_registrados.includes('diabetes'), false);
  assert.deepEqual(Object.keys(payload).sort(), ['campos_registrados', 'politica_version', 'resultado']);
  const serialized = JSON.stringify(recorder.events[0]);
  for (const forbidden of [
    '5555-0101',
    'Persona Sintetica',
    'Texto clinico sintetico confidencial',
    '2999999999999',
    'EXP-SINTETICO',
    'token-en-body',
    'Bearer secreto-sintetico',
    'sesion=sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('riesgo actualiza solo diferencias reales y colapsa los factores sin true o false', async () => {
  const recorder = privateAuditRecorder();
  let before;
  let updatedArgs;

  await withClinicalService('risk', {
    repository: {
      obtenerPorEmbarazo: async () => before,
      actualizarPorEmbarazo: async (args) => {
        updatedArgs = args;
        return {
          ...before,
          ...args.data,
          id: 502,
          tiene_riesgo: true,
        };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    before = { id: 502, paciente_id: 41, embarazo_id: 91, ...completeRisk(service) };
    const body = completeRisk(service, {
      diabetes: true,
      otra_enfermedad_descripcion: 'Nueva observacion sintetica',
    });
    await service.actualizarFichaRiesgo({
      pacienteId: 41,
      embarazoId: 91,
      body,
      req: ACTOR,
    });
  });

  assert.deepEqual(updatedArgs.campos.sort(), ['diabetes', 'otra_enfermedad_descripcion']);
  assert.equal(recorder.events.length, 1);
  const payload = privatePayload(recorder.events[0], {
    entity: 'riesgo_obstetrico',
    table: 'fichas_riesgo_obstetrico',
    action: 'actualizar',
    id: 502,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, [
    'factores_riesgo',
    'otra_enfermedad_descripcion',
    'tiene_riesgo',
  ]);
  assert.deepEqual(Object.keys(payload).sort(), [
    'campos_sensibles_modificados',
    'politica_version',
    'resultado',
  ]);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('diabetes'), false);
  assert.equal(serialized.includes('Nueva observacion sintetica'), false);
  assert.equal(serialized.includes('true'), false);
  assert.equal(serialized.includes('false'), false);
});

test('riesgo ignora orden de claves, booleanos, numeros, fechas y vacios equivalentes', async () => {
  let before;
  let writes = 0;
  let audits = 0;

  await withClinicalService('risk', {
    repository: {
      obtenerPorEmbarazo: async () => before,
      actualizarPorEmbarazo: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    before = {
      id: 503,
      paciente_id: 41,
      embarazo_id: 91,
      ...completeRisk(service, {
        migrante: false,
        diabetes: false,
        distancia_servicio_km: '4.50',
        fecha_ultima_regla: '2026-01-01',
        ocupacion: null,
      }),
    };
    const sameEntries = service.RIESGO_FIELDS.map((field) => [field, before[field]]).reverse();
    const body = Object.fromEntries(sameEntries);
    body.migrante = 'false';
    body.diabetes = 0;
    body.distancia_servicio_km = 4.5;
    body.fecha_ultima_regla = '2026-01-01T00:00:00.000Z';
    body.ocupacion = '';

    assert.equal(await service.actualizarFichaRiesgo({
      pacienteId: 41,
      embarazoId: 91,
      body,
      req: ACTOR,
    }), before);
  });

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('fallo de auditoria revierte atomicamente la ficha y sus factores', async () => {
  const transaction = [];
  let stored = null;
  const recorder = privateAuditRecorder({ fail: true });

  await assert.rejects(withClinicalService('risk', {
    repository: {
      enTransaccion: async (operation) => {
        transaction.push('BEGIN');
        try {
          const result = await operation({ transaction: true });
          transaction.push('COMMIT');
          return result;
        } catch (error) {
          stored = null;
          transaction.push('ROLLBACK');
          throw error;
        }
      },
      obtenerPorEmbarazo: async () => null,
      insertar: async (data) => {
        stored = { id: 504, ...data, tiene_riesgo: true };
        return stored;
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarFichaRiesgo({
    pacienteId: 41,
    embarazoId: 91,
    body: completeRisk(service, { diabetes: true }),
    req: ACTOR,
  })), /audit insert failed/);

  assert.equal(stored, null);
  assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  assert.equal(recorder.events.length, 0);
});

test('riesgo elimina con campos_eliminados sin snapshot', async () => {
  const recorder = privateAuditRecorder();
  let before;

  await withClinicalService('risk', {
    repository: {
      obtenerPorEmbarazo: async () => before,
      eliminarPorEmbarazo: async () => ({ ficha: before, rowCount: 1 }),
    },
    audit: recorder.audit,
  }, async (service) => {
    before = {
      id: 505,
      paciente_id: 41,
      embarazo_id: 91,
      ...completeRisk(service, {
        diabetes: true,
        tiene_riesgo: true,
        otra_enfermedad_descripcion: 'No debe persistir',
      }),
    };
    assert.deepEqual(await service.eliminarFichaRiesgo({
      pacienteId: 41,
      embarazoId: 91,
      req: ACTOR,
    }), { message: 'Ficha de riesgo eliminada' });
  });

  const payload = privatePayload(recorder.events[0], {
    entity: 'riesgo_obstetrico',
    table: 'fichas_riesgo_obstetrico',
    action: 'eliminar',
    id: 505,
  });
  assert.ok(payload.campos_eliminados.includes('factores_riesgo'));
  assert.ok(payload.campos_eliminados.includes('tiene_riesgo'));
  assert.equal(payload.campos_eliminados.includes('diabetes'), false);
  assert.equal(JSON.stringify(payload).includes('No debe persistir'), false);
});

test('embarazo cerrado rechaza riesgo antes de DML y no genera exito', async () => {
  let reads = 0;
  let writes = 0;
  let audits = 0;

  await assert.rejects(withClinicalService('risk', {
    repository: {
      obtenerPorEmbarazo: async () => { reads += 1; },
      insertar: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => { throw closedPregnancyError(); },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.guardarFichaRiesgo({
    pacienteId: 41,
    embarazoId: 91,
    body: completeRisk(service),
    req: ACTOR,
  })), (error) => error.code === 'PREGNANCY_READ_ONLY');

  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('vacuna crea evento privado solo con campos_registrados', async () => {
  const recorder = privateAuditRecorder();
  let savedData;

  await withClinicalService('vaccine', {
    repository: {
      obtenerPorDosis: async () => null,
      upsert: async (data) => {
        savedData = data;
        return { id: 601, ...data };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.equal((await service.guardarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_VACCINE,
      req: ACTOR,
    })).id, 601);
  });

  assert.equal(savedData.registrado_por, ACTOR.usuario.id);
  assert.equal(savedData.updated_by, ACTOR.usuario.id);
  const payload = privatePayload(recorder.events[0], {
    entity: 'vacuna',
    table: 'vacunas_paciente',
    action: 'crear',
    id: 601,
  });
  assert.deepEqual(payload.campos_registrados, [
    'fecha_dosis',
    'momento',
    'numero_dosis',
    'tipo_vacuna',
  ]);
  assert.deepEqual(Object.keys(payload).sort(), ['campos_registrados', 'politica_version', 'resultado']);
  const serialized = JSON.stringify(recorder.events[0]);
  for (const forbidden of [
    'td_tdap',
    'durante_embarazo',
    '2026-06-15',
    'Dato de interfaz',
    'secreto-anidado',
    'Bearer secreto-sintetico',
    'sesion=sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('vacuna actualiza solo nombres modificados sin tipo, dosis, fecha ni valores', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 602,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_VACCINE,
  };
  let updatedArgs;

  await withClinicalService('vaccine', {
    repository: {
      obtenerPorId: async () => before,
      actualizar: async (args) => {
        updatedArgs = args;
        return { ...before, ...args.data };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.actualizarVacuna({
    pacienteId: 41,
    embarazoId: 91,
    id: 602,
    body: { ...VALID_VACCINE, numero_dosis: 2, fecha_dosis: '2026-07-01' },
    req: ACTOR,
  }));

  assert.deepEqual(updatedArgs.campos, ['numero_dosis', 'fecha_dosis']);
  const payload = privatePayload(recorder.events[0], {
    entity: 'vacuna',
    table: 'vacunas_paciente',
    action: 'actualizar',
    id: 602,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, ['fecha_dosis', 'numero_dosis']);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ['td_tdap', 'durante_embarazo', '2026-06-15', '2026-07-01']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(serialized.includes('"anterior"'), false);
  assert.equal(serialized.includes('"nuevo"'), false);
});

test('vacuna equivalente y advertencia de similar no ejecutan DML ni auditoria', async () => {
  const before = {
    id: 603,
    paciente_id: 41,
    embarazo_id: 91,
    tipo_vacuna: 'influenza',
    momento: 'durante_embarazo',
    numero_dosis: 1,
    fecha_dosis: '2026-06-01',
  };
  let writes = 0;
  let audits = 0;

  await withClinicalService('vaccine', {
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.equal(await service.actualizarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 603,
      body: {
        tipo_vacuna: 'influenza',
        momento: 'durante_embarazo',
        numero_dosis: '1',
        fecha_dosis: '2026-06-01T00:00:00.000Z',
        advertencia_similar: 'Otra vacuna parecida',
      },
      req: ACTOR,
    }), before);
  });

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('upsert equivalente de vacuna no crea evento falso', async () => {
  const before = {
    id: 604,
    paciente_id: 41,
    embarazo_id: 91,
    tipo_vacuna: 'td_tdap',
    momento: 'durante_embarazo',
    numero_dosis: 1,
    fecha_dosis: null,
  };
  let writes = 0;
  let audits = 0;

  await withClinicalService('vaccine', {
    repository: {
      obtenerPorDosis: async () => before,
      upsert: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.equal(await service.guardarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      body: { ...VALID_VACCINE, fecha_dosis: '' },
      req: ACTOR,
    }), before);
  });

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('fallo de auditoria revierte atomicamente la vacuna', async () => {
  const transaction = [];
  let stored = null;
  const recorder = privateAuditRecorder({ fail: true });

  await assert.rejects(withClinicalService('vaccine', {
    repository: {
      enTransaccion: async (operation) => {
        transaction.push('BEGIN');
        try {
          const result = await operation({ transaction: true });
          transaction.push('COMMIT');
          return result;
        } catch (error) {
          stored = null;
          transaction.push('ROLLBACK');
          throw error;
        }
      },
      obtenerPorDosis: async () => null,
      upsert: async (data) => {
        stored = { id: 605, ...data };
        return stored;
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarVacuna({
    pacienteId: 41,
    embarazoId: 91,
    body: VALID_VACCINE,
    req: ACTOR,
  })), /audit insert failed/);

  assert.equal(stored, null);
  assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  assert.equal(recorder.events.length, 0);
});

test('vacuna elimina con campos_eliminados y sin snapshot', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 606,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_VACCINE,
  };

  await withClinicalService('vaccine', {
    repository: {
      obtenerPorId: async () => before,
      eliminar: async () => ({ vacuna: before, rowCount: 1 }),
    },
    audit: recorder.audit,
  }, async (service) => service.eliminarVacuna({
    pacienteId: 41,
    embarazoId: 91,
    id: 606,
    req: ACTOR,
  }));

  const payload = privatePayload(recorder.events[0], {
    entity: 'vacuna',
    table: 'vacunas_paciente',
    action: 'eliminar',
    id: 606,
  });
  assert.deepEqual(payload.campos_eliminados, [
    'fecha_dosis',
    'momento',
    'numero_dosis',
    'tipo_vacuna',
  ]);
  assert.equal(JSON.stringify(payload).includes('td_tdap'), false);
  assert.equal(JSON.stringify(payload).includes('2026-06-15'), false);
});

test('fallo de auditoria revierte las eliminaciones de riesgo y vacuna', async () => {
  {
    let exists = true;
    let row;
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    await assert.rejects(withClinicalService('risk', {
      repository: {
        enTransaccion: async (operation) => {
          transaction.push('BEGIN');
          try {
            const result = await operation({ transaction: true });
            transaction.push('COMMIT');
            return result;
          } catch (error) {
            exists = true;
            transaction.push('ROLLBACK');
            throw error;
          }
        },
        obtenerPorEmbarazo: async () => (exists ? row : null),
        eliminarPorEmbarazo: async () => {
          exists = false;
          return { ficha: row, rowCount: 1 };
        },
      },
      audit: recorder.audit,
    }, async (service) => {
      row = { id: 609, paciente_id: 41, embarazo_id: 91, ...completeRisk(service) };
      return service.eliminarFichaRiesgo({ pacienteId: 41, embarazoId: 91, req: ACTOR });
    }), /audit insert failed/);
    assert.equal(exists, true);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }

  {
    let exists = true;
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    const row = { id: 610, paciente_id: 41, embarazo_id: 91, ...VALID_VACCINE };
    await assert.rejects(withClinicalService('vaccine', {
      repository: {
        enTransaccion: async (operation) => {
          transaction.push('BEGIN');
          try {
            const result = await operation({ transaction: true });
            transaction.push('COMMIT');
            return result;
          } catch (error) {
            exists = true;
            transaction.push('ROLLBACK');
            throw error;
          }
        },
        obtenerPorId: async () => (exists ? row : null),
        eliminar: async () => {
          exists = false;
          return { vacuna: row, rowCount: 1 };
        },
      },
      audit: recorder.audit,
    }, async (service) => service.eliminarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 610,
      req: ACTOR,
    })), /audit insert failed/);
    assert.equal(exists, true);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }
});

test('vacunas permanecen aisladas por embarazo y el cerrado no genera auditoria', async () => {
  const otherPregnancyVaccine = {
    id: 607,
    paciente_id: 41,
    embarazo_id: 92,
    ...VALID_VACCINE,
  };
  let writes = 0;
  let audits = 0;

  await assert.rejects(withClinicalService('vaccine', {
    repository: {
      obtenerPorId: async () => otherPregnancyVaccine,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.actualizarVacuna({
    pacienteId: 41,
    embarazoId: 91,
    id: 607,
    body: VALID_VACCINE,
    req: ACTOR,
  })), /embarazo seleccionado/);

  await assert.rejects(withClinicalService('vaccine', {
    repository: {
      obtenerPorDosis: async () => null,
      upsert: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => { throw closedPregnancyError(); },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.guardarVacuna({
    pacienteId: 41,
    embarazoId: 92,
    body: VALID_VACCINE,
    req: ACTOR,
  })), (error) => error.code === 'PREGNANCY_READ_ONLY');

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('antecedentes vacunales son lectura y no inventan eventos de modificacion', async () => {
  let audits = 0;
  const antecedente = {
    id: 608,
    paciente_id: 41,
    embarazo_id: null,
    tipo_vacuna: 'spr_sr',
    numero_dosis: 1,
    fecha_dosis: '2020-01-01',
  };

  await withClinicalService('vaccine', {
    repository: {
      listarAntecedentes: async (args) => {
        assert.deepEqual(args, { pacienteId: 41, excluirEmbarazoId: 91 });
        return [antecedente];
      },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.deepEqual(await service.listarAntecedentes({
      pacienteId: 41,
      excluirEmbarazoId: 91,
    }), [antecedente]);
  });

  assert.equal(audits, 0);
});

test('repositorios de riesgo y vacunas confirman, revierten y liberan transacciones', async () => {
  for (const repositoryPath of [RISK_REPOSITORY_PATH, VACCINE_REPOSITORY_PATH]) {
    const successCalls = [];
    const successClient = {
      query: async (sql) => { successCalls.push(sql); },
      release: () => { successCalls.push('RELEASE'); },
    };
    await withRepositoryPool(repositoryPath, {
      connect: async () => successClient,
    }, async (repository) => {
      assert.equal(await repository.enTransaccion(async (client) => {
        assert.equal(client, successClient);
        return 'ok';
      }), 'ok');
    });
    assert.deepEqual(successCalls, ['BEGIN', 'COMMIT', 'RELEASE']);

    const failureCalls = [];
    const failureClient = {
      query: async (sql) => { failureCalls.push(sql); },
      release: () => { failureCalls.push('RELEASE'); },
    };
    await withRepositoryPool(repositoryPath, {
      connect: async () => failureClient,
    }, async (repository) => {
      await assert.rejects(repository.enTransaccion(async () => {
        throw new Error('clinical write failed');
      }), /clinical write failed/);
    });
    assert.deepEqual(failureCalls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
  }
});

test('productores de riesgo y vacunas no conservan el escritor legado ni payloads crudos', () => {
  for (const relativePath of [
    '../src/services/riesgoService.js',
    '../src/services/vacunasService.js',
  ]) {
    const source = fs.readFileSync(require.resolve(relativePath), 'utf8');
    assert.match(source, /registrarEventoPrivado/);
    assert.doesNotMatch(source, /utils\/auditoria/);
    assert.doesNotMatch(source, /datosAnteriores|datosNuevos|req\.body/);
    assert.doesNotMatch(source, /tabla:\s*['"](?:fichas_riesgo_obstetrico|vacunas_paciente)/);
  }
});
