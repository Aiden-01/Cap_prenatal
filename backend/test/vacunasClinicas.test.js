const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  VACCINE_MOMENTS,
  VACCINE_RULES,
  VACCINE_TYPES,
  addCalendarPeriod,
  expectedMomentForDate,
  gestationalAgeAtDate,
  minimumTdDateBetween,
  validateVaccineType,
} = require('../src/domain/vacunasRules');
const { vacunaSchema, vacunaUpdateSchema } = require('../src/validations/vacunas.schemas');
const { HttpError } = require('../src/utils/httpError');

const SERVICE_PATH = require.resolve('../src/services/vacunasService');
const REPOSITORY_PATH = require.resolve('../src/repositories/vacunasRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');
const PREGNANCIES_PATH = require.resolve('../src/utils/embarazos');
const REQUEST = { usuario: { id: 83 } };

function vaccine(type, dose, date, extra = {}) {
  const defaultMoment = type === VACCINE_TYPES.SPR_SR
    ? VACCINE_MOMENTS.BEFORE_PREGNANCY
    : VACCINE_MOMENTS.DURING_PREGNANCY;
  return {
    id: extra.id,
    paciente_id: extra.paciente_id || 41,
    embarazo_id: Object.prototype.hasOwnProperty.call(extra, 'embarazo_id') ? extra.embarazo_id : 91,
    tipo_vacuna: type,
    momento: extra.momento || defaultMoment,
    numero_dosis: dose,
    fecha_dosis: date,
  };
}

function pregnancy(id = 91, extra = {}) {
  return {
    id,
    paciente_id: 41,
    estado: 'activo',
    fur: '2026-01-01',
    fecha_inicio: '2026-01-01',
    fecha_cierre: null,
    ...extra,
  };
}

function validate(type, history, pregnancies = []) {
  return validateVaccineType({ type, history, pregnancies });
}

function rejectsCode(operation, code) {
  assert.throws(operation, (error) => error.code === code);
}

test('periodos clínicos usan calendario y conservan edad gestacional exacta', () => {
  assert.equal(addCalendarPeriod('2026-01-31', { months: 1 }), '2026-02-28');
  assert.equal(addCalendarPeriod('2024-02-29', { years: 10 }), '2034-02-28');
  assert.equal(minimumTdDateBetween('2020-01-31', 1, 3), '2020-08-29');
  assert.deepEqual(gestationalAgeAtDate('2026-01-01', '2026-05-20'), {
    totalDays: 139,
    weeks: 19,
    days: 6,
  });
});

for (const position of [1, 2, 3, 4, 5]) {
  test(`TD permite que el primer registro local sea la posición ${position}`, () => {
    validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, position, '2026-06-01')]);
  });

  test(`TD rechaza duplicado de la posición ${position}`, () => {
    rejectsCode(() => validate(VACCINE_TYPES.TD, [
      vaccine(VACCINE_TYPES.TD, position, '2026-06-01', { id: 1 }),
      vaccine(VACCINE_TYPES.TD, position, '2027-06-01', { id: 2 }),
    ]), 'TD_POSITION_ALREADY_EXISTS');
  });
}

test('TD valida Dosis 1 y Dosis 3 con intervalo acumulado válido', () => {
  validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 1, '2020-01-31', { id: 1 }),
    vaccine(VACCINE_TYPES.TD, 3, '2020-08-29', { id: 3 }),
  ]);
});

test('TD rechaza Dosis 1 y Dosis 3 con intervalo acumulado inválido y datos estructurados', () => {
  assert.throws(() => validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 1, '2020-01-31', { id: 1 }),
    vaccine(VACCINE_TYPES.TD, 3, '2020-08-28', { id: 3 }),
  ]), (error) => {
    assert.equal(error.code, 'TD_POSITION_INTERVAL_NOT_MET');
    assert.equal(error.details.from_position, 1);
    assert.equal(error.details.to_position, 3);
    assert.equal(error.details.minimum_date, '2020-08-29');
    return true;
  });
});

