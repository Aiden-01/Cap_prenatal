import test from "node:test";
import assert from "node:assert/strict";

import { calculateGestationalAge, parseClinicalDate } from "../src/utils/gestationalAge.js";
import { getVaccineErrorPresentation } from "../src/utils/vaccineError.js";
import {
  VACCINE_CATALOG,
  VACCINE_MOMENT_OPTIONS,
  VACCINE_MOMENTS,
  VACCINE_TYPES,
  addCalendarPeriod,
  assessVaccineInterval,
  assessVaccineMoment,
  firstAvailablePosition,
  getAppointmentRecommendation,
  getVaccineStatus,
  hasMissingPreviousPositions,
  nextWeekday,
  vaccineDoseLabel,
} from "../src/utils/vaccineSchedule.js";
import {
  buildVaccineRequestData,
  firstMissingVaccineField,
  normalizeVaccineDate,
} from "../src/utils/vaccineFormState.js";
import {
  clinicalAlertFromIntervalAssessment,
} from "../src/utils/vaccineError.js";

const record = (type, dose, date, extra = {}) => ({
  id: extra.id || `${type}-${dose}-${date}`,
  tipo_vacuna: type,
  numero_dosis: dose,
  fecha_dosis: date,
  embarazo_id: extra.pregnancyId ?? 7,
  momento: extra.moment || VACCINE_MOMENTS.DURING_PREGNANCY,
});

const apiError = (code, details = {}, message = "Error clínico") => ({
  response: { data: { code, details, message } },
});

test("catálogo separa TD/Tdap y momentos oficiales no incluyen No", () => {
  const obsoleteCombinedType = ["td", "tdap"].join("_");
  assert.deepEqual(
    VACCINE_CATALOG.map(({ value }) => value),
    [VACCINE_TYPES.TD, VACCINE_TYPES.TDAP, VACCINE_TYPES.INFLUENZA, VACCINE_TYPES.SPR_SR]
  );
  assert.equal(VACCINE_CATALOG.some(({ value }) => value === obsoleteCombinedType), false);
  assert.deepEqual(VACCINE_MOMENT_OPTIONS.map(({ value }) => value), [
    "previo_embarazo",
    "durante_embarazo",
    "postparto_aborto",
  ]);
  assert.equal(VACCINE_MOMENT_OPTIONS.some(({ label }) => label === "No"), false);
  assert.equal(vaccineDoseLabel("influenza", 1), "Aplicación de Influenza");
});

test("Influenza conserva aplicaciones independientes sin posición ni cita", () => {
  const applications = [
    record("influenza", 1, "2026-01-10", { id: 1, moment: VACCINE_MOMENTS.BEFORE_PREGNANCY }),
    record("influenza", 1, "2026-06-10", { id: 2 }),
    record("influenza", 1, "2026-07-10", { id: 3 }),
  ];
  const status = getVaccineStatus("influenza", applications, { pregnancyId: 7 });
  assert.equal(status.applications.length, 3);
  assert.deepEqual(status.applications.map(({ id }) => id), [1, 2, 3]);
  assert.equal(status.completed, 3);
  assert.deepEqual(status.registeredPositions, []);
  assert.deepEqual(status.positionStates, []);
  assert.equal(status.nextDose, null);
  assert.equal(status.nextAppointment, null);
  assert.equal(getAppointmentRecommendation("influenza", 1, "2026-07-10"), null);
});

test("TD puede iniciar desde Dosis 3 y muestra huecos sin afirmar que no fue aplicada", () => {
  const status = getVaccineStatus("td", [record("td", 3, "2026-08-03")]);
  assert.equal(status.completed, 1);
  assert.equal(status.nextDose, 4);
  assert.equal(status.nextLabel, "Refuerzo 1");
  assert.deepEqual(status.positionStates.map(({ state }) => state), [
    "unregistered", "unregistered", "registered", "pending", "pending",
  ]);
  assert.equal(hasMissingPreviousPositions(status, 3), true);
  assert.equal(firstAvailablePosition(status), 1);
});

