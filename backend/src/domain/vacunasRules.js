const { HttpError } = require('../utils/httpError');

const DAY_MS = 24 * 60 * 60 * 1000;

const VACCINE_TYPES = Object.freeze({
  TD: 'td',
  TDAP: 'tdap',
  INFLUENZA: 'influenza',
  SPR_SR: 'spr_sr',
});

const VACCINE_MOMENTS = Object.freeze({
  BEFORE_PREGNANCY: 'previo_embarazo',
  DURING_PREGNANCY: 'durante_embarazo',
  POSTPARTUM: 'postparto_aborto',
});

const VACCINE_RULES = Object.freeze({
  [VACCINE_TYPES.TD]: Object.freeze({
    scope: 'patient',
    maximum: 5,
    writablePregnancyStates: Object.freeze(['activo', 'puerperio']),
    sequence: Object.freeze([
      Object.freeze({ position: 1, label: 'Dosis 1', minimumInterval: null }),
      Object.freeze({ position: 2, label: 'Dosis 2', minimumInterval: Object.freeze({ months: 1 }) }),
      Object.freeze({ position: 3, label: 'Dosis 3', minimumInterval: Object.freeze({ months: 6 }) }),
      Object.freeze({ position: 4, label: 'Refuerzo 1', minimumInterval: Object.freeze({ years: 10 }) }),
      Object.freeze({ position: 5, label: 'Refuerzo 2', minimumInterval: Object.freeze({ years: 10 }) }),
    ]),
  }),
  [VACCINE_TYPES.TDAP]: Object.freeze({
    scope: 'pregnancy',
    maximum: 1,
    sequence: Object.freeze([1]),
    writablePregnancyStates: Object.freeze(['activo', 'puerperio']),
    allowedApplicationContexts: Object.freeze(['pregnancy', 'puerperium']),
    minimumGestationalDays: 20 * 7,
    activeMoment: VACCINE_MOMENTS.DURING_PREGNANCY,
    puerperiumMoment: VACCINE_MOMENTS.POSTPARTUM,
  }),
  [VACCINE_TYPES.SPR_SR]: Object.freeze({
    scope: 'patient',
    maximum: 2,
    sequence: Object.freeze([1, 2]),
    writablePregnancyStates: Object.freeze(['activo', 'puerperio']),
    forbiddenApplicationState: 'pregnancy',
    minimumInterval: Object.freeze({ months: 1 }),
  }),
});

const TD_INTERVAL_ERRORS = Object.freeze({
  2: Object.freeze({
    code: 'TD_DOSE_2_INTERVAL_NOT_MET',
    message: 'La segunda dosis de TD requiere al menos un mes desde la primera.',
  }),
  3: Object.freeze({
    code: 'TD_DOSE_3_INTERVAL_NOT_MET',
    message: 'La tercera dosis de TD requiere al menos seis meses desde la segunda.',
  }),
  4: Object.freeze({
    code: 'TD_BOOSTER_1_INTERVAL_NOT_MET',
    message: 'El primer refuerzo de TD requiere diez años desde la tercera dosis.',
  }),
  5: Object.freeze({
    code: 'TD_BOOSTER_2_INTERVAL_NOT_MET',
    message: 'El segundo refuerzo de TD requiere diez años desde el primer refuerzo.',
  }),
});

function clinicalError(message, code, details = undefined) {
  return new HttpError(409, message, { code, details });
}

function parseClinicalDate(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  return date;
}

function formatClinicalDate(date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarPeriod(value, { months = 0, years = 0 } = {}) {
  const source = parseClinicalDate(value);
  if (!source) return null;
  const sourceYear = source.getUTCFullYear();
  const sourceMonth = source.getUTCMonth();
  const sourceDay = source.getUTCDate();
  const absoluteMonth = sourceMonth + months + (years * 12);
  const targetYear = sourceYear + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatClinicalDate(new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(sourceDay, lastTargetDay)
  )));
}

function gestationalAgeAtDate(fur, applicationDate) {
  const furDate = parseClinicalDate(fur);
  const targetDate = parseClinicalDate(applicationDate);
  if (!furDate || !targetDate) return null;
  const totalDays = Math.floor((targetDate.getTime() - furDate.getTime()) / DAY_MS);
  if (totalDays < 0) return null;
  return {
    totalDays,
    weeks: Math.floor(totalDays / 7),
    days: totalDays % 7,
  };
}

