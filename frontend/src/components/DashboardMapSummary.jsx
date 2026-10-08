import { useEffect, useState } from 'react';
import api from '../api/axios';
import { getErrorMessage } from '../utils/errorMessage';

export default function DashboardMapSummary({ onOpen }) {
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api.get('/mapa/riesgo', { signal: controller.signal }).then(({ data }) => {
      if (!active) return;
      if (!Array.isArray(data)) throw new Error('No se pudo interpretar el resumen del mapa.');
      const counts = data.map(community => Number(community.total_riesgo ?? 0));
      if (counts.some(count => !Number.isFinite(count) || count < 0)) throw new Error('No se pudo interpretar el resumen del mapa.');
      // Keep aggregates only; the dashboard does not retain patient lists or coordinates.
      setSummary({ communities: data.length, risk: counts.reduce((total, count) => total + count, 0) });
    }).catch(err => {
      if (active) setError(getErrorMessage(err, 'No se pudo cargar el resumen del mapa.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  return <section className="card" aria-label="Resumen del mapa de riesgo">
    <h2>Mapa de Riesgo</h2>
    {loading ? <p>Cargando resumen del mapa…</p> : error ? <div role="alert">
      <p>{error}</p>
      <button type="button" className="btn-secondary" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1); }}>Reintentar resumen del mapa</button>
    </div> : <p>{summary.communities} comunidades · {summary.risk} pacientes con riesgo en el mapa</p>}
    <button type="button" className="btn-secondary" onClick={onOpen}>Abrir mapa completo</button>
  </section>;
}
