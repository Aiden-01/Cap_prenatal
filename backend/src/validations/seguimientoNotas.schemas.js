const { z } = require('zod');
const { responsableSchema } = require('./profesionales.schemas');
const id = z.coerce.number().int().positive().max(2147483647);
const paramsSchema = z.object({ pacienteId: id }).strict();
const controlParamsSchema = paramsSchema.extend({ id });
const idsSchema = z.union([z.string().regex(/^[1-9]\d*(,[1-9]\d*)*$/).transform(value => value.split(',')), z.array(id)])
  .pipe(z.array(id).min(1).max(100)).transform(ids => [...new Set(ids)]);
const querySchema = z.object({ embarazo_id: id, controles_ids: idsSchema }).strict();
const bodySchema = z.object({ embarazo_id: id, version: id,
  tipo: z.enum(['nota_evolucion', 'nota_enfermeria']), responsable: responsableSchema }).strict();
module.exports = { paramsSchema, controlParamsSchema, querySchema, bodySchema };
