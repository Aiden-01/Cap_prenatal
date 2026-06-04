const { registrarEvento } = require('../services/auditService');

async function registrarAuditoria(req, {
  accion,
  tabla,
  registroId = null,
  pacienteId = null,
  embarazoId = null,
  usuarioId = req.usuario?.id || null,
  datosAnteriores = null,
  datosNuevos = null,
  descripcion = null,
}) {
  return registrarEvento(req, {
    accion,
    tabla,
    registroId,
    pacienteId,
    embarazoId,
    usuarioId,
    datosAnteriores,
    datosNuevos,
    descripcion,
  });
}

module.exports = { registrarAuditoria };
