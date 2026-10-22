const { z } = require('zod');
const { requiredPastOrTodayDate } = require('./common.schemas');
const { responsableSchema } = require('./profesionales.schemas');

const tipoNotaSchema = z.enum(['nota_evolucion', 'nota_enfermeria']);
const enteroPositivo = z.number().int().min(1).max(2147483647);
const idUrl = z.union([
  enteroPositivo,
  z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(enteroPositivo),
]);
// Acepta también enteros ya validados: el servicio repite la validación tras el middleware.
const idQuery = idUrl;
const fechaAtencion = z.union([z.null(), requiredPastOrTodayDate.refine(value => !value.startsWith('0000'), 'Debe ser una fecha válida')]);
const horaAtencion = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
  'Debe usar formato HH:mm o HH:mm:ss').transform(value => value.length === 5 ? `${value}:00` : value).nullable();
// Narrativa de texto plano: conserva párrafos y tabulaciones, sin caracteres de control ocultos.
const contenidoSchema = z.string().transform(value => value.normalize('NFC').replace(/\r\n?/g, '\n'))
  .pipe(z.string().max(20000).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\n\t]/g, '')), 'Contenido inválido'));

const notaCreateSchema = z.object({
  tipo: tipoNotaSchema,
  embarazo_id: enteroPositivo.nullable().optional(),
  control_prenatal_id: enteroPositivo.nullable().optional(),
  es_principal: z.boolean().optional(),
  fecha_atencion: fechaAtencion.optional(),
  hora_atencion: horaAtencion.optional(),
  contenido: contenidoSchema.default(''),
  responsable: responsableSchema,
  clave_idempotencia: z.uuid(),
}).strict();

const notaUpdateSchema = z.object({
  version: enteroPositivo,
  fecha_atencion: fechaAtencion.optional(),
  hora_atencion: horaAtencion.optional(),
  contenido: contenidoSchema.optional(),
  responsable: responsableSchema.optional(),
}).strict().refine(body => ['fecha_atencion', 'hora_atencion', 'contenido', 'responsable']
  .some(campo => body[campo] !== undefined), 'Indica al menos un campo para actualizar');

const notaFinalizeSchema = z.object({ version: enteroPositivo }).strict();
const notaPacienteParamsSchema = z.object({ pacienteId: idUrl }).strict();
const notaIdParamsSchema = z.object({ pacienteId: idUrl, notaId: idUrl }).strict();
const notaListQuerySchema = z.object({
  tipo: tipoNotaSchema.optional(),
  embarazo_id: idQuery.optional(),
  control_prenatal_id: idQuery.optional(),
  estado: z.enum(['borrador', 'captura_finalizada']).optional(),
  pagina: idQuery.pipe(z.number().max(100000)).default(1),
  limite: idQuery.pipe(z.number().max(50)).default(20),
}).strict();

module.exports = { notaCreateSchema, notaUpdateSchema, notaFinalizeSchema,
  notaPacienteParamsSchema, notaIdParamsSchema, notaListQuerySchema };
