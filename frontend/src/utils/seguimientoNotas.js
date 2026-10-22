export const TIPOS_NOTA = Object.freeze({ nota_evolucion: 'Nota de evolución', nota_enfermeria: 'Nota de evolución de enfermería' });
export const ESTADOS_NOTA = Object.freeze({ pendiente: 'Nota pendiente', borrador: 'Nota en borrador', captura_finalizada: 'Captura finalizada' });
export const puedeLeerNotas = usuario => Boolean(usuario?.permisos?.includes('pacientes.ver')
  && ['notas_evolucion.ver', 'notas_enfermeria.ver'].some(permiso => usuario.permisos.includes(permiso)));
export function seguimientoNotasPath({ pacienteId, embarazoId, controlId }) {
  if (![pacienteId, embarazoId, controlId].every(id => /^[1-9]\d*$/.test(String(id)))) return null;
  return `/pacientes/${pacienteId}/controles/${controlId}/seguimiento-notas?embarazo_id=${embarazoId}`;
}
