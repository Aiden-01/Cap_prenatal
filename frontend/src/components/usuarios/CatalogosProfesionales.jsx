import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import { listarCatalogo } from '../../api/catalogos';
import { useGlobalToast } from '../../context/ToastContext';
import { getErrorMessage } from '../../utils/errorMessage';
import AdminDialog from './AdminDialog';

const CLASIFICACIONES_PROFESIONALES = [
  ['sin_clasificar', 'Sin clasificar'],
  ['medico', 'Médico'],
  ['enfermeria_ae', 'Enfermería — AE'],
  ['enfermeria_ep', 'Enfermería — EP'],
  ['no_clinico', 'No clínico'],
];

const clasificacionLabel = value => CLASIFICACIONES_PROFESIONALES.find(([codigo]) => codigo === value)?.[1] || 'Sin clasificar';

function CatalogoEditor({ tipo, item, onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: item?.nombre || '', codigo: item?.codigo || '', descripcion: item?.descripcion || '',
    ...(tipo === 'cargos' ? { clasificacion_profesional: item?.clasificacion_profesional || 'sin_clasificar' } : {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const toast = useGlobalToast();
  const guardar = async event => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setSaving(true); setError('');
    try {
      if (item) await api.put(`/catalogos/${tipo}/${item.id}`, form);
      else await api.post(`/catalogos/${tipo}`, form);
      toast('Catálogo guardado', 'success'); onSaved(); onClose();
    } catch (err) { const message = getErrorMessage(err, 'No se pudo guardar el catálogo'); setError(message); toast(message, 'error'); }
    finally { pending.current = false; setSaving(false); }
  };
  return <AdminDialog titleId="catalogo-editor-title" busy={saving} onClose={onClose}>
    <h2 id="catalogo-editor-title">{item ? 'Editar' : 'Crear'} {tipo === 'cargos' ? 'cargo' : 'especialidad'}</h2>
    <form onSubmit={guardar}>
      {['nombre', 'codigo', 'descripcion'].map(campo => <div className="form-group" key={campo}>
        <label className="input-label" htmlFor={`catalogo-${campo}`}>{({ nombre: 'Nombre', codigo: 'Código (opcional)', descripcion: 'Descripción (opcional)' })[campo]}</label>
        {campo === 'descripcion' ? <textarea className="input-field" id={`catalogo-${campo}`} maxLength={500} value={form[campo]} disabled={saving} onChange={e => setForm({ ...form, [campo]: e.target.value })} />
          : <input className="input-field" id={`catalogo-${campo}`} required={campo === 'nombre'} maxLength={campo === 'nombre' ? 150 : 40} value={form[campo]} disabled={saving} onChange={e => setForm({ ...form, [campo]: e.target.value })} />}
      </div>)}
      {tipo === 'cargos' && <div className="form-group">
        <label className="input-label" htmlFor="catalogo-clasificacion">Clasificación profesional</label>
        <select className="input-field" id="catalogo-clasificacion" aria-describedby="catalogo-clasificacion-help" value={form.clasificacion_profesional} disabled={saving} onChange={e => setForm({ ...form, clasificacion_profesional: e.target.value })}>
          {CLASIFICACIONES_PROFESIONALES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p id="catalogo-clasificacion-help">Clasifica el cargo para validar la coherencia del responsable clínico. No acredita colegiación ni habilitación legal y no concede permisos. Confirma la clasificación del cargo antes de cambiarla; no se deduce de su nombre.</p>
      </div>}
      {error && <div role="alert" className="error-box">{error}</div>}
      <div className="action-row"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar catálogo'}</button></div>
    </form>
  </AdminDialog>;
}

export default function CatalogosProfesionales({ onClose }) {
  const [query, setQuery] = useState({ tipo: 'cargos', estado: 'todos', buscar: '', pagina: 1 });
  const [result, setResult] = useState({ data: [], total: 0, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const toast = useGlobalToast();
  useEffect(() => {
    const controller = new AbortController();
    const { tipo, ...params } = query;
    listarCatalogo(tipo, { ...params, limite: 20 }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ ...data, loading: false, error: '' }); })
      .catch(err => { if (!controller.signal.aborted) setResult({ data: [], total: 0, loading: false, error: getErrorMessage(err, 'No se pudo cargar el catálogo') }); });
    return () => controller.abort();
  }, [query, revision]);
  const cambiar = changes => {
    setResult(current => ({ ...current, loading: true, error: '' }));
    setQuery(current => ({ ...current, pagina: 1, ...changes }));
  };
  const refresh = () => { cambiar({}); setRevision(n => n + 1); };
  const cambiarEstado = async item => {
    if (pending.current) return;
    pending.current = true; setSaving(true);
    try {
      await api.patch(`/catalogos/${query.tipo}/${item.id}/${item.activo ? 'desactivar' : 'reactivar'}`);
      toast(item.activo ? 'Elemento desactivado' : 'Elemento reactivado', 'success'); setConfirm(null); refresh();
    } catch (err) { toast(getErrorMessage(err, 'No se pudo cambiar el estado'), 'error'); }
    finally { pending.current = false; setSaving(false); }
  };
  const paginas = Math.max(1, Math.ceil(result.total / 20));
  return <section className="card catalogos-panel" aria-labelledby="catalogos-title">
    <div className="catalogos-heading"><h2 id="catalogos-title">Catálogos profesionales</h2><button className="btn-secondary" onClick={onClose}>Volver a usuarios</button></div>
    <div className="catalogos-controls">
      <label>Catálogo<select className="input-field" value={query.tipo} onChange={e => cambiar({ tipo: e.target.value, buscar: '' })}><option value="cargos">Cargos</option><option value="especialidades">Especialidades</option></select></label>
      <label>Buscar en catálogo<input className="input-field" type="search" value={query.buscar} maxLength={150} onChange={e => cambiar({ buscar: e.target.value })} /></label>
      <label>Estado del catálogo<select className="input-field" value={query.estado} onChange={e => cambiar({ estado: e.target.value })}><option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select></label>
      <button className="btn-primary" onClick={() => setEditor({ item: null })}>{query.tipo === 'cargos' ? 'Crear cargo' : 'Crear especialidad'}</button>
    </div>
    {result.error && <div role="alert" className="error-box">{result.error} <button className="btn-secondary" onClick={refresh}>Reintentar</button></div>}
    {result.loading ? <p role="status">Cargando catálogo…</p> : <>
      <ul className="catalogos-list">{result.data.map(item => <li key={item.id}>
        <div className="catalogo-copy"><strong>{item.nombre}</strong><span>{item.codigo || 'Sin código'} · {item.activo ? 'Activo' : 'Inactivo'}</span>{query.tipo === 'cargos' && <span>Clasificación: {clasificacionLabel(item.clasificacion_profesional)}</span>}{item.descripcion && <p>{item.descripcion}</p>}</div>
        <div className="action-row"><button className="btn-secondary btn-compact" aria-label={`Editar ${item.nombre}`} onClick={() => setEditor({ item })}>Editar</button><button className="btn-secondary btn-compact" aria-label={`${item.activo ? 'Desactivar' : 'Reactivar'} ${item.nombre}`} disabled={saving} onClick={() => item.activo ? setConfirm(item) : cambiarEstado(item)}>{item.activo ? 'Desactivar' : 'Reactivar'}</button></div>
      </li>)}</ul>
      {!result.data.length && !result.error && <p>No hay elementos con estos filtros.</p>}
      <nav className="catalogos-pagination" aria-label="Paginación de catálogos"><button className="btn-secondary" disabled={query.pagina <= 1} onClick={() => cambiar({ pagina: query.pagina - 1 })}>Anterior</button><span>Página {query.pagina} de {paginas} · {result.total} elementos</span><button className="btn-secondary" disabled={query.pagina >= paginas} onClick={() => cambiar({ pagina: query.pagina + 1 })}>Siguiente</button></nav>
    </>}
    {editor && <CatalogoEditor tipo={query.tipo} item={editor.item} onClose={() => setEditor(null)} onSaved={refresh} />}
    {confirm && <AdminDialog titleId="desactivar-catalogo-title" busy={saving} onClose={() => setConfirm(null)}><h2 id="desactivar-catalogo-title">Desactivar {confirm.nombre}</h2><p>Se conservarán los perfiles que ya lo tienen asignado. Dejará de estar disponible para nuevas asignaciones.</p><div className="action-row"><button className="btn-secondary" disabled={saving} onClick={() => setConfirm(null)}>Cancelar</button><button className="btn-danger" disabled={saving} onClick={() => cambiarEstado(confirm)}>{saving ? 'Guardando…' : 'Confirmar desactivación'}</button></div></AdminDialog>}
  </section>;
}
