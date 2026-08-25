const { z } = require('zod');

const integerString = z.string().regex(/^(?:0|[1-9]\d*)$/);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AUTOMATION_CENSUS_DAYS = 31;
const DISPATCH_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MISSED_APPOINTMENT_REPLAY_CONFIRMATION = 'REINTENTAR_INASISTENCIAS_SEMANALES';

function isRealIsoDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isoDayNumber(value) {
  return Date.parse(`${value}T00:00:00Z`) / DAY_MS;
}

const automationDate = z.string()
  .regex(DATE_RE)
  .refine(isRealIsoDate);

const automationRangeQuerySchema = z.strictObject({
  offset_days: integerString
    .transform(Number)
    .pipe(z.number().int().min(0).max(30))
    .optional(),
  window_days: integerString
    .transform(Number)
    .pipe(z.number().int().min(1).max(7))
    .optional(),
});

const automationCensusPeriodQuerySchema = z.strictObject({
  desde: automationDate,
  hasta: automationDate,
}).superRefine(({ desde, hasta }, ctx) => {
  if (!isRealIsoDate(desde) || !isRealIsoDate(hasta)) return;
  if (desde > hasta) {
    ctx.addIssue({ code: 'custom', path: ['hasta'] });
    return;
  }

  const inclusiveDays = isoDayNumber(hasta) - isoDayNumber(desde) + 1;
  if (inclusiveDays > MAX_AUTOMATION_CENSUS_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['hasta'] });
  }
});

const automationMissedAppointmentsPeriodSchema = z.strictObject({
  desde: automationDate,
  hasta: automationDate,
});

const automationEmptyQuerySchema = z.strictObject({});

const automationDispatchConfirmationSchema = z.strictObject({
  dispatch_token: z.string().regex(DISPATCH_TOKEN_RE),
});

const automationDispatchResolutionSchema = z.strictObject({
  desde: automationDate,
  hasta: automationDate,
  resolucion: z.enum(['enviado', 'reintentar']),
  confirmacion: z.literal(MISSED_APPOINTMENT_REPLAY_CONFIRMATION),
  motivo_codigo: z.enum([
    'entrega_confirmada_en_resend',
    'entrega_no_realizada_confirmada',
  ]),
});

module.exports = {
  DISPATCH_TOKEN_RE,
  MAX_AUTOMATION_CENSUS_DAYS,
  MISSED_APPOINTMENT_REPLAY_CONFIRMATION,
  automationCensusPeriodQuerySchema,
  automationDispatchConfirmationSchema,
  automationDispatchResolutionSchema,
  automationEmptyQuerySchema,
  automationMissedAppointmentsPeriodSchema,
  automationRangeQuerySchema,
  isRealIsoDate,
};
