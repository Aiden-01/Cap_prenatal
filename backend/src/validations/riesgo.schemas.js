const {
  z,
  requiredDate,
  optionalDate,
  optionalInt,
  optionalNumber,
  optionalBoolean,
  optionalText,
} = require('./common.schemas');

const riesgoBase = {
  fecha: requiredDate,
  telefono: optionalText(20),
  pueblo: optionalText(30),
  migrante: optionalBoolean,
  estado_civil: optionalText(30),
  escolaridad: optionalText(50),
  ocupacion: optionalText(100),
  nombre_esposo_conviviente: optionalText(200),
  edad_esposo: optionalInt(10, 100),
  pueblo_esposo: optionalText(30),
  escolaridad_esposo: optionalText(50),
  ocupacion_esposo: optionalText(100),
  distancia_servicio_km: optionalNumber(0, 500),
  tiempo_horas: optionalNumber(0, 72),
  fecha_ultima_regla: optionalDate,
  fecha_probable_parto: optionalDate,
  no_embarazos: optionalInt(0, 25),
  no_partos: optionalInt(0, 25),
  no_cesareas: optionalInt(0, 15),
  no_abortos: optionalInt(0, 25),
  no_hijos_vivos: optionalInt(0, 25),
  no_hijos_muertos: optionalInt(0, 25),
  edad_embarazo_semanas: optionalInt(0, 45),
  otra_enfermedad_descripcion: optionalText(1000),
  referida_a: optionalText(255),
  nombre_personal_atendio: optionalText(150),
};

const riesgoBooleanFields = [
  'muerte_fetal_neonatal_previa', 'abortos_espontaneos_3mas', 'gestas_3mas',
  'peso_ultimo_bebe_menor_2500g', 'peso_ultimo_bebe_mayor_4500g',
  'antec_hipertension_preeclampsia', 'cirugias_tracto_reproductivo',
  'embarazo_multiple', 'menor_20_anos', 'mayor_35_anos', 'paciente_rh_negativo',
  'hemorragia_vaginal', 'vih_positivo_sifilis', 'presion_diastolica_90mas',
  'anemia', 'desnutricion_obesidad', 'dolor_abdominal', 'sintomatologia_urinaria',
  'ictericia', 'diabetes', 'enfermedad_renal', 'enfermedad_corazon',
  'hipertension_arterial', 'consumo_drogas_alcohol_tabaco', 'otra_enfermedad_severa',
];

for (const field of riesgoBooleanFields) {
  riesgoBase[field] = optionalBoolean;
}

const riesgoSchema = z.object(riesgoBase).passthrough();

module.exports = {
  riesgoSchema,
};