function requireClinicalDates(records, type) {
  for (const record of records) {
    if (!parseClinicalDate(record.fecha_dosis)) {
      throw clinicalError(
        `La fecha de aplicación es obligatoria para ${type === VACCINE_TYPES.SPR_SR ? 'SR/SPR' : type.toUpperCase()}.`,
        'VACCINE_APPLICATION_DATE_REQUIRED',
        { vaccine_type: type }
      );
    }
  }
}

function vaccineName(type) {
  if (type === VACCINE_TYPES.SPR_SR) return 'SR/SPR';
  if (type === VACCINE_TYPES.TDAP) return 'Tdap';
  return 'TD';
}

function doseLabel(type, position) {
  if (type === VACCINE_TYPES.TD) {
    return VACCINE_RULES[type].sequence[Number(position) - 1]?.label || `Posición ${position}`;
  }
  if (type === VACCINE_TYPES.TDAP) return 'Dosis única del embarazo';
  return `Dosis ${position}`;
}

function validateUniquePositions(records, type) {
  const positions = new Map();
  for (const record of records) {
    const position = Number(record.numero_dosis);
    if (positions.has(position)) {
      throw clinicalError(
        `Ya existe una ${doseLabel(type, position)} de ${vaccineName(type)} para esta paciente.`,
        `${type === VACCINE_TYPES.SPR_SR ? 'SPR_SR' : 'TD'}_POSITION_ALREADY_EXISTS`,
        {
          vaccine_type: type,
          duplicate_position: position,
          existing_record_id: positions.get(position).id || null,
          candidate_record_id: record.id || null,
        }
      );
    }
    positions.set(position, record);
  }
}

function minimumTdDateBetween(applicationDate, fromPosition, toPosition) {
  let minimumDate = applicationDate;
  for (let position = Number(fromPosition) + 1; position <= Number(toPosition); position += 1) {
    minimumDate = addCalendarPeriod(
      minimumDate,
      VACCINE_RULES[VACCINE_TYPES.TD].sequence[position - 1].minimumInterval
    );
  }
  return minimumDate;
}

function validateTd(records) {
  const rule = VACCINE_RULES[VACCINE_TYPES.TD];
  requireClinicalDates(records, VACCINE_TYPES.TD);
  validateUniquePositions(records, VACCINE_TYPES.TD);
  if (records.length > rule.maximum) {
    throw clinicalError(
      'La paciente ya completó el esquema máximo de TD.',
      'TD_MAXIMUM_REACHED',
      { maximum: rule.maximum }
    );
  }
  const ordered = [...records].sort((left, right) => (
    Number(left.numero_dosis) - Number(right.numero_dosis)
  ));

  for (let fromIndex = 0; fromIndex < ordered.length; fromIndex += 1) {
    for (let toIndex = fromIndex + 1; toIndex < ordered.length; toIndex += 1) {
      const previous = ordered[fromIndex];
      const next = ordered[toIndex];
      const fromPosition = Number(previous.numero_dosis);
      const toPosition = Number(next.numero_dosis);
      const minimumDate = minimumTdDateBetween(previous.fecha_dosis, fromPosition, toPosition);
      if (next.fecha_dosis >= minimumDate) continue;
      const adjacentError = toPosition === fromPosition + 1
        ? TD_INTERVAL_ERRORS[toPosition]
        : null;
      throw clinicalError(
        adjacentError?.message
          || `La fecha de ${doseLabel(VACCINE_TYPES.TD, toPosition)} no respeta el intervalo mínimo respecto de ${doseLabel(VACCINE_TYPES.TD, fromPosition)}.`,
        adjacentError?.code || 'TD_POSITION_INTERVAL_NOT_MET',
        {
          vaccine_type: VACCINE_TYPES.TD,
          expected_dose: toPosition,
          from_position: fromPosition,
          to_position: toPosition,
          minimum_date: minimumDate,
          previous_date: previous.fecha_dosis,
          previous_record_id: previous.id || null,
          candidate_record_id: next.id || null,
        }
      );
    }
  }
}

