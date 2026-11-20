import { useId, useRef, useState } from 'react';
import api from '../../api/axios';
import { useGlobalToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errorMessage';
import PerfilProfesionalFields from './PerfilProfesionalFields';
import AdminDialog from './AdminDialog';

export default function ModalPerfilProfesional({ usuario, onClose, onSaved }) {
  const [form, setForm] = useState({ cargo_id: usuario.cargo_id ?? null, nombre_completo: usuario.nombre_completo, username: usuario.username });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();
  const pending = useRef(false);
  const toast = useGlobalToast();
  const guardar = async event => {
    event.preventDefault();
    if (pending.current || !ready) return;
    if (!form.nombre_completo?.trim() || !form.username?.trim()) { setError('Nombre completo y usuario son obligatorios.'); return; }
    pending.current = true; setSaving(true); setError('');
    try {
      await api.put('/usuarios/' + usuario.id, { cargo_id: form.cargo_id,
        ...(form.nombre_completo !== usuario.nombre_completo ? { nombre_completo: form.nombre_completo.trim() } : {}),
        ...(form.username !== usuario.username ? { username: form.username.trim() } : {}),
      });
      toast('Perfil profesional actualizado', 'success'); onSaved(); onClose();
    } catch (err) {
      const message = getErrorMessage(err, 'No se pudo guardar el perfil');
      setError(message); toast(message, 'error');
    } finally { pending.current = false; setSaving(false); }
  };

  return <AdminDialog titleId="perfil-title" busy={saving} onClose={onClose}>
    <h2 id="perfil-title">Perfil del usuario</h2><p>{usuario.nombre_completo}</p>
    <form onSubmit={guardar} aria-busy={saving} noValidate>
      {['nombre_completo', 'username'].map(campo => <div className="form-group" key={campo}>
        <label className="input-label" htmlFor={fieldId + campo}>{campo === 'username' ? 'Nombre de usuario' : 'Nombre completo'}</label>
        <input id={fieldId + campo} className="input-field" required maxLength={campo === 'username' ? 80 : 150} value={form[campo] || ''} disabled={saving} onChange={event => setForm(current => ({ ...current, [campo]: event.target.value }))} />
      </div>)}
      <p className="usuario-email-help">Cambiar el nombre de usuario cierra sus sesiones; deberá volver a iniciar sesión.</p>
      <PerfilProfesionalFields usuario={usuario} value={form} onChange={(campo, valor) => setForm(current => ({ ...current, [campo]: valor }))} disabled={saving} onReady={setReady} />
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="action-row"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving || !ready}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
    </form>
  </AdminDialog>;
}
