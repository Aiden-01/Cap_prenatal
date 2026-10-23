import { useEffect, useId, useRef, useState } from 'react';
import api from '../../api/axios';
import { useGlobalToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errorMessage';
import PerfilProfesionalFields from './PerfilProfesionalFields';
import AdminDialog from './AdminDialog';
import { normalizarEmail, validarEmail } from '../../utils/usuarioEmail';

export default function ModalPerfilProfesional({ usuario, onClose, onSaved }) {
  const [form, setForm] = useState({ cargo_id: usuario.cargo_id ?? null, email: usuario.email ?? '', nombre_completo: usuario.nombre_completo, username: usuario.username });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const emailId = useId();
  const emailRef = useRef(null);
  const pending = useRef(false);
  const toast = useGlobalToast();
  useEffect(() => { if (emailError && !saving) emailRef.current?.focus(); }, [emailError, saving]);
  const guardar = async event => {
    event.preventDefault();
    if (pending.current || !ready) return;
    if (!form.nombre_completo?.trim() || !form.username?.trim()) { setError('Nombre completo y usuario son obligatorios.'); return; }
    const email = normalizarEmail(form.email);
    const emailChanged = email !== normalizarEmail(usuario.email);
    const invalid = emailChanged ? validarEmail(email) : '';
    setEmailError(invalid);
    if (invalid) { emailRef.current?.focus(); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      await api.put(`/usuarios/${usuario.id}`, { cargo_id: form.cargo_id, ...(form.nombre_completo !== usuario.nombre_completo ? { nombre_completo: form.nombre_completo.trim() } : {}), ...(form.username !== usuario.username ? { username: form.username.trim() } : {}), ...(emailChanged ? { email } : {}) });
      toast('Perfil profesional actualizado', 'success'); onSaved(); onClose();
    } catch (err) {
      const message = getErrorMessage(err, 'No se pudo guardar el perfil');
      if (err?.response?.data?.code === 'EMAIL_DUPLICADO' || err?.response?.data?.details?.some(detail => (detail.campo || detail.field) === 'email')) {
        setEmailError(message); emailRef.current?.focus();
      }
      setError(message); toast(message, 'error');
    }
    finally { pending.current = false; setSaving(false); }
  };
  return <AdminDialog titleId="perfil-title" busy={saving} onClose={onClose}>
    <h2 id="perfil-title">Perfil del usuario</h2><p>{usuario.nombre_completo}</p>
    {!usuario.email && <p className="usuario-email-pendiente" role="status">Correo pendiente. Puedes completar el correo o actualizar el cargo sin bloquear la cuenta.</p>}
    <form onSubmit={guardar} aria-busy={saving} noValidate>
      {['nombre_completo', 'username'].map(campo => <div className="form-group" key={campo}>
        <label className="input-label" htmlFor={emailId + campo}>{campo === 'username' ? 'Nombre de usuario' : 'Nombre completo'}</label>
        <input id={emailId + campo} className="input-field" required maxLength={campo === 'username' ? 80 : 150} value={form[campo] || ''} disabled={saving} onChange={event => setForm(current => ({ ...current, [campo]: event.target.value }))} />
      </div>)}
      <p className="usuario-email-help">Cambiar el nombre de usuario cierra sus sesiones; deberá volver a iniciar sesión. El historial conserva su identidad por ID.</p>
      <div className="form-group">
        <label className="input-label" htmlFor={emailId}>Correo electrónico</label>
        <input ref={emailRef} id={emailId} className={`input-field${emailError ? ' input-error' : ''}`} type="email" inputMode="email" autoComplete="off" maxLength={254} value={form.email} disabled={saving} aria-invalid={Boolean(emailError)} aria-describedby={`${emailId}-help${emailError ? ` ${emailId}-error` : ''}`} onChange={event => { setForm(current => ({ ...current, email: event.target.value })); setEmailError(''); }} />
        <p id={`${emailId}-help`} className="usuario-email-help">El acceso continúa con nombre de usuario y contraseña. Asignar un correo no verifica su propiedad.</p>
        {emailError && <p id={`${emailId}-error`} role="alert" className="field-error-text">{emailError}</p>}
      </div>
      <PerfilProfesionalFields usuario={usuario} value={form} onChange={(campo, valor) => setForm(current => ({ ...current, [campo]: valor }))} disabled={saving} onReady={setReady} />
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="action-row"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving || !ready}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
    </form>
  </AdminDialog>;
}
