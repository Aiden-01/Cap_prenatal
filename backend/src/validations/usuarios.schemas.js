const { passwordSchema } = require('../security/passwordPolicy');
const {
  z,
  optionalBoolean,
  requiredText,
} = require('./common.schemas');

const rolSchema = z.enum(['director', 'admin', 'personal_salud'], {
  error: 'Rol invalido',
});

const perfilIdSchema = z.union([
  z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number),
]).pipe(z.number().int().min(1).max(2147483647)).nullable().optional();

// Un correo con formato válido todavía debe comprobarse desde la cuenta titular.
const emailSchema = z.string({ error: 'El correo electrónico es obligatorio' })
  .trim().toLowerCase().min(1, 'El correo electrónico es obligatorio')
  .max(254, 'El correo electrónico debe tener como máximo 254 caracteres')
  .email('Ingresa un correo electrónico válido');

const usuarioCreateSchema = z.object({
  nombre_completo: requiredText(150),
  username: requiredText(80),
  email: emailSchema,
  password: passwordSchema,
  rol: rolSchema,
  cargo_id: perfilIdSchema,
}).strict();

const usuarioUpdateSchema = z.object({
  username: requiredText(80).optional(),
  nombre_completo: requiredText(150).optional(),
  activo: optionalBoolean,
  rol: rolSchema.optional(),
  cargo_id: perfilIdSchema,
}).strict();

module.exports = {
  emailSchema,
  usuarioCreateSchema,
  usuarioUpdateSchema,
};
