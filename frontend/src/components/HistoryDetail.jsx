import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, FileText, Layers, UserRound, X } from 'lucide-react';
import { historyDate, historyResult } from '../utils/historyPresentation';

export default function HistoryDetail({ item, onClose, isMobile = false }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const escape = (event) => {
      if (event.key === 'Escape') onClose();
      if (isMobile && event.key === 'Tab') {
        const targets = panelRef.current?.querySelectorAll('button, input, select, a[href], [tabindex="0"]');
        const first = targets?.[0]; const last = targets?.[targets.length - 1];
        if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    if (isMobile) { document.body.style.overflow = 'hidden'; if (root) root.inert = true; }
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (isMobile) { document.body.style.overflow = previousOverflow; if (root) root.inert = wasInert; }
    };
  }, [onClose, isMobile]);
  const date = historyDate(item.fecha);
  const result = historyResult(item.tipo, item.presentacion?.resultado);
  const content = <aside ref={panelRef} className="card history-detail" role={isMobile ? 'dialog' : undefined}
    aria-modal={isMobile ? true : undefined} aria-labelledby="history-detail-title">
    {isMobile ? <div className="history-sheet-handle" aria-hidden="true" /> : null}
    <div className="history-detail-heading">
      <h2 id="history-detail-title">Detalle de actividad</h2>
      <button ref={closeRef} type="button" className="history-close" onClick={onClose} aria-label="Cerrar detalle"><X size={20} /></button>
    </div>
    <div className="history-detail-summary">
      <span className="history-activity-icon"><FileText size={26} /></span>
      <div><h3>{item.presentacion?.titulo || 'Actividad no identificada'}</h3>
        <p>{date.date}{date.time ? ` · ${date.time}` : ''}</p>
        <span className={`history-result ${result.tone}`}>{result.label}</span>
      </div>
    </div>
    <dl className="history-detail-fields">
      <div><dt><UserRound size={18} />Usuario</dt><dd>{item.usuario?.nombre_completo || 'Usuario no disponible'}
        {item.usuario?.username ? <small>{item.usuario.username}</small> : null}</dd></div>
      <div><dt><CalendarDays size={18} />Fecha y hora</dt><dd>{date.date}{date.time ? <small>{date.time}</small> : null}</dd></div>
      <div><dt><Layers size={18} />Módulo</dt><dd>{item.presentacion?.modulo || 'Módulo no identificado'}</dd></div>
      <div><dt><FileText size={18} />Actividad</dt><dd>{item.presentacion?.titulo || 'Actividad no identificada'}</dd></div>
      <div><dt>Categoría</dt><dd>{item.presentacion?.categoria || 'Otros eventos'}</dd></div>
      <div><dt>Resultado</dt><dd><span className={`history-result ${result.tone}`}>{result.label}</span></dd></div>
    </dl>
  </aside>;
  return isMobile ? createPortal(<div className="history-sheet-backdrop" onPointerDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>{content}</div>, document.body) : content;
}
