import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import EditorNotaClinica from '../components/EditorNotaClinica';
import { TIPOS_NOTA, ESTADOS_NOTA } from '../utils/seguimientoNotas';
import { getErrorMessage } from '../utils/errorMessage';
import { ClinicalWorkflowShell, ClinicalSection } from '../components/clinical/ClinicalWorkflow';
import './seguimiento-notas.css';

export default function NotasClinicas() {
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
  const controlId = search.get('control_id');
  const embarazoId = search.get('embarazo_id');
  const tipo = search.get('tipo');
  const contextKey = `${id}:${embarazoId || ''}`;
  const listKey = `${contextKey}:${controlId || ''}:${pagina}:${revision}`;
  const principalKey = `${id}:${controlId || ''}:${tipo || ''}:${revision}`;
  const can = (type, action) => usuario?.permisos?.includes(`${type === 'nota_evolucion' ? 'notas_evolucion' : 'notas_enfermeria'}.${action}`);
  useEffect(() => {
    let active = true;
    api.get(`/pacientes/${id}/expediente`, { params: embarazoId ? { embarazo_id: embarazoId } : {} })
      .then(({ data }) => { if (active) setContexto({ key: contextKey, data }); })
      .catch(err => { if (active) setError(getErrorMessage(err, 'No se pudo consultar el expediente.')); });
    return () => { active = false; };
  }, [id, embarazoId, contextKey, revision]);
  useEffect(() => {
    let active = true;
    api.get(`/pacientes/${id}/notas-clinicas`, { params: { pagina, limite: 20,
      ...(controlId ? { control_prenatal_id: controlId } : {}) } })
      .then(({ data }) => { if (active) setList({ key: listKey, ...data }); })
      .catch(err => { if (active) setError(getErrorMessage(err, 'No se pudieron consultar las notas.')); });
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
      } catch (err) { if (active) setError(getErrorMessage(err, 'No se pudo comprobar la nota principal.')); }
    })();
    return () => { active = false; };
  }, [id, controlId, tipo, principalKey]);
  const exp = contexto?.key === contextKey ? contexto.data : null;
  const ready = list?.key === listKey;
  const selectedId = search.get('nota_id');
  const principalReady = principalResult?.key === principalKey;
  const principal = principalReady ? principalResult.nota : null;
  const current = editor || (selectedId ? { notaId: selectedId } : principal ? { notaId: principal.id }
    : principalReady && controlId && Object.hasOwn(TIPOS_NOTA, tipo) ? { tipo } : null);
  const editable = exp && (!embarazoId || (!exp.is_read_only && ['activo', 'puerperio'].includes(exp.embarazo_seleccionado?.estado)));
  return <ClinicalWorkflowShell title="Notas clínicas del expediente" mode="Historial" patientName={exp?.paciente ? `${exp.paciente.nombres} ${exp.paciente.apellidos}` : undefined}
    onBack={() => navigate(`/pacientes/${id}${embarazoId ? `?embarazo_id=${embarazoId}` : ''}`)}>
    <ClinicalSection title="Historial de notas">
      <p>{controlId ? `Notas asociadas al control ${controlId}.` : 'El historial incluye documentos de todos los embarazos y notas independientes.'}</p>
      <button type="button" className="btn-secondary" onClick={() => { setError(''); setRevision(value => value + 1); }}>Actualizar historial</button>
      {error && <p role="alert">{error}<button onClick={() => { setError(''); setRevision(value => value + 1); }}>Reintentar</button></p>}
      {!ready && !error && <p role="status">Cargando historial…</p>}
      {ready && <>
        {!list.data.length && <p>No hay notas registradas.</p>}
        {list.data.map(nota => <div className="nota-historial" key={nota.id}>
          <p>{TIPOS_NOTA[nota.tipo]} · {ESTADOS_NOTA[nota.estado]} · {nota.fecha_atencion || 'Sin fecha'} · {nota.responsable_snapshot?.nombre_completo}</p>
          <p>{nota.control_prenatal_id ? `Control ${nota.control_prenatal_id}` : 'Sin control asociado'}</p>
          <button type="button" className="btn-secondary" onClick={() => { setEditor(null); setSearch({ nota_id: String(nota.id), ...(embarazoId ? { embarazo_id: embarazoId } : {}) }); }}>Abrir nota</button>
        </div>)}
        <button disabled={pagina === 1} onClick={() => setPagina(value => value - 1)}>Anterior</button>
        <span> Página {pagina} </span>
        <button disabled={pagina * list.limite >= list.total} onClick={() => setPagina(value => value + 1)}>Siguiente</button>
      </>}
      {editable && !controlId && Object.entries(TIPOS_NOTA).map(([type, label]) => can(type, 'ver') && can(type, 'registrar')
        ? <button key={type} className="btn-secondary" onClick={() => setEditor({ tipo: type, instanceId: crypto.randomUUID() })}>Nueva {label.toLowerCase()}</button> : null)}
      {controlId && !principalReady && !error && <p role="status">Comprobando nota principal…</p>}
    </ClinicalSection>
    {exp && current && (current.notaId || can(current.tipo, 'ver')) && <ClinicalSection title="Documento clínico">
      <EditorNotaClinica key={`${id}:${current.notaId || current.tipo}:${current.instanceId || ''}:${controlId || ''}:${embarazoId || ''}`}
        pacienteId={id} paciente={exp.paciente} usuario={usuario} tipo={current.tipo} notaId={current.notaId} embarazoId={embarazoId}
        controlId={controlId} readOnly={!editable} onSaved={() => setRevision(value => value + 1)} />
    </ClinicalSection>}
  </ClinicalWorkflowShell>;
}
