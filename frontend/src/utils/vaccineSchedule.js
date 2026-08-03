import { parseClinicalDate } from "./gestationalAge.js";

export const VACCINE_TYPES = Object.freeze({
  TD: "td",
  TDAP: "tdap",
  INFLUENZA: "influenza",
  SPR_SR: "spr_sr",
});

export const VACCINE_MOMENTS = Object.freeze({
  BEFORE_PREGNANCY: "previo_embarazo",
  DURING_PREGNANCY: "durante_embarazo",
  POSTPARTUM: "postparto_aborto",
});

export const VACCINE_MOMENT_OPTIONS = Object.freeze([
  Object.freeze({
    value: VACCINE_MOMENTS.BEFORE_PREGNANCY,
    label: "Previo al embarazo",
    description: "La aplicación ocurrió antes del inicio del embarazo.",
  }),
  Object.freeze({
    value: VACCINE_MOMENTS.DURING_PREGNANCY,
    label: "Durante el embarazo",
    description: "La aplicación ocurrió dentro del período gestacional.",
  }),
  Object.freeze({
    value: VACCINE_MOMENTS.POSTPARTUM,
    label: "Postparto/aborto",
    description: "La aplicación ocurrió desde el cierre clínico del embarazo.",
  }),
]);

export const VACCINE_CATALOG = Object.freeze([
  Object.freeze({
    value: VACCINE_TYPES.TD,
    label: "TD",
    description: "Esquema longitudinal de 3 dosis y 2 refuerzos.",
    maximum: 5,
    sequence: Object.freeze(["Dosis 1", "Dosis 2", "Dosis 3", "Refuerzo 1", "Refuerzo 2"]),
    intervals: Object.freeze({
      1: Object.freeze({ months: 1 }),
      2: Object.freeze({ months: 6 }),
      3: Object.freeze({ years: 10 }),
      4: Object.freeze({ years: 10 }),
    }),
  }),
  Object.freeze({
    value: VACCINE_TYPES.TDAP,
    label: "Tdap",
    description: "Una aplicación por embarazo desde las 20 semanas o durante el puerperio si quedó pendiente.",
    maximum: 1,
    sequence: Object.freeze(["Dosis única del embarazo"]),
    intervals: Object.freeze({}),
  }),
  Object.freeze({
    value: VACCINE_TYPES.INFLUENZA,
    label: "Influenza",
    description: "Registra la aplicación que consta en el carné o antecedente de la paciente.",
    simpleApplication: true,
    maximum: null,
    sequence: Object.freeze([]),
    intervals: Object.freeze({}),
  }),
  Object.freeze({
    value: VACCINE_TYPES.SPR_SR,
    label: "SR/SPR",
    description: "Máximo 2 dosis por paciente. No se administra durante el embarazo.",
    maximum: 2,
    sequence: Object.freeze(["Dosis 1", "Dosis 2"]),
    intervals: Object.freeze({ 1: Object.freeze({ months: 1 }) }),
  }),
]);

const CATALOG_BY_TYPE = new Map(VACCINE_CATALOG.map((item) => [item.value, item]));

export function vaccineDefinition(type) {
  return CATALOG_BY_TYPE.get(type) || null;
}

export function vaccineLabel(type) {
  return vaccineDefinition(type)?.label || "Vacuna";
}

export function vaccineDoseLabel(type, dose) {
  if (type === VACCINE_TYPES.INFLUENZA) return "Aplicación de Influenza";
  const definition = vaccineDefinition(type);
  return definition?.sequence?.[Number(dose) - 1] || `Dosis ${dose || "—"}`;
}

export function vaccineMomentLabel(moment) {
  return VACCINE_MOMENT_OPTIONS.find((option) => option.value === moment)?.label || "Momento por confirmar";
}

export function clinicalDateInputValue(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "";
}

export function addCalendarPeriod(value, { months = 0, years = 0 } = {}) {
  const source = parseClinicalDate(value);
  if (!source) return "";
  const absoluteMonth = source.getUTCMonth() + months + (years * 12);
  const year = source.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return clinicalDateInputValue(new Date(Date.UTC(
    year,
    month,
    Math.min(source.getUTCDate(), lastDay)
  )));
}

export function nextWeekday(value) {
  const date = parseClinicalDate(value);
  if (!date) return "";
  const weekday = date.getUTCDay();
  const daysToAdd = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  if (daysToAdd) date.setUTCDate(date.getUTCDate() + daysToAdd);
  return clinicalDateInputValue(date);
}

