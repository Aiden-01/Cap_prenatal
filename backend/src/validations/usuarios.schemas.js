const {
  z,
  optionalBoolean,
  requiredText,
} = require('./common.schemas');

const rolSchema = z.enum(['admin', 'personal_salud'], {
  error: 'Rol invalido',
});

const usuarioCreateSchema = z.object({
  nombre_completo: requiredText(150),
  username: requiredText(80),
  password: z.string({ error: 'Campo requerido' }).min(6, 'La contrasena debe tener al menos 6 caracteres'),
  rol: rolSchema,
}).passthrough();

const usuarioUpdateSchema = z.object({
  nombre_completo: requiredText(150),
  activo: optionalBoolean,
  password: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().min(6, 'La contrasena debe tener al menos 6 caracteres').optional()
  ),
  rol: rolSchema,
}).passthrough();

module.exports = {
  usuarioCreateSchema,
  usuarioUpdateSchema,
};
