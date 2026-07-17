const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const privateAuditService = require('../src/services/auditService');
const { HttpError } = require('../src/utils/httpError');

const MORBIDITY_SERVICE_PATH = require.resolve('../src/services/morbilidadService');
const MORBIDITY_REPOSITORY_PATH = require.resolve('../src/repositories/morbilidadRepository');
const BIRTH_PLAN_SERVICE_PATH = require.resolve('../src/services/planPartoService');
const BIRTH_PLAN_REPOSITORY_PATH = require.resolve('../src/repositories/planPartoRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const POOL_PATH = require.resolve('../src/db/pool');

const ACTOR = {
  usuario: {
    id: 83,
    username: 'clinica.pruebas',
    rol: 'personal_salud',
    permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'],
  },
  headers: {
    authorization: 'Bearer secreto-sintetico',
    cookie: 'sesion=sintetica',
    'user-agent': 'node:test',
  },
  ip: '127.0.0.1',
};

const VALID_MORBIDITY = {
  fecha: '2026-06-15',
  hora: '08:30',
  motivo_consulta: 'Motivo sintetico confidencial',
  historia_enfermedad_actual: 'Historia sintetica confidencial',
  revision_por_sistemas: 'Revision sintetica confidencial',
  examen_fisico: 'Examen sintetico confidencial',
  impresion_clinica: 'Diagnostico sintetico confidencial',
  tratamiento_referencia: 'Medicamento 99 mg y referencia sintetica',
  nombre_cargo_atiende: 'Persona Clinica Sintetica',
  codigo_diagnostico: 'COD-SINTETICO',
  dosis: '99 mg',
  observaciones: 'Observacion ignorada confidencial',
  token: 'token-en-body',
};

const VALID_BIRTH_PLAN = {
  no_registro: 'REG-SINTETICO-001',
  servicio_salud: 'Servicio de Salud Sintetico',
  lugar_residencia: 'Direccion sintetica confidencial',
  fecha: '2026-06-15',
  nombre_conyuge: 'Persona Conyuge Sintetica',
  telefono: '5555-0202',
  fur: '2026-01-01',
  fecha_probable_parto: '2026-10-08',
  no_embarazos: 2,
  edad_gestacional_semanas: 24,
  peligro_hemorragia_vaginal: true,
  lugar_atencion_parto: 'hospital_sintetico',
  como_trasladara: 'Vehiculo sintetico',
  acompana_traslado: 'Persona Apoyo Sintetica',
  telefono_vehiculo: '5555-0303',
  nombre_activara_plan: 'Persona Responsable Sintetica',
  nombre_proveedor_salud: 'Proveedor Sintetico',
  cui: '2999999999999',
  expediente: 'EXP-SINTETICO',
  comunidad: 'Comunidad Sintetica',
  token: 'token-plan-body',
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
  const isMorbidity = kind === 'morbidity';
  const servicePath = isMorbidity ? MORBIDITY_SERVICE_PATH : BIRTH_PLAN_SERVICE_PATH;
  const repositoryPath = isMorbidity
    ? MORBIDITY_REPOSITORY_PATH
    : BIRTH_PLAN_REPOSITORY_PATH;
  const repositoryLabel = isMorbidity ? 'morbilidadRepository' : 'planPartoRepository';
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

test('morbilidad crea evento privado con campos_registrados y sin valores clinicos', async () => {
  const recorder = privateAuditRecorder();
  let inserted;

  await withClinicalService('morbidity', {
    repository: {
      insertar: async (data) => {
        inserted = data;
        return { id: 701, ...data };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.equal((await service.guardarMorbilidad({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_MORBIDITY,
      req: ACTOR,
    })).id, 701);
  });

  assert.equal(inserted.registrado_por, ACTOR.usuario.id);
  assert.equal(inserted.updated_by, ACTOR.usuario.id);
  assert.equal(recorder.databases[0].transaction, true);
  const payload = privatePayload(recorder.events[0], {
    entity: 'morbilidad',
    table: 'morbilidad_embarazo',
    action: 'crear',
    id: 701,
  });
  assert.deepEqual(payload.campos_registrados, [
    'examen_fisico',
    'fecha',
    'historia_enfermedad_actual',
    'hora',
    'impresion_clinica',
    'motivo_consulta',
    'nombre_cargo_atiende',
    'revision_por_sistemas',
    'tratamiento_referencia',
  ]);
  assert.deepEqual(Object.keys(payload).sort(), ['campos_registrados', 'politica_version', 'resultado']);
  const serialized = JSON.stringify(recorder.events[0]);
  for (const forbidden of [
    'Motivo sintetico confidencial',
    'Historia sintetica confidencial',
    'Diagnostico sintetico confidencial',
    'COD-SINTETICO',
    'Medicamento 99 mg',
    '99 mg',
    'Observacion ignorada confidencial',
    'Persona Clinica Sintetica',
    'token-en-body',
    'Bearer secreto-sintetico',
    'sesion=sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('morbilidad actualiza solo nombres de campos realmente modificados', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 702,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_MORBIDITY,
  };
  let updatedArgs;

  await withClinicalService('morbidity', {
    repository: {
      obtenerPorId: async () => before,
      actualizar: async (args) => {
        updatedArgs = args;
        return { registro: { ...before, ...args.data }, rowCount: 1 };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.deepEqual(await service.actualizarMorbilidad({
      pacienteId: 41,
      embarazoId: 91,
      id: 702,
      body: {
        impresion_clinica: 'Otro diagnostico sintetico',
        tratamiento_referencia: 'Otro medicamento sintetico 20 mg',
        observaciones: 'Ignorada por el modelo real',
      },
      req: ACTOR,
    }), { message: 'Registro actualizado' });
  });

  assert.deepEqual(updatedArgs.campos, ['impresion_clinica', 'tratamiento_referencia']);
  const payload = privatePayload(recorder.events[0], {
    entity: 'morbilidad',
    table: 'morbilidad_embarazo',
    action: 'actualizar',
    id: 702,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, [
    'impresion_clinica',
    'tratamiento_referencia',
  ]);
  assert.deepEqual(Object.keys(payload).sort(), [
    'campos_sensibles_modificados',
    'politica_version',
    'resultado',
  ]);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('Otro diagnostico sintetico'), false);
  assert.equal(serialized.includes('Otro medicamento sintetico'), false);
  assert.equal(serialized.includes('Ignorada por el modelo real'), false);
});

test('morbilidad equivalente en fecha, hora y vacios no ejecuta DML ni auditoria', async () => {
  const before = {
    id: 703,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_MORBIDITY,
    fecha: '2026-06-15',
    hora: '08:30:00',
    tratamiento_referencia: null,
  };
  let writes = 0;
  let audits = 0;

  await withClinicalService('morbidity', {
    repository: {
      obtenerPorId: async () => before,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.deepEqual(await service.actualizarMorbilidad({
      pacienteId: 41,
      embarazoId: 91,
      id: 703,
      body: {
        fecha: '2026-06-15T00:00:00.000Z',
        hora: '08:30',
        tratamiento_referencia: '',
      },
      req: ACTOR,
    }), { message: 'Registro actualizado' });
  });

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('morbilidad elimina con campos_eliminados sin snapshot', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 704,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_MORBIDITY,
  };

  await withClinicalService('morbidity', {
    repository: {
      obtenerPorId: async () => before,
      eliminar: async () => ({ registro: before, rowCount: 1 }),
    },
    audit: recorder.audit,
  }, async (service) => service.eliminarMorbilidad({
    pacienteId: 41,
    embarazoId: 91,
    id: 704,
    req: ACTOR,
  }));

  const payload = privatePayload(recorder.events[0], {
    entity: 'morbilidad',
    table: 'morbilidad_embarazo',
    action: 'eliminar',
    id: 704,
  });
  assert.deepEqual(payload.campos_eliminados, [
    'examen_fisico',
    'fecha',
    'historia_enfermedad_actual',
    'hora',
    'impresion_clinica',
    'motivo_consulta',
    'nombre_cargo_atiende',
    'revision_por_sistemas',
    'tratamiento_referencia',
  ]);
  assert.equal(JSON.stringify(payload).includes('Diagnostico sintetico confidencial'), false);
});

test('fallo de auditoria revierte creacion y eliminacion de morbilidad', async () => {
  {
    let stored = null;
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    await assert.rejects(withClinicalService('morbidity', {
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
        insertar: async (data) => {
          stored = { id: 705, ...data };
          return stored;
        },
      },
      audit: recorder.audit,
    }, async (service) => service.guardarMorbilidad({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_MORBIDITY,
      req: ACTOR,
    })), /audit insert failed/);
    assert.equal(stored, null);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }

  {
    let exists = true;
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    const row = { id: 706, paciente_id: 41, embarazo_id: 91, ...VALID_MORBIDITY };
    await assert.rejects(withClinicalService('morbidity', {
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
          return { registro: row, rowCount: 1 };
        },
      },
      audit: recorder.audit,
    }, async (service) => service.eliminarMorbilidad({
      pacienteId: 41,
      embarazoId: 91,
      id: 706,
      req: ACTOR,
    })), /audit insert failed/);
    assert.equal(exists, true);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }
});

test('morbilidad rechaza embarazo incorrecto o cerrado sin evento exitoso', async () => {
  let writes = 0;
  let audits = 0;
  const otherPregnancy = {
    id: 707,
    paciente_id: 41,
    embarazo_id: 92,
    ...VALID_MORBIDITY,
  };

  await assert.rejects(withClinicalService('morbidity', {
    repository: {
      obtenerPorId: async () => otherPregnancy,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.actualizarMorbilidad({
    pacienteId: 41,
    embarazoId: 91,
    id: 707,
    body: { impresion_clinica: 'Cambio sintetico' },
    req: ACTOR,
  })), /embarazo seleccionado/);

  await assert.rejects(withClinicalService('morbidity', {
    repository: {
      insertar: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => { throw closedPregnancyError(); },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.guardarMorbilidad({
    pacienteId: 41,
    embarazoId: 92,
    body: VALID_MORBIDITY,
    req: ACTOR,
  })), (error) => error.code === 'PREGNANCY_READ_ONLY');

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('plan de parto crea evento privado sin valores prellenados o identificadores externos', async () => {
  const recorder = privateAuditRecorder();
  let inserted;

  await withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async () => null,
      insertar: async (data) => {
        inserted = data;
        return { id: 801, ...data };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.equal((await service.guardarPlanParto({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_BIRTH_PLAN,
      req: ACTOR,
    })).id, 801);
  });

  assert.equal(inserted.registrado_por, ACTOR.usuario.id);
  assert.equal(inserted.updated_by, ACTOR.usuario.id);
  assert.equal('cui' in inserted, false);
  assert.equal('expediente' in inserted, false);
  assert.equal('comunidad' in inserted, false);
  const payload = privatePayload(recorder.events[0], {
    entity: 'plan_parto',
    table: 'planes_parto',
    action: 'crear',
    id: 801,
  });
  for (const field of [
    'no_registro',
    'servicio_salud',
    'lugar_residencia',
    'nombre_conyuge',
    'telefono',
    'fur',
    'fecha_probable_parto',
    'peligro_hemorragia_vaginal',
    'lugar_atencion_parto',
    'como_trasladara',
    'acompana_traslado',
  ]) assert.ok(payload.campos_registrados.includes(field));
  assert.deepEqual(Object.keys(payload).sort(), ['campos_registrados', 'politica_version', 'resultado']);
  const serialized = JSON.stringify(recorder.events[0]);
  for (const forbidden of [
    'REG-SINTETICO-001',
    'Servicio de Salud Sintetico',
    'Direccion sintetica confidencial',
    'Persona Conyuge Sintetica',
    '5555-0202',
    '2026-01-01',
    '2026-10-08',
    'hospital_sintetico',
    'Vehiculo sintetico',
    'Persona Apoyo Sintetica',
    '2999999999999',
    'EXP-SINTETICO',
    'Comunidad Sintetica',
    'token-plan-body',
    'Bearer secreto-sintetico',
    'sesion=sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('upsert del plan registra solo nombres realmente modificados y un unico evento', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 802,
    paciente_id: 41,
    embarazo_id: 91,
    fecha: '2026-06-15',
    lugar_atencion_parto: 'cap',
    como_trasladara: 'a_pie',
    nombre_activara_plan: 'Persona Anterior Sintetica',
  };
  let updatedArgs;

  await withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async () => before,
      actualizar: async (args) => {
        updatedArgs = args;
        return { ...before, ...args.data };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarPlanParto({
    pacienteId: 41,
    embarazoId: 91,
    body: {
      fecha: '2026-06-15',
      lugar_atencion_parto: 'hospital',
      como_trasladara: 'vehiculo',
      nombre_activara_plan: 'Persona Nueva Sintetica',
    },
    req: ACTOR,
  }));

  assert.deepEqual(updatedArgs.campos, [
    'lugar_atencion_parto',
    'como_trasladara',
    'nombre_activara_plan',
  ]);
  assert.equal(recorder.events.length, 1);
  const payload = privatePayload(recorder.events[0], {
    entity: 'plan_parto',
    table: 'planes_parto',
    action: 'actualizar',
    id: 802,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, [
    'como_trasladara',
    'lugar_atencion_parto',
    'nombre_activara_plan',
  ]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    'hospital',
    'vehiculo',
    'Persona Anterior Sintetica',
    'Persona Nueva Sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('plan equivalente en vacios, numeros, fechas y booleanos no escribe ni audita', async () => {
  const before = {
    id: 803,
    paciente_id: 41,
    embarazo_id: 91,
    fecha: '2026-06-15',
    fur: '2026-01-01',
    no_embarazos: '2',
    kms_servicio: '4.50',
    usara_casa_materna: false,
    otros_articulos: null,
  };
  let writes = 0;
  let audits = 0;

  await withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async () => before,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.equal(await service.guardarPlanParto({
      pacienteId: 41,
      embarazoId: 91,
      body: {
        fecha: '2026-06-15T00:00:00.000Z',
        fur: '2026-01-01T00:00:00.000Z',
        no_embarazos: 2,
        kms_servicio: 4.5,
        usara_casa_materna: 'false',
        otros_articulos: '',
      },
      req: ACTOR,
    }), before);
  });

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('consulta y prellenado del plan son solo lectura y no generan auditoria', async () => {
  const plan = {
    id: 804,
    paciente_id: 41,
    embarazo_id: 91,
    ...VALID_BIRTH_PLAN,
  };
  let audits = 0;

  await withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async (embarazoId) => {
        assert.equal(embarazoId, 91);
        return plan;
      },
    },
    audit: async () => { audits += 1; },
  }, async (service) => {
    assert.equal(await service.obtenerPlanParto(41, 91), plan);
  });

  assert.equal(audits, 0);
});

test('fallo de auditoria revierte creacion y actualizacion del plan', async () => {
  {
    let stored = null;
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    await assert.rejects(withClinicalService('birthPlan', {
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
          stored = { id: 805, ...data };
          return stored;
        },
      },
      audit: recorder.audit,
    }, async (service) => service.guardarPlanParto({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_BIRTH_PLAN,
      req: ACTOR,
    })), /audit insert failed/);
    assert.equal(stored, null);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }

  {
    const original = {
      id: 806,
      paciente_id: 41,
      embarazo_id: 91,
      fecha: '2026-06-15',
      lugar_atencion_parto: 'cap',
    };
    let stored = { ...original };
    const transaction = [];
    const recorder = privateAuditRecorder({ fail: true });
    await assert.rejects(withClinicalService('birthPlan', {
      repository: {
        enTransaccion: async (operation) => {
          transaction.push('BEGIN');
          try {
            const result = await operation({ transaction: true });
            transaction.push('COMMIT');
            return result;
          } catch (error) {
            stored = { ...original };
            transaction.push('ROLLBACK');
            throw error;
          }
        },
        obtenerPorEmbarazo: async () => stored,
        actualizar: async (args) => {
          stored = { ...stored, ...args.data };
          return stored;
        },
      },
      audit: recorder.audit,
    }, async (service) => service.guardarPlanParto({
      pacienteId: 41,
      embarazoId: 91,
      body: { fecha: '2026-06-15', lugar_atencion_parto: 'hospital' },
      req: ACTOR,
    })), /audit insert failed/);
    assert.deepEqual(stored, original);
    assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  }
});

test('planes de dos embarazos permanecen aislados y el cerrado no escribe', async () => {
  let writes = 0;
  let audits = 0;
  const planPregnancy92 = {
    id: 807,
    paciente_id: 41,
    embarazo_id: 92,
    fecha: '2026-06-15',
  };

  await withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async (embarazoId) => {
        assert.equal(embarazoId, 91);
        return null;
      },
      insertar: async (data) => {
        writes += 1;
        assert.equal(data.embarazo_id, 91);
        return { id: 808, ...data };
      },
    },
    audit: async (_req, event) => {
      audits += 1;
      assert.equal(event.embarazoId, 91);
    },
  }, async (service) => service.guardarPlanParto({
    pacienteId: 41,
    embarazoId: 91,
    body: { fecha: '2026-06-15' },
    req: ACTOR,
  }));
  assert.equal(planPregnancy92.embarazo_id, 92);

  await assert.rejects(withClinicalService('birthPlan', {
    repository: {
      obtenerPorEmbarazo: async () => planPregnancy92,
      actualizar: async () => { writes += 1; },
    },
    pregnancies: {
      validarEmbarazoEditable: async () => { throw closedPregnancyError(); },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.guardarPlanParto({
    pacienteId: 41,
    embarazoId: 92,
    body: { fecha: '2026-06-15' },
    req: ACTOR,
  })), (error) => error.code === 'PREGNANCY_READ_ONLY');

  assert.equal(writes, 1);
  assert.equal(audits, 1);
});

test('repositorios de morbilidad y plan confirman, revierten y liberan transacciones', async () => {
  for (const repositoryPath of [MORBIDITY_REPOSITORY_PATH, BIRTH_PLAN_REPOSITORY_PATH]) {
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

test('productores no conservan escritor legado, payload crudo ni eliminacion inexistente del plan', () => {
  for (const relativePath of [
    '../src/services/morbilidadService.js',
    '../src/services/planPartoService.js',
  ]) {
    const source = fs.readFileSync(require.resolve(relativePath), 'utf8');
    assert.match(source, /registrarEventoPrivado/);
    assert.doesNotMatch(source, /utils\/auditoria/);
    assert.doesNotMatch(source, /datosAnteriores|datosNuevos|req\.body/);
    assert.doesNotMatch(source, /tabla:\s*['"](?:morbilidad_embarazo|planes_parto)/);
  }

  const routeSource = fs.readFileSync(require.resolve('../src/routes/controles.js'), 'utf8');
  const controllerSource = fs.readFileSync(
    require.resolve('../src/controllers/planPartoController.js'),
    'utf8'
  );
  const repositorySource = fs.readFileSync(BIRTH_PLAN_REPOSITORY_PATH, 'utf8');
  assert.doesNotMatch(routeSource, /delete\s*\(\s*['"]\/plan-parto/);
  assert.doesNotMatch(controllerSource, /eliminarPlanParto/);
  assert.doesNotMatch(repositorySource, /async function eliminar/);
});
