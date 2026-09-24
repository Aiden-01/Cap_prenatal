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
const VACCINE_INPUT_FIELDS = Object.freeze({
  tipo_vacuna: "vacuna_tipo_vacuna", numero_dosis: "vacuna_numero_dosis",
  momento: "vacuna_momento", fecha_dosis: "vacuna_fecha_dosis",
});
const PUERPERIUM_INPUT_FIELDS = Object.freeze({
  numero_atencion: "puerperio_numero_atencion", fecha: "puerperio_fecha",
  dias_despues_parto: "puerperio_dias_despues_parto",
  lugar_atencion_parto: "puerperio_lugar_atencion_parto",
  quien_atendio_parto: "puerperio_quien_atendio_parto",
  tipo_parto: "puerperio_tipo_parto", recien_nacido_vivo: "puerperio_recien_nacido_vivo",
  tuvo_apego_inmediato: "puerperio_tuvo_apego_inmediato",
  lactancia_materna_exclusiva: "puerperio_lactancia_materna_exclusiva",
  nombre_cargo_atiende: "puerperio_nombre_cargo_atiende",
});
const PATIENT_FORMS = new Set(["nueva_paciente", "editar_paciente"]);
const VACCINE_FORMS = new Set(["nueva_vacuna", "editar_vacuna"]);
const PUERPERIUM_FORMS = new Set(["nuevo_puerperio", "editar_puerperio"]);

export function patientFieldId(name) { return PATIENT_INPUT_FIELDS[name] || undefined; }
export function riskFieldId(name) { return RISK_INPUT_FIELDS[name] || undefined; }
export function vaccineFieldId(name) { return VACCINE_INPUT_FIELDS[name] || undefined; }
export function puerperiumFieldId(name) { return PUERPERIUM_INPUT_FIELDS[name] || undefined; }
export function isSupportedFormField(id, form) {
  if (PATIENT_FORMS.has(form)) return Object.values(PATIENT_INPUT_FIELDS).includes(id);
  if (form === "ficha_riesgo") return Object.values(RISK_INPUT_FIELDS).includes(id);
  if (VACCINE_FORMS.has(form)) return Object.values(VACCINE_INPUT_FIELDS).includes(id);
  return PUERPERIUM_FORMS.has(form) && Object.values(PUERPERIUM_INPUT_FIELDS).includes(id);
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
