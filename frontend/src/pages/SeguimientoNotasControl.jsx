import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useSeguimientoNotas } from '../hooks/useSeguimientoNotas';
import SeguimientoNotaEstado from '../components/SeguimientoNotaEstado';
import { TIPOS_NOTA } from '../utils/seguimientoNotas';
import { getErrorMessage } from '../utils/errorMessage';
import { ClinicalWorkflowShell, ClinicalSection } from '../components/clinical/ClinicalWorkflow';
import './seguimiento-notas.css';

function ConfirmarProfesional({ tipo, pacienteId, embarazoId, controlId, onConfirmed }) {
  const [modo, setModo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [directorio, setDirectorio] = useState(null);
  const [profesionalId, setProfesionalId] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [clase, setClase] = useState(tipo === 'nota_evolucion' ? 'medico' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const nursing = tipo === 'nota_enfermeria';
  useEffect(() => {
    if (modo !== 'usuario') return;
    let active = true;
    const clases = nursing ? ['enfermeria_ae', 'enfermeria_ep'] : ['medico'];
    Promise.all(clases.map(clasificacion_profesional => api.get('/profesionales', {
      params: { buscar, clasificacion_profesional, limite: 50 },
    }))).then(responses => {
      if (active) setDirectorio({ buscar, data: responses.flatMap(response => response.data.data),
        truncated: responses.some(response => response.data.total > response.data.data.length) });
    }).catch(() => { if (active) setDirectorio({ buscar, error: true }); });
    return () => { active = false; };
  }, [modo, buscar, nursing]);
  const submit = async event => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError('');
    const responsable = modo === 'autenticado' ? { tipo: 'autenticado' }
      : modo === 'usuario' ? { tipo: 'usuario', usuario_id: Number(profesionalId) }
        : { tipo: 'externo', nombre_completo: nombre, cargo, especialidad: especialidad || null, clasificacion_profesional: clase };
    try {
      await api.post(`/pacientes/${pacienteId}/controles/${controlId}/seguimiento-notas`, {
        embarazo_id: Number(embarazoId), version: 1, tipo, responsable,
      });
      onConfirmed();
    } catch (err) { setError(getErrorMessage(err, 'No se pudo confirmar. Consulta el seguimiento e inténtalo de nuevo.')); }
    finally { lock.current = false; setSaving(false); }
  };
  return <form onSubmit={submit} className="seguimiento-notas-form">
    <h3>{TIPOS_NOTA[tipo]}</h3>
    <p>Confirma quién atendió. Esta decisión registra un pendiente y no crea una nota.</p>
    <fieldset disabled={saving}>
      <label>Profesional que atendió
        <select required value={modo} onChange={event => { setModo(event.target.value); setProfesionalId(''); }}>
          <option value="">Sin confirmar</option>
          <option value="autenticado">Yo atendí (el servidor validará mi clasificación)</option>
          <option value="usuario">Otro profesional del directorio</option>
          <option value="externo">Profesional externo</option>
        </select>
      </label>
      {modo === 'usuario' && <>
        <label>Buscar profesional por nombre<input value={buscar} maxLength={150} onChange={event => { setBuscar(event.target.value); setProfesionalId(''); }} /></label>
        {directorio?.buscar !== buscar ? <p role="status">Cargando profesionales…</p>
          : directorio.error ? <p role="alert">No se pudo cargar el directorio. Cambia la búsqueda para reintentar.</p>
            : <label>Profesional confirmado<select required value={profesionalId} onChange={event => setProfesionalId(event.target.value)}>
              <option value="">Selecciona un profesional</option>
              {directorio.data.map(persona => <option key={persona.id} value={persona.id}>{persona.nombre_completo} — {persona.cargo_nombre}</option>)}
            </select>{directorio.truncated && <span>Hay más resultados; precisa la búsqueda.</span>}</label>}
      </>}
      {modo === 'externo' && <>
        <label>Nombre completo<input required maxLength={150} value={nombre} onChange={event => setNombre(event.target.value)} /></label>
        <label>Cargo declarado<input required maxLength={150} value={cargo} onChange={event => setCargo(event.target.value)} /></label>
        <label>Especialidad (opcional)<input maxLength={150} value={especialidad} onChange={event => setEspecialidad(event.target.value)} /></label>
        {nursing && <label>Clasificación profesional<select required value={clase} onChange={event => setClase(event.target.value)}>
          <option value="">Selecciona clasificación</option><option value="enfermeria_ae">Auxiliar de Enfermería</option><option value="enfermeria_ep">Enfermera Profesional</option>
        </select></label>}
      </>}
      <button className="btn-primary" type="submit" disabled={!modo || saving}>{saving ? 'Confirmando…' : 'Confirmar seguimiento'}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function SeguimientoNotasControl() {
  const { id, controlId } = useParams();
  const [search] = useSearchParams();
  const embarazoId = search.get('embarazo_id');
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const seguimiento = useSeguimientoNotas({ pacienteId: id, embarazoId, controlesIds: [controlId], usuario });
  const [contexto, setContexto] = useState(null);
  const contextKey = `${id}:${embarazoId}`;
  useEffect(() => {
    let active = true;
    api.get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId } })
      .then(response => { if (active) setContexto({ key: contextKey, data: response.data }); })
      .catch(() => { if (active) setContexto({ key: contextKey, error: true }); });
    return () => { active = false; };
  }, [id, embarazoId, contextKey]);
  const exp = contexto?.key === contextKey ? contexto.data : null;
  const row = seguimiento.data.find(item => item.control_prenatal_id === Number(controlId));
  const editable = exp && !exp.is_read_only && ['activo', 'puerperio'].includes(exp.embarazo_seleccionado?.estado);
  const expediente = `/pacientes/${id}?embarazo_id=${encodeURIComponent(embarazoId || '')}&tab=controles`;
  return <ClinicalWorkflowShell title="Seguimiento documental del control" mode={editable ? 'Seguimiento' : 'readonly'}
    description={`Control ${controlId} · Embarazo ${embarazoId || 'sin seleccionar'}`}
    patientName={exp?.paciente ? `${exp.paciente.nombres} ${exp.paciente.apellidos}` : undefined}
    onBack={() => navigate(expediente)}>
    <ClinicalSection title="Estado de las notas">
      <p>El control y su cita siguiente se conservan aunque dejes la nota para después.</p>
      <p>Confirma solo los tipos correspondientes a los profesionales que atendieron. Si no conoces su identidad, puedes dejarla sin determinar.</p>
      {!seguimiento.enabled && <p role="alert">Selecciona un contexto válido y verifica tus permisos de lectura de notas.</p>}
      {seguimiento.loading && <p role="status">Cargando seguimiento…</p>}
      {seguimiento.error && <div role="alert"><p>No se pudo consultar el seguimiento documental. El control permanece guardado.</p><button className="btn-secondary" onClick={seguimiento.retry}>Reintentar</button></div>}
      {!seguimiento.loading && !seguimiento.error && <SeguimientoNotaEstado seguimiento={row} />}
      {row?.documentos.map(documento => <div key={documento.tipo}>
        <p>{TIPOS_NOTA[documento.tipo]} — Responsable {documento.responsable_nota ? 'de la nota' : 'previsto'}: {(documento.responsable_nota || documento.responsable_previsto)?.nombre_completo}</p>
        {documento.responsable_nota && documento.responsable_previsto && <p>Profesional previsto al confirmar el seguimiento: {documento.responsable_previsto.nombre_completo}</p>}
      </div>)}
      <p>La captura finalizada es un cierre administrativo. No equivale a firma clínica.</p>
      {Object.entries(TIPOS_NOTA).map(([tipo, titulo]) => {
        const prefijo = tipo === 'nota_evolucion' ? 'notas_evolucion' : 'notas_enfermeria';
        return usuario?.permisos?.includes(`${prefijo}.ver`) ? <button key={tipo} type="button" className="btn-secondary"
          onClick={() => navigate(`/pacientes/${id}/notas?embarazo_id=${embarazoId}&control_id=${controlId}&tipo=${tipo}`)}>Abrir {titulo.toLowerCase()}</button> : null;
      })}
      <button type="button" className="btn-secondary" onClick={() => navigate(expediente)}>Volver al expediente sin completar una nota</button>
    </ClinicalSection>
    {contexto?.error && <p role="alert">No se pudo cargar el contexto clínico. No se habilitarán confirmaciones.</p>}
    {editable && row?.elegible && !seguimiento.loading && !seguimiento.error && Object.entries(TIPOS_NOTA).map(([tipo]) => {
      const prefijo = tipo === 'nota_evolucion' ? 'notas_evolucion' : 'notas_enfermeria';
      return usuario?.permisos?.includes(`${prefijo}.ver`) && usuario.permisos.includes(`${prefijo}.registrar`)
        && !row.documentos.some(documento => documento.tipo === tipo)
        ? <ClinicalSection key={tipo} title={`Definir ${TIPOS_NOTA[tipo].toLowerCase()}`}>
          <ConfirmarProfesional tipo={tipo} pacienteId={id} embarazoId={embarazoId} controlId={controlId} onConfirmed={seguimiento.retry} />
        </ClinicalSection> : null;
    })}
  </ClinicalWorkflowShell>;
}
