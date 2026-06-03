const {
  z,
  requiredDate,
  optionalDate,
  optionalTime,
  optionalText,
} = require('./common.schemas');

const morbilidadBase = {
  fecha: optionalDate,
  hora: optionalTime,
  motivo_consulta: optionalText(2000),
  historia_enfermedad_actual: optionalText(5000),
  revision_por_sistemas: optionalText(5000),
  examen_fisico: optionalText(5000),
  impresion_clinica: optionalText(2000),
  tratamiento_referencia: optionalText(5000),
  nombre_cargo_atiende: optionalText(150),
};

const morbilidadCreateSchema = z.object({
  ...morbilidadBase,
  fecha: requiredDate,
  motivo_consulta: z.string({ error: 'Campo requerido' })
    .trim()
    .min(1, 'Campo requerido')
    .max(2000, 'Debe tener 2000 caracteres o menos'),
}).passthrough();

const morbilidadUpdateSchema = z.object(morbilidadBase).passthrough();

module.exports = {
  morbilidadCreateSchema,
  morbilidadUpdateSchema,
};
