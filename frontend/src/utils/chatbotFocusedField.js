const CONTROL_FIELD_TABS = Object.freeze({
  numero_control: "general",
  cita_siguiente: "general",
  acompanante: "general",
  semanas_gestacion: "general",
  hematologia: "laboratorio",
  vih: "laboratorio",
});
const PATIENT_INPUT_FIELDS = Object.freeze({
  no_expediente: "paciente_no_expediente", cui: "paciente_cui", nombres: "paciente_nombres",
  apellidos: "paciente_apellidos", fecha_nacimiento: "paciente_fecha_nacimiento",
  comunidad: "paciente_comunidad", telefono: "paciente_telefono", pueblo: "paciente_pueblo",
  estado_civil: "paciente_estado_civil", nivel_estudios: "paciente_nivel_estudios",
  profesion_oficio: "paciente_profesion_oficio", fur: "paciente_fur", fpp: "paciente_fpp",
  gestas_previas: "paciente_gestas_previas", partos: "paciente_partos", abortos: "paciente_abortos",
  cesareas: "paciente_cesareas", hijos_viven: "paciente_hijos_viven",
});
const RISK_INPUT_FIELDS = Object.freeze({
  fecha: "riesgo_fecha", telefono: "riesgo_telefono", pueblo: "riesgo_pueblo",
  estado_civil: "riesgo_estado_civil", escolaridad: "riesgo_escolaridad",
  ocupacion: "riesgo_ocupacion", fecha_ultima_regla: "riesgo_fecha_ultima_regla",
  fecha_probable_parto: "riesgo_fecha_probable_parto", tiempo_horas: "riesgo_tiempo_horas",
  referida_a: "riesgo_referida_a", nombre_personal_atendio: "riesgo_nombre_personal_atendio",
  no_embarazos: "riesgo_no_embarazos", distancia_servicio_km: "riesgo_distancia_servicio_km",
});
const PATIENT_FORMS = new Set(["nueva_paciente", "editar_paciente"]);

export function patientFieldId(name) { return PATIENT_INPUT_FIELDS[name] || undefined; }
export function riskFieldId(name) { return RISK_INPUT_FIELDS[name] || undefined; }
export function isSupportedFormField(id, form) {
  if (PATIENT_FORMS.has(form)) return Object.values(PATIENT_INPUT_FIELDS).includes(id);
  return form === "ficha_riesgo" && Object.values(RISK_INPUT_FIELDS).includes(id);
}
export function captureFormField(id, form, navigationKey) {
  return isSupportedFormField(id, form) ? { id, form, navigationKey } : null;
}
export function currentFormField(snapshot, navigationKey) {
  return snapshot?.navigationKey === navigationKey && isSupportedFormField(snapshot.id, snapshot.form)
    ? snapshot.id : null;
}

export function captureControlField(fieldId, tab, navigationKey) {
  if (typeof fieldId !== "string" || CONTROL_FIELD_TABS[fieldId] !== tab) return null;
  return { id: fieldId, tab, navigationKey };
}

export function currentControlField(snapshot, tab, navigationKey) {
  if (snapshot?.tab !== tab || snapshot?.navigationKey !== navigationKey) return null;
  return CONTROL_FIELD_TABS[snapshot.id] === tab ? snapshot.id : null;
}