test('TD acumula seis meses y diez años entre Dosis 2 y Refuerzo 1', () => {
  validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 2, '2020-02-29', { id: 2 }),
    vaccine(VACCINE_TYPES.TD, 4, '2030-08-29', { id: 4 }),
  ]);
  rejectsCode(() => validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 2, '2020-02-29', { id: 2 }),
    vaccine(VACCINE_TYPES.TD, 4, '2030-08-28', { id: 4 }),
  ]), 'TD_POSITION_INTERVAL_NOT_MET');
});

test('TD permite agregar retroactivamente una posición anterior válida', () => {
  const partial = [
    vaccine(VACCINE_TYPES.TD, 2, '2020-02-29', { id: 2 }),
    vaccine(VACCINE_TYPES.TD, 3, '2020-08-29', { id: 3 }),
  ];
  validate(VACCINE_TYPES.TD, partial);
  validate(VACCINE_TYPES.TD, [
    ...partial,
    vaccine(VACCINE_TYPES.TD, 1, '2020-01-29', { id: 1 }),
  ]);
});

test('TD revalida toda la cronología al agregar una posición anterior incompatible', () => {
  rejectsCode(() => validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 2, '2020-02-29', { id: 2 }),
    vaccine(VACCINE_TYPES.TD, 3, '2020-08-29', { id: 3 }),
    vaccine(VACCINE_TYPES.TD, 1, '2020-02-01', { id: 1 }),
  ]), 'TD_DOSE_2_INTERVAL_NOT_MET');
});

test('TD acepta huecos y no exige Dosis 1 para conservar Dosis 3', () => {
  validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, 3, '2026-06-01')]);
});

test('SR/SPR permite iniciar desde Dosis 1 o Dosis 2', () => {
  validate(VACCINE_TYPES.SPR_SR, [vaccine(VACCINE_TYPES.SPR_SR, 1, '2025-01-31')]);
  validate(VACCINE_TYPES.SPR_SR, [vaccine(VACCINE_TYPES.SPR_SR, 2, '2025-02-28')]);
});

for (const position of [1, 2]) {
  test(`SR/SPR rechaza duplicado de la posición ${position}`, () => {
    rejectsCode(() => validate(VACCINE_TYPES.SPR_SR, [
      vaccine(VACCINE_TYPES.SPR_SR, position, '2025-01-01', { id: 1 }),
      vaccine(VACCINE_TYPES.SPR_SR, position, '2025-02-01', { id: 2 }),
    ]), 'SPR_SR_POSITION_ALREADY_EXISTS');
  });
}

test('SR/SPR valida un mes calendario cuando ambas posiciones constan', () => {
  validate(VACCINE_TYPES.SPR_SR, [
    vaccine(VACCINE_TYPES.SPR_SR, 1, '2025-01-31', { id: 1 }),
    vaccine(VACCINE_TYPES.SPR_SR, 2, '2025-02-28', { id: 2 }),
  ]);
  rejectsCode(() => validate(VACCINE_TYPES.SPR_SR, [
    vaccine(VACCINE_TYPES.SPR_SR, 1, '2025-01-31', { id: 1 }),
    vaccine(VACCINE_TYPES.SPR_SR, 2, '2025-02-27', { id: 2 }),
  ]), 'SPR_SR_DOSE_2_INTERVAL_NOT_MET');
});

test('momento previo al embarazo acepta fecha anterior y rechaza contradicción', () => {
  const current = pregnancy();
  validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, 2, '2025-12-31', {
    momento: VACCINE_MOMENTS.BEFORE_PREGNANCY,
  })], [current]);
  rejectsCode(() => validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, 2, '2026-02-01', {
    momento: VACCINE_MOMENTS.BEFORE_PREGNANCY,
  })], [current]), 'VACCINE_MOMENT_DATE_MISMATCH');
});

test('momento durante embarazo acepta fecha dentro del período', () => {
  const current = pregnancy();
  assert.equal(expectedMomentForDate(current, '2026-06-01'), VACCINE_MOMENTS.DURING_PREGNANCY);
  validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, 3, '2026-06-01')], [current]);
});

