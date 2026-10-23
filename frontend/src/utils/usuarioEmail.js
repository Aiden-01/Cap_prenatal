export const normalizarEmail = value => String(value ?? '').trim().toLowerCase();

export function validarEmail(value) {
  const email = normalizarEmail(value);
  if (!email) return 'Ingresa un correo electrónico.';
  if (email.length > 254) return 'El correo electrónico admite hasta 254 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Ingresa un correo electrónico válido.';
  return '';
}
