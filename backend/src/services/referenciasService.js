const referenciasRepository = require('../repositories/referenciasRepository');
const { registrarEventoPrivado } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const REFERENCIA_FIELDS = ['fecha', 'lugar_referencia', 'diagnostico'];
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'referencia', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'referencia', evento: 'actualizar' }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'referencia', evento: 'eliminar' }),
});
const RESULTADO_EXITOSO = 'exitoso';

function auditChangesForFields(fields, action) {
  const namedFields = [...new Set(fields)].sort();
  const marker = (value) => Object.fromEntries(namedFields.map((field) => [field, value]));
  if (action === 'crear') return { nuevos: marker('registrado') };
  if (action === 'eliminar') return { anteriores: marker('eliminado') };
  return {
    anteriores: marker('anterior'),
    nuevos: marker('nuevo'),
  };
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

function valoresReferenciaEquivalentes(previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  const previousNumber = numericValue(previous);
  const nextNumber = numericValue(next);
  if (previousNumber !== null && nextNumber !== null) return previousNumber === nextNumber;
  if (structurallyEqual(previous, next)) return true;
  return normalizedText(previous) === normalizedText(next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresReferenciaEquivalentes(previous?.[field], next?.[field])
  );
}

function buildUpdateData(body) {
  const campos = REFERENCIA_FIELDS.filter(
    (field) => Object.prototype.hasOwnProperty.call(body, field)
  );
  const data = {};
  for (const field of campos) data[field] = emptyToNull(body[field]);
  return { campos, data };
}

async function listarReferencias(pacienteId) {
  return referenciasRepository.listarPorPaciente(pacienteId);
}

async function guardarReferencia({ pacienteId, body, req }) {
  return referenciasRepository.enTransaccion(async (client) => {
    const referencia = await referenciasRepository.insertar({
      paciente_id: pacienteId,
      fecha: body.fecha,
      lugar_referencia: body.lugar_referencia,
      diagnostico: emptyToNull(body.diagnostico),
      registrado_por: req.usuario.id,
      updated_by: req.usuario.id,
    }, client);

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.crear,
      accion: 'crear',
      entidadId: referencia.id,
      pacienteId,
      cambios: auditChangesForFields(REFERENCIA_FIELDS, 'crear'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return referencia;
  });
}

async function actualizarReferencia({ pacienteId, id, body, req }) {
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  return referenciasRepository.enTransaccion(async (client) => {
    const before = await referenciasRepository.obtenerPorIdYPaciente(id, pacienteId, client);
    if (!before) throw new HttpError(404, 'Referencia no encontrada');

    const modifiedFields = camposRealmenteModificados(before, data, campos);
    if (modifiedFields.length === 0) return { message: 'Referencia actualizada' };
    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, data[field]])
    );
    const { referencia, rowCount } = await referenciasRepository.actualizar({
      id,
      pacienteId,
      data: modifiedData,
      campos: modifiedFields,
      updatedBy: req.usuario.id,
    }, client);

    if (rowCount === 0) throw new HttpError(404, 'Referencia no encontrada');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: referencia?.id || id,
      pacienteId,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Referencia actualizada' };
  });
}

async function eliminarReferencia({ pacienteId, id, req }) {
  return referenciasRepository.enTransaccion(async (client) => {
    const { rowCount } = await referenciasRepository.eliminar({ id, pacienteId }, client);
    if (rowCount === 0) throw new HttpError(404, 'Referencia no encontrada');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: id,
      pacienteId,
      cambios: auditChangesForFields(REFERENCIA_FIELDS, 'eliminar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Referencia eliminada' };
  });
}

module.exports = {
  REFERENCIA_FIELDS,
  valoresReferenciaEquivalentes,
  listarReferencias,
  guardarReferencia,
  actualizarReferencia,
  eliminarReferencia,
};
