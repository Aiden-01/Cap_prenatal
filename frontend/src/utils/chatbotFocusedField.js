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
const MORBIDITY_INPUT_FIELDS = Object.freeze({
  fecha: "morbilidad_fecha", hora: "morbilidad_hora",
  motivo_consulta: "morbilidad_motivo_consulta",
  historia_enfermedad_actual: "morbilidad_historia_enfermedad_actual",
  revision_por_sistemas: "morbilidad_revision_por_sistemas",
  examen_fisico: "morbilidad_examen_fisico",
  impresion_clinica: "morbilidad_impresion_clinica",
  tratamiento_referencia: "morbilidad_tratamiento_referencia",
  nombre_cargo_atiende: "morbilidad_nombre_cargo_atiende",
});
const BIRTH_PLAN_INPUT_FIELDS = Object.freeze({
  no_registro: "plan_parto_no_registro", servicio_salud: "plan_parto_servicio_salud",
  lugar_residencia: "plan_parto_lugar_residencia", nombre_conyuge: "plan_parto_nombre_conyuge",
  telefono: "plan_parto_telefono", fecha_nacimiento: "plan_parto_fecha_nacimiento",
  con_quien_vive: "plan_parto_con_quien_vive", no_embarazos: "plan_parto_no_embarazos",
  fur: "plan_parto_fur", fecha_probable_parto: "plan_parto_fecha_probable_parto",
  edad_gestacional_semanas: "plan_parto_edad_gestacional_semanas",
  edad_gestacional_au: "plan_parto_edad_gestacional_au",
  peligro_hemorragia_vaginal: "plan_parto_peligro_hemorragia_vaginal",
  posicion_parto: "plan_parto_posicion_parto", posicion_parto_otro: "plan_parto_posicion_parto_otro",
  lugar_atencion_parto: "plan_parto_lugar_atencion_parto",
  lugar_atencion_parto_otro: "plan_parto_lugar_atencion_parto_otro",
  horas_distancia: "plan_parto_horas_distancia", kms_servicio: "plan_parto_kms_servicio",
  como_trasladara: "plan_parto_como_trasladara",
  usara_casa_materna: "plan_parto_usara_casa_materna", ropa_nino: "plan_parto_ropa_nino",
  lleva_dpi_madre: "plan_parto_lleva_dpi_madre", otros_articulos: "plan_parto_otros_articulos",
  acompana_traslado: "plan_parto_acompana_traslado", acompana_parto: "plan_parto_acompana_parto",
  con_quien_hijos: "plan_parto_con_quien_hijos", quien_cuida_casa: "plan_parto_quien_cuida_casa",
  telefono_vehiculo: "plan_parto_telefono_vehiculo",
  responsable_activar: "plan_parto_responsable_activar",
  nombre_activara_plan: "plan_parto_nombre_activara_plan",
  nombre_proveedor_salud: "plan_parto_nombre_proveedor_salud",
});
const PATIENT_FORMS = new Set(["nueva_paciente", "editar_paciente"]);
const VACCINE_FORMS = new Set(["nueva_vacuna", "editar_vacuna"]);
const PUERPERIUM_FORMS = new Set(["nuevo_puerperio", "editar_puerperio"]);
const MORBIDITY_FORMS = new Set(["nueva_morbilidad", "editar_morbilidad"]);

export function patientFieldId(name) { return PATIENT_INPUT_FIELDS[name] || undefined; }
export function riskFieldId(name) { return RISK_INPUT_FIELDS[name] || undefined; }
export function vaccineFieldId(name) { return VACCINE_INPUT_FIELDS[name] || undefined; }
export function puerperiumFieldId(name) { return PUERPERIUM_INPUT_FIELDS[name] || undefined; }
export function morbidityFieldId(name) { return MORBIDITY_INPUT_FIELDS[name] || undefined; }
export function birthPlanFieldId(name) { return BIRTH_PLAN_INPUT_FIELDS[name] || undefined; }
export function isSupportedFormField(id, form) {
  if (PATIENT_FORMS.has(form)) return Object.values(PATIENT_INPUT_FIELDS).includes(id);
  if (form === "ficha_riesgo") return Object.values(RISK_INPUT_FIELDS).includes(id);
  if (VACCINE_FORMS.has(form)) return Object.values(VACCINE_INPUT_FIELDS).includes(id);
  if (PUERPERIUM_FORMS.has(form)) return Object.values(PUERPERIUM_INPUT_FIELDS).includes(id);
  if (MORBIDITY_FORMS.has(form)) return Object.values(MORBIDITY_INPUT_FIELDS).includes(id);
  return form === "plan_parto" && Object.values(BIRTH_PLAN_INPUT_FIELDS).includes(id);
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