test('SR/SPR rechaza selección durante embarazo y permite postparto', () => {
  rejectsCode(() => validate(VACCINE_TYPES.SPR_SR, [
    vaccine(VACCINE_TYPES.SPR_SR, 2, '2026-06-01', { momento: VACCINE_MOMENTS.DURING_PREGNANCY }),
  ], [pregnancy()]), 'SPR_SR_DURING_PREGNANCY');

  const puerperium = pregnancy(91, { estado: 'puerperio', fecha_cierre: '2026-10-01' });
  validate(VACCINE_TYPES.SPR_SR, [
    vaccine(VACCINE_TYPES.SPR_SR, 2, '2026-10-01', { momento: VACCINE_MOMENTS.POSTPARTUM }),
  ], [puerperium]);
});

test('Tdap durante embarazo rechaza 19+6 y acepta desde 20 semanas', () => {
  rejectsCode(() => validate(VACCINE_TYPES.TDAP, [
    vaccine(VACCINE_TYPES.TDAP, 1, '2026-05-20'),
  ], [pregnancy()]), 'TDAP_BEFORE_20_WEEKS');
  validate(VACCINE_TYPES.TDAP, [
    vaccine(VACCINE_TYPES.TDAP, 1, '2026-05-21'),
  ], [pregnancy()]);
});

test('Tdap previa no consume la aplicación durante el embarazo actual', () => {
  validate(VACCINE_TYPES.TDAP, [
    vaccine(VACCINE_TYPES.TDAP, 1, '2025-10-01', { id: 1, momento: VACCINE_MOMENTS.BEFORE_PREGNANCY }),
    vaccine(VACCINE_TYPES.TDAP, 1, '2026-05-21', { id: 2 }),
  ], [pregnancy()]);
});

test('Tdap mantiene una aplicación durante o después de cada embarazo', () => {
  rejectsCode(() => validate(VACCINE_TYPES.TDAP, [
    vaccine(VACCINE_TYPES.TDAP, 1, '2026-05-21', { id: 1 }),
    vaccine(VACCINE_TYPES.TDAP, 1, '2026-10-01', { id: 2, momento: VACCINE_MOMENTS.POSTPARTUM }),
  ], [pregnancy(91, { estado: 'puerperio', fecha_cierre: '2026-10-01' })]), 'TDAP_ALREADY_EXISTS');
});

test('postparto acepta fecha de cierre y rechaza fecha anterior', () => {
  const closed = pregnancy(91, { estado: 'puerperio', fecha_cierre: '2026-10-01' });
  validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 4, '2026-10-01', { momento: VACCINE_MOMENTS.POSTPARTUM }),
  ], [closed]);
  rejectsCode(() => validate(VACCINE_TYPES.TD, [
    vaccine(VACCINE_TYPES.TD, 4, '2026-09-30', { momento: VACCINE_MOMENTS.POSTPARTUM }),
  ], [closed]), 'VACCINE_POSTPARTUM_DATE_BEFORE_CLOSE');
});

test('datos insuficientes conservan el momento seleccionado sin inventar contexto', () => {
  const incomplete = pregnancy(91, { fur: null, fecha_inicio: null, fecha_cierre: null });
  validate(VACCINE_TYPES.TD, [vaccine(VACCINE_TYPES.TD, 3, '2026-06-01')], [incomplete]);
  validate(VACCINE_TYPES.TDAP, [vaccine(VACCINE_TYPES.TDAP, 1, '2026-06-01')], [incomplete]);
  const puerperiumWithoutClose = pregnancy(91, { estado: 'puerperio', fecha_cierre: null });
  validate(VACCINE_TYPES.TDAP, [vaccine(VACCINE_TYPES.TDAP, 1, '2026-10-01', {
    momento: VACCINE_MOMENTS.POSTPARTUM,
  })], [puerperiumWithoutClose]);
});

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

