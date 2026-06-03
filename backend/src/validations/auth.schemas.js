const { z } = require('./common.schemas');

const loginSchema = z.object({
  username: z.string({ error: 'Usuario y contrasena requeridos' }).trim().min(1, 'Usuario y contrasena requeridos'),
  password: z.string({ error: 'Usuario y contrasena requeridos' }).min(1, 'Usuario y contrasena requeridos'),
}).passthrough();

module.exports = {
  loginSchema,
};
