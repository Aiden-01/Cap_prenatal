import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import { accessIdentity } from '../utils/accessRules';
import { puedeLeerNotas } from '../utils/seguimientoNotas';

export function useSeguimientoNotas({ pacienteId, embarazoId, controlesIds, usuario }) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const ids = [...new Set(controlesIds.map(Number))].sort((a, b) => a - b).join(',');
  const enabled = puedeLeerNotas(usuario) && /^[1-9]\d*$/.test(String(embarazoId)) && Boolean(ids);
  const key = JSON.stringify([pacienteId, embarazoId, ids, accessIdentity(usuario), revision]);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      const all = ids.split(',');
      const data = [];
      for (let start = 0; start < all.length; start += 100) {
        const response = await api.get(`/pacientes/${pacienteId}/controles/seguimiento-notas`, {
          params: { embarazo_id: embarazoId, controles_ids: all.slice(start, start + 100).join(',') },
        });
        if (!Array.isArray(response.data?.data)) throw new Error('Respuesta de seguimiento inválida');
        data.push(...response.data.data);
      }
      return data;
    };
    load().then(data => { if (active) setResult({ key, data }); })
      .catch(() => { if (active) setResult({ key, error: true }); });
    window.addEventListener('focus', retry);
    return () => { active = false; window.removeEventListener('focus', retry); };
  }, [enabled, key, ids, pacienteId, embarazoId, retry]);
  if (!enabled) return { enabled: false, loading: false, data: [], retry };
  if (result?.key !== key) return { enabled: true, loading: true, data: [], retry };
  return { enabled: true, loading: false, data: result.data || [], error: result.error, retry };
}