function expectedMomentForDate(pregnancy, applicationDate) {
  const target = parseClinicalDate(applicationDate);
  if (!target || !pregnancy) return null;
  const start = parseClinicalDate(pregnancy.fur || pregnancy.fecha_inicio);
  const close = parseClinicalDate(pregnancy.fecha_cierre);
  if (close && target.getTime() >= close.getTime()) return VACCINE_MOMENTS.POSTPARTUM;
  if (start && target.getTime() < start.getTime()) return VACCINE_MOMENTS.BEFORE_PREGNANCY;
  if (start && (close || pregnancy.estado === 'activo')) return VACCINE_MOMENTS.DURING_PREGNANCY;
  return null;
}

function validateOfficialMoment(record, pregnancy) {
  if (!pregnancy || !parseClinicalDate(record.fecha_dosis)) return;
  const expectedMoment = expectedMomentForDate(pregnancy, record.fecha_dosis);
  if (!expectedMoment) {
    if (record.momento === VACCINE_MOMENTS.POSTPARTUM && pregnancy.estado === 'activo') {
      throw clinicalError(
        'El embarazo relacionado continúa activo; no puede registrarse todavía como postparto/aborto.',
        'VACCINE_MOMENT_STATE_MISMATCH',
        {
          application_date: record.fecha_dosis,
          selected_moment: record.momento,
          expected_moment: VACCINE_MOMENTS.DURING_PREGNANCY,
          pregnancy_id: pregnancy.id,
        }
      );
    }
    return;
  }
  if (expectedMoment === record.momento) return;
  const details = {
    application_date: record.fecha_dosis,
    selected_moment: record.momento,
    expected_moment: expectedMoment,
    pregnancy_id: pregnancy.id,
    pregnancy_start: pregnancy.fur || pregnancy.fecha_inicio || null,
    pregnancy_close: pregnancy.fecha_cierre || null,
  };
  if (record.momento === VACCINE_MOMENTS.POSTPARTUM && pregnancy.fecha_cierre) {
    throw clinicalError(
      'La fecha postparto/aborto debe ser igual o posterior al cierre del embarazo.',
      'VACCINE_POSTPARTUM_DATE_BEFORE_CLOSE',
      details
    );
  }
  throw clinicalError(
    'El momento seleccionado no coincide con la fecha del embarazo relacionado.',
    'VACCINE_MOMENT_DATE_MISMATCH',
    details
  );
}

function validateOfficialMoments(records, pregnancies) {
  const pregnancyById = new Map(pregnancies.map((pregnancy) => [String(pregnancy.id), pregnancy]));
  records.forEach((record) => {
    validateOfficialMoment(record, pregnancyById.get(String(record.embarazo_id || '')));
  });
}

function pregnancyWindowState(pregnancy, applicationDate) {
  const expectedMoment = expectedMomentForDate(pregnancy, applicationDate);
  if (expectedMoment === VACCINE_MOMENTS.DURING_PREGNANCY) return 'pregnant';
  if (expectedMoment) return 'outside';
  return 'indeterminate';
}

function validateSprClinicalContext(record, pregnancies) {
  if (record.momento === VACCINE_MOMENTS.DURING_PREGNANCY) {
    throw clinicalError(
      'SR/SPR no puede registrarse como aplicada durante el embarazo.',
      'SPR_SR_DURING_PREGNANCY',
      {
        application_date: record.fecha_dosis,
        selected_moment: record.momento,
        pregnancy_id: record.embarazo_id || null,
      }
    );
  }
  for (const pregnancy of pregnancies) {
    if (pregnancyWindowState(pregnancy, record.fecha_dosis) === 'pregnant') {
      throw clinicalError(
        'SR/SPR no puede administrarse durante el embarazo.',
        'SPR_SR_DURING_PREGNANCY',
        { application_date: record.fecha_dosis, pregnancy_id: pregnancy.id }
      );
    }
  }
}

