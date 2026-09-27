import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Filter, History, Search, XCircle } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../hooks/useAuth';
import HistoryDetail from '../components/HistoryDetail';
import HistoryCard from '../components/HistoryCard';
import useHistoryMobile from '../hooks/useHistoryMobile';
import { EMPTY_HISTORY_FILTERS, HISTORY_MODULES, HISTORY_TYPES, historyActivity, historyParams } from '../utils/historyPresentation';
import './Historial.css';
import { canViewHistory } from '../utils/historyAccess';

function HistoryContent() {
  const isMobile = useHistoryMobile();
  const [draft, setDraft] = useState({ ...EMPTY_HISTORY_FILTERS });
  const [request, setRequest] = useState({ filters: { ...EMPTY_HISTORY_FILTERS }, cursor: null, previous: [] });
  const [response, setResponse] = useState(null);
  const [usersRequest, setUsersRequest] = useState(0);
  const [users, setUsers] = useState({ items: [], error: false });
  const [selected, setSelected] = useState(null);
  const [filterError, setFilterError] = useState('');
  const detailTrigger = useRef(null);
  const loading = response?.request !== request;
  const error = !loading && response?.error;
  const items = loading || error ? [] : response?.data?.items || [];

  useEffect(() => {
    const controller = new AbortController();
    api.get('/auditoria', { params: historyParams(request.filters, request.cursor), signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setResponse({ request, data }); })
      .catch((err) => {
        if (!controller.signal.aborted) setResponse({ request, error: err.response?.status === 403
          ? 'No tienes permiso para consultar el historial.' : 'No se pudo cargar el historial. Inténtalo de nuevo.' });
      });
    return () => controller.abort();
  }, [request]);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/auditoria/usuarios', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUsers({ items: data, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setUsers({ items: [], error: true }); });
    return () => controller.abort();
  }, [usersRequest]);

  const closeDetail = useCallback(() => {
    setSelected(null);
    detailTrigger.current?.focus();
    // El modal restaura inert al desmontarse antes de devolver el foco.
    queueMicrotask(() => detailTrigger.current?.focus());
  }, []);
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (draft.desde && draft.hasta && draft.desde > draft.hasta) {
      setFilterError('La fecha final debe ser igual o posterior a la fecha inicial.'); return;
    }
    setFilterError(''); setSelected(null);
    setRequest({ filters: { ...draft }, cursor: null, previous: [] });
  };
  const navigate = (next) => { setSelected(null); setRequest(next); };
  const openDetail = (item, trigger) => { detailTrigger.current = trigger; setSelected(item); };

  return <div className="history-page">
    <header className="page-header"><div><h1>Historial de actividad</h1><p>Consulta las actividades recientes del sistema.</p></div></header>
    <form className="card history-filters" onSubmit={submit} aria-label="Filtros del historial">
      <label className="history-search"><Search size={18} /><span className="sr-only">Buscar actividad</span>
        <input className="input-field" placeholder="Buscar actividad…" value={draft.q} maxLength={100} onChange={(e) => change('q', e.target.value)} /></label>
      <label><span className="sr-only">Tipo</span><select className="input-field" aria-label="Tipo" value={draft.tipo} onChange={(e) => change('tipo', e.target.value)}>
        <option value="">Tipo</option>{HISTORY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="sr-only">Usuario</span><select className="input-field" aria-label="Usuario" value={draft.usuario_id} onChange={(e) => change('usuario_id', e.target.value)}>
        <option value="">Usuario</option>{users.items.map((user) => <option key={user.id} value={String(user.id)}>{user.nombre_completo || user.username || 'Usuario no disponible'}</option>)}</select></label>
      <label><span className="sr-only">Módulo</span><select className="input-field" aria-label="Módulo" value={draft.modulo} onChange={(e) => change('modulo', e.target.value)}>
        <option value="">Módulo</option>{HISTORY_MODULES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="history-dates"><label>Desde<input type="date" className="input-field" value={draft.desde} onChange={(e) => change('desde', e.target.value)} /></label>
        <label>Hasta<input type="date" className="input-field" value={draft.hasta} min={draft.desde || undefined} onChange={(e) => change('hasta', e.target.value)} /></label></div>
      <button className="btn-primary" type="submit"><Filter size={16} />Filtrar</button>
      <button className="btn-secondary" type="button" onClick={() => {
        setDraft({ ...EMPTY_HISTORY_FILTERS }); setFilterError(''); setSelected(null);
        setRequest({ filters: { ...EMPTY_HISTORY_FILTERS }, cursor: null, previous: [] });
      }}>Limpiar</button>
      {filterError ? <p className="history-filter-error" role="alert">{filterError}</p> : null}
      {users.error ? <p className="history-filter-error" role="alert">No se pudo cargar el filtro de usuarios. <button type="button" onClick={() => setUsersRequest((value) => value + 1)}>Reintentar usuarios</button></p> : null}
    </form>
    <div className={`history-workspace ${selected ? 'with-detail' : ''}`}>
      <section className="card history-list" aria-labelledby="history-list-title" aria-busy={loading}>
        <div className="history-list-heading"><h2 id="history-list-title">Actividades del sistema</h2><p>Registros recientes, ordenados por fecha y hora.</p></div>
        {loading ? <div className="history-state" role="status"><History size={28} /><p>Cargando actividades…</p></div> : error ?
          <div className="history-state" role="alert"><AlertCircle size={28} /><p>{error}</p><button className="btn-secondary" onClick={() => setRequest({ ...request })}>Reintentar</button></div> : !items.length ?
            <div className="history-state" role="status"><History size={30} /><h3>No hay actividades para mostrar</h3><p>Prueba con otros filtros o un periodo diferente.</p></div> :
            isMobile ? <div className="history-mobile-cards">{items.map((item) =>
              <HistoryCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={openDetail} />
            )}</div> : <div className="history-table-scroll"><table className="history-table"><thead><tr>
              {['Fecha y hora', 'Usuario', 'Actividad', 'Módulo', 'Resultado', 'Detalle'].map((label) => <th scope="col" key={label}>{label}</th>)}
            </tr></thead><tbody>{items.map((item) => {
              const { date, result, title, module, user, initials } = historyActivity(item);
              return <tr key={item.id} className={selected?.id === item.id ? 'is-selected' : ''}>
                <td><time>{date.date}<small>{date.time}</small></time></td>
                <td><div className="history-user"><span className="history-avatar" aria-hidden="true">{initials}</span>
                  <div><strong>{user}</strong>{item.usuario?.username ? <small>{item.usuario.username}</small> : null}</div></div></td>
                <td className="history-activity">{title}</td>
                <td>{module}</td>
                <td><span className={`history-result ${result.tone}`}>{result.tone === 'failed' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}{result.label}</span></td>
                <td><button className="btn-secondary history-view" aria-label={`Ver detalles: ${title}`} aria-expanded={selected?.id === item.id}
                  onClick={(event) => openDetail(item, event.currentTarget)}>Ver detalles</button></td>
              </tr>;
            })}</tbody></table></div>}
        <nav className="history-pagination" aria-label="Navegación del historial">
          <button className="btn-secondary" disabled={loading || !request.previous.length} onClick={() => navigate({ ...request, cursor: request.previous.at(-1), previous: request.previous.slice(0, -1) })}><ChevronLeft size={16} />Anterior</button>
          <button className="btn-secondary" disabled={loading || error || !response?.data?.has_more || !response?.data?.next_cursor} onClick={() => navigate({ ...request, cursor: response.data.next_cursor, previous: [...request.previous, request.cursor] })}>Siguiente<ChevronRight size={16} /></button>
        </nav>
      </section>
      {selected ? <HistoryDetail key={selected.id} item={selected} onClose={closeDetail} isMobile={isMobile} /> : null}
    </div>
  </div>;
}

export default function Historial() {
  const { usuario } = useAuth();
  if (!canViewHistory(usuario)) return <Navigate to="/dashboard" replace />;
  return <HistoryContent />;
}
