import { useEffect, useId, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';
import AdminDialog from './usuarios/AdminDialog';
import EmailFormatHint from './EmailFormatHint';
import api from '../api/axios';
import { getErrorMessage } from '../utils/errorMessage';
import { normalizarEmail, validarEmail } from '../utils/usuarioEmail';
import '../pages/forced-password.css';
import './account-email.css';

export default function OwnEmailDialog({ onClose, onChanged }) {
  const id = useId();
  const firstField = useRef(null);
  const pending = useRef(false);
  const [account, setAccount] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.get('/auth/correo', { signal: controller.signal })
      .then(({ data }) => setAccount(data))
      .catch(err => {
        if (!controller.signal.aborted) setError(getErrorMessage(err, 'No se pudo consultar tu correo.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const ready = Boolean(account?.available);
  useEffect(() => {
    if (ready) firstField.current?.focus();
  }, [ready, challenge]);

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const normalized = normalizarEmail(email);
    const formatError = validarEmail(normalized);
    if (formatError) { setError(formatError); return; }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (challenge) {
        await api.post('/auth/correo/confirmar', { email: normalized, code, challenge_id: challenge.id });
        onChanged();
      } else {
        const { data } = await api.post('/auth/correo/solicitar', { email: normalized, current_password: password });
        setEmail(normalized);
        setRemaining(data.expires_in);
        setChallenge({ id: data.challenge_id, expiresAt: Date.now() + data.expires_in * 1000 });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo completar la solicitud.'));
    } finally {
      setPassword('');
      pending.current = false;
      setBusy(false);
    }
  }

  function restart() {
    setChallenge(null);
    setCode('');
    setError('');
  }

  return <AdminDialog titleId={id} busy={busy} onClose={onClose} className="account-email-dialog forced-password-card">
    <div className="forced-password-heading account-email-heading">
      <span className="forced-password-shield" aria-hidden="true"><MailCheck size={28} /></span>
      <h2 id={id}>Correo electrónico</h2>
      {account && <p>{account.email ? <>Correo actual <strong>{account.email}</strong></> : 'Tu cuenta todavía no tiene correo registrado.'}</p>}
    </div>
    {loading && <p role="status">Consultando tu correo…</p>}
    {account && !ready && <p role="status">El servicio de correo no está disponible.</p>}
    {ready && <form onSubmit={submit} noValidate>
      {challenge ? <>
        <p>Ingresa el código enviado a <strong>{email}</strong>. Al confirmar, tendrás que iniciar sesión nuevamente.</p>
        <label className="input-label" htmlFor={id + '-code'}>Código de ocho dígitos</label>
        <input ref={firstField} id={id + '-code'} className="input-field account-email-code" inputMode="numeric"
          autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
          aria-describedby={id + '-expiry'} disabled={busy} />
        <p id={id + '-expiry'}>{remaining ? 'El código vence 15 minutos después del envío.' : 'El código venció. Solicita uno nuevo.'}</p>
        <button className="btn-primary forced-password-submit" disabled={busy || code.length !== 8 || !remaining}>Confirmar correo</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={restart}>Cambiar dirección o solicitar otro código</button>
      </> : <>
        <label className="input-label" htmlFor={id + '-email'}>Nuevo correo electrónico</label>
        <input ref={firstField} id={id + '-email'} className="input-field" type="email" autoComplete="email" maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required aria-describedby={id + '-format'} />
        <EmailFormatHint id={id + '-format'} value={email} />
        <label className="input-label" htmlFor={id + '-password'}>Contraseña actual</label>
        <input id={id + '-password'} className="input-field" type="password" autoComplete="current-password"
          value={password} onChange={event => setPassword(event.target.value)} disabled={busy} required />
        <button className="btn-primary forced-password-submit" disabled={busy || !password}>Enviar código</button>
      </>}
    </form>}
    {error && <p className="field-error-text" role="alert">{error}</p>}
    <button className="forced-password-logout" type="button" disabled={busy} onClick={onClose}>Cerrar</button>
  </AdminDialog>;
}
