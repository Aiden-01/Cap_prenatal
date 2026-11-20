import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { validPassword } from '../utils/passwordPolicy';
import { getErrorMessage } from '../utils/errorMessage';
import AccountPasswordFields from '../components/AccountPasswordFields';
import './forced-password.css';
export default function ForcedPasswordChange() {
  const { usuario, logout } = useAuth();
  const [form,setForm] = useState({current_password:'',new_password:'',confirm_password:''});
  const lock = useRef(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const themeKey = `theme:${usuario?.username || usuario?.id || 'default'}`;
  const [theme, setTheme] = useState(() => ({ key: themeKey, value: localStorage.getItem(themeKey) || localStorage.getItem('theme') || 'light' }));
  const currentTheme = theme.key === themeKey ? theme.value : localStorage.getItem(themeKey) || localStorage.getItem('theme') || 'light';
  const themeEnabled = Boolean(usuario?.requiere_cambio_password);
  useLayoutEffect(() => {
    if (!themeEnabled) return;
    document.documentElement.classList.toggle('dark', currentTheme === 'dark');
    localStorage.setItem(themeKey, currentTheme);
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme, themeKey, themeEnabled]);
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
          <AccountPasswordFields form={form} setForm={setForm} includeCurrent error={error} />
          <button className="btn-primary forced-password-submit" disabled={!valid || busy}>{busy ? 'Guardando…' : <>Guardar y continuar<ArrowRight size={18} aria-hidden="true" /></>}</button>
          <button className="forced-password-logout" type="button" onClick={salir}><LogOut size={15} aria-hidden="true" />Cerrar sesión</button>
        </fieldset></form>
      </section>
      <p className="forced-password-footnote"><ShieldCheck size={14} aria-hidden="true" />Tu seguridad ayuda a proteger la información clínica</p>
    </div>
  </main>;
}
