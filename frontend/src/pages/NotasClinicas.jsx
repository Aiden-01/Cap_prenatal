import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import EditorNotaClinica from '../components/EditorNotaClinica';
import { TIPOS_NOTA, ESTADOS_NOTA } from '../utils/seguimientoNotas';
import { errorNota } from '../utils/notasClinicas';
import { FileText, Plus, RefreshCw, ChevronLeft, ChevronRight, Download, ArrowUpRight } from 'lucide-react';
import { descargarNotaPdf } from '../api/notasClinicas';
import { ClinicalWorkflowShell } from '../components/clinical/ClinicalWorkflow';
import './seguimiento-notas.css';

export default function NotasClinicas({ embedded = false, expediente }) {
  const { id } = useParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [contexto, setContexto] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [editor, setEditor] = useState(null);
  const [principalResult, setPrincipalResult] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState('');
  const [pdfBusy, setPdfBusy] = useState(null);
  const controlId = search.get('control_id');
  const embarazoId = search.get('embarazo_id') || (embedded ? expediente?.embarazo_seleccionado?.id : null);
  const tipo = search.get('tipo');
  const contextKey = `${id}:${embarazoId || ''}`;
  const listKey = `${contextKey}:${controlId || ''}:${pagina}:${revision}`;
  const principalKey = `${id}:${controlId || ''}:${tipo || ''}:${revision}`;
  const can = (type, action) => usuario?.permisos?.includes(`${type === 'nota_evolucion' ? 'notas_evolucion' : 'notas_enfermeria'}.${action}`);
  useEffect(() => {
    if (embedded) return;
    let active = true;
    api.get(`/pacientes/${id}/expediente`, { params: embarazoId ? { embarazo_id: embarazoId } : {} })
      .then(({ data }) => { if (active) setContexto({ key: contextKey, data }); })
      .catch(err => { if (active) setError(errorNota(err, 'No se pudo consultar el expediente.')); });
    return () => { active = false; };
  }, [id, embarazoId, contextKey, revision, embedded]);
  useEffect(() => {
    let active = true;
    api.get(`/pacientes/${id}/notas-clinicas`, { params: { pagina, limite: 20,
      ...(controlId ? { control_prenatal_id: controlId } : {}) } })
      .then(({ data }) => { if (active) setList({ key: listKey, ...data }); })
      .catch(err => { if (active) setError(errorNota(err, 'No se pudieron consultar las notas.')); });
    return () => { active = false; };
  }, [id, controlId, pagina, listKey]);
  useEffect(() => {
    if (!controlId || !Object.hasOwn(TIPOS_NOTA, tipo)) return;
    let active = true;
    (async () => {
      try {
        let page = 1;
        while (active) {
          const { data } = await api.get(`/pacientes/${id}/notas-clinicas`, { params: {
            control_prenatal_id: controlId, tipo, pagina: page, limite: 50,
          } });
          const principal = data.data.find(nota => nota.es_principal);
          if (principal || page * data.limite >= data.total) {
            if (active) setPrincipalResult({ key: principalKey, nota: principal || null });
            return;
          }
          page += 1;
        }
      } catch (err) { if (active) setError(errorNota(err, 'No se pudo comprobar la nota principal.')); }
    })();
    return () => { active = false; };
  }, [id, controlId, tipo, principalKey]);
  const exp = embedded ? expediente : contexto?.key === contextKey ? contexto.data : null;
  const ready = list?.key === listKey;
  const selectedId = search.get('nota_id');
  const principalReady = principalResult?.key === principalKey;
  const principal = principalReady ? principalResult.nota : null;
  const current = editor || (selectedId ? { notaId: selectedId } : principal ? { notaId: principal.id }
    : principalReady && controlId && Object.hasOwn(TIPOS_NOTA, tipo) ? { tipo } : null);
  const editable = exp && (!embarazoId || (!exp.is_read_only && ['activo', 'puerperio'].includes(exp.embarazo_seleccionado?.estado)));
  const refresh = () => { setError(''); setRevision(value => value + 1); };
  const open = nota => {
    setEditor(null); setCreating(false);
    const next = new URLSearchParams(search); next.set('nota_id', nota.id); next.delete('control_id'); next.delete('tipo');
    setSearch(next);
  };
  const content = <div className="notas-module">
    <header className="notas-module-header">
      <div><span className="nota-eyebrow">Documentación de la atención</span><h2>Notas clínicas</h2><p>Consulta la evolución médica y de enfermería del expediente.</p></div>
      <div className="nota-action-buttons">
        <button type="button" className="btn-secondary" aria-label="Actualizar historial" onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></button>
        {editable && !controlId && Object.keys(TIPOS_NOTA).some(type => can(type, 'ver') && can(type, 'registrar')) && <button type="button" className="btn-primary" onClick={() => { setCreating(true); setNewType(''); }}><Plus size={16} aria-hidden="true" />Nueva nota</button>}
      </div>
    </header>
    {creating && <div className="nota-create card">
      <div><h3>Nueva nota clínica</h3><p className="nota-muted">Selecciona el tipo documental según la atención brindada.</p></div>
      <label>Tipo de nota<select value={newType} onChange={event => setNewType(event.target.value)}><option value="">Selecciona tipo</option>
        {Object.entries(TIPOS_NOTA).filter(([type]) => can(type, 'ver') && can(type, 'registrar')).map(([type, title]) => <option key={type} value={type}>{title}</option>)}
      </select></label>
      <div className="nota-action-buttons"><button type="button" className="btn-primary" disabled={!newType} onClick={() => { setEditor({ tipo: newType, instanceId: crypto.randomUUID() }); setCreating(false); }}>Abrir editor</button><button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button></div>
    </div>}
    <section className="notas-history card" aria-label="Historial de notas">
      <div className="notas-history-title"><h3>Historial de notas</h3><span className="nota-muted">{ready && !error ? `${list.total} documentos` : 'Consulta del expediente'}</span></div>
      {controlId && <p className="nota-muted">Notas asociadas al control {controlId}.</p>}
      {error && <div role="alert" className="nota-error"><p>{error}</p><button className="btn-secondary" onClick={refresh}>Reintentar</button></div>}
      {!ready && !error && <p role="status" className="nota-empty">Cargando historial…</p>}
      {ready && !error && <>
        {!list.data.length && <div className="nota-empty"><FileText size={32} aria-hidden="true" /><h3>Aún no hay notas clínicas</h3><p>Documenta la atención con una nota médica o de enfermería. Puedes guardar un borrador y completarlo después.</p></div>}
        <div className="notas-history-list">{list.data.map(nota => <article className="nota-historial" key={nota.id}>
          <span className="nota-section-icon"><FileText size={20} aria-hidden="true" /></span>
          <div className="nota-history-details"><strong>{TIPOS_NOTA[nota.tipo]}</strong><p>{nota.fecha_atencion || 'Fecha pendiente'} · {nota.responsable_snapshot?.nombre_completo || 'Responsable no registrado'}</p><small>{nota.control_prenatal_id ? `Control ${nota.control_prenatal_id}` : 'Sin control asociado'} · Nota {nota.id}</small></div>
          <span className={`nota-status ${nota.estado === 'captura_finalizada' ? 'is-final' : ''}`}>{nota.estado === 'borrador' ? 'Borrador' : ESTADOS_NOTA[nota.estado]}</span>
          <div className="nota-action-buttons"><button type="button" className="btn-secondary" onClick={() => open(nota)}>Abrir<ArrowUpRight size={14} aria-hidden="true" /></button>
            <button type="button" className="btn-secondary" disabled={pdfBusy !== null} aria-label={`Descargar PDF de nota ${nota.id}`} onClick={async () => {
              if (pdfBusy !== null) return; setPdfBusy(nota.id);
              try { await descargarNotaPdf(id, nota.id); } catch (err) { setError(errorNota(err, 'No se pudo descargar el PDF.')); }
              finally { setPdfBusy(null); }
            }}><Download size={14} aria-hidden="true" />{pdfBusy === nota.id ? 'Generando…' : 'PDF'}</button></div>
        </article>)}</div>
        {list.total > 0 && <nav className="notas-pagination" aria-label="Páginas de notas"><button className="btn-secondary" disabled={pagina === 1} onClick={() => setPagina(value => value - 1)}><ChevronLeft size={15} aria-hidden="true" />Anterior</button><span>Página {pagina} de {Math.max(1, Math.ceil(list.total / list.limite))}</span><button className="btn-secondary" disabled={pagina * list.limite >= list.total} onClick={() => setPagina(value => value + 1)}>Siguiente<ChevronRight size={15} aria-hidden="true" /></button></nav>}
      </>}
      {controlId && !principalReady && !error && <p role="status">Comprobando nota principal…</p>}
    </section>
    {exp && current && (current.notaId || can(current.tipo, 'ver')) && <EditorNotaClinica key={`${id}:${current.instanceId || current.notaId || current.tipo}:${controlId || ''}:${embarazoId || ''}`}
      pacienteId={id} paciente={exp.paciente} usuario={usuario} tipo={current.tipo} notaId={current.notaId} embarazoId={embarazoId}
      controlId={controlId} readOnly={!editable} onSaved={saved => {
        setEditor(current); setRevision(value => value + 1);
        if (saved?.id) { const next = new URLSearchParams(search); next.set('nota_id', saved.id); setSearch(next, { replace: true }); }
      }} />}
  </div>;
  return embedded ? content : <ClinicalWorkflowShell title="Notas clínicas del expediente" mode="Historial" patientName={exp?.paciente ? `${exp.paciente.nombres} ${exp.paciente.apellidos}` : undefined}
    onBack={() => navigate(`/pacientes/${id}${embarazoId ? `?embarazo_id=${embarazoId}` : ''}`)}>{content}</ClinicalWorkflowShell>;
}
