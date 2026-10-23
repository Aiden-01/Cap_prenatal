import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { descargarNotaPdf } from '../api/notasClinicas';
import ResponsableNota from './ResponsableNota';
import { TIPOS_NOTA, ESTADOS_NOTA } from '../utils/seguimientoNotas';
import { inicioCapturaGuatemala, errorNota, validarNota } from '../utils/notasClinicas';
import { FileText, UserRound, CalendarDays, Save, Download, CheckCircle, RotateCcw } from 'lucide-react';

export default function EditorNotaClinica({ pacienteId, paciente, usuario, tipo, notaId, embarazoId,
  controlId, readOnly = false, onSaved }) {
  const [nota, setNota] = useState(null);
  const [loading, setLoading] = useState(Boolean(notaId));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contenido, setContenido] = useState('');
  const [inicio] = useState(() => inicioCapturaGuatemala());
  const [fecha, setFecha] = useState(() => notaId ? '' : inicio.fecha);
  const [hora, setHora] = useState(() => notaId ? '' : inicio.hora);
  const [notice, setNotice] = useState('');
  const [responsable, setResponsable] = useState({ tipo: '' });
  const [cambiarResponsable, setCambiarResponsable] = useState(false);
  const [revision, setRevision] = useState(0);
  const [recoveryId, setRecoveryId] = useState(null);
  const [reintentoPendiente, setReintentoPendiente] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmedId, setConfirmedId] = useState(null);
  const lock = useRef(false);
  const pendingCreate = useRef(null);
  const confirmedCreateId = useRef(null);
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
    }).catch(err => { if (active) { setError(errorNota(err, 'No se pudo recuperar la nota.')); setLoading(false); } });
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
    const invalid = validarNota({ fecha, hora, contenido, responsable, requiereResponsable: !nota || cambiarResponsable });
    if (invalid) { setError(invalid); return; }
    lock.current = true; setSaving(true); setError(''); setNotice('');
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
        if (confirmedCreateId.current) result = { data: { id: confirmedCreateId.current } };
        else {
          result = await api.post(base, pendingCreate.current);
          confirmedCreateId.current = result.data.id;
          setConfirmedId(result.data.id);
        }
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
      setNotice(`Borrador guardado correctamente · Nota ${recovered.data.id}`);
      if (!editsAfterRequest) onSaved?.(recovered.data);
    } catch (err) {
      if (!nota && !confirmedCreateId.current && err.response?.status && err.response.status < 500 && err.response.status !== 408) pendingCreate.current = null;
      setReintentoPendiente(Boolean(pendingCreate.current));
      if (err.response?.status === 409) setConflict(true);
      setError(errorNota(err, 'No se pudo guardar. Reintenta para recuperar el resultado de la misma solicitud.'));
    } finally { lock.current = false; setSaving(false); }
  };
  const finalizar = async () => {
    if (lock.current || conflict || lectura || !nota || !can('finalizar_captura')) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post(`${base}/${nota.id}/finalizar`, { version: nota.version });
      setNota(previous => ({ ...previous, ...data })); setNotice('Captura finalizada correctamente.'); onSaved?.({ ...nota, ...data });
    } catch (err) {
      if (err.response?.status === 409) setConflict(true);
      setError(errorNota(err, 'No se pudo finalizar. Recupera la nota para consultar su estado.'));
    } finally { lock.current = false; setSaving(false); }
  };
  const descargarPdf = async () => {
    if (lock.current || !nota || !can('ver')) return;
    lock.current = true; setDownloading(true); setError('');
    try {
      await descargarNotaPdf(pacienteId, nota.id);
    } catch (err) {
      let message = 'No se pudo descargar el PDF. Verifica tus permisos e inténtalo de nuevo.';
      if (err.response?.data instanceof Blob) {
        try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* Keep safe fallback. */ }
      } else message = errorNota(err, message);
      setError(message);
    } finally { lock.current = false; setDownloading(false); }
  };
  if (loading) return <p role="status">Cargando nota…</p>;
  if (notaId && !nota) return <div role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>;
  const dirty = nota && (contenido !== nota.contenido || fecha !== (nota.fecha_atencion || '') || hora !== (nota.hora_atencion?.slice(0, 5) || '') || cambiarResponsable);
  return <section className="nota-clinica card" aria-label="Editor de nota clínica">
    <header className="nota-editor-header">
      <span className="nota-section-icon"><FileText size={22} aria-hidden="true" /></span>
      <div><span className="nota-eyebrow">Documento clínico</span><h2>{TIPOS_NOTA[actualTipo]}</h2>
        <p>{paciente?.nombres} {paciente?.apellidos} · Expediente {paciente?.no_expediente || 'sin número registrado'}</p></div>
      <span className={`nota-status ${nota?.estado === 'captura_finalizada' ? 'is-final' : ''}`}>{ESTADOS_NOTA[nota?.estado] || 'Nuevo borrador'}</span>
    </header>
    <form className="seguimiento-notas-form nota-editor-form" onSubmit={save} noValidate>
      <fieldset disabled={saving || downloading || frozen || conflict}>
        <legend className="sr-only">Datos de la nota</legend>
        <section className="nota-editor-section" aria-labelledby="nota-atencion-title">
          <h3 id="nota-atencion-title"><CalendarDays size={18} aria-hidden="true" />Información de la atención</h3>
          <div className="nota-fields-grid">
            <label>Fecha de atención<input type="date" required value={fecha} onChange={event => setFecha(event.target.value)} /></label>
            <label>Hora de atención<input type="time" required value={hora} onChange={event => setHora(event.target.value)} /></label>
            <div className="nota-field-summary"><span>Vinculación</span><strong>{controlId || nota?.control_prenatal_id ? `Control ${controlId || nota.control_prenatal_id}` : 'Sin control asociado'}</strong><small>Hora local de Guatemala · ajustable para atenciones anteriores</small></div>
          </div>
        </section>
        <section className="nota-editor-section" aria-labelledby="nota-responsable-title">
          <h3 id="nota-responsable-title"><UserRound size={18} aria-hidden="true" />Profesional responsable</h3>
          <p className="nota-muted">Capturista: {nota?.capturista_usuario_id ? `Usuario ${nota.capturista_usuario_id}` : usuario?.nombre_completo || `Usuario ${usuario?.id}`}. El responsable clínico se registra por separado.</p>
          {nota?.responsable_snapshot && <div className="nota-responsable-summary">Responsable: <strong>{nota.responsable_snapshot.nombre_completo}</strong><span>{nota.responsable_snapshot.cargo_nombre}</span></div>}
          {nota && !frozen && <label className="nota-check"><input type="checkbox" checked={cambiarResponsable} onChange={event => setCambiarResponsable(event.target.checked)} />Cambiar responsable</label>}
          {(!nota || cambiarResponsable) && !frozen && <ResponsableNota tipo={actualTipo} usuario={usuario} value={responsable} onChange={setResponsable} />}
        </section>
        <section className="nota-editor-section" aria-labelledby="nota-narrativa-title">
          <h3 id="nota-narrativa-title"><FileText size={18} aria-hidden="true" />Narrativa clínica</h3>
          <label className="sr-only" htmlFor="nota-contenido">Narrativa clínica</label>
          <textarea id="nota-contenido" rows={16} maxLength={20000} value={contenido} placeholder="Registra la evolución, hallazgos y atención brindada…" onChange={event => setContenido(event.target.value)} />
          <div className="nota-textarea-meta"><span>Texto libre · conserva los párrafos</span><span>{contenido.length}/20000 caracteres</span></div>
        </section>
      </fieldset>
      <div className="nota-feedback" aria-live="polite">
        {notice && <p role="status" className="nota-success"><CheckCircle size={18} aria-hidden="true" />{notice}</p>}
        {dirty && <p>Guarda los cambios antes de finalizar la captura.</p>}
        {error && <p role="alert" className="nota-error">{error}</p>}
        {reintentoPendiente && <p role="alert">{confirmedId
          ? `El servidor confirmó la creación de la nota ${confirmedId}, pero no pudo recuperarse. Guardar borrador reintentará la lectura sin crear otra nota.`
          : 'El resultado del envío anterior es incierto. Guardar borrador reintentará exactamente ese contenido; los cambios posteriores se conservarán para un siguiente guardado.'}</p>}
        {conflict && <p role="alert">La edición está bloqueada hasta recuperar la versión guardada. Conserva tu texto antes de continuar.</p>}
      </div>
      <footer className="nota-editor-actions">
        <div><strong>{saving ? 'Guardando…' : dirty || !nota ? 'Cambios pendientes' : 'Documento guardado'}</strong><small>Finalizar captura no equivale a firma clínica. Una captura finalizada no admite cambios.</small></div>
        <div className="nota-action-buttons">
          {!frozen && <button type="submit" className="btn-primary" disabled={saving || downloading || conflict}><Save size={16} aria-hidden="true" />{saving ? 'Guardando…' : 'Guardar borrador'}</button>}
          {!lectura && nota && can('finalizar_captura') && <button type="button" className="btn-primary" disabled={saving || downloading || conflict || dirty || !fecha || !hora || !contenido.trim()} onClick={finalizar}><CheckCircle size={16} aria-hidden="true" />Finalizar captura</button>}
          {nota && can('ver') && <button type="button" className="btn-secondary" disabled={saving || downloading || dirty || conflict} onClick={descargarPdf}><Download size={16} aria-hidden="true" />{downloading ? 'Generando PDF…' : 'Descargar PDF institucional'}</button>}
          {(notaId || nota?.id) && !saving && <button type="button" className="btn-secondary" disabled={downloading} onClick={() => {
            if (!dirty || window.confirm('Se reemplazará el texto local por la versión guardada. ¿Continuar?')) {
              setRecoveryId(nota?.id); setRevision(value => value + 1); setLoading(true);
            }
          }}><RotateCcw size={16} aria-hidden="true" />Recuperar versión guardada</button>}
        </div>
      </footer>
    </form>
    {dirty && <p className="nota-muted">El PDF utiliza la versión guardada; guarda o recupera la nota antes de descargar.</p>}
  </section>;
}
