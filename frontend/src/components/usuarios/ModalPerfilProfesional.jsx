import { useRef, useState } from 'react';
import api from '../../api/axios';
import { useGlobalToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errorMessage';
import PerfilProfesionalFields from './PerfilProfesionalFields';
import AdminDialog from './AdminDialog';

export default function ModalPerfilProfesional({ usuario, onClose, onSaved }) {
  const [form, setForm] = useState({ cargo_id: usuario.cargo_id ?? null, especialidad_id: usuario.especialidad_id ?? null });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const toast = useGlobalToast();
  const guardar = async event => {
    event.preventDefault();
    if (pending.current || !ready) return;
    pending.current = true; setSaving(true); setError('');
    try {
      await api.put(`/usuarios/${usuario.id}`, form);
      toast('Perfil profesional actualizado', 'success'); onSaved(); onClose();
    } catch (err) { const message = getErrorMessage(err, 'No se pudo guardar el perfil'); setError(message); toast(message, 'error'); }
    finally { pending.current = false; setSaving(false); }
  };
  return <AdminDialog titleId="perfil-title" busy={saving} onClose={onClose}>
    <h2 id="perfil-title">Perfil profesional</h2><p>{usuario.nombre_completo}</p>
    <form onSubmit={guardar} aria-busy={saving}>
      <PerfilProfesionalFields usuario={usuario} value={form} onChange={(campo, valor) => setForm(current => ({ ...current, [campo]: valor }))} disabled={saving} onReady={setReady} />
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="action-row"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving || !ready}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
    </form>
  </AdminDialog>;
}
