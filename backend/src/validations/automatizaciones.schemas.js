const { z } = require('zod');

const integerString = z.string().regex(/^(?:0|[1-9]\d*)$/);

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

module.exports = {
  automationRangeQuerySchema,
};