function validateSpr(records, pregnancies) {
  const rule = VACCINE_RULES[VACCINE_TYPES.SPR_SR];
  requireClinicalDates(records, VACCINE_TYPES.SPR_SR);
  validateUniquePositions(records, VACCINE_TYPES.SPR_SR);
  if (records.length > rule.maximum) {
    throw clinicalError(
      'La paciente ya alcanzó el máximo de dos dosis de SR/SPR.',
      'SPR_SR_MAXIMUM_REACHED',
      { maximum: rule.maximum }
    );
  }
  const first = records.find((record) => Number(record.numero_dosis) === 1);
  const second = records.find((record) => Number(record.numero_dosis) === 2);
  if (first && second) {
    const minimumDate = addCalendarPeriod(first.fecha_dosis, rule.minimumInterval);
    if (second.fecha_dosis < minimumDate) {
      throw clinicalError(
        'La segunda dosis de SR/SPR requiere al menos un mes desde la primera.',
        'SPR_SR_DOSE_2_INTERVAL_NOT_MET',
        {
          vaccine_type: VACCINE_TYPES.SPR_SR,
          expected_dose: 2,
          from_position: 1,
          to_position: 2,
          minimum_date: minimumDate,
          previous_date: first.fecha_dosis,
        }
      );
    }
  }
  records.forEach((record) => validateSprClinicalContext(record, pregnancies));
}

function validateTdapRecord(record, pregnancy) {
  if (Number(record.numero_dosis) !== 1) {
    throw clinicalError(
      'Tdap admite una única aplicación por embarazo y debe registrarse como dosis 1.',
      'TDAP_DOSE_INVALID',
      { expected_dose: 1, received_dose: Number(record.numero_dosis) }
    );
  }
  if (record.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY) return;
  if (!pregnancy) {
    throw clinicalError(
      'La Tdap durante el embarazo o postparto debe estar asociada al embarazo correspondiente.',
      'TDAP_PREGNANCY_REQUIRED',
      { pregnancy_id: record.embarazo_id || null, selected_moment: record.momento }
    );
  }
  if (record.momento === VACCINE_MOMENTS.POSTPARTUM) return;
  const age = gestationalAgeAtDate(pregnancy.fur, record.fecha_dosis);
  if (age && age.totalDays < VACCINE_RULES[VACCINE_TYPES.TDAP].minimumGestationalDays) {
    throw clinicalError(
      'Tdap solo puede administrarse desde las 20 semanas durante el embarazo.',
      'TDAP_BEFORE_20_WEEKS',
      {
        pregnancy_id: pregnancy.id,
        application_date: record.fecha_dosis,
        gestational_weeks: age.weeks,
        gestational_days: age.days,
        minimum_gestational_weeks: 20,
      }
    );
  }
}

function validateTdap(records, pregnancies) {
  requireClinicalDates(records, VACCINE_TYPES.TDAP);
  const pregnancyById = new Map(pregnancies.map((pregnancy) => [String(pregnancy.id), pregnancy]));
  const counts = new Map();
  for (const record of records) {
    validateTdapRecord(record, pregnancyById.get(String(record.embarazo_id || '')));
    if (record.momento === VACCINE_MOMENTS.BEFORE_PREGNANCY) continue;
    const key = String(record.embarazo_id || '');
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > VACCINE_RULES[VACCINE_TYPES.TDAP].maximum) {
      throw clinicalError(
        'Ya existe una aplicación de Tdap durante o después de este embarazo.',
        'TDAP_ALREADY_EXISTS',
        { pregnancy_id: record.embarazo_id, maximum: 1 }
      );
    }
  }
}

function validateVaccineType({ type, history, pregnancies = [] }) {
  const records = history.filter((record) => record.tipo_vacuna === type);
  validateOfficialMoments(records, pregnancies);
  if (type === VACCINE_TYPES.TD) return validateTd(records);
  if (type === VACCINE_TYPES.TDAP) return validateTdap(records, pregnancies);
  if (type === VACCINE_TYPES.SPR_SR) return validateSpr(records, pregnancies);
  return undefined;
}

module.exports = {
  VACCINE_MOMENTS,
  VACCINE_RULES,
  VACCINE_TYPES,
  addCalendarPeriod,
  expectedMomentForDate,
  gestationalAgeAtDate,
  minimumTdDateBetween,
  parseClinicalDate,
  pregnancyWindowState,
  validateOfficialMoment,
  validateVaccineType,
};
