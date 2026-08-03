import { parseClinicalDate } from "./gestationalAge.js";
import { VACCINE_TYPES } from "./vaccineSchedule.js";

export const VACCINE_REQUIRED_FIELDS = Object.freeze([
  Object.freeze({ field: "tipo_vacuna", message: "Selecciona la vacuna." }),
  Object.freeze({ field: "numero_dosis", message: "Selecciona la dosis que deseas registrar." }),
  Object.freeze({ field: "momento", message: "Selecciona el momento de aplicación." }),
  Object.freeze({ field: "fecha_dosis", message: "Selecciona la fecha de aplicación." }),
]);

export function normalizeVaccineDate(value) {
  const date = String(value || "").split("T")[0];
  return parseClinicalDate(date) ? date : "";
}

export function firstMissingVaccineField(form) {
  return VACCINE_REQUIRED_FIELDS.find(({ field }) => {
    if (field === "numero_dosis") {
      return form?.tipo_vacuna !== VACCINE_TYPES.INFLUENZA && !Number(form?.[field]);
    }
    if (field === "fecha_dosis") return !normalizeVaccineDate(form?.[field]);
    return !String(form?.[field] || "").trim();
  }) || null;
}

export function buildVaccineRequestData(form) {
  return {
    tipo_vacuna: form.tipo_vacuna,
    momento: form.momento,
    numero_dosis: form.tipo_vacuna === VACCINE_TYPES.INFLUENZA
      ? 1
      : Number(form.numero_dosis),
    fecha_dosis: normalizeVaccineDate(form.fecha_dosis),
  };
}
