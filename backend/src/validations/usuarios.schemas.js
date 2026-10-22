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

const usuarioCreateSchema = z.object({
  nombre_completo: requiredText(150),
  username: requiredText(80),
  password: z.string({ error: 'Campo requerido' }).min(6, 'La contrasena debe tener al menos 6 caracteres'),
  rol: rolSchema,
  cargo_id: perfilIdSchema,
  especialidad_id: perfilIdSchema,
}).passthrough();

const usuarioUpdateSchema = z.object({
  nombre_completo: requiredText(150).optional(),
  activo: optionalBoolean,
  password: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().min(6, 'La contrasena debe tener al menos 6 caracteres').optional()
  ),
  rol: rolSchema.optional(),
  cargo_id: perfilIdSchema,
  especialidad_id: perfilIdSchema,
}).passthrough();

module.exports = {
  usuarioCreateSchema,
  usuarioUpdateSchema,
};
