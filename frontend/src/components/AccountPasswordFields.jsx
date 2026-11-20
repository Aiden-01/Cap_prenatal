import { useId, useState } from 'react';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { passwordRequirements } from '../utils/passwordPolicy';

const labels = { current_password: 'Contraseña temporal', new_password: 'Nueva contraseña', confirm_password: 'Confirmar nueva contraseña' };

export default function AccountPasswordFields({ form, setForm, includeCurrent = false, error = '', idPrefix = '' }) {
  const [visible, setVisible] = useState({});
  const rulesId = useId();
  const requirements = passwordRequirements(form.new_password);
  const tooLong = !requirements[5][1];
  const composition = requirements.slice(0, 5).filter(([, ok]) => ok).length;
  const strength = !form.new_password ? 0 : requirements.every(([, ok]) => ok) ? 4 : !requirements[6][1] ? 1 : Math.min(3, Math.max(1, Math.round(composition * 3 / 5)));
  const strengthLabel = ['Sin evaluar', 'Débil', 'En progreso', 'Casi lista', 'Fuerte'][strength];
  const lengthMessage = 'Esta contraseña es demasiado larga. Prueba con una frase más corta.';
  const fields = includeCurrent ? Object.keys(labels) : ['new_password', 'confirm_password'];
  return <>
    <div className="forced-password-fields">
      {fields.map(name => <div className="forced-password-field" key={name}>
        <label htmlFor={idPrefix + name}>{labels[name]}</label>
        <div className="forced-password-input">
          <input className="input-field" id={idPrefix + name} type={visible[name] ? 'text' : 'password'}
            autoComplete={name === 'current_password' ? 'current-password' : 'new-password'} required value={form[name]}
            aria-invalid={name === 'new_password' && tooLong} aria-describedby={name === 'new_password' ? rulesId : undefined}
            onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} />
          <button type="button" aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${labels[name].toLowerCase()}`} aria-pressed={Boolean(visible[name])}
            onClick={() => setVisible(current => ({ ...current, [name]: !current[name] }))}>{visible[name] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
        </div>
      </div>)}
    </div>
    <div className="forced-password-strength" data-strength={strength}>
      <div className="forced-password-strength-label"><span>Fortaleza de tu contraseña</span><strong>{strengthLabel}</strong></div>
      <div className="forced-password-segments" role="meter" aria-label="Fortaleza de la contraseña" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength} aria-valuetext={strengthLabel}>{[1, 2, 3, 4].map(segment => <span key={segment} className={segment <= strength ? 'is-filled' : ''} />)}</div>
    </div>
    <section className="forced-password-rules" aria-labelledby={rulesId}>
      <h2 id={rulesId}>Para una contraseña segura</h2>
      <ul aria-label="Requisitos de contraseña">{requirements.filter((_, index) => index !== 5).map(([label, ok]) => {
        const completed = Boolean(form.new_password) && ok;
        return <li key={label} className={completed ? 'is-complete' : ''}>{completed ? <Check size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}<span>{label}<span className="sr-only">{completed ? ': cumplido' : ': pendiente'}</span></span></li>;
      })}</ul>
    </section>
    <div className="forced-password-feedback" aria-live="polite">
      {tooLong && <p role="status">{lengthMessage}</p>}
      {form.confirm_password && form.confirm_password !== form.new_password && <p role="status">Las contraseñas no coinciden.</p>}
      {includeCurrent && form.new_password && form.new_password === form.current_password && <p role="status">Elige una contraseña diferente de la temporal.</p>}
      {error && <p role="alert">{/72.*bytes|UTF-?8|bytes.*72/i.test(error) ? lengthMessage : error}</p>}
    </div>
  </>;
}
