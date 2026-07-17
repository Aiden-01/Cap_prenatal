const assert = require('node:assert/strict');
const test = require('node:test');

const privateAuditService = require('../src/services/auditService');
const { HttpError } = require('../src/utils/httpError');

const PUERPERIO_SERVICE_PATH = require.resolve('../src/services/puerperioService');
const PUERPERIO_REPOSITORY_PATH = require.resolve('../src/repositories/puerperioRepository');
const REFERENCIAS_SERVICE_PATH = require.resolve('../src/services/referenciasService');
const REFERENCIAS_REPOSITORY_PATH = require.resolve('../src/repositories/referenciasRepository');
const COMUNIDADES_SERVICE_PATH = require.resolve('../src/services/comunidadesService');
const COMUNIDADES_REPOSITORY_PATH = require.resolve('../src/repositories/comunidadesRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const POOL_PATH = require.resolve('../src/db/pool');

const ACTOR = {
  usuario: {
    id: 83,
    username: 'clinica.pruebas',
    permisos: ['pacientes.ver', 'controles.crear', 'controles.editar'],
  },
  headers: {
    authorization: 'Bearer secreto-puerperio',
    cookie: 'sesion=sintetica',
    'user-agent': 'node:test',
  },
  ip: '127.0.0.1',
};

const VALID_PUERPERIO = {
  numero_atencion: 1,
  fecha: '2026-06-18',
  hora: '08:30',
  signos_peligro: 'Sangrado sintetico y dolor confidencial',
  dias_despues_parto: 2,
  lugar_atencion_parto: 'Hospital sintetico confidencial',
  quien_atendio_parto: 'Persona Comadrona Sintetica',
  recien_nacido_vivo: true,
  tipo_parto: 'vaginal',
  tuvo_apego_inmediato: true,
  lactancia_materna_exclusiva: true,
  herida_operatoria: 'Descripcion de herida sintetica',
  pa_sistolica: 120,
  pa_diastolica: 80,
  frecuencia_cardiaca: 72,
  frecuencia_respiratoria: 18,
  temperatura: 36.8,
  examen_mamas: 'Examen sintetico confidencial',
  examen_ginecologico: 'Examen ginecologico sintetico',
  orientacion_consejeria: 'Consejeria sintetica confidencial',
  impresion_clinica: 'Diagnostico puerperal sintetico',
  tratamiento: 'Medicamento puerperal 99 mg',
  nombre_cargo_atiende: 'Persona Clinica Sintetica',
  peso_recien_nacido: '3.2 kg',
  vacunas_recien_nacido: 'Vacuna sintetica',
  observaciones: 'Observacion fuera del modelo',
  token: 'token-en-body',
};

const VALID_REFERENCIA = {
  fecha: '2026-06-18',
  lugar_referencia: 'Hospital Destino Sintetico',
  diagnostico: 'Diagnostico de referencia sintetico',
  prioridad: 'urgente',
  traslado: 'Ambulancia sintetica',
  observaciones: 'Observacion de traslado sintetica',
  cui: '2999999999999',
  numero_expediente: 'EXP-SINTETICO',
  token: 'token-referencia',
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

const SERVICE_CONFIG = Object.freeze({
  puerperio: {
    servicePath: PUERPERIO_SERVICE_PATH,
    repositoryPath: PUERPERIO_REPOSITORY_PATH,
    repositoryLabel: 'puerperioRepository',
  },
  referencias: {
    servicePath: REFERENCIAS_SERVICE_PATH,
    repositoryPath: REFERENCIAS_REPOSITORY_PATH,
    repositoryLabel: 'referenciasRepository',
  },
  comunidades: {
    servicePath: COMUNIDADES_SERVICE_PATH,
    repositoryPath: COMUNIDADES_REPOSITORY_PATH,
    repositoryLabel: 'comunidadesRepository',
  },
});

async function withService(kind, { repository = {}, audit, pregnancies = {} } = {}, callback) {
  const config = SERVICE_CONFIG[kind];
  const repositoryWithTransaction = {
    enTransaccion: async (operation) => operation({ transaction: true, kind }),
    ...repository,
  };
  const restore = [
    cacheModule(
      config.repositoryPath,
      strictMock(repositoryWithTransaction, config.repositoryLabel)
    ),
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
      }) => ({ id: embarazoId || 91, paciente_id: pacienteId, estado: 'puerperio' })),
      validarEmbarazoEditable: pregnancies.validarEmbarazoEditable || (async ({
        pacienteId,
        embarazoId,
      }) => ({ id: embarazoId, paciente_id: pacienteId, estado: 'puerperio' })),
    }),
  ];
  const previousService = require.cache[config.servicePath];
  delete require.cache[config.servicePath];

  try {
    return await callback(require(config.servicePath));
  } finally {
    delete require.cache[config.servicePath];
    if (previousService) require.cache[config.servicePath] = previousService;
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
  assert.equal(event.pacienteId, expected.patientId ?? null);
  assert.equal(event.embarazoId, expected.pregnancyId ?? null);
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

test('crear puerperio y pasar el embarazo comparten cliente con payloads privados minimos', async () => {
  const recorder = privateAuditRecorder();
  let upsertArgs;

  await withService('puerperio', {
    repository: {
      obtenerEmbarazoParaActualizar: async () => ({
        id: 91,
        paciente_id: 41,
        estado: 'activo',
        observaciones: 'Embarazo confidencial',
      }),
      obtenerPorNumeroYEmbarazo: async () => null,
      marcarEmbarazoEnPuerperio: async () => ({
        id: 91,
        paciente_id: 41,
        estado: 'puerperio',
        fecha_cierre: '2026-06-18',
      }),
      upsert: async (args) => {
        upsertArgs = args;
        return { id: 901, ...args.data };
      },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.equal((await service.guardarPuerperio({
      pacienteId: 41,
      embarazoId: 91,
      body: VALID_PUERPERIO,
      req: ACTOR,
    })).id, 901);
    assert.deepEqual(
      upsertArgs.updateFields,
      service.PUERPERIO_FIELDS.filter((field) => field !== 'numero_atencion')
    );
  });

  assert.equal(recorder.events.length, 2);
  assert.equal(recorder.databases.every((db) => db.transaction === true), true);
  const pregnancyPayload = privatePayload(recorder.events[0], {
    entity: 'embarazo',
    table: 'embarazos',
    action: 'estado',
    id: 91,
    patientId: 41,
    pregnancyId: 91,
  });
  assert.deepEqual(pregnancyPayload.cambios, {
    estado_embarazo: { anterior: 'activo', nuevo: 'puerperio' },
  });

  const puerperiumPayload = privatePayload(recorder.events[1], {
    entity: 'puerperio',
    table: 'controles_puerperio',
    action: 'crear',
    id: 901,
    patientId: 41,
    pregnancyId: 91,
  });
  assert.ok(puerperiumPayload.campos_registrados.includes('frecuencia_cardiaca'));
  assert.ok(puerperiumPayload.campos_registrados.includes('signos_peligro'));
  assert.ok(puerperiumPayload.campos_registrados.includes('recien_nacido_vivo'));
  const serialized = JSON.stringify(recorder.events);
  for (const forbidden of [
    'Sangrado sintetico',
    'Hospital sintetico',
    'Persona Comadrona',
    'Descripcion de herida',
    'Diagnostico puerperal',
    'Medicamento puerperal',
    'Persona Clinica',
    '3.2 kg',
    'Vacuna sintetica',
    'Observacion fuera',
    'Embarazo confidencial',
    'token-en-body',
    'Bearer secreto-puerperio',
    'sesion=sintetica',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('upsert de puerperio existente audita solo el delta y no duplica la transicion', async () => {
  const recorder = privateAuditRecorder();
  const before = { id: 902, paciente_id: 41, embarazo_id: 91, ...VALID_PUERPERIO };
  let upsertArgs;

  await withService('puerperio', {
    repository: {
      obtenerEmbarazoParaActualizar: async () => ({ id: 91, paciente_id: 41, estado: 'puerperio' }),
      obtenerPorNumeroYEmbarazo: async () => before,
      upsert: async (args) => {
        upsertArgs = args;
        return { ...before, ...args.data };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    body: {
      ...VALID_PUERPERIO,
      frecuencia_cardiaca: 80,
      signos_peligro: 'Nuevo signo sintetico',
    },
    req: ACTOR,
  }));

  assert.deepEqual(upsertArgs.updateFields, ['signos_peligro', 'frecuencia_cardiaca']);
  assert.equal(recorder.events.length, 1);
  const payload = privatePayload(recorder.events[0], {
    entity: 'puerperio',
    table: 'controles_puerperio',
    action: 'actualizar',
    id: 902,
    patientId: 41,
    pregnancyId: 91,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, [
    'frecuencia_cardiaca',
    'signos_peligro',
  ]);
  assert.equal(JSON.stringify(payload).includes('Nuevo signo sintetico'), false);
});

test('puerperio equivalente en fecha, hora, numero, booleano, vacio y espacios es no-op', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 903,
    paciente_id: 41,
    embarazo_id: 91,
    numero_atencion: 1,
    fecha: '2026-06-18',
    hora: '08:30:00',
    frecuencia_cardiaca: '72',
    recien_nacido_vivo: true,
    signos_peligro: 'Sin signos de peligro',
    tratamiento: null,
  };
  let writes = 0;

  await withService('puerperio', {
    repository: {
      obtenerEmbarazoParaActualizar: async () => ({ id: 91, paciente_id: 41, estado: 'puerperio' }),
      obtenerPorNumeroYEmbarazo: async () => before,
      upsert: async () => { writes += 1; },
    },
    audit: recorder.audit,
  }, async (service) => {
    assert.equal(await service.guardarPuerperio({
      pacienteId: 41,
      embarazoId: 91,
      body: {
        numero_atencion: 1,
        fecha: '2026-06-18T00:00:00.000Z',
        hora: '08:30',
        frecuencia_cardiaca: 72,
        recien_nacido_vivo: 'true',
        signos_peligro: '  Sin   signos de peligro  ',
        tratamiento: '',
      },
      req: ACTOR,
    }), before);
  });

  assert.equal(writes, 0);
  assert.equal(recorder.events.length, 0);
});

test('actualizacion directa de puerperio conserva solo nombres realmente modificados', async () => {
  const recorder = privateAuditRecorder();
  const before = { id: 904, paciente_id: 41, embarazo_id: 91, ...VALID_PUERPERIO };
  let updatedArgs;

  await withService('puerperio', {
    repository: {
      obtenerPorId: async () => before,
      obtenerPorIdYEmbarazo: async () => before,
      actualizar: async (args) => {
        updatedArgs = args;
        return { ...before, ...args.data };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.actualizarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    id: 904,
    body: {
      impresion_clinica: 'Nueva impresion sintetica',
      tratamiento: 'Nuevo medicamento sintetico',
      frecuencia_cardiaca: '72',
    },
    req: ACTOR,
  }));

  assert.deepEqual(updatedArgs.campos, ['impresion_clinica', 'tratamiento']);
  const payload = privatePayload(recorder.events[0], {
    entity: 'puerperio',
    table: 'controles_puerperio',
    action: 'actualizar',
    id: 904,
    patientId: 41,
    pregnancyId: 91,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, ['impresion_clinica', 'tratamiento']);
});

test('eliminacion de puerperio usa campos_eliminados sin snapshot', async () => {
  const recorder = privateAuditRecorder();
  const before = { id: 905, paciente_id: 41, embarazo_id: 91, ...VALID_PUERPERIO };

  await withService('puerperio', {
    repository: {
      obtenerPorId: async () => before,
      obtenerPorIdYEmbarazo: async () => before,
      eliminar: async () => ({ control: before, rowCount: 1 }),
    },
    audit: recorder.audit,
  }, async (service) => service.eliminarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    id: 905,
    req: ACTOR,
  }));

  const payload = privatePayload(recorder.events[0], {
    entity: 'puerperio',
    table: 'controles_puerperio',
    action: 'eliminar',
    id: 905,
    patientId: 41,
    pregnancyId: 91,
  });
  assert.ok(payload.campos_eliminados.includes('signos_peligro'));
  assert.equal(JSON.stringify(payload).includes('Diagnostico puerperal sintetico'), false);
});

test('fallo de auditoria revierte control, transicion y evita eventos posteriores', async () => {
  let pregnancyState = 'activo';
  let control = null;
  const transaction = [];
  const recorder = privateAuditRecorder({ fail: true });

  await assert.rejects(withService('puerperio', {
    repository: {
      enTransaccion: async (operation) => {
        transaction.push('BEGIN');
        try {
          const result = await operation({ transaction: true });
          transaction.push('COMMIT');
          return result;
        } catch (error) {
          pregnancyState = 'activo';
          control = null;
          transaction.push('ROLLBACK');
          throw error;
        }
      },
      obtenerEmbarazoParaActualizar: async () => ({
        id: 91,
        paciente_id: 41,
        estado: pregnancyState,
      }),
      obtenerPorNumeroYEmbarazo: async () => null,
      marcarEmbarazoEnPuerperio: async () => {
        pregnancyState = 'puerperio';
        return { id: 91, paciente_id: 41, estado: pregnancyState };
      },
      upsert: async (args) => {
        control = { id: 906, ...args.data };
        return control;
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    body: VALID_PUERPERIO,
    req: ACTOR,
  })), /audit insert failed/);

  assert.equal(pregnancyState, 'activo');
  assert.equal(control, null);
  assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
  assert.equal(recorder.databases.length, 1);
  assert.equal(recorder.events.length, 0);
});

test('embarazo cerrado o control de otro embarazo no ejecutan DML ni auditoria', async () => {
  let writes = 0;
  let audits = 0;

  await assert.rejects(withService('puerperio', {
    repository: {
      obtenerEmbarazoParaActualizar: async () => ({ id: 91, paciente_id: 41, estado: 'cerrado' }),
      upsert: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.guardarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    body: VALID_PUERPERIO,
    req: ACTOR,
  })), (error) => error.code === 'PREGNANCY_READ_ONLY');

  await assert.rejects(withService('puerperio', {
    repository: {
      obtenerPorId: async () => ({ id: 999, paciente_id: 41, embarazo_id: 92 }),
      obtenerPorIdYEmbarazo: async () => null,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.actualizarPuerperio({
    pacienteId: 41,
    embarazoId: 91,
    id: 999,
    body: { tratamiento: 'Dato sintetico' },
    req: ACTOR,
  })), /no encontrado/);

  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('crear referencia guarda solo campos_registrados y nunca inventa embarazo_id', async () => {
  const recorder = privateAuditRecorder();
  let inserted;

  await withService('referencias', {
    repository: {
      insertar: async (data) => {
        inserted = data;
        return { id: 1001, ...data };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarReferencia({
    pacienteId: 41,
    body: VALID_REFERENCIA,
    req: ACTOR,
  }));

  assert.equal('embarazo_id' in inserted, false);
  const payload = privatePayload(recorder.events[0], {
    entity: 'referencia',
    table: 'referencias_efectuadas',
    action: 'crear',
    id: 1001,
    patientId: 41,
  });
  assert.deepEqual(payload.campos_registrados, ['diagnostico', 'fecha', 'lugar_referencia']);
  const serialized = JSON.stringify(recorder.events[0]);
  for (const forbidden of [
    'Hospital Destino Sintetico',
    'Diagnostico de referencia',
    'urgente',
    'Ambulancia sintetica',
    'Observacion de traslado',
    '2999999999999',
    'EXP-SINTETICO',
    'token-referencia',
    'Bearer secreto-puerperio',
  ]) assert.equal(serialized.includes(forbidden), false);
});

test('referencia actualiza solo el delta y omite cambios equivalentes', async () => {
  const recorder = privateAuditRecorder();
  const before = {
    id: 1002,
    paciente_id: 41,
    fecha: '2026-06-18',
    lugar_referencia: 'Hospital Destino Sintetico',
    diagnostico: null,
  };
  let updatedArgs;

  await withService('referencias', {
    repository: {
      obtenerPorIdYPaciente: async () => before,
      actualizar: async (args) => {
        updatedArgs = args;
        return { referencia: { ...before, ...args.data }, rowCount: 1 };
      },
    },
    audit: recorder.audit,
  }, async (service) => service.actualizarReferencia({
    pacienteId: 41,
    id: 1002,
    body: {
      fecha: '2026-06-18T00:00:00.000Z',
      lugar_referencia: 'Hospital Regional Sintetico',
      diagnostico: '',
    },
    req: ACTOR,
  }));

  assert.deepEqual(updatedArgs.campos, ['lugar_referencia']);
  const payload = privatePayload(recorder.events[0], {
    entity: 'referencia',
    table: 'referencias_efectuadas',
    action: 'actualizar',
    id: 1002,
    patientId: 41,
  });
  assert.deepEqual(payload.campos_sensibles_modificados, ['lugar_referencia']);
  assert.equal(JSON.stringify(payload).includes('Hospital Regional Sintetico'), false);

  let writes = 0;
  let audits = 0;
  await withService('referencias', {
    repository: {
      obtenerPorIdYPaciente: async () => before,
      actualizar: async () => { writes += 1; },
    },
    audit: async () => { audits += 1; },
  }, async (service) => service.actualizarReferencia({
    pacienteId: 41,
    id: 1002,
    body: {
      fecha: '2026-06-18T00:00:00.000Z',
      lugar_referencia: '  Hospital   Destino Sintetico  ',
      diagnostico: '',
    },
    req: ACTOR,
  }));
  assert.equal(writes, 0);
  assert.equal(audits, 0);
});

test('eliminar referencia conserva campos_eliminados sin snapshot ni embarazo', async () => {
  const recorder = privateAuditRecorder();
  const row = { id: 1003, paciente_id: 41, ...VALID_REFERENCIA };

  await withService('referencias', {
    repository: {
      eliminar: async () => ({ referencia: row, rowCount: 1 }),
    },
    audit: recorder.audit,
  }, async (service) => service.eliminarReferencia({
    pacienteId: 41,
    id: 1003,
    req: ACTOR,
  }));

  const payload = privatePayload(recorder.events[0], {
    entity: 'referencia',
    table: 'referencias_efectuadas',
    action: 'eliminar',
    id: 1003,
    patientId: 41,
  });
  assert.deepEqual(payload.campos_eliminados, ['diagnostico', 'fecha', 'lugar_referencia']);
  assert.equal(recorder.events[0].embarazoId, null);
  assert.equal(JSON.stringify(payload).includes('Hospital Destino Sintetico'), false);
});

test('fallo de auditoria revierte la referencia clinica', async () => {
  let stored = null;
  const transaction = [];
  const recorder = privateAuditRecorder({ fail: true });

  await assert.rejects(withService('referencias', {
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
        stored = { id: 1004, ...data };
        return stored;
      },
    },
    audit: recorder.audit,
  }, async (service) => service.guardarReferencia({
    pacienteId: 41,
    body: VALID_REFERENCIA,
    req: ACTOR,
  })), /audit insert failed/);

  assert.equal(stored, null);
  assert.deepEqual(transaction, ['BEGIN', 'ROLLBACK']);
});

test('comunidades, ultimo productor adicional, usa auditoria privada atomica y minima', async () => {
  const recorder = privateAuditRecorder();
  const data = {
    nombre: 'Comunidad Sintetica Secreta',
    territorio: 2,
    sector: 'A',
    lat: 16.1,
    lng: -90.2,
  };

  await withService('comunidades', {
    repository: {
      existeNombre: async () => false,
      crear: async (input) => ({ id: 1201, activo: true, ...input }),
    },
    audit: recorder.audit,
  }, async (service) => service.crearComunidad({ body: data, req: ACTOR }));

  const payload = privatePayload(recorder.events[0], {
    entity: 'comunidad',
    table: 'comunidades',
    action: 'crear',
    id: 1201,
  });
  assert.deepEqual(payload.campos_registrados, [
    'activo',
    'lat',
    'lng',
    'nombre',
    'sector',
    'territorio',
  ]);
  assert.equal(JSON.stringify(payload).includes('Comunidad Sintetica Secreta'), false);

  const stateRecorder = privateAuditRecorder();
  await withService('comunidades', {
    repository: {
      obtenerPorId: async () => ({ id: 1201, activo: true }),
      totalRiesgoActivo: async () => 0,
      actualizarActivo: async () => ({ id: 1201, activo: false }),
    },
    audit: stateRecorder.audit,
  }, async (service) => service.desactivarComunidad({ id: 1201, req: ACTOR }));
  const statePayload = privatePayload(stateRecorder.events[0], {
    entity: 'comunidad',
    table: 'comunidades',
    action: 'estado',
    id: 1201,
  });
  assert.deepEqual(statePayload.cambios, { activo: { anterior: true, nuevo: false } });
});

test('repositorios clinicos y de comunidades confirman, revierten y liberan transacciones', async () => {
  for (const repositoryPath of [
    PUERPERIO_REPOSITORY_PATH,
    REFERENCIAS_REPOSITORY_PATH,
    COMUNIDADES_REPOSITORY_PATH,
  ]) {
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
        throw new Error('write failed');
      }), /write failed/);
    });
    assert.deepEqual(failureCalls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
  }
});