async function withClinicalService({ initialHistory = [], pregnancies = [pregnancy()] } = {}, callback) {
  let history = [...initialHistory];
  let nextId = 100;
  let transactionTail = Promise.resolve();
  const auditEvents = [];
  const repository = {
    async enTransaccion(operation) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await operation({ transaction: true });
      } finally {
        release();
      }
    },
    bloquearPaciente: async (pacienteId) => ({ id: pacienteId }),
    listarHistoriaClinica: async () => [...history],
    listarEmbarazosPaciente: async () => pregnancies,
    obtenerPorId: async (id) => history.find((item) => String(item.id) === String(id)) || null,
    obtenerPorDosis: async () => null,
    insertar: async (data) => {
      const row = { id: nextId, ...data };
      nextId += 1;
      history.push(row);
      return row;
    },
    upsert: async (data) => {
      const row = { id: nextId, ...data };
      nextId += 1;
      history.push(row);
      return row;
    },
    actualizar: async ({ id, data }) => {
      const index = history.findIndex((item) => String(item.id) === String(id));
      if (index === -1) return null;
      history[index] = { ...history[index], ...data };
      return history[index];
    },
    eliminar: async ({ id }) => {
      const index = history.findIndex((item) => String(item.id) === String(id));
      if (index === -1) return { vacuna: null, rowCount: 0 };
      const [removed] = history.splice(index, 1);
      return { vacuna: removed, rowCount: 1 };
    },
  };
  const restores = [
    cacheModule(REPOSITORY_PATH, repository),
    cacheModule(AUDIT_PATH, { registrarEventoPrivado: async (_req, event) => { auditEvents.push(event); } }),
    cacheModule(PREGNANCIES_PATH, {
      requerirEmbarazoId: (value) => value,
      resolverEmbarazoParaLectura: async () => pregnancies[0],
      validarEmbarazoEditable: async ({ embarazoId }) => {
        const selected = pregnancies.find((item) => String(item.id) === String(embarazoId));
        if (!selected) throw new HttpError(404, 'Embarazo no encontrado', { code: 'PREGNANCY_NOT_FOUND' });
        if (selected.estado === 'cerrado') throw new HttpError(409, 'Solo lectura', { code: 'PREGNANCY_READ_ONLY' });
        return selected;
      },
    }),
  ];
  const previousService = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];
  try {
    return await callback(require(SERVICE_PATH), () => [...history], auditEvents);
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previousService) require.cache[SERVICE_PATH] = previousService;
    restores.reverse().forEach((restore) => restore());
  }
}

test('editar una fecha no puede romper la cronología parcial TD', async () => {
  const initialHistory = [
    vaccine(VACCINE_TYPES.TD, 1, '2026-01-01', { id: 1 }),
    vaccine(VACCINE_TYPES.TD, 3, '2026-08-01', { id: 3 }),
  ];
  await withClinicalService({ initialHistory }, async (service, history) => {
    await assert.rejects(service.actualizarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 3,
      body: { fecha_dosis: '2026-07-31' },
      req: REQUEST,
    }), (error) => error.code === 'TD_POSITION_INTERVAL_NOT_MET');
    assert.equal(history().find((item) => item.id === 3).fecha_dosis, '2026-08-01');
  });
});

test('editar posición y momento revalida y persiste únicamente cambios válidos', async () => {
  const initialHistory = [vaccine(VACCINE_TYPES.TD, 2, '2025-12-01', {
    id: 2,
    momento: VACCINE_MOMENTS.BEFORE_PREGNANCY,
  })];
  await withClinicalService({ initialHistory }, async (service, history, audits) => {
    const updated = await service.actualizarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 2,
      body: { numero_dosis: 3, momento: VACCINE_MOMENTS.BEFORE_PREGNANCY },
      req: REQUEST,
    });
    assert.equal(updated.numero_dosis, 3);
    assert.equal(history()[0].momento, VACCINE_MOMENTS.BEFORE_PREGNANCY);
    assert.equal(audits.length, 1);
  });
});

test('cambiar el embarazo relacionado revalida el contexto y audita el destino', async () => {
  const initialHistory = [vaccine(VACCINE_TYPES.TD, 2, '2027-06-01', { id: 2 })];
  const pregnancies = [
    pregnancy(91),
    pregnancy(92, { fur: '2027-01-01', fecha_inicio: '2027-01-01' }),
  ];
  await withClinicalService({ initialHistory, pregnancies }, async (service, history, audits) => {
    const updated = await service.actualizarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 2,
      body: { embarazo_id: 92 },
      req: REQUEST,
    });
    assert.equal(updated.embarazo_id, 92);
    assert.equal(history()[0].embarazo_id, 92);
    assert.equal(audits[0].embarazoId, 92);
  });
});

