const { z } = require('zod');

const emptyToUndefined = (value) => (value === '' || value === null ? undefined : value);

function todayGuatemalaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const idParam = z.coerce.number({
  invalid_type_error: 'Debe ser un identificador numerico',
}).int('Debe ser un entero').positive('Debe ser mayor que 0');

const idParams = z.object({
  id: idParam.optional(),
  pacienteId: idParam.optional(),
});

const pacienteIdParam = z.object({
  pacienteId: idParam,
});

const pacienteRootIdParam = z.object({
  id: idParam,
});

const nestedIdParams = z.object({
  pacienteId: idParam,
  id: idParam,
});

const validDateString = z.string({ error: 'Campo requerido' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Debe usar formato YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Debe ser una fecha valida');

const dateString = z.preprocess(emptyToUndefined, validDateString);
const optionalDate = z.preprocess(emptyToUndefined, validDateString.optional());
const requiredDate = dateString;
const validPastOrTodayDateString = validDateString.refine(
  (value) => value <= todayGuatemalaDate(),
  'No puede ser una fecha futura'
);
const optionalPastOrTodayDate = z.preprocess(emptyToUndefined, validPastOrTodayDateString.optional());
const requiredPastOrTodayDate = z.preprocess(emptyToUndefined, validPastOrTodayDateString);

const validTimeString = z.string({ error: 'Campo requerido' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Debe usar formato HH:mm o HH:mm:ss');

const timeString = z.preprocess(emptyToUndefined, validTimeString);
const optionalTime = z.preprocess(emptyToUndefined, validTimeString.optional());

function optionalNumber(min, max, label = 'Debe ser un numero valido') {
  let schema = z.coerce.number({ invalid_type_error: label }).finite(label);
  if (min !== undefined) schema = schema.min(min, `Debe ser mayor o igual a ${min}`);
  if (max !== undefined) schema = schema.max(max, `Debe ser menor o igual a ${max}`);
  return z.preprocess(emptyToUndefined, schema.optional());
}

function optionalInt(min, max) {
  return optionalNumber(min, max).refine(
    (value) => value === undefined || Number.isInteger(value),
    'Debe ser un numero entero'
  );
}

function requiredInt(min, max) {
  let schema = z.coerce.number({ error: 'Campo requerido' }).int('Debe ser un numero entero');
  if (min !== undefined) schema = schema.min(min, `Debe ser mayor o igual a ${min}`);
  if (max !== undefined) schema = schema.max(max, `Debe ser menor o igual a ${max}`);
  return z.preprocess(emptyToUndefined, schema);
}

const optionalBoolean = z.preprocess(emptyToUndefined, z.boolean().optional());
const optionalText = (max = 255) => z.preprocess(
  emptyToUndefined,
  z.string().trim().max(max, `Debe tener ${max} caracteres o menos`).optional()
);
const requiredText = (max = 255) => z.preprocess(
  emptyToUndefined,
  z.string({ error: 'Campo requerido' })
  .trim()
  .min(1, 'Campo requerido')
  .max(max, `Debe tener ${max} caracteres o menos`)
);

const gestationalAge = optionalInt(0, 45);
const bloodPressureSystolic = optionalInt(50, 250);
const bloodPressureDiastolic = optionalInt(30, 160);
const heartRate = optionalInt(30, 220);
const respiratoryRate = optionalInt(5, 80);
const temperature = optionalNumber(30, 45);
const weightKg = optionalNumber(20, 250);
const heightCm = optionalNumber(80, 230);

module.exports = {
  z,
  dateString,
  optionalDate,
  requiredDate,
  optionalPastOrTodayDate,
  requiredPastOrTodayDate,
  optionalTime,
  optionalNumber,
  optionalInt,
  requiredInt,
  optionalBoolean,
  optionalText,
  requiredText,
  idParam,
  idParams,
  pacienteIdParam,
  pacienteRootIdParam,
  nestedIdParams,
  gestationalAge,
  bloodPressureSystolic,
  bloodPressureDiastolic,
  heartRate,
  respiratoryRate,
  temperature,
  weightKg,
  heightCm,
};
