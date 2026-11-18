export function passwordRequirements(value = '') {
  return [
    ['Mínimo 8 caracteres', [...value].length >= 8],
    ['Una mayúscula', /[A-Z]/.test(value)], ['Una minúscula', /[a-z]/.test(value)],
    ['Un número', /[0-9]/.test(value)], ['Un carácter especial', /[^A-Za-z0-9\s]/u.test(value)],
    ['Máximo 72 bytes UTF-8', new TextEncoder().encode(value).length <= 72],
    ['Evita contraseñas comunes', !['password','password1','password1!','contraseña1!','contrasena1!','qwerty123!','12345678','admin123!','welcome1!','changeme1!'].includes(value.toLowerCase())],
  ];
}
export const validPassword = value => passwordRequirements(value).every(([,ok]) => ok);
