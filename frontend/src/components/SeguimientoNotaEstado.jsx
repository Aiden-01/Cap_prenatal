import { ESTADOS_NOTA, TIPOS_NOTA } from '../utils/seguimientoNotas';

export default function SeguimientoNotaEstado({ seguimiento }) {
  if (!seguimiento) return null;
  return <div aria-label="Seguimiento documental">
    {seguimiento.documentos.map(documento => <p key={documento.tipo}>
      <strong>{TIPOS_NOTA[documento.tipo]}: </strong>{ESTADOS_NOTA[documento.estado] || 'Estado no disponible'}
    </p>)}
    {seguimiento.elegible && !seguimiento.documentos.length && <p>Tipo de nota por definir para los documentos que puedes consultar.</p>}
    {!seguimiento.elegible && !seguimiento.documentos.length && <p>Control histórico: sin seguimiento documental automático.</p>}
  </div>;
}
