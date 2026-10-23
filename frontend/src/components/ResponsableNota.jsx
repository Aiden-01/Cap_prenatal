import { useEffect, useState } from 'react';
import api from '../api/axios';
import { errorNota } from '../utils/notasClinicas';

export default function ResponsableNota({ tipo, usuario, value, onChange }) {
  const [buscar, setBuscar] = useState('');
  const [directorio, setDirectorio] = useState(null);
  const [ownProfile, setOwnProfile] = useState(null);
  const [revision, setRevision] = useState(0);
  const nursing = tipo === 'nota_enfermeria';
  useEffect(() => {
    if (!usuario?.id) return;
    let active = true;
    const clases = nursing ? ['AE', 'EP'] : ['MED'];
    Promise.all(clases.map(cargo_codigo => api.get('/profesionales', { params: { buscar: usuario.nombre_completo || '', cargo_codigo, limite: 50 } })))
      .then(responses => { if (active) setOwnProfile({ key: `${tipo}:${usuario.id}`, enabled: responses.some(response => response.data.data.some(person => person.id === usuario.id)) }); })
      .catch(() => { if (active) setOwnProfile({ key: `${tipo}:${usuario.id}`, enabled: false }); });
    return () => { active = false; };
  }, [tipo, nursing, usuario?.id, usuario?.nombre_completo, revision]);
  useEffect(() => {
    if (value.tipo !== 'usuario') return;
    let active = true;
    const clases = nursing ? ['AE', 'EP'] : ['MED'];
    Promise.all(clases.map(cargo_codigo => api.get('/profesionales', {
      params: { buscar, cargo_codigo, limite: 50 },
    }))).then(responses => {
      if (active) setDirectorio({ key: `${tipo}:${buscar}`, data: responses.flatMap(response => response.data.data),
        truncated: responses.some(response => response.data.total > response.data.data.length) });
    }).catch(err => { if (active) setDirectorio({ key: `${tipo}:${buscar}`, error: err.response?.status === 403
      ? 'No tienes permiso para consultar el directorio.' : `Error al consultar profesionales. ${errorNota(err, 'Inténtalo de nuevo.')}` }); });
    return () => { active = false; };
  }, [value.tipo, buscar, tipo, nursing, revision]);
  const change = (field, next) => onChange({ ...value, [field]: next });
  return <div className="nota-responsable-fields">
    <label>Profesional responsable<select required value={value.tipo || ''} onChange={event => onChange(
      event.target.value === 'externo' ? { tipo: 'externo', nombre_completo: '',
        cargo_codigo: nursing ? '' : 'MED' }
        : event.target.value === 'usuario' ? { tipo: 'usuario', usuario_id: '' } : { tipo: event.target.value }
    )}>
      <option value="">Selecciona responsable</option>
      <option value="autenticado" disabled={Boolean(usuario) && !(ownProfile?.key === `${tipo}:${usuario.id}` && ownProfile.enabled)}>Yo atendí</option>
      <option value="usuario">Profesional del directorio</option>
      <option value="externo">Profesional externo</option>
    </select></label>
    {value.tipo === 'usuario' && <>
      <label>Buscar profesional<input value={buscar} maxLength={150} onChange={event => { setBuscar(event.target.value); change('usuario_id', ''); }} /></label>
      {directorio?.key !== `${tipo}:${buscar}` ? <p role="status">Cargando profesionales…</p>
        : directorio.error ? <div role="alert" className="nota-error"><p>{directorio.error}</p><button type="button" className="btn-secondary" onClick={() => { setDirectorio(null); setRevision(value => value + 1); }}>Reintentar directorio</button></div>
          : <><label>Profesional del directorio<select required value={value.usuario_id} onChange={event => change('usuario_id', Number(event.target.value) || '')}>
            <option value="">Selecciona profesional</option>
            {directorio.data.map(persona => <option key={persona.id} value={persona.id}>{persona.nombre_completo} — {persona.cargo_nombre}</option>)}
          </select>{directorio.truncated && <span>Precisa la búsqueda para ver más resultados.</span>}</label>{!directorio.data.length && <p role="status" className="nota-muted">No se encontraron profesionales habilitados para este tipo. Revisa la búsqueda, el código del cargo y su estado.</p>}</>}
    </>}
    {value.tipo === 'externo' && <>
      <label>Nombre completo<input required maxLength={150} value={value.nombre_completo} onChange={event => change('nombre_completo', event.target.value)} /></label>
      {<label>Cargo declarado<select required value={value.cargo_codigo} onChange={event => change('cargo_codigo', event.target.value)}>
        <option value="">Selecciona cargo</option>{!nursing && <option value="MED">Médico/a</option>}{nursing && <option value="AE">Auxiliar de Enfermería</option>}{nursing && <option value="EP">Enfermera Profesional</option>}
      </select></label>}
    <p className="nota-muted">Identidad externa declarada; no verificada por el establecimiento.</p>
</>}
    {value.tipo === 'usuario' && value.usuario_id && <p role="status" className="nota-selection">Profesional del directorio seleccionado.</p>}
    {usuario && !ownProfile?.enabled && <p className="nota-muted">«Yo atendí» requiere un perfil clínico activo correspondiente a este tipo de nota.</p>}
  </div>;
}
