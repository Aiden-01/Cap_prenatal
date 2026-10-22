const { z } = require('zod');

const texto = (max) => z.string().transform(value => value.normalize('NFC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(max)
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Texto contiene caracteres de control')
    .refine(value => value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').trim().length > 0, 'Texto vacío'));
const opcional = (max) => z.preprocess(
  value => value === undefined || (typeof value === 'string' && !value.trim()) ? null : value,
  texto(max).nullable()
);
const catalogoSchema = z.object({
  nombre: texto(150),
  codigo: opcional(40),
  descripcion: opcional(500),
}).strict();
const catalogoIdSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(2147483647)),
}).strict();
const catalogoListSchema = z.object({
  estado: z.enum(['activos', 'inactivos', 'todos']).default('activos'),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
module.exports = { catalogoSchema, catalogoIdSchema, catalogoListSchema };
