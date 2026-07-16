const { z } = require('zod');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

function isRealIsoDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isoDayNumber(value) {
  return Date.parse(`${value}T00:00:00Z`) / DAY_MS;
}

const reportDate = z.string({ error: 'Campo requerido' })
  .regex(DATE_RE, 'Debe usar formato YYYY-MM-DD')
  .refine(isRealIsoDate, 'Debe ser una fecha valida');

const periodoReportesQuerySchema = z.object({
  desde: reportDate,
  hasta: reportDate,
}).strict('Parametro no permitido').superRefine(({ desde, hasta }, ctx) => {
  if (!isRealIsoDate(desde) || !isRealIsoDate(hasta)) return;

  if (desde > hasta) {
    ctx.addIssue({
      code: 'custom',
      path: ['hasta'],
      message: 'La fecha hasta debe ser igual o posterior a desde',
    });
    return;
  }

  const inclusiveDays = isoDayNumber(hasta) - isoDayNumber(desde) + 1;
  if (inclusiveDays > MAX_REPORT_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['hasta'],
      message: `El periodo no puede superar ${MAX_REPORT_DAYS} dias`,
    });
  }
});

module.exports = {
  MAX_REPORT_DAYS,
  isRealIsoDate,
  periodoReportesQuerySchema,
};
