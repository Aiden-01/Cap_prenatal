import { useEffect, useState } from 'react';
import { cargarCargosActivos } from '../api/catalogos';

export default function ControlProfessionalFields({ form, set, originalControl, disabled, errors = {} }) {
  const [state, setState] = useState({ loading: !disabled, cargos: [], error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    cargarCargosActivos(controller.signal).then(cargos => {
      if (!controller.signal.aborted) setState({ loading: false, cargos, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ loading: false, cargos: [], error: 'No se pudieron cargar los cargos.' });
    });
    return () => controller.abort();
  }, [disabled, revision]);
  const assigned = originalControl?.cargo_atiende_id;
  const snapshot = originalControl?.cargo_atiende_snapshot;
  const historicalOption = assigned && !state.cargos.some(cargo => String(cargo.id) === String(assigned));
  return <>
    <div className="form-group">
      <label className="input-label" htmlFor="control-nombre_atiende">Nombre completo de quien atiende</label>
      <input id="control-nombre_atiende" name="nombre_atiende" className={`input-field ${errors.nombre_atiende ? 'input-error' : ''}`} value={form.nombre_atiende ?? ''} maxLength={150} disabled={disabled}
        aria-invalid={Boolean(errors.nombre_atiende)} aria-describedby={errors.nombre_atiende ? 'control-nombre_atiende-error' : undefined}
        onChange={event => set('nombre_atiende', event.target.value)} />
      {errors.nombre_atiende && <div id="control-nombre_atiende-error" className="field-error-text" role="alert">{errors.nombre_atiende}</div>}
    </div>
    <div className="form-group">
      <label className="input-label" htmlFor="control-cargo_atiende_id">Cargo de quien atiende</label>
      <select id="control-cargo_atiende_id" name="cargo_atiende_id" className={`input-field ${errors.cargo_atiende_id ? 'input-error' : ''}`} value={form.cargo_atiende_id ?? ''} disabled={disabled || state.loading || Boolean(state.error)}
        aria-invalid={Boolean(errors.cargo_atiende_id)} aria-describedby={errors.cargo_atiende_id ? 'control-cargo_atiende_id-error' : undefined}
        onChange={event => set('cargo_atiende_id', event.target.value ? Number(event.target.value) : null)}>
        <option value="">{state.loading ? 'Cargando cargos…' : 'Sin cargo especificado'}</option>
        {historicalOption && <option value={assigned}>{snapshot?.nombre || 'Cargo registrado'}{disabled ? '' : ' (asignación conservada)'}</option>}
        {state.cargos.map(cargo => <option value={cargo.id} key={cargo.id}>{cargo.nombre}{cargo.codigo ? ` (${cargo.codigo})` : ''}</option>)}
      </select>
      {errors.cargo_atiende_id && <div id="control-cargo_atiende_id-error" className="field-error-text" role="alert">{errors.cargo_atiende_id}</div>}
    </div>
    {state.error && !disabled && <div style={{ gridColumn: '1 / -1' }} role="alert" className="error-box">{state.error} <button type="button" className="btn-secondary" onClick={() => { setState(current => ({ ...current, loading: true, error: '' })); setRevision(value => value + 1); }}>Reintentar</button></div>}
    {originalControl?.nombre_cargo_atiende && <p className="control-field-hint" style={{ gridColumn: '1 / -1' }}>Texto histórico conservado, sin interpretar: <strong>{originalControl.nombre_cargo_atiende}</strong></p>}
    <p className="control-field-hint" style={{ gridColumn: '1 / -1' }}>Datos declarados de la atención; no acreditan identidad verificada ni autoría clínica.</p>
  </>;
}