test("TD sugiere por posición más alta, no por cantidad de registros", () => {
  const status = getVaccineStatus("td", [
    record("td", 1, "2026-01-03"),
    record("td", 3, "2026-08-03"),
  ]);
  assert.equal(status.completed, 2);
  assert.equal(status.highestPosition, 3);
  assert.equal(status.nextDose, 4);
  assert.equal(status.nextLabel, "Refuerzo 1");
});

test("Refuerzo 2 TD marca posición terminal aunque existan huecos documentales", () => {
  const status = getVaccineStatus("td", [record("td", 5, "2046-08-03")]);
  assert.equal(status.complete, true);
  assert.equal(status.completed, 1);
  assert.equal(status.nextDose, null);
  assert.equal(status.positionStates[0].state, "unregistered");
  assert.equal(status.positionStates[4].state, "registered");
});

test("SR/SPR puede iniciar desde Dosis 2 y queda completo con Dosis 1 no registrada", () => {
  const status = getVaccineStatus("spr_sr", [record("spr_sr", 2, "2026-09-03")]);
  assert.equal(status.complete, true);
  assert.equal(status.completed, 1);
  assert.equal(status.nextDose, null);
  assert.equal(status.positionStates[0].state, "unregistered");
  assert.equal(status.positionStates[1].state, "registered");
});

test("Tdap previa no consume la aplicación del embarazo actual", () => {
  const previous = record("tdap", 1, "2025-10-01", {
    moment: VACCINE_MOMENTS.BEFORE_PREGNANCY,
    pregnancyId: 7,
  });
  const priorOnly = getVaccineStatus("tdap", [previous], { pregnancyId: 7 });
  assert.equal(priorOnly.applications.length, 1);
  assert.equal(priorOnly.schemeApplications.length, 0);
  assert.equal(priorOnly.complete, false);
  assert.equal(priorOnly.nextDose, 1);

  const current = getVaccineStatus("tdap", [
    previous,
    record("tdap", 1, "2026-05-21", { pregnancyId: 7 }),
  ], { pregnancyId: 7 });
  assert.equal(current.schemeApplications.length, 1);
  assert.equal(current.complete, true);
  assert.equal(current.nextAppointment, null);
});

test("recomendación usa posición seleccionada y no propone una ya superada", () => {
  const fromDoseTwo = getAppointmentRecommendation("td", 2, "2026-02-03");
  assert.equal(fromDoseTwo.nextDose, 3);
  assert.equal(fromDoseTwo.minimumDate, "2026-08-03");
  assert.equal(
    getAppointmentRecommendation("td", 1, "2026-01-03", { existingPositions: [1, 3] }),
    null
  );
  assert.equal(getAppointmentRecommendation("spr_sr", 2, "2026-09-03"), null);
});

test("momento previo, durante y postparto se comprueban con fechas disponibles", () => {
  const pregnancy = { estado: "puerperio", fur: "2026-01-01", fecha_cierre: "2026-10-01" };
  assert.equal(assessVaccineMoment(pregnancy, "2025-12-31", "previo_embarazo").state, "valid");
  assert.equal(assessVaccineMoment(pregnancy, "2026-06-01", "durante_embarazo").state, "valid");
  assert.equal(assessVaccineMoment(pregnancy, "2026-10-01", "postparto_aborto").state, "valid");
  assert.equal(assessVaccineMoment(pregnancy, "2026-06-01", "previo_embarazo").state, "contradictory");
  assert.equal(assessVaccineMoment(pregnancy, "2026-09-30", "postparto_aborto").state, "contradictory");
});

