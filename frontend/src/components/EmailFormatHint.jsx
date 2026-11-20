import { normalizarEmail, validarEmail } from '../utils/usuarioEmail';

export default function EmailFormatHint({ id, value }) {
  const present = Boolean(normalizarEmail(value));
  const invalid = present && Boolean(validarEmail(value));
  return <div id={id} aria-live="polite" className={`email-format ${present ? (invalid ? 'email-format-invalid' : 'email-format-valid') : ''}`}>
    {present && (invalid ? 'Formato de correo inválido' : 'Correo electrónico válido')}
  </div>;
}
