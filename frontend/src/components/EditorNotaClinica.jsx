import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import ResponsableNota from './ResponsableNota';
import { TIPOS_NOTA, ESTADOS_NOTA } from '../utils/seguimientoNotas';
import { getErrorMessage } from '../utils/errorMessage';

export default function EditorNotaClinica({ pacienteId, paciente, usuario, tipo, notaId, embarazoId,
  controlId, readOnly = false, onSaved }) {
  const [nota, setNota] = useState(null);
  const [loading, setLoading] = useState(Boolean(notaId));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contenido, setContenido] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [responsable, setResponsable] = useState({ tipo: '' });
  const [cambiarResponsable, setCambiarResponsable] = useState(false);
  const [revision, setRevision] = useState(0);
  const [recoveryId, setRecoveryId] = useState(null);
  const [reintentoPendiente, setReintentoPendiente] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const lock = useRef(false);
  const pendingCreate = useRef(null);
  const base = `/pacientes/${pacienteId}/notas-clinicas`;
  const targetId = notaId || recoveryId;
  useEffect(() => {
    if (!targetId) return;
    let active = true;
    api.get(`${base}/${targetId}`).then(({ data }) => {
      if (!active) return;
      setNota(data); setContenido(data.contenido); setFecha(data.fecha_atencion || '');
      setHora(data.hora_atencion?.slice(0, 5) || ''); setConflict(false); setError('');
      setCambiarResponsable(false); setLoading(false);
    }).catch(err => { if (active) { setError(getErrorMessage(err, 'No se pudo recuperar la nota.')); setLoading(false); } });
    return () => { active = false; };
  }, [base, targetId, revision]);
  const actualTipo = nota?.tipo || tipo;
  const prefijo = actualTipo === 'nota_evolucion' ? 'notas_evolucion' : 'notas_enfermeria';
  const can = action => usuario?.permisos?.includes(`${prefijo}.${action}`);
  const lectura = readOnly || nota?.estado === 'captura_finalizada';
  const frozen = lectura || !can('registrar');
  const save = async event => {
    event.preventDefault();
    if (lock.current || frozen || conflict) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const fields = { contenido, fecha_atencion: fecha || null, hora_atencion: hora || null,
        ...(!nota || cambiarResponsable ? { responsable } : {}) };
      let result;
      if (nota) result = await api.put(`${base}/${nota.id}`, { version: nota.version, ...fields });
      else {
        // Preserve the exact request after an ambiguous network failure, even if fields are edited.
        pendingCreate.current ||= { tipo: actualTipo, ...fields, clave_idempotencia: crypto.randomUUID(),
          ...(embarazoId ? { embarazo_id: Number(embarazoId) } : {}),
          ...(controlId ? { control_prenatal_id: Number(controlId), es_principal: true } : {}) };
        result = await api.post(base, pendingCreate.current);
      }
      const recovered = await api.get(`${base}/${result.data.id}`);
      const editsAfterRequest = reintentoPendiente && pendingCreate.current &&
        ['contenido', 'fecha_atencion', 'hora_atencion', 'responsable'].some(field => JSON.stringify(fields[field]) !== JSON.stringify(pendingCreate.current[field]));
      setNota(recovered.data);
      if (!editsAfterRequest) {
        setContenido(recovered.data.contenido); setFecha(recovered.data.fecha_atencion || '');
        setHora(recovered.data.hora_atencion?.slice(0, 5) || ''); setCambiarResponsable(false);
      } else setCambiarResponsable(JSON.stringify(fields.responsable) !== JSON.stringify(pendingCreate.current.responsable));
      pendingCreate.current = null; setReintentoPendiente(false);
      if (!editsAfterRequest) onSaved?.();
    } catch (err) {
      if (!nota && err.response?.status && err.response.status < 500 && err.response.status !== 408) pendingCreate.current = null;
      setReintentoPendiente(Boolean(pendingCreate.current));
      if (err.response?.status === 409) setConflict(true);
      setError(getErrorMessage(err, 'No se pudo guardar. Reintenta para recuperar el resultado de la misma solicitud.'));
    } finally { lock.current = false; setSaving(false); }
  };
  const finalizar = async () => {
    if (lock.current || conflict || lectura || !nota || !can('finalizar_captura')) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post(`${base}/${nota.id}/finalizar`, { version: nota.version });
      setNota(previous => ({ ...previous, ...data })); onSaved?.();
    } catch (err) {
      if (err.response?.status === 409) setConflict(true);
      setError(getErrorMessage(err, 'No se pudo finalizar. Recupera la nota para consultar su estado.'));
    } finally { lock.current = false; setSaving(false); }
  };
  const descargarPdf = async () => {
    if (lock.current || !nota || !can('ver')) return;
    lock.current = true; setDownloading(true); setError('');
    try {
      const response = await api.get(`${base}/${nota.id}/pdf`, { responseType: 'blob' });
      if (!response.headers?.['content-type']?.includes('application/pdf')) throw new Error('El servidor no devolvió un PDF válido');
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url; link.download = `nota-clinica-${nota.id}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      let message = 'No se pudo descargar el PDF. Verifica tus permisos e inténtalo de nuevo.';
      if (err.response?.data instanceof Blob) {
        try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* Keep safe fallback. */ }
      } else message = getErrorMessage(err, message);
      setError(message);
    } finally { lock.current = false; setDownloading(false); }
  };
  if (loading) return <p role="status">Cargando nota…</p>;
  if (notaId && !nota) return <div role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>;
  const dirty = nota && (contenido !== nota.contenido || fecha !== (nota.fecha_atencion || '') || hora !== (nota.hora_atencion?.slice(0, 5) || '') || cambiarResponsable);
  return <section className="nota-clinica">
    <h2>{TIPOS_NOTA[actualTipo]}</h2>
    <p>{paciente?.nombres} {paciente?.apellidos} · Expediente {paciente?.no_expediente || 'sin número registrado'}</p>
    <p>{ESTADOS_NOTA[nota?.estado] || 'Nuevo borrador'} · {controlId || nota?.control_prenatal_id ? `Control ${controlId || nota.control_prenatal_id}` : 'Sin control asociado'}</p>
    <p>Capturista: {nota?.capturista_usuario_id ? `Usuario ${nota.capturista_usuario_id}` : usuario?.nombre_completo || `Usuario ${usuario?.id}`}. El responsable clínico se registra por separado.</p>
    {nota?.responsable_snapshot && <p>Responsable: {nota.responsable_snapshot.nombre_completo} · {nota.responsable_snapshot.cargo_nombre} · {nota.responsable_snapshot.especialidad_nombre}</p>}
    <form className="seguimiento-notas-form" onSubmit={save}>
      <fieldset disabled={saving || frozen || conflict}>
        <label>Fecha de atención<input type="date" value={fecha} onChange={event => setFecha(event.target.value)} /></label>
        <label>Hora de atención<input type="time" value={hora} onChange={event => setHora(event.target.value)} /></label>
        {nota && !frozen && <label><input type="checkbox" checked={cambiarResponsable} onChange={event => setCambiarResponsable(event.target.checked)} />Cambiar responsable</label>}
        {(!nota || cambiarResponsable) && !frozen && <ResponsableNota tipo={actualTipo} value={responsable} onChange={setResponsable} />}
        <label>Narrativa clínica<textarea rows={18} maxLength={20000} value={contenido} onChange={event => setContenido(event.target.value)} /></label>
        <span>{contenido.length}/20000 caracteres</span>
        {!frozen && <button type="submit" className="btn-primary">{saving ? 'Guardando…' : 'Guardar borrador'}</button>}
      </fieldset>
    </form>
    {!lectura && nota && can('finalizar_captura') && <button type="button" className="btn-primary" disabled={saving || conflict || dirty || !fecha || !hora || !contenido.trim()} onClick={finalizar}>Finalizar captura</button>}
    {dirty && <p>Guarda los cambios antes de finalizar la captura.</p>}
    <p>Finalizar captura no equivale a firma clínica. Una captura finalizada no admite cambios.</p>
    {nota && can('ver') && <button type="button" className="btn-secondary" disabled={saving || downloading || dirty || conflict} onClick={descargarPdf}>
      {downloading ? 'Generando PDF…' : 'Descargar PDF institucional'}</button>}
    {dirty && <p>El PDF utiliza la versión guardada; guarda o recupera la nota antes de descargar.</p>}
    {error && <p role="alert">{error}</p>}
    {reintentoPendiente && <p role="alert">El resultado del envío anterior es incierto. Guardar borrador reintentará exactamente ese contenido; los cambios posteriores se conservarán para un siguiente guardado.</p>}
    {conflict && <p role="alert">La nota cambió o ya existe una principal. Conserva tu texto antes de recuperar la versión vigente o volver al historial.</p>}
    {(notaId || nota?.id) && !saving && <button type="button" className="btn-secondary" onClick={() => {
      if (!dirty || window.confirm('Se reemplazará el texto local por la versión guardada. ¿Continuar?')) {
        setRecoveryId(nota?.id); setRevision(value => value + 1); setLoading(true);
      }
    }}>Recuperar versión guardada</button>}
  </section>;
}