test('eliminar una posición conserva una historia parcial válida', async () => {
  const initialHistory = [
    vaccine(VACCINE_TYPES.TD, 1, '2026-01-01', { id: 1 }),
    vaccine(VACCINE_TYPES.TD, 3, '2026-08-01', { id: 3 }),
  ];
  await withClinicalService({ initialHistory }, async (service, history) => {
    assert.deepEqual(await service.eliminarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 1,
      req: REQUEST,
    }), { message: 'Vacuna eliminada' });
    assert.deepEqual(history().map((item) => item.numero_dosis), [3]);
  });
});

test('dos solicitudes concurrentes para la misma posición TD dejan un solo registro', async () => {
  await withClinicalService({}, async (service, history) => {
    const input = {
      pacienteId: 41,
      embarazoId: 91,
      body: vaccine(VACCINE_TYPES.TD, 3, '2026-06-01'),
      req: REQUEST,
    };
    const results = await Promise.allSettled([service.guardarVacuna(input), service.guardarVacuna(input)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'TD_POSITION_ALREADY_EXISTS');
    assert.equal(history().filter((item) => item.numero_dosis === 3).length, 1);
  });
});

test('Influenza inserta aplicaciones independientes con valor interno 1', async () => {
  const pregnancies = [
    pregnancy(91),
    pregnancy(92, { fur: '2027-01-01', fecha_inicio: '2027-01-01' }),
  ];
  await withClinicalService({ pregnancies }, async (service, history) => {
    const inputs = [
      { embarazoId: 91, momento: VACCINE_MOMENTS.BEFORE_PREGNANCY, fecha_dosis: '2025-12-01' },
      { embarazoId: 91, momento: VACCINE_MOMENTS.DURING_PREGNANCY, fecha_dosis: '2026-06-01' },
      { embarazoId: 91, momento: VACCINE_MOMENTS.DURING_PREGNANCY, fecha_dosis: '2026-07-01' },
      { embarazoId: 92, momento: VACCINE_MOMENTS.DURING_PREGNANCY, fecha_dosis: '2027-06-01' },
    ];
    const created = [];
    for (const input of inputs) {
      created.push(await service.guardarVacuna({
        pacienteId: 41,
        embarazoId: input.embarazoId,
        body: {
          tipo_vacuna: VACCINE_TYPES.INFLUENZA,
          momento: input.momento,
          numero_dosis: 1,
          fecha_dosis: input.fecha_dosis,
        },
        req: REQUEST,
      }));
    }

    assert.equal(new Set(created.map(({ id }) => id)).size, 4);
    assert.equal(history().length, 4);
    assert.ok(history().every(({ numero_dosis }) => numero_dosis === 1));
    assert.equal(history().filter(({ embarazo_id }) => embarazo_id === 91).length, 3);
    assert.equal(history().filter(({ fecha_dosis }) => fecha_dosis.startsWith('2026')).length, 2);
  });
});

test('Influenza edita y elimina únicamente el registro seleccionado por ID', async () => {
  const initialHistory = [
    vaccine(VACCINE_TYPES.INFLUENZA, 1, '2026-06-01', { id: 1 }),
    vaccine(VACCINE_TYPES.INFLUENZA, 1, '2026-07-01', { id: 2 }),
    vaccine(VACCINE_TYPES.INFLUENZA, 1, '2026-08-01', { id: 3 }),
  ];
  await withClinicalService({ initialHistory }, async (service, history) => {
    const updated = await service.actualizarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 2,
      body: { fecha_dosis: '2026-07-15' },
      req: REQUEST,
    });
    assert.equal(updated.id, 2);
    assert.equal(updated.fecha_dosis, '2026-07-15');
    assert.equal(history().find(({ id }) => id === 1).fecha_dosis, '2026-06-01');
    assert.equal(history().find(({ id }) => id === 3).fecha_dosis, '2026-08-01');

    await service.eliminarVacuna({
      pacienteId: 41,
      embarazoId: 91,
      id: 2,
      req: REQUEST,
    });
    assert.deepEqual(history().map(({ id }) => id), [1, 3]);
  });
});

