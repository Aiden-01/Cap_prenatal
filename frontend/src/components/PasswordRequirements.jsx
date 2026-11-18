import { passwordRequirements } from '../utils/passwordPolicy';
export default function PasswordRequirements({ value = '' }) {
  const requirements = passwordRequirements(value);
  const score = requirements.filter(([,ok]) => ok).length;
  return <div className="password-requirements"><label>Fortaleza <meter min="0" max={requirements.length} value={value ? score : 0} aria-label="Fortaleza de la contraseña" /></label>
    <ul aria-label="Requisitos de contraseña">{requirements.map(([label,ok]) => <li key={label}><span aria-hidden="true">{ok ? '✓' : '○'} </span>{label}<span className="sr-only">{ok ? ': cumplido' : ': pendiente'}</span></li>)}</ul></div>;
}
