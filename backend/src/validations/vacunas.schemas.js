const {
  z,
  optionalDate,
  optionalInt,
  requiredInt,
} = require('./common.schemas');

const tiposVacuna = ['td_tdap', 'influenza', 'spr_sr'];
const momentosVacuna = ['previo_embarazo', 'durante_embarazo', 'postparto_aborto'];

const tipoVacuna = z.string({ error: 'Campo requerido' })
  .refine((value) => tiposVacuna.includes(value), 'Debe ser td_tdap, influenza o spr_sr');

const momentoVacuna = z.string({ error: 'Campo requerido' })
  .refine(
    (value) => momentosVacuna.includes(value),
    'Debe ser previo_embarazo, durante_embarazo o postparto_aborto'
  );

const vacunaSchema = z.object({
  tipo_vacuna: tipoVacuna,
  momento: momentoVacuna,
  numero_dosis: optionalInt(1, 10),
  fecha_dosis: optionalDate,
}).passthrough();

const vacunaUpdateSchema = z.object({
  tipo_vacuna: tipoVacuna,
  momento: momentoVacuna,
  numero_dosis: requiredInt(1, 10).optional(),
  fecha_dosis: optionalDate,
}).passthrough();

module.exports = {
  vacunaSchema,
  vacunaUpdateSchema,
};
