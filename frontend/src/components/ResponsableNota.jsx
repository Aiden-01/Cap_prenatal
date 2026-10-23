import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function ResponsableNota({ tipo, value, onChange }) {
  const [buscar, setBuscar] = useState('');
  const [directorio, setDirectorio] = useState(null);
  const nursing = tipo === 'nota_enfermeria';
  useEffect(() => {
    if (value.tipo !== 'usuario') return;
    let active = true;
    const clases = nursing ? ['enfermeria_ae', 'enfermeria_ep'] : ['medico'];
    Promise.all(clases.map(clasificacion_profesional => api.get('/profesionales', {
      params: { buscar, clasificacion_profesional, limite: 50 },
    }))).then(responses => {
      if (active) setDirectorio({ buscar, data: responses.flatMap(response => response.data.data),
        truncated: responses.some(response => response.data.total > response.data.data.length) });
    }).catch(() => { if (active) setDirectorio({ buscar, error: true }); });
    return () => { active = false; };
  }, [value.tipo, buscar, nursing]);
  const change = (field, next) => onChange({ ...value, [field]: next });
  return <>
    <label>Profesional responsable<select required value={value.tipo || ''} onChange={event => onChange(
      event.target.value === 'externo' ? { tipo: 'externo', nombre_completo: '', cargo: '', especialidad: null,
        clasificacion_profesional: nursing ? '' : 'medico' }
        : event.target.value === 'usuario' ? { tipo: 'usuario', usuario_id: '' } : { tipo: event.target.value }
    )}>
      <option value="">Selecciona responsable</option>
      <option value="autenticado">Yo atendí (se validará mi clasificación)</option>
      <option value="usuario">Profesional del directorio</option>
      <option value="externo">Profesional externo</option>
    </select></label>
    {value.tipo === 'usuario' && <>
      <label>Buscar profesional<input value={buscar} maxLength={150} onChange={event => { setBuscar(event.target.value); change('usuario_id', ''); }} /></label>
      {directorio?.buscar !== buscar ? <p role="status">Cargando profesionales…</p>
        : directorio.error ? <p role="alert">No se pudo cargar el directorio. Cambia la búsqueda para reintentar.</p>
          : <label>Profesional del directorio<select required value={value.usuario_id} onChange={event => change('usuario_id', Number(event.target.value) || '')}>
            <option value="">Selecciona profesional</option>
            {directorio.data.map(persona => <option key={persona.id} value={persona.id}>{persona.nombre_completo} — {persona.cargo_nombre} {persona.especialidad_nombre || ''}</option>)}
          </select>{directorio.truncated && <span>Precisa la búsqueda para ver más resultados.</span>}</label>}
    </>}
    {value.tipo === 'externo' && <>
      <label>Nombre completo<input required maxLength={150} value={value.nombre_completo} onChange={event => change('nombre_completo', event.target.value)} /></label>
      <label>Cargo declarado<input required maxLength={150} value={value.cargo} onChange={event => change('cargo', event.target.value)} /></label>
      <label>Especialidad (opcional)<input maxLength={150} value={value.especialidad || ''} onChange={event => change('especialidad', event.target.value || null)} /></label>
      {nursing && <label>Clasificación profesional<select required value={value.clasificacion_profesional} onChange={event => change('clasificacion_profesional', event.target.value)}>
        <option value="">Selecciona clasificación</option><option value="enfermeria_ae">Auxiliar de Enfermería</option><option value="enfermeria_ep">Enfermera Profesional</option>
      </select></label>}
    </>}
  </>;
}
