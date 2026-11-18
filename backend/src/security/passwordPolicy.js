const { z } = require('../validations/common.schemas');
function passwordIssues(value) {
  if (typeof value !== 'string') return ['Ingresa una contraseña'];
  const errors = [];
  if ([...value].length < 8) errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(value)) errors.push('Una mayúscula');
  if (!/[a-z]/.test(value)) errors.push('Una minúscula');
  if (!/[0-9]/.test(value)) errors.push('Un número');
  if (!/[^A-Za-z0-9\s]/u.test(value)) errors.push('Un carácter especial');
  if (Buffer.byteLength(value, 'utf8') > 72) errors.push('Máximo 72 bytes UTF-8; no se recorta la contraseña');
  if (['password','password1','password1!','contraseña1!','contrasena1!','qwerty123!','12345678','admin123!','welcome1!','changeme1!'].includes(value.toLowerCase())) errors.push('Evita contraseñas comunes');
  return errors;
}
const passwordSchema = z.string().superRefine((value, ctx) => {
  for (const message of passwordIssues(value)) ctx.addIssue({code:'custom',message});
});
module.exports = { passwordIssues, passwordSchema };
