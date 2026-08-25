const { z, idParam, requiredDate } = require('./common.schemas');

const citaQuerySchema = z.strictObject({
  embarazo_id: idParam,
});

const citaReprogramarSchema = z.strictObject({
  fecha_programada: requiredDate,
});

module.exports = { citaQuerySchema, citaReprogramarSchema };
