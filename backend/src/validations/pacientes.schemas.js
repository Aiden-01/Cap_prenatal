const {
  z,
  optionalDate,
  requiredDate,
  optionalInt,
  optionalNumber,
  optionalBoolean,
  optionalText,
  requiredText,
} = require('./common.schemas');

const optionalEnum = (values) => z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.enum(values).optional()
);

const pacienteBase = {
  no_expediente: optionalText(30),
  cui: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().regex(/^\d{13}$/, 'El CUI debe tener exactamente 13 digitos').optional()
  ),
  nombre_establecimiento: optionalText(150),
  distrito: optionalText(100),
  area_salud: optionalText(150),
  categoria_servicio: optionalEnum(['CCS', 'PS', 'CS_B', 'CS_A', 'CAP']),
  nombres: optionalText(150),
  apellidos: optionalText(150),
  fecha_nacimiento: optionalDate,
  edad_manual: optionalInt(10, 60),
  edad_calculada: optionalText(80),
  rango_edad: optionalEnum(['menor_14', '14_19', '20_35', 'mayor_35']),
  clasificacion_alfa_beta: optionalEnum(['SI', 'NO', 'ALFA', 'BETA']),
  domicilio: optionalText(255),
  municipio: optionalText(100),
  territorio: optionalText(100),
  sector: optionalText(80),
  comunidad: optionalText(100),
  telefono: optionalText(20),
  nivel_estudios: optionalEnum(['ninguno', 'primaria', 'basico', 'diversificado', 'universitaria', 'secundaria']),
  ultimo_anio_aprobado: optionalInt(0, 20),
  profesion_oficio: optionalText(100),
  estado_civil: optionalEnum(['casada', 'unida', 'soltera', 'separada', 'vive_sola']),
  pueblo: optionalEnum(['maya', 'garifuna', 'xinca', 'mestizo', 'otro']),
  fur: optionalDate,
  fpp: optionalDate,
  gestas_previas: optionalInt(0, 25),
  abortos: optionalInt(0, 25),
  partos: optionalInt(0, 25),
  partos_vaginales: optionalInt(0, 25),
  cesareas: optionalInt(0, 15),
  nacidos_vivos: optionalInt(0, 25),
  nacidos_muertos: optionalInt(0, 25),
  hijos_viven: optionalInt(0, 25),
  muertos_antes_1sem: optionalInt(0, 25),
  muertos_despues_1sem: optionalInt(0, 25),
  fin_embarazo_anterior: optionalDate,
  fracaso_metodo: optionalEnum(['no', 'barrera', 'hormonal', 'DIU', 'natural', 'emergencia']),
  antec_diabetes_tipo: optionalEnum(['1', '2', 'G']),
  antec_emb_ectopico_num: optionalInt(0, 25),
  cobertura_igss: optionalBoolean,
  cobertura_privada: optionalBoolean,
  viene_referida: optionalBoolean,
  vive_sola: optionalBoolean,
  es_migrante: optionalBoolean,
  eg_confiable_fur: optionalBoolean,
  eg_confiable_usg: optionalBoolean,
  embarazo_planeado: optionalBoolean,
};

const pacienteCreateSchema = z.object({
  ...pacienteBase,
  no_expediente: requiredText(30),
  nombres: requiredText(150),
  apellidos: requiredText(150),
}).passthrough();

const pacienteUpdateSchema = z.object(pacienteBase).passthrough();

const pacienteListQuerySchema = z.object({
  buscar: optionalText(100),
  pagina: optionalInt(1, 100000),
  limite: optionalInt(1, 100),
}).passthrough();

const embarazoBodySchema = z.object({
  fur: optionalDate,
  fpp: optionalDate,
  fecha_cierre: optionalDate,
  fecha_parto: optionalDate,
  observaciones: optionalText(1000),
}).passthrough();

module.exports = {
  pacienteCreateSchema,
  pacienteUpdateSchema,
  pacienteListQuerySchema,
  embarazoBodySchema,
};
