const { z, idParam, requiredDate } = require('./common.schemas');

const citaQuerySchema = z.strictObject({
  embarazo_id: idParam,
});

const citaReprogramarSchema = z.strictObject({
  fecha_programada: requiredDate,
});

const MAX_CALENDAR_RANGE_DAYS = 62;
const MS_PER_DAY = 86_400_000;

const citasCalendarioQuerySchema = z.strictObject({
  from: requiredDate,
  to: requiredDate,
}).superRefine(({ from, to }, ctx) => {
  if (from > to) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'La fecha final debe ser igual o posterior a la fecha inicial',
    });
    return;
  }

  const inclusiveDays = ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`))
    / MS_PER_DAY) + 1;
  if (inclusiveDays > MAX_CALENDAR_RANGE_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `El rango no puede superar ${MAX_CALENDAR_RANGE_DAYS} dias`,
    });
  }
});

module.exports = {
  citaQuerySchema,
  citaReprogramarSchema,
  citasCalendarioQuerySchema,
  MAX_CALENDAR_RANGE_DAYS,
};