test("datos insuficientes generan advertencia sin sustituir momento", () => {
  const assessment = assessVaccineMoment(
    { estado: "puerperio", fur: null, fecha_inicio: null, fecha_cierre: null },
    "2026-10-01",
    "postparto_aborto"
  );
  assert.equal(assessment.state, "unverifiable");
  assert.match(assessment.message, /No hay suficientes fechas/);
  assert.equal(assessVaccineMoment(
    { estado: "puerperio", fur: "2026-01-01", fecha_cierre: null },
    "2026-10-01",
    "postparto_aborto"
  ).state, "unverifiable");
});

test("suma períodos calendario y resuelve fin de mes, febrero y bisiesto", () => {
  assert.equal(addCalendarPeriod("2026-08-03", { months: 1 }), "2026-09-03");
  assert.equal(addCalendarPeriod("2026-08-31", { months: 6 }), "2027-02-28");
  assert.equal(addCalendarPeriod("2024-01-31", { months: 1 }), "2024-02-29");
  assert.equal(addCalendarPeriod("2024-02-29", { years: 10 }), "2034-02-28");
});

test("día hábil conserva lunes y viernes y mueve fin de semana hacia adelante", () => {
  assert.equal(nextWeekday("2026-08-03"), "2026-08-03");
  assert.equal(nextWeekday("2026-08-07"), "2026-08-07");
  assert.equal(nextWeekday("2026-08-08"), "2026-08-10");
  assert.equal(nextWeekday("2026-08-09"), "2026-08-10");
});

test("fecha clínica no cambia por zona horaria", () => {
  assert.equal(parseClinicalDate("2026-08-03").toISOString().slice(0, 10), "2026-08-03");
  assert.equal(parseClinicalDate("2026-02-29"), null);
  assert.deepEqual(calculateGestationalAge("2026-01-01", "2026-05-20"), {
    totalDays: 139,
    weeks: 19,
    days: 6,
  });
});

test("error TD acumulado muestra posición relativa y fecha mínima", () => {
  const result = getVaccineErrorPresentation(apiError("TD_POSITION_INTERVAL_NOT_MET", {
    expected_dose: 3,
    from_position: 1,
    minimum_date: "2026-08-05",
  }));
  assert.equal(result.field, "fecha_dosis");
  assert.match(result.message, /Dosis 3/);
  assert.match(result.message, /Dosis 1/);
  assert.match(result.message, /5 de agosto de 2026/);
});

test("errores de posición duplicada y momento apuntan al control correcto", () => {
  assert.equal(
    getVaccineErrorPresentation(apiError("TD_POSITION_ALREADY_EXISTS", { duplicate_position: 3 }, "Ya existe una Dosis 3 de TD para esta paciente.")).field,
    "numero_dosis"
  );
  assert.equal(
    getVaccineErrorPresentation(apiError("VACCINE_MOMENT_DATE_MISMATCH", {}, "El momento seleccionado no coincide con la fecha del embarazo.")).field,
    "momento"
  );
  assert.equal(
    getVaccineErrorPresentation(apiError("SPR_SR_DURING_PREGNANCY")).field,
    "momento"
  );
});

test("error Tdap conserva semanas y días y error inesperado conserva fallback", () => {
  const tdap = getVaccineErrorPresentation(apiError("TDAP_BEFORE_20_WEEKS", {
    gestational_weeks: 19,
    gestational_days: 6,
  }));
  assert.match(tdap.message, /19 semanas y 6 días/);
  assert.equal(getVaccineErrorPresentation(new Error("Conexión interrumpida")).message, "Conexión interrumpida");
});

