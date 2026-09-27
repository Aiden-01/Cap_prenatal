import { CheckCircle2, XCircle } from 'lucide-react';
import { historyActivity } from '../utils/historyPresentation';

export default function HistoryCard({ item, selected, onSelect }) {
  const { date, result, title, module, user, initials } = historyActivity(item);
  return <article className={`card history-mobile-card ${selected ? 'is-selected' : ''}`}>
    <div className="history-mobile-card-heading">
      <span className="history-avatar" aria-hidden="true">{initials}</span>
      <div><h3>{title}</h3><p>{user}</p>
        <time dateTime={item.fecha || undefined}>{date.date}{date.time ? ` · ${date.time}` : ''}</time></div>
    </div>
    <div className="history-mobile-card-footer">
      <span className="history-module-chip">{module}</span>
      <span className={`history-result ${result.tone}`}>{result.tone === 'failed' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}{result.label}</span>
      <button type="button" className="btn-secondary history-view" aria-label={`Ver detalles: ${title}`} aria-expanded={selected}
        onClick={(event) => onSelect(item, event.currentTarget)}>Ver detalles</button>
    </div>
  </article>;
}
