const referenciasRepository = require('../repositories/referenciasRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const REFERENCIA_FIELDS = ['fecha', 'lugar_referencia', 'diagnostico'];

function buildUpdateData(body) {
  const campos = REFERENCIA_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  const data = {};
  for (const field of campos) data[field] = emptyToNull(body[field]);
  return { campos, data };
}

async function listarReferencias(pacienteId) {
  return referenciasRepository.listarPorPaciente(pacienteId);
}

async function guardarReferencia({ pacienteId, body, req }) {
  const referencia = await referenciasRepository.insertar({
    paciente_id: pacienteId,
    fecha: body.fecha,
    lugar_referencia: body.lugar_referencia,
    diagnostico: emptyToNull(body.diagnostico),
    registrado_por: req.usuario.id,
    updated_by: req.usuario.id,
  });

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'referencias_efectuadas',
    registroId: referencia.id,
    pacienteId,
    datosNuevos: referencia,
    descripcion: 'Referencia registrada',
  });

  return referencia;
}

async function actualizarReferencia({ pacienteId, id, body, req }) {
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  const before = await referenciasRepository.obtenerPorIdYPaciente(id, pacienteId);
  const { referencia, rowCount } = await referenciasRepository.actualizar({
    id,
    pacienteId,
    data,
    campos,
    updatedBy: req.usuario.id,
  });

  if (rowCount === 0) throw new HttpError(404, 'Referencia no encontrada');

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'referencias_efectuadas',
    registroId: id,
    pacienteId,
    datosAnteriores: before,
    datosNuevos: referencia,
    descripcion: 'Referencia actualizada',
  });

  return { message: 'Referencia actualizada' };
}

async function eliminarReferencia({ pacienteId, id, req }) {
  const { referencia, rowCount } = await referenciasRepository.eliminar({ id, pacienteId });

  if (rowCount === 0) throw new HttpError(404, 'Referencia no encontrada');

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'referencias_efectuadas',
    registroId: id,
    pacienteId,
    datosAnteriores: referencia,
    descripcion: 'Referencia eliminada',
  });

  return { message: 'Referencia eliminada' };
}

module.exports = {
  listarReferencias,
  guardarReferencia,
  actualizarReferencia,
  eliminarReferencia,
};
