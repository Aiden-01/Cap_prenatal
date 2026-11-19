import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, ClipboardList, Clock3, FilePenLine, HeartPulse, Stethoscope } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import { useSeguimientoNotas } from '../hooks/useSeguimientoNotas';
import { ESTADOS_NOTA, TIPOS_NOTA } from '../utils/seguimientoNotas';
import { getErrorMessage } from '../utils/errorMessage';
import { ClinicalNotice, ClinicalWorkflowShell } from '../components/clinical/ClinicalWorkflow';
import './seguimiento-notas.css';

function ConfirmarProfesional({ tipo, pacienteId, embarazoId, controlId, onConfirmed }) {
  const [modo, setModo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [directorio, setDirectorio] = useState(null);
  const [profesionalId, setProfesionalId] = useState('');
  const [nombre, setNombre] = useState('');
  const [clase, setClase] = useState(tipo === 'nota_evolucion' ? 'MED' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const nursing = tipo === 'nota_enfermeria';
  useEffect(() => {
    if (modo !== 'usuario') return;
    let active = true;
    const clases = nursing ? ['AE', 'EP'] : ['MED'];
    Promise.all(clases.map(cargo_codigo => api.get('/profesionales', {
      params: { buscar, cargo_codigo, limite: 50 },
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
        : { tipo: 'externo', nombre_completo: nombre, cargo_codigo: clase };
    try {
      await api.post(`/pacientes/${pacienteId}/controles/${controlId}/seguimiento-notas`, {
        embarazo_id: Number(embarazoId), version: 1, tipo, responsable,
      });
      onConfirmed();
    } catch (err) { setError(getErrorMessage(err, 'No se pudo confirmar. Consulta el seguimiento e inténtalo de nuevo.')); }
    finally { lock.current = false; setSaving(false); }
  };
  return <form onSubmit={submit} className="seguimiento-notas-form">
    <fieldset disabled={saving}>
      <label>Profesional que atendió
        <select required value={modo} onChange={event => { setModo(event.target.value); setProfesionalId(''); }}>
          <option value="">Selecciona quién atendió</option>
          <option value="autenticado">Yo atendí</option>
          <option value="usuario">Profesional del directorio</option>
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
          {<label>Cargo declarado<select required value={clase} onChange={event => setClase(event.target.value)}>
          <option value="">Selecciona cargo</option>{!nursing && <option value="MED">Médico/a</option>}{nursing && <option value="AE">Auxiliar de Enfermería</option>}{nursing && <option value="EP">Enfermera Profesional</option>}
        </select></label>}
      <p className="nota-muted">Identidad externa declarada; no verificada por el establecimiento.</p>
</>}
      <button className="btn-primary" type="submit" disabled={!modo || saving}>
        <Check size={16} aria-hidden="true" /> {saving ? 'Confirmando…' : 'Confirmar seguimiento'}
      </button>
    </fieldset>
    {error && <p className="nota-error" role="alert">{error}</p>}
  </form>;
}

const ICONOS_ESTADO = { pendiente: Clock3, borrador: FilePenLine, captura_finalizada: CheckCircle2 };

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
  const control = exp?.controles_prenatales?.find(item => Number(item.id) === Number(controlId));
  const numeroControl = row?.numero_control ?? control?.numero_control;
  const editable = exp && !exp.is_read_only && ['activo', 'puerperio'].includes(exp.embarazo_seleccionado?.estado);
  const soloLectura = exp && !editable;
  const expediente = `/pacientes/${id}?embarazo_id=${encodeURIComponent(embarazoId || '')}&tab=controles`;
  return <ClinicalWorkflowShell title="Seguimiento documental del control" mode={soloLectura ? 'readonly' : 'Seguimiento'}
    icon={ClipboardList} className="seguimiento-control"
    patientName={exp?.paciente ? `${exp.paciente.nombres} ${exp.paciente.apellidos}` : undefined}
    onBack={() => navigate(expediente)}>
    {(row || control) && <section className="card seguimiento-confirmacion" aria-labelledby="seguimiento-control-guardado">
      <span className="nota-section-icon" aria-hidden="true"><CheckCircle2 size={24} /></span>
      <div>
        <h2 id="seguimiento-control-guardado">{numeroControl == null ? 'Control guardado' : `Control ${numeroControl} guardado`}</h2>
        <p>Puedes completar las notas ahora o retomarlas desde el expediente.</p>
      </div>
    </section>}
    {!seguimiento.enabled && <ClinicalNotice variant="restriction">Verifica el contexto del control y tus permisos de consulta.</ClinicalNotice>}
    {seguimiento.loading && <p role="status">Cargando seguimiento…</p>}
    {seguimiento.error && <ClinicalNotice variant="error" title="No se pudo consultar el seguimiento documental.">
      <button type="button" className="btn-secondary" onClick={seguimiento.retry}>Reintentar</button>
    </ClinicalNotice>}
    {contexto?.key === contextKey && contexto.error && <ClinicalNotice variant="error">
      No se pudo cargar el contexto clínico para confirmar el seguimiento.
    </ClinicalNotice>}
    <div className="seguimiento-documentos" role="group" aria-label="Seguimiento documental">
      {Object.entries(TIPOS_NOTA).map(([tipo, titulo]) => {
        const medicina = tipo === 'nota_evolucion';
        const prefijo = medicina ? 'notas_evolucion' : 'notas_enfermeria';
        if (!usuario?.permisos?.includes(`${prefijo}.ver`)) return null;
        const documento = row?.documentos.find(item => item.tipo === tipo);
        const confirmar = editable && row?.elegible && !documento && usuario.permisos.includes(`${prefijo}.registrar`);
        const estado = documento?.estado;
        const estadoTexto = documento ? ESTADOS_NOTA[estado] || 'Estado no disponible'
          : row?.elegible ? 'Sin confirmar' : 'Sin seguimiento';
        const IconoEstado = ICONOS_ESTADO[estado];
        const IconoNota = medicina ? Stethoscope : HeartPulse;
        const responsable = documento?.responsable_nota || documento?.responsable_previsto;
        return <article className={`card seguimiento-documento ${medicina ? '' : 'is-enfermeria'}`} key={tipo} aria-labelledby={tipo}>
          <header className="seguimiento-documento-header">
            <span className="nota-section-icon" aria-hidden="true"><IconoNota size={22} /></span>
            <h2 id={tipo}>{medicina ? 'Evolución médica' : 'Enfermería'}</h2>
            {row && <span className="nota-status seguimiento-estado" data-estado={estado}>
              {IconoEstado && <IconoEstado size={14} aria-hidden="true" />}
              {estadoTexto}
            </span>}
          </header>
          {responsable && <dl className="seguimiento-responsables">
            <div>
              <dt>{documento.responsable_nota ? 'Responsable de la nota' : 'Profesional previsto'}</dt>
              <dd>{responsable.nombre_completo}</dd>
            </div>
            {documento.responsable_nota && documento.responsable_previsto && <div>
              <dt>Profesional previsto al confirmar</dt>
              <dd>{documento.responsable_previsto.nombre_completo}</dd>
            </div>}
          </dl>}
          {estado === 'captura_finalizada' && <p className="nota-muted">Cierre administrativo sin firma clínica.</p>}
          {confirmar && <>
            <p className="nota-muted">Confirma quién atendió para dejar la nota pendiente.</p>
            <ConfirmarProfesional key={controlId} tipo={tipo} pacienteId={id} embarazoId={embarazoId}
              controlId={controlId} onConfirmed={seguimiento.retry} />
          </>}
          <div className="seguimiento-documento-acciones">
            <button type="button" className="btn-secondary" aria-label={`Abrir ${titulo.toLowerCase()}`}
              onClick={() => navigate(`/pacientes/${id}/notas?embarazo_id=${embarazoId}&control_id=${controlId}&tipo=${tipo}`)}>
              Abrir nota <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </article>;
      })}
    </div>
    <footer className="seguimiento-volver">
      <button type="button" className="btn-secondary" onClick={() => navigate(expediente)}>
        <Clock3 size={16} aria-hidden="true" /> Volver al expediente sin completar una nota
      </button>
    </footer>
  </ClinicalWorkflowShell>;
}
