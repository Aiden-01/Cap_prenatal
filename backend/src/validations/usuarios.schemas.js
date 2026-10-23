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

// El correo pertenece solo a la administración de cuentas. Su presencia no
// acredita propiedad ni cambia el mecanismo de autenticación por username.
const emailSchema = z.string({ error: 'El correo electrónico es obligatorio' })
  .trim().toLowerCase().min(1, 'El correo electrónico es obligatorio')
  .max(254, 'El correo electrónico debe tener como máximo 254 caracteres')
  .email('Ingresa un correo electrónico válido');

const usuarioCreateSchema = z.object({
  nombre_completo: requiredText(150),
  username: requiredText(80),
  email: emailSchema,
  password: z.string({ error: 'Campo requerido' }).min(6, 'La contrasena debe tener al menos 6 caracteres'),
  rol: rolSchema,
  cargo_id: perfilIdSchema,
}).strict();

const usuarioUpdateSchema = z.object({
  username: requiredText(80).optional(),
  nombre_completo: requiredText(150).optional(),
  email: emailSchema.optional(),
  activo: optionalBoolean,
  password: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().min(6, 'La contrasena debe tener al menos 6 caracteres').optional()
  ),
  rol: rolSchema.optional(),
  cargo_id: perfilIdSchema,
}).strict();

module.exports = {
  usuarioCreateSchema,
  usuarioUpdateSchema,
};
