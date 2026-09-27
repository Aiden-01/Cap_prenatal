const { z } = require('zod');
const { isRealIsoDate } = require('./reportes.schemas');

const ACTIONS = ['login', 'logout', 'login_fallido', 'login_usuario_inactivo',
  'crear', 'actualizar', 'eliminar', 'estado', 'consultar', 'generar_pdf', 'exportar'];
const MODULES = ['autenticacion', 'usuarios', 'permisos', 'documentos', 'reportes',
  'automatizaciones', 'pacientes', 'comunidades', 'controles_prenatales',
  'citas_prenatales', 'puerperio', 'vacunas', 'morbilidad', 'riesgo_obstetrico',
  'plan_parto', 'referencias', 'general'];
const ENTITIES = ['usuario', 'usuarios', 'usuario_permisos', 'sesion', 'auth_sessions',
  'documento', 'documentos', 'reporte', 'reportes', 'exportacion',
  'censo_primer_control', 'inasistencias_semanales', 'seguimiento_tdap_el_chal',
  'calidad_datos_semanal', 'proximas_citas', 'automatizaciones', 'paciente',
  'pacientes', 'embarazo', 'embarazos', 'control_prenatal', 'controles_prenatales',
  'cita_prenatal', 'citas_prenatales', 'riesgo_obstetrico', 'fichas_riesgo_obstetrico',
  'vacuna', 'vacunas_paciente', 'morbilidad', 'morbilidad_embarazo', 'plan_parto',
  'planes_parto', 'puerperio', 'controles_puerperio', 'comunidad', 'comunidades',
  'referencia', 'referencias_efectuadas'];
const day = z.string().refine((value) => isRealIsoDate(value) && value >= '0001-01-01',
  'Debe ser una fecha valida YYYY-MM-DD');
const auditoriaQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  tipo: z.enum(ACTIONS).optional(),
  usuario_id: z.string().regex(/^[1-9]\d{0,9}$/).refine(
    (value) => Number(value) <= 2147483647, 'Usuario invalido').optional(),
  modulo: z.enum(MODULES).optional(),
  desde: day.optional(),
  hasta: day.optional(),
  cursor: z.string().min(1).max(1000).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().refine((value) => !value.desde || !value.hasta || value.desde <= value.hasta,
  { message: 'hasta debe ser igual o posterior a desde', path: ['hasta'] });

module.exports = { ACTIONS, MODULES, ENTITIES, auditoriaQuerySchema };
