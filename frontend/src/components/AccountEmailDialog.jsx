import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, MailCheck, ShieldCheck } from 'lucide-react';
import AdminDialog from './usuarios/AdminDialog';
import AccountPasswordFields from './AccountPasswordFields';
import api from '../api/axios';
import { getErrorMessage } from '../utils/errorMessage';
import { normalizarEmail, validarEmail } from '../utils/usuarioEmail';
import { validPassword } from '../utils/passwordPolicy';
import '../pages/forced-password.css';
import './account-email.css';

const digits = value => value.replace(/\D/g, '').slice(0, 8);
const timeLabel = time => `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
const emptyPassword = { new_password: '', confirm_password: '' };

export default function AccountEmailDialog({ onClose }) {
  const titleId = useId();
  const panel = useRef(null);
  const pending = useRef(false);
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [csrf, setCsrf] = useState('');
  const [password, setPassword] = useState(emptyPassword);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expires, setExpires] = useState(0);
  const [resend, setResend] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = Math.max(0, Math.ceil((expires - now) / 1000));
  const resendLeft = Math.max(0, Math.ceil((resend - now) / 1000));

  useEffect(() => {
    panel.current?.querySelector('input, button')?.focus();
    if (step !== 'code') return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [step]);

  function request(path, body, csrfValue) {
    const config = { skipAuthRefresh: true, skipAuthRedirect: true,
      headers: { 'X-CAP-Recovery': '1', ...(csrfValue ? { 'X-Recovery-CSRF': csrfValue } : {}) } };
    return api.post('/auth/recuperacion/' + path, body, config);
  }

  async function perform(action) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try { await action(); }
    catch (err) {
      setError(getErrorMessage(err, 'No se pudo completar la solicitud.'));
      if (err.response?.data?.code === 'ACCOUNT_GRANT_INVALID') {
        setPassword(emptyPassword); setCsrf(''); setStep('email');
      }
    } finally { pending.current = false; setBusy(false); }
  }

  function issue(event) {
    event.preventDefault();
    if (step === 'code' && resendLeft) return;
    if (validarEmail(email)) { setError(validarEmail(email)); return; }
    void perform(async () => {
      const { data } = await request('solicitar', { email: normalizarEmail(email) });
      const start = Date.now();
      setNow(start); setResend(start + data.resend_after * 1000); setExpires(start + data.expires_in * 1000);
      setCode(''); setStep('code');
    });
  }

  function verify(event) {
    event.preventDefault();
    if (code.length !== 8 || !secondsLeft) return;
    void perform(async () => {
      const { data } = await request('validar', { email: normalizarEmail(email), code });
      setCode(''); setCsrf(data.csrf); setStep('password');
    });
  }

  function reset(event) {
    event.preventDefault();
    if (!validPassword(password.new_password) || password.new_password !== password.confirm_password) return;
    void perform(async () => {
      await request('restablecer', password, csrf);
      setCsrf(''); setPassword(emptyPassword); setStep('success');
    });
  }

  const title = step === 'code' ? 'Ingresa tu código' : step === 'password' ? 'Establece una nueva contraseña'
    : step === 'success' ? 'Contraseña actualizada' : 'Recupera tu contraseña';
  return <AdminDialog titleId={titleId} busy={busy} onClose={onClose} className="account-email-dialog forced-password-card">
    <div className="forced-password-heading account-email-heading">
      <span className="forced-password-shield" aria-hidden="true">{step === 'success' ? <CheckCircle2 size={28} /> : <ShieldCheck size={28} />}</span>
      <h2 id={titleId}>{title}</h2>
      {step === 'password' && <p>Elige una contraseña personal que solo tú conozcas.</p>}
    </div>
    <div ref={panel}>
      {step === 'email' && <form onSubmit={issue} noValidate>
        <label className="input-label" htmlFor={titleId + '-email'}>Correo electrónico</label>
        <input id={titleId + '-email'} className="input-field" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
        <p>Ingresa el correo registrado en tu cuenta.</p>
        <button className="btn-primary forced-password-submit" disabled={busy}><MailCheck size={17} />Enviar código</button>
      </form>}
      {step === 'code' && <form onSubmit={verify} noValidate>
        <p>Si el correo corresponde a una cuenta activa, recibirás un código de ocho dígitos.</p>
        <label className="input-label" htmlFor={`${titleId}-code`}>Código de ocho dígitos</label>
        <input id={`${titleId}-code`} className="input-field account-email-code" inputMode="numeric" autoComplete="one-time-code" value={code}
          aria-describedby={`${titleId}-time`} onChange={event => setCode(digits(event.target.value))} disabled={busy} />
        <p id={`${titleId}-time`}>{secondsLeft ? `Vence en ${timeLabel(secondsLeft)}` : 'El código venció. Solicita uno nuevo.'}</p>
        <button className="btn-primary forced-password-submit" disabled={busy || code.length !== 8 || !secondsLeft}>Validar código</button>
        <button type="button" className="btn-secondary" onClick={issue} disabled={busy || resendLeft > 0}>{resendLeft ? `Reenviar en ${resendLeft} s` : 'Reenviar código'}</button>
      </form>}
      {step === 'password' && <form onSubmit={reset} noValidate><fieldset disabled={busy}>
        <AccountPasswordFields form={password} setForm={setPassword} idPrefix="recovery-" error={error} />
        <button className="btn-primary forced-password-submit" disabled={!validPassword(password.new_password) || password.new_password !== password.confirm_password}>Guardar contraseña</button>
      </fieldset></form>}
      {step === 'success' && <><p role="status">Ya puedes iniciar sesión con tu nueva contraseña.</p>
        <button className="btn-primary forced-password-submit" onClick={onClose}>Volver al inicio de sesión</button></>}
      {step !== 'password' && error && <p className="field-error-text" role="alert">{error}</p>}
      {step !== 'success' && <button className="forced-password-logout" type="button" disabled={busy} onClick={onClose}>Cancelar</button>}
    </div>
  </AdminDialog>;
}
