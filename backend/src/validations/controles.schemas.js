const {
  z,
  optionalDate,
  requiredDate,
  optionalTime,
  optionalInt,
  optionalNumber,
  optionalBoolean,
  optionalText,
  requiredInt,
  gestationalAge,
  bloodPressureSystolic,
  bloodPressureDiastolic,
  heartRate,
  respiratoryRate,
  temperature,
  weightKg,
  heightCm,
} = require('./common.schemas');

const controlBase = {
  numero_control: optionalInt(1, 20),
  fecha: optionalDate,
  hora: optionalTime.optional(),
  motivo_consulta: optionalText(2000),
  edad_gestacional_semanas: gestationalAge,
  pa_sistolica: bloodPressureSystolic,
  pa_diastolica: bloodPressureDiastolic,
  frecuencia_cardiaca: heartRate,
  frecuencia_respiratoria: respiratoryRate,
  temperatura: temperature,
  perimetro_braquial_cm: optionalNumber(10, 60),
  peso_kg: weightKg,
  talla_cm: heightCm,
  imc: optionalNumber(10, 80),
  altura_uterina_cm: optionalNumber(0, 45),
  fcf: optionalInt(60, 220),
  sulfato_ferroso_tabletas: optionalInt(0, 1000),
  acido_folico_tabletas: optionalInt(0, 1000),
  cita_siguiente: optionalDate,
  papanicolau_ivaa_fecha_toma: optionalDate,
  vih_resultado: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(['positivo', 'negativo']).optional()
  ),
  vdrl_resultado: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(['positivo', 'negativo']).optional()
  ),
};

const controlBooleanFields = [
  'peligro_hemorragia_vaginal', 'peligro_palidez', 'peligro_dolor_cabeza',
  'peligro_hipertension', 'peligro_dolor_epigastrico', 'peligro_trastornos_visuales',
  'peligro_fiebre', 'examen_bucodental', 'examen_mamas', 'movimientos_fetales',
  'sangre_manchado', 'verrugas_herpes_papilomas', 'flujo_vaginal',
  'hematologia_realizada', 'glicemia_realizada', 'grupo_rh_realizado',
  'orina_realizada', 'orina_bacteriuria', 'orina_proteinuria', 'heces_realizada',
  'vih_realizado', 'vdrl_realizado', 'vdrl_tratamiento_indicado', 'torch_realizado',
  'torch_resultado_positivo', 'papanicolau_ivaa_realizado', 'hepatitis_b_realizado',
  'usg_realizado', 'sulfato_ferroso', 'acido_folico', 'orient_plan_emergencia_parto',
  'orient_alimentacion_embarazo', 'orient_senales_peligro', 'orient_lactancia_materna',
  'orient_planificacion_familiar', 'orient_importancia_postparto',
  'orient_vacunacion_nino', 'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones', 'orient_tratamiento_its_pareja',
];

for (const field of controlBooleanFields) {
  controlBase[field] = optionalBoolean;
}

const controlCreateSchema = z.object({
  ...controlBase,
  numero_control: requiredInt(1, 20),
  fecha: requiredDate,
}).passthrough();

const controlUpdateSchema = z.object(controlBase).passthrough();

const puerperioBase = {
  numero_atencion: optionalInt(1, 2),
  fecha: optionalDate,
  hora: optionalTime.optional(),
  dias_despues_parto: optionalInt(0, 60),
  tipo_parto: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(['vaginal', 'cesarea']).optional()
  ),
  pa_sistolica: bloodPressureSystolic,
  pa_diastolica: bloodPressureDiastolic,
  frecuencia_cardiaca: heartRate,
  frecuencia_respiratoria: respiratoryRate,
  temperatura: temperature,
  recien_nacido_vivo: optionalBoolean,
  tuvo_apego_inmediato: optionalBoolean,
  lactancia_materna_exclusiva: optionalBoolean,
  signos_peligro: optionalText(2000),
};

const puerperioCreateSchema = z.object({
  ...puerperioBase,
  numero_atencion: requiredInt(1, 2),
  fecha: requiredDate,
}).passthrough();

const puerperioUpdateSchema = z.object(puerperioBase).passthrough();

const planPartoSchema = z.object({
  fecha: requiredDate,
  fur: optionalDate,
  fecha_probable_parto: optionalDate,
  fecha_nacimiento: optionalDate,
  fecha_ultima_cesarea: optionalDate,
  no_embarazos: optionalInt(0, 25),
  no_partos: optionalInt(0, 25),
  no_abortos: optionalInt(0, 25),
  no_hijos_vivos: optionalInt(0, 25),
  no_hijos_muertos: optionalInt(0, 25),
  no_cesareas: optionalInt(0, 15),
  edad_gestacional_semanas: gestationalAge,
  edad_gestacional_au: gestationalAge,
  horas_distancia: optionalNumber(0, 72),
  kms_servicio: optionalNumber(0, 500),
  ha_tenido_atencion_prenatal: optionalBoolean,
  casa_materna_cercana: optionalBoolean,
  usara_casa_materna: optionalBoolean,
  lleva_dpi_madre: optionalBoolean,
  lleva_dpi_conyuge: optionalBoolean,
  lleva_partida_nacimiento: optionalBoolean,
  cuenta_ahorro: optionalBoolean,
  comunicado_comite: optionalBoolean,
}).passthrough();

module.exports = {
  controlCreateSchema,
  controlUpdateSchema,
  planPartoSchema,
  puerperioCreateSchema,
  puerperioUpdateSchema,
};