export function formatClinicalDateSpanish(value, { includeWeekday = true } = {}) {
  const date = parseClinicalDate(value);
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "UTC",
    ...(includeWeekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getAppointmentRecommendation(
  type,
  completedDose,
  applicationDate,
  { existingPositions = [] } = {}
) {
  const definition = vaccineDefinition(type);
  const position = Number(completedDose);
  const interval = definition?.intervals?.[position];
  const hasLaterPosition = existingPositions.some((item) => Number(item) > position);
  if (!definition || !interval || hasLaterPosition || !parseClinicalDate(applicationDate)) return null;
  const minimumDate = addCalendarPeriod(applicationDate, interval);
  const suggestedDate = nextWeekday(minimumDate);
  if (!minimumDate || !suggestedDate) return null;
  return {
    type,
    vaccine: definition.label,
    completedDose: position,
    completedLabel: vaccineDoseLabel(type, position),
    nextDose: position + 1,
    nextLabel: vaccineDoseLabel(type, position + 1),
    minimumDate,
    suggestedDate,
    movedForWeekend: minimumDate !== suggestedDate,
  };
}

export function minimumVaccineDateBetween(type, applicationDate, fromPosition, toPosition) {
  const definition = vaccineDefinition(type);
  let minimumDate = applicationDate;
  if (!definition || !parseClinicalDate(applicationDate) || Number(fromPosition) >= Number(toPosition)) return "";
  for (let position = Number(fromPosition); position < Number(toPosition); position += 1) {
    const interval = definition.intervals?.[position];
    if (!interval) return "";
    minimumDate = addCalendarPeriod(minimumDate, interval);
  }
  return minimumDate;
}

export function assessVaccineInterval(type, selectedDose, applicationDate, records = []) {
  if (![VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(type)) return null;
  const selectedPosition = Number(selectedDose);
  const selectedDate = String(applicationDate || "").split("T")[0];
  if (!selectedPosition || !parseClinicalDate(selectedDate)) return null;

  const knownPositions = records
    .filter((record) => record?.tipo_vacuna === type)
    .map((record) => ({
      position: Number(record.numero_dosis),
      date: String(record.fecha_dosis || "").split("T")[0],
    }))
    .filter(({ position, date }) => position !== selectedPosition && parseClinicalDate(date))
    .sort((left, right) => left.position - right.position);

  for (const known of knownPositions) {
    const fromPosition = Math.min(known.position, selectedPosition);
    const toPosition = Math.max(known.position, selectedPosition);
    const fromDate = known.position < selectedPosition ? known.date : selectedDate;
    const toDate = known.position < selectedPosition ? selectedDate : known.date;
    const minimumDate = minimumVaccineDateBetween(type, fromDate, fromPosition, toPosition);
    if (!minimumDate || toDate >= minimumDate) continue;
    const affectedPosition = known.position < selectedPosition ? selectedPosition : known.position;
    return {
      type,
      selectedDose: selectedPosition,
      selectedLabel: vaccineDoseLabel(type, selectedPosition),
      relatedDose: known.position,
      relatedLabel: vaccineDoseLabel(type, known.position),
      affectedDose: affectedPosition,
      affectedLabel: vaccineDoseLabel(type, affectedPosition),
      minimumDate,
      suggestedDate: nextWeekday(minimumDate),
      movedForWeekend: nextWeekday(minimumDate) !== minimumDate,
      direction: known.position < selectedPosition ? "after" : "before",
    };
  }
  return null;
}

function recordDate(record) {
  return String(record?.fecha_dosis || "").split("T")[0];
}

export function sortVaccineHistory(records = []) {
  return [...records].sort((left, right) => {
    const byDate = recordDate(left).localeCompare(recordDate(right));
    return byDate || Number(left?.id || 0) - Number(right?.id || 0);
  });
}

function currentTdapApplications(records, pregnancyId) {
  return records.filter((record) => (
    String(record?.embarazo_id) === String(pregnancyId)
    && record?.momento !== VACCINE_MOMENTS.BEFORE_PREGNANCY
  ));
}

export function getVaccineStatus(type, records = [], { pregnancyId = null } = {}) {
  const definition = vaccineDefinition(type);
  if (!definition) return null;
  const applications = sortVaccineHistory(records.filter((record) => record?.tipo_vacuna === type));
  if (type === VACCINE_TYPES.INFLUENZA) {
    return {
      definition,
      applications,
      schemeApplications: applications,
      completed: applications.length,
      complete: false,
      registeredPositions: [],
      highestPosition: 0,
      nextDose: null,
      nextLabel: null,
      positionStates: [],
      lastApplication: applications.at(-1) || null,
      nextAppointment: null,
    };
  }
  const schemeApplications = type === VACCINE_TYPES.TDAP
    ? currentTdapApplications(applications, pregnancyId)
    : applications;
  const positionRecords = new Map();
  schemeApplications.forEach((record) => positionRecords.set(Number(record.numero_dosis), record));
  const registeredPositions = [...positionRecords.keys()].sort((left, right) => left - right);
  const highestPosition = registeredPositions.at(-1) || 0;
  const terminalRegistered = positionRecords.has(definition.maximum);
  const complete = terminalRegistered;
  const nextDose = type === VACCINE_TYPES.TDAP
    ? complete ? null : 1
    : complete ? null : Math.min(highestPosition + 1 || 1, definition.maximum);
  const positionStates = definition.sequence.map((label, index) => {
    const position = index + 1;
    const record = positionRecords.get(position) || null;
    return {
      position,
      label,
      record,
      state: record ? "registered" : position < highestPosition ? "unregistered" : "pending",
    };
  });
  const highestRecord = positionRecords.get(highestPosition) || null;
  const lastApplication = schemeApplications.at(-1) || null;
  return {
    definition,
    applications,
    schemeApplications,
    completed: registeredPositions.length,
    complete,
    registeredPositions,
    highestPosition,
    nextDose,
    nextLabel: nextDose ? vaccineDoseLabel(type, nextDose) : null,
    positionStates,
    lastApplication,
    nextAppointment: highestRecord && nextDose
      ? getAppointmentRecommendation(type, highestPosition, recordDate(highestRecord), {
        existingPositions: registeredPositions,
      })
      : null,
  };
}

export function hasMissingPreviousPositions(status, selectedDose) {
  return Boolean(status?.positionStates.some((item) => (
    item.position < Number(selectedDose) && item.state !== "registered"
  )));
}

export function firstAvailablePosition(status) {
  return status?.positionStates.find((item) => item.state !== "registered")?.position || null;
}

export function assessVaccineMoment(pregnancy, applicationDate, selectedMoment) {
  if (!selectedMoment || !parseClinicalDate(applicationDate)) {
    return { state: "pending", message: "Selecciona el momento y la fecha de aplicación." };
  }
  const date = parseClinicalDate(applicationDate);
  const start = parseClinicalDate(pregnancy?.fur || pregnancy?.fecha_inicio);
  const close = parseClinicalDate(pregnancy?.fecha_cierre);
  let expectedMoment = null;
  if (close && date.getTime() >= close.getTime()) expectedMoment = VACCINE_MOMENTS.POSTPARTUM;
  else if (start && date.getTime() < start.getTime()) expectedMoment = VACCINE_MOMENTS.BEFORE_PREGNANCY;
  else if (start && (close || pregnancy?.estado === "activo")) expectedMoment = VACCINE_MOMENTS.DURING_PREGNANCY;

  if (!expectedMoment) {
    if (selectedMoment === VACCINE_MOMENTS.POSTPARTUM && pregnancy?.estado === "activo") {
      return {
        state: "contradictory",
        expectedMoment: VACCINE_MOMENTS.DURING_PREGNANCY,
        message: "El embarazo relacionado continúa activo; todavía no corresponde seleccionar Postparto/aborto.",
      };
    }
    return {
      state: "unverifiable",
      message: "No hay suficientes fechas del embarazo para comprobar este momento. Verifica el antecedente antes de guardar.",
    };
  }
  if (expectedMoment === selectedMoment) return { state: "valid", expectedMoment, message: "El momento coincide con las fechas disponibles." };
  if (selectedMoment === VACCINE_MOMENTS.POSTPARTUM && close) {
    return {
      state: "contradictory",
      expectedMoment,
      message: "La fecha postparto/aborto debe ser igual o posterior al cierre del embarazo.",
    };
  }
  return {
    state: "contradictory",
    expectedMoment,
    message: `La fecha corresponde a ${vaccineMomentLabel(expectedMoment).toLowerCase()}, no a ${vaccineMomentLabel(selectedMoment).toLowerCase()}.`,
  };
}

export function clinicalDateFromRecord(record) {
  return recordDate(record);
}
