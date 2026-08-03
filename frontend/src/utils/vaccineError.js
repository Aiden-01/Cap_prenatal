import { getErrorMessage } from "./errorMessage.js";
import {
  VACCINE_TYPES,
  formatClinicalDateSpanish,
  nextWeekday,
  vaccineDoseLabel,
  vaccineLabel,
} from "./vaccineSchedule.js";
import { normalizeVaccineDate } from "./vaccineFormState.js";

function structuredDetails(error) {
  const details = error?.response?.data?.details || error?.response?.data?.detalles;
  return details && !Array.isArray(details) && typeof details === "object" ? details : {};
}

function typeFromError(code, details, context) {
  if (details.vaccine_type) return details.vaccine_type;
  if (context.type) return context.type;
  if (code.startsWith("SPR_SR_")) return VACCINE_TYPES.SPR_SR;
  if (code.startsWith("TDAP_")) return VACCINE_TYPES.TDAP;
  if (code.startsWith("TD_")) return VACCINE_TYPES.TD;
  return "";
}

export function createIntervalClinicalAlert({
  type,
  dose,
  minimumDate,
  suggestedDate = nextWeekday(minimumDate),
  reason,
  affectedDose = dose,
}) {
  const safeMinimum = normalizeVaccineDate(minimumDate);
  const safeSuggested = normalizeVaccineDate(suggestedDate) || nextWeekday(safeMinimum);
  return {
    kind: "interval",
    title: "Intervalo no cumplido",
    reason,
    vaccine: vaccineLabel(type),
    dose: vaccineDoseLabel(type, dose),
    affectedDose: vaccineDoseLabel(type, affectedDose),
    minimumDate: safeMinimum,
    suggestedDate: safeSuggested,
    movedForWeekend: Boolean(safeMinimum && safeSuggested && safeMinimum !== safeSuggested),
  };
}

export function clinicalAlertFromIntervalAssessment(issue) {
  if (!issue) return null;
  const reason = issue.direction === "after"
    ? `${issue.selectedLabel} de ${vaccineLabel(issue.type)} todavía no puede registrarse.`
    : `La fecha seleccionada para ${issue.selectedLabel} no conserva el intervalo mínimo con ${issue.relatedLabel} ya registrada.`;
  return createIntervalClinicalAlert({
    type: issue.type,
    dose: issue.selectedDose,
    affectedDose: issue.affectedDose,
    minimumDate: issue.minimumDate,
    suggestedDate: issue.suggestedDate,
    reason,
  });
}

export function createVaccineClinicalAlert(title, reason, type, dose) {
  return {
    kind: "clinical",
    title,
    reason,
    vaccine: type ? vaccineLabel(type) : "Vacuna",
    dose: type && dose ? vaccineDoseLabel(type, dose) : "Por confirmar",
  };
}

export function getVaccineErrorPresentation(error, context = {}) {
  const code = error?.response?.data?.code || "";
  const details = structuredDetails(error);
  const fallback = getErrorMessage(error, "No fue posible guardar la vacuna");
  const type = typeFromError(code, details, context);
  const dose = Number(details.expected_dose || details.duplicate_position || context.dose || 0);

  if (details.minimum_date && (code.startsWith("TD_") || code.startsWith("SPR_SR_"))) {
    const message = code.startsWith("TD_") && details.from_position
      ? `La fecha de ${vaccineDoseLabel(VACCINE_TYPES.TD, details.expected_dose)} debe ser igual o posterior al ${formatClinicalDateSpanish(details.minimum_date, { includeWeekday: false })}, considerando ${vaccineDoseLabel(VACCINE_TYPES.TD, details.from_position)}.`
      : `${vaccineDoseLabel(type, dose)} de ${vaccineLabel(type)} puede registrarse a partir del ${formatClinicalDateSpanish(details.minimum_date, { includeWeekday: false })}.`;
    return {
      field: "fecha_dosis",
      message,
      clinicalAlert: createIntervalClinicalAlert({
        type,
        dose,
        minimumDate: details.minimum_date,
        reason: fallback || message,
      }),
    };
  }
  if (code === "TDAP_BEFORE_20_WEEKS") {
    const message = `La paciente tiene ${details.gestational_weeks ?? "—"} semanas y ${details.gestational_days ?? "—"} días. Tdap se permite desde las 20 semanas.`;
    return {
      field: "fecha_dosis",
      message,
      clinicalAlert: createVaccineClinicalAlert("Vacuna no permitida", message, VACCINE_TYPES.TDAP, 1),
    };
  }
  if (code === "TDAP_ALREADY_EXISTS") {
    const message = "Ya existe una Tdap para este embarazo.";
    return {
      field: "tipo_vacuna",
      message,
      clinicalAlert: createVaccineClinicalAlert("Dosis ya registrada", message, VACCINE_TYPES.TDAP, 1),
    };
  }
  if (code === "TD_POSITION_ALREADY_EXISTS" || code === "SPR_SR_POSITION_ALREADY_EXISTS") {
    const duplicateType = code.startsWith("TD_") ? VACCINE_TYPES.TD : VACCINE_TYPES.SPR_SR;
    const message = fallback || `Ya existe ${vaccineDoseLabel(duplicateType, details.duplicate_position)} para esta paciente.`;
    return {
      field: "numero_dosis",
      message,
      clinicalAlert: createVaccineClinicalAlert("Dosis ya registrada", message, duplicateType, dose),
    };
  }
  if (code === "SPR_SR_DURING_PREGNANCY") {
    const message = "SR/SPR no puede registrarse como aplicada durante el embarazo.";
    return {
      field: "momento",
      message,
      clinicalAlert: createVaccineClinicalAlert("Vacuna no permitida", message, VACCINE_TYPES.SPR_SR, dose || 1),
    };
  }
  if ([
    "VACCINE_MOMENT_DATE_MISMATCH",
    "VACCINE_MOMENT_STATE_MISMATCH",
    "VACCINE_POSTPARTUM_DATE_BEFORE_CLOSE",
  ].includes(code)) {
    return {
      field: "momento",
      message: fallback,
      clinicalAlert: createVaccineClinicalAlert("Momento de aplicación incompatible", fallback, type, dose),
    };
  }
  if (["TD_MAXIMUM_REACHED", "SPR_SR_MAXIMUM_REACHED"].includes(code)) {
    return {
      field: "tipo_vacuna",
      message: fallback,
      clinicalAlert: createVaccineClinicalAlert("Esquema completado", fallback, type, dose),
    };
  }
  if (code === "VACCINE_APPLICATION_DATE_REQUIRED") {
    const currentDate = normalizeVaccineDate(context.applicationDate);
    if (currentDate) {
      const message = "La fecha seleccionada está incluida correctamente. Otra aplicación del historial no tiene una fecha clínica utilizable.";
      return {
        field: "",
        message,
        clinicalAlert: createVaccineClinicalAlert("Fecha del historial pendiente", message, type, dose),
      };
    }
    return { field: "fecha_dosis", message: "Selecciona la fecha de aplicación." };
  }
  if (code === "TD_DOSE_SEQUENCE_INVALID" || code === "SPR_SR_DOSE_SEQUENCE_INVALID") {
    const message = details.expected_dose
      ? `La aplicación esperada es ${vaccineDoseLabel(code.startsWith("TD_") ? VACCINE_TYPES.TD : VACCINE_TYPES.SPR_SR, details.expected_dose)}.`
      : fallback;
    return { field: "numero_dosis", message };
  }
  return { field: "", message: fallback, clinicalAlert: null };
}
