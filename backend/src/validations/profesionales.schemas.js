const { z } = require('zod');

const cargoClinicoSchema = z.enum(['MED', 'AE', 'EP']);
const texto = (max) => z.string().transform(value => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(max).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Texto inválido'));
const usuarioIdSchema = z.number().int().positive().max(2147483647);
const responsableSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('autenticado') }).strict(),
  z.object({ tipo: z.literal('usuario'), usuario_id: usuarioIdSchema }).strict(),
  z.object({
    tipo: z.literal('externo'),
    nombre_completo: texto(150),
    cargo_codigo: cargoClinicoSchema,
  }).strict(),
]);
const profesionalesQuerySchema = z.object({
  buscar: z.string().trim().max(150).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Búsqueda inválida').default(''),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(50).default(20),
  cargo_codigo: cargoClinicoSchema.optional(),
}).strict();

module.exports = { profesionalesQuerySchema, responsableSchema };