test('validadores requieren posición explícita y permiten editar embarazo relacionado', () => {
  assert.equal(vacunaSchema.safeParse({
    tipo_vacuna: VACCINE_TYPES.TD,
    momento: VACCINE_MOMENTS.DURING_PREGNANCY,
    fecha_dosis: '2026-06-01',
  }).success, false);
  assert.equal(vacunaUpdateSchema.safeParse({ embarazo_id: 92 }).success, false);
  assert.equal(vacunaUpdateSchema.safeParse({
    tipo_vacuna: VACCINE_TYPES.TD,
    momento: VACCINE_MOMENTS.DURING_PREGNANCY,
    embarazo_id: 92,
  }).success, true);
  assert.equal(vacunaSchema.safeParse({
    tipo_vacuna: VACCINE_TYPES.INFLUENZA,
    momento: VACCINE_MOMENTS.DURING_PREGNANCY,
    numero_dosis: 2,
    fecha_dosis: '2026-06-01',
  }).success, false);
});

test('migración 011 libera únicamente aplicaciones de Influenza', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../src/db/migrations/011_vax4_influenza_aplicaciones_independientes.sql'
  ), 'utf8');
  assert.match(migration, /DROP INDEX IF EXISTS ux_vacunas_embarazo_dosis/);
  assert.match(migration, /tipo_vacuna = 'influenza' AND numero_dosis = 1/);
  assert.match(migration, /SET numero_dosis = 1/);
  assert.doesNotMatch(migration, /DROP INDEX IF EXISTS ux_vacunas_td_paciente_posicion/);
  assert.doesNotMatch(migration, /DROP INDEX IF EXISTS ux_vacunas_spr_sr_paciente_posicion/);
  assert.doesNotMatch(migration, /DROP INDEX IF EXISTS ux_vacunas_tdap_embarazo/);
  assert.doesNotMatch(migration, /DELETE FROM vacunas_paciente/);
});

test('migración 010 protege posiciones por paciente y limita Tdap clínica por embarazo', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '../src/db/migrations/010_vax31_historias_parciales.sql'
  ), 'utf8');
  assert.match(migration, /ux_vacunas_td_paciente_posicion/);
  assert.match(migration, /ux_vacunas_spr_sr_paciente_posicion/);
  assert.match(migration, /DROP INDEX IF EXISTS ux_vacunas_tdap_embarazo/);
  assert.match(migration, /momento IN \('durante_embarazo', 'postparto_aborto'\)/);
  assert.doesNotMatch(migration, /DELETE FROM vacunas_paciente/);
});

test('schema nuevo conserva los tres momentos oficiales y los índices VAX-3.1', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  assert.match(schema, /momento IN \('previo_embarazo','durante_embarazo','postparto_aborto'\)/);
  assert.match(schema, /ux_vacunas_td_paciente_posicion/);
  assert.match(schema, /ux_vacunas_spr_sr_paciente_posicion/);
  assert.match(schema, /momento IN \('durante_embarazo', 'postparto_aborto'\)/);
  assert.match(schema, /tipo_vacuna = 'influenza' AND numero_dosis = 1/);
  assert.match(schema, /DROP INDEX IF EXISTS ux_vacunas_embarazo_dosis/);
  assert.doesNotMatch(schema, /CREATE UNIQUE INDEX IF NOT EXISTS ux_vacunas_embarazo_dosis/);
});

test('repositorio mantiene bloqueo de paciente e historia longitudinal completa', () => {
  const source = fs.readFileSync(REPOSITORY_PATH, 'utf8');
  assert.match(source, /SELECT id FROM pacientes WHERE id = \$1 FOR UPDATE/);
  assert.match(source, /WHERE paciente_id = \$1 AND tipo_vacuna IN \('td', 'tdap', 'spr_sr'\)/);
  assert.match(source, /ORDER BY fecha_dosis ASC NULLS LAST, id ASC/);
});

test('reglas conservan catálogo clínico sin combinar TD y Tdap', () => {
  const obsoleteType = ['td', 'tdap'].join('_');
  assert.equal(Object.values(VACCINE_TYPES).includes(obsoleteType), false);
  assert.equal(VACCINE_RULES[VACCINE_TYPES.TD].maximum, 5);
  assert.equal(VACCINE_RULES[VACCINE_TYPES.SPR_SR].maximum, 2);
});
