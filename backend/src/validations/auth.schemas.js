const { passwordSchema } = require('../security/passwordPolicy');
const { z } = require('./common.schemas');

const loginSchema = z.object({
  username: z.string({ error: 'Usuario y contrasena requeridos' }).trim().min(1, 'Usuario y contrasena requeridos'),
  password: z.string({ error: 'Usuario y contrasena requeridos' }).min(1, 'Usuario y contrasena requeridos').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Máximo 72 bytes UTF-8'),
}).passthrough();

const changePasswordSchema = z.object({
  current_password: z.string({ error: 'Contrasena actual requerida' }).min(1, 'Contrasena actual requerida').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Máximo 72 bytes UTF-8'),
  new_password: passwordSchema,
  confirm_password: z.string({ error: 'Confirmacion requerida' }).min(1, 'Confirmacion requerida'),
}).strict().refine((data) => data.new_password === data.confirm_password, {
  path: ['confirm_password'],
  message: 'La confirmacion no coincide con la nueva contrasena',
});

const emptyBodySchema = z.object({}).strict();

module.exports = {
  loginSchema,
  changePasswordSchema,
  emptyBodySchema,
};
