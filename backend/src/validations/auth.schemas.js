const { z } = require('./common.schemas');

const loginSchema = z.object({
  username: z.string({ error: 'Usuario y contrasena requeridos' }).trim().min(1, 'Usuario y contrasena requeridos'),
  password: z.string({ error: 'Usuario y contrasena requeridos' }).min(1, 'Usuario y contrasena requeridos'),
}).passthrough();

const changePasswordSchema = z.object({
  current_password: z.string({ error: 'Contrasena actual requerida' }).min(1, 'Contrasena actual requerida'),
  new_password: z.string({ error: 'Nueva contrasena requerida' }).min(6, 'La nueva contrasena debe tener al menos 6 caracteres'),
  confirm_password: z.string({ error: 'Confirmacion requerida' }).min(1, 'Confirmacion requerida'),
}).refine((data) => data.new_password === data.confirm_password, {
  path: ['confirm_password'],
  message: 'La confirmacion no coincide con la nueva contrasena',
}).passthrough();

module.exports = {
  loginSchema,
  changePasswordSchema,
};
