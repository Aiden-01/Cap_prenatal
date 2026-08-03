const {
  z,
  optionalPastOrTodayDate,
  requiredInt,
} = require('./common.schemas');
const { VACCINE_RULES, VACCINE_TYPES } = require('../domain/vacunasRules');

const tiposVacuna = Object.values(VACCINE_TYPES);
const momentosVacuna = ['previo_embarazo', 'durante_embarazo', 'postparto_aborto'];

const tipoVacuna = z.string({ error: 'Campo requerido' })
  .refine((value) => tiposVacuna.includes(value), 'Debe ser td, tdap, influenza o spr_sr');

const momentoVacuna = z.string({ error: 'Campo requerido' })
  .refine(
    (value) => momentosVacuna.includes(value),
    'Debe ser previo_embarazo, durante_embarazo o postparto_aborto'
  );

const validateClinicalDose = (data, ctx, { requireDate = false } = {}) => {
  const rule = VACCINE_RULES[data.tipo_vacuna];
  const dose = Number(data.numero_dosis ?? 1);
  if (data.tipo_vacuna === VACCINE_TYPES.INFLUENZA && dose !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numero_dosis'],
      message: 'Influenza requiere el valor interno 1',
    });
  }
  if (rule?.maximum && dose > rule.maximum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numero_dosis'],
      message: `${data.tipo_vacuna === VACCINE_TYPES.SPR_SR ? 'SR/SPR' : data.tipo_vacuna.toUpperCase()} permite maximo ${rule.maximum} dosis`,
    });
  }
  if (requireDate && rule && !data.fecha_dosis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fecha_dosis'],
      message: 'La fecha de aplicacion es obligatoria para esta vacuna',
    });
  }
};

const validateClinicalCreate = (data, ctx) => validateClinicalDose(
  data,
  ctx,
  { requireDate: true }
);

const vacunaSchema = z.object({
  tipo_vacuna: tipoVacuna,
  momento: momentoVacuna,
  numero_dosis: requiredInt(1, 10),
  fecha_dosis: optionalPastOrTodayDate,
}).passthrough().superRefine(validateClinicalCreate);

const vacunaUpdateSchema = z.object({
  tipo_vacuna: tipoVacuna,
  momento: momentoVacuna,
  numero_dosis: requiredInt(1, 10).optional(),
  fecha_dosis: optionalPastOrTodayDate,
  embarazo_id: requiredInt(1).optional(),
}).passthrough().superRefine(validateClinicalDose);

module.exports = {
  vacunaSchema,
  vacunaUpdateSchema,
};
