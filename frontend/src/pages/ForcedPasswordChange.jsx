import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, Check, Circle, Eye, EyeOff, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { passwordRequirements, validPassword } from '../utils/passwordPolicy';
import { getErrorMessage } from '../utils/errorMessage';
import './forced-password.css';
export default function ForcedPasswordChange() {
  const { usuario, logout } = useAuth();
  const [form,setForm] = useState({current_password:'',new_password:'',confirm_password:''});
  const lock = useRef(false);
  const [visible,setVisible] = useState({}), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const themeKey = `theme:${usuario?.username || usuario?.id || 'default'}`;
  const [theme, setTheme] = useState(() => ({ key: themeKey, value: localStorage.getItem(themeKey) || localStorage.getItem('theme') || 'light' }));
  const currentTheme = theme.key === themeKey ? theme.value : localStorage.getItem(themeKey) || localStorage.getItem('theme') || 'light';
  useEffect(() => {
    document.documentElement.classList.toggle('dark', currentTheme === 'dark');
    localStorage.setItem(themeKey, currentTheme);
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme, themeKey]);
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.requiere_cambio_password) return <Navigate to="/dashboard" replace />;
  const valid = validPassword(form.new_password) && form.new_password === form.confirm_password && form.new_password !== form.current_password && form.current_password;
  async function submit(event) {
    event.preventDefault(); if (lock.current || busy || !valid) return;
    lock.current = true;
    setBusy(true); setError('');
    try { await api.post('/auth/cambiar-password',form); logout({reason:'Contraseña actualizada. Inicia sesión con tu nueva contraseña.'}); }
    catch(err) { setError(getErrorMessage(err,'No se pudo cambiar la contraseña.')); }
    finally { lock.current = false; setBusy(false); }
  }
  async function salir() { if(busy)return; setBusy(true);try {await api.post('/auth/logout',{});logout();}catch(err){setError(getErrorMessage(err,'No se pudo cerrar sesión.'));setBusy(false);} }
  const requirements = passwordRequirements(form.new_password);
  const tooLong = !requirements[5][1];
  const composition = requirements.slice(0, 5).filter(([, ok]) => ok).length;
  const strength = !form.new_password ? 0 : requirements.every(([, ok]) => ok) ? 4 : !requirements[6][1] ? 1 : Math.min(3, Math.max(1, Math.round(composition * 3 / 5)));
  const strengthLabel = ['Sin evaluar', 'Débil', 'En progreso', 'Casi lista', 'Fuerte'][strength];
  const lengthMessage = 'Esta contraseña es demasiado larga. Prueba con una frase más corta.';
  const readableError = /72.*bytes|UTF-?8|bytes.*72/i.test(error) ? lengthMessage : error;
  return <main className="forced-password">
    <div className="forced-password-shell">
      <div className="forced-password-topbar">
        <div className="forced-password-brand"><ShieldCheck size={23} aria-hidden="true" /><span>CAP <strong>Prenatal</strong><small>CAP El Chal</small></span></div>
        <div className="forced-password-theme" role="group" aria-label="Apariencia">
          {[['light', Sun, 'claro'], ['dark', Moon, 'oscuro']].map(([value, Icon, label]) => <button key={value} type="button" aria-label={`Usar tema ${label}`} aria-pressed={currentTheme === value} onClick={() => setTheme({ key: themeKey, value })}><Icon size={16} aria-hidden="true" /></button>)}
        </div>
      </div>
      <section className="forced-password-card" aria-labelledby="forced-password-title">
        <header className="forced-password-heading"><span className="forced-password-shield"><ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true" /></span>
          <h1 id="forced-password-title">Protege tu cuenta</h1>
          <p>Antes de continuar, crea una contraseña personal que solo tú conozcas</p>
        </header>
        <form onSubmit={submit} noValidate><fieldset disabled={busy}>
          <div className="forced-password-fields">
            {[['current_password','Contraseña temporal'],['new_password','Nueva contraseña'],['confirm_password','Confirmar nueva contraseña']].map(([name,label]) => <div className="forced-password-field" key={name}>
              <label htmlFor={name}>{label}</label>
              <div className="forced-password-input">
                <input className="input-field" id={name} type={visible[name] ? 'text' : 'password'} autoComplete={name === 'current_password' ? 'current-password' : 'new-password'} required value={form[name]} aria-invalid={name === 'new_password' && tooLong} aria-describedby={name === 'new_password' ? `forced-password-rules${tooLong ? ' forced-password-length' : ''}` : undefined} onChange={e => setForm({ ...form, [name]: e.target.value })} />
                <button type="button" aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[name])} onClick={() => setVisible(current => ({ ...current, [name]: !current[name] }))}>{visible[name] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
              </div>
            </div>)}
          </div>
          <div className="forced-password-strength" data-strength={strength}>
            <div className="forced-password-strength-label"><span>Fortaleza de tu contraseña</span><strong>{strengthLabel}</strong></div>
            <div className="forced-password-segments" role="meter" aria-label="Fortaleza de la contraseña" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength} aria-valuetext={strengthLabel}>{[1,2,3,4].map(segment => <span key={segment} className={segment <= strength ? 'is-filled' : ''} />)}</div>
          </div>
          <section className="forced-password-rules" aria-labelledby="forced-password-rules">
            <h2 id="forced-password-rules">Para una contraseña segura</h2>
            <ul aria-label="Requisitos de contraseña">{requirements.filter((_, index) => index !== 5).map(([label, ok]) => {
              const completed = Boolean(form.new_password) && ok;
              return <li key={label} className={completed ? 'is-complete' : ''}>{completed ? <Check size={15} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}<span>{label}<span className="sr-only">{completed ? ': cumplido' : ': pendiente'}</span></span></li>;
            })}</ul>
          </section>
          <div className="forced-password-feedback" aria-live="polite">
            {tooLong && <p id="forced-password-length" role="status">{lengthMessage}</p>}
            {form.confirm_password && form.confirm_password !== form.new_password && <p role="status">Las contraseñas no coinciden.</p>}
            {form.new_password && form.new_password === form.current_password && <p role="status">Elige una contraseña diferente de la temporal.</p>}
            {error && <p role="alert">{readableError}</p>}
          </div>
          <button className="btn-primary forced-password-submit" disabled={!valid || busy}>{busy ? 'Guardando…' : <>Guardar y continuar<ArrowRight size={18} aria-hidden="true" /></>}</button>
          <button className="forced-password-logout" type="button" onClick={salir}><LogOut size={15} aria-hidden="true" />Cerrar sesión</button>
        </fieldset></form>
      </section>
      <p className="forced-password-footnote"><ShieldCheck size={14} aria-hidden="true" />Tu seguridad ayuda a proteger la información clínica</p>
    </div>
  </main>;
}
