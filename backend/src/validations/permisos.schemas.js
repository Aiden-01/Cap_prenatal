const { z } = require('./common.schemas');

const permisosUpdateSchema = z.object({
  permisos: z.array(z.string().min(1, 'Codigo requerido')).default([]),
}).passthrough();

module.exports = {
  permisosUpdateSchema,
};
