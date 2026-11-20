export const normalizarEmail = value => String(value ?? '').trim().toLowerCase();

export function validarEmail(value) {
  const email = normalizarEmail(value);
  if (!email) return 'Ingresa un correo electrónico.';
  if (email.length > 254) return 'El correo electrónico admite hasta 254 caracteres.';
  // Mantiene la misma comprobación de formato que el esquema de alta en la API.
  if (!/^(?!\.)(?!.*\.\.)([a-z0-9_'+\-.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/.test(email)) return 'Ingresa un correo electrónico válido.';
  return '';
}