test("fecha controlada se conserva y el payload usa YYYY-MM-DD sin zona horaria", () => {
  const form = {
    tipo_vacuna: "td",
    numero_dosis: 3,
    momento: "durante_embarazo",
    fecha_dosis: "2026-08-03",
  };
  assert.deepEqual(buildVaccineRequestData(form), form);
  assert.equal(normalizeVaccineDate("2026-08-03T23:59:59.000-06:00"), "2026-08-03");
  assert.equal(firstMissingVaccineField(form), null);
  assert.equal(buildVaccineRequestData({ ...form, tipo_vacuna: "spr_sr" }).fecha_dosis, "2026-08-03");
  assert.equal(buildVaccineRequestData({ ...form, numero_dosis: 2 }).fecha_dosis, "2026-08-03");
  assert.equal(buildVaccineRequestData({ ...form, momento: "previo_embarazo" }).fecha_dosis, "2026-08-03");
  const influenza = {
    tipo_vacuna: "influenza",
    momento: "durante_embarazo",
    numero_dosis: null,
    fecha_dosis: "2026-08-03",
  };
  assert.equal(firstMissingVaccineField(influenza), null);
  assert.deepEqual(buildVaccineRequestData(influenza), {
    tipo_vacuna: "influenza",
    momento: "durante_embarazo",
    numero_dosis: 1,
    fecha_dosis: "2026-08-03",
  });
});

test("fecha válida nunca se presenta como campo obligatorio faltante", () => {
  const presentation = getVaccineErrorPresentation(apiError(
    "VACCINE_APPLICATION_DATE_REQUIRED",
    { vaccine_type: "td" },
    "La fecha de aplicación es obligatoria para TD."
  ), { type: "td", dose: 3, applicationDate: "2026-08-03" });
  assert.equal(presentation.field, "");
  assert.doesNotMatch(presentation.message, /obligatoria/i);
  assert.equal(presentation.clinicalAlert.title, "Fecha del historial pendiente");
});

test("intervalo anterior al mínimo produce alerta preventiva con dosis y fecha", () => {
  const issue = assessVaccineInterval("td", 3, "2027-01-31", [
    record("td", 2, "2026-08-03"),
  ]);
  assert.equal(issue.minimumDate, "2027-02-03");
  assert.equal(issue.selectedLabel, "Dosis 3");
  const alert = clinicalAlertFromIntervalAssessment(issue);
  assert.equal(alert.title, "Intervalo no cumplido");
  assert.equal(alert.dose, "Dosis 3");
  assert.equal(alert.minimumDate, "2027-02-03");
});

test("intervalo de fin de semana sugiere el lunes siguiente", () => {
  const issue = assessVaccineInterval("td", 2, "2026-10-02", [
    record("td", 1, "2026-09-03"),
  ]);
  const alert = clinicalAlertFromIntervalAssessment(issue);
  assert.equal(alert.minimumDate, "2026-10-03");
  assert.equal(alert.suggestedDate, "2026-10-05");
  assert.equal(alert.movedForWeekend, true);
});

test("errores clínicos estructurados comparten títulos del diálogo central", () => {
  const interval = getVaccineErrorPresentation(apiError("TD_DOSE_3_INTERVAL_NOT_MET", {
    vaccine_type: "td",
    expected_dose: 3,
    from_position: 2,
    minimum_date: "2027-02-03",
  }));
  assert.equal(interval.clinicalAlert.title, "Intervalo no cumplido");
  assert.equal(interval.clinicalAlert.minimumDate, "2027-02-03");
  assert.equal(getVaccineErrorPresentation(apiError("TD_POSITION_ALREADY_EXISTS", { duplicate_position: 3 })).clinicalAlert.title, "Dosis ya registrada");
  assert.equal(getVaccineErrorPresentation(apiError("TDAP_BEFORE_20_WEEKS", { gestational_weeks: 19, gestational_days: 6 })).clinicalAlert.title, "Vacuna no permitida");
  assert.equal(getVaccineErrorPresentation(apiError("SPR_SR_DURING_PREGNANCY")).clinicalAlert.title, "Vacuna no permitida");
  assert.equal(getVaccineErrorPresentation(apiError("VACCINE_MOMENT_DATE_MISMATCH")).clinicalAlert.title, "Momento de aplicación incompatible");
});
