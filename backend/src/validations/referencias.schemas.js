const {
  z,
  requiredDate,
  optionalDate,
  optionalText,
} = require('./common.schemas');

const referenciaBase = {
  fecha: optionalDate,
  lugar_referencia: optionalText(200),
  diagnostico: optionalText(5000),
};

const referenciaCreateSchema = z.object({
  ...referenciaBase,
  fecha: requiredDate,
  lugar_referencia: z.string({ error: 'Campo requerido' })
    .trim()
    .min(1, 'Campo requerido')
    .max(200, 'Debe tener 200 caracteres o menos'),
}).passthrough();

const referenciaUpdateSchema = z.object(referenciaBase).passthrough();

module.exports = {
  referenciaCreateSchema,
  referenciaUpdateSchema,
};
