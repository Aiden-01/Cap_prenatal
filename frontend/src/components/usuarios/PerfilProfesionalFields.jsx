import { useEffect, useId, useState } from 'react';
import { cargarOpcionesActivas } from '../../api/catalogos';

export default function PerfilProfesionalFields({ value, onChange, usuario, required = false, disabled = false, onReady }) {
  const id = useId();
  const [state, setState] = useState({ loading: true, cargos: [], especialidades: [], error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['cargos', 'especialidades'].map(tipo => cargarOpcionesActivas(tipo, controller.signal)))
      .then(([cargos, especialidades]) => {
        if (!controller.signal.aborted) { setState({ loading: false, cargos, especialidades, error: '' }); onReady?.(true); }
      }).catch(() => {
        if (!controller.signal.aborted) { setState({ loading: false, cargos: [], especialidades: [], error: 'No se pudieron cargar los catálogos.' }); onReady?.(false); }
      });
    return () => controller.abort();
  }, [reload, onReady]);
  const options = (tipo, campo, nombre, activo) => {
    const lista = state[tipo];
    const assigned = usuario?.[campo];
    // Solo la asignación histórica del perfil puede ofrecer una opción inactiva.
    const historial = assigned && !lista.some(item => String(item.id) === String(assigned))
      ? [{ id: assigned, nombre: usuario[nombre] || `Opción ${assigned}`, activo: usuario[activo] }] : [];
    return [...historial, ...lista].map(item => <option key={item.id} value={item.id}>{item.nombre}{item.activo === false ? ' (inactivo, asignado)' : ''}</option>);
  };
  return <div className="perfil-fields" aria-busy={state.loading}>
    {state.loading && <p role="status">Cargando cargos y especialidades…</p>}
    {state.error && <div role="alert" className="error-box">{state.error} <button type="button" className="btn-secondary" onClick={() => { setState(current => ({ ...current, loading: true, error: '' })); onReady?.(false); setReload(n => n + 1); }}>Reintentar</button></div>}
    <div className="form-group">
      <label className="input-label" htmlFor={`${id}-cargo`}>Cargo laboral{required ? ' *' : ''}</label>
      <select className="input-field" id={`${id}-cargo`} value={value.cargo_id ?? ''} required={required} disabled={disabled || state.loading || Boolean(state.error)} onChange={e => onChange('cargo_id', e.target.value ? Number(e.target.value) : null)}>
        <option value="">{required ? 'Selecciona un cargo' : 'Sin cargo asignado'}</option>
        {options('cargos', 'cargo_id', 'cargo_nombre', 'cargo_activo')}
      </select>
    </div>
    <div className="form-group">
      <label className="input-label" htmlFor={`${id}-especialidad`}>Especialidad (opcional)</label>
      <select className="input-field" id={`${id}-especialidad`} value={value.especialidad_id ?? ''} disabled={disabled || state.loading || Boolean(state.error)} onChange={e => onChange('especialidad_id', e.target.value ? Number(e.target.value) : null)}>
        <option value="">Sin especialidad</option>
        {options('especialidades', 'especialidad_id', 'especialidad_nombre', 'especialidad_activa')}
      </select>
    </div>
  </div>;
}
