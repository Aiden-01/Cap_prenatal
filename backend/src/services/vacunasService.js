const vacunasRepository = require('../repositories/vacunasRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

async function listarVacunas(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? vacunasRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function listarAntecedentes({ pacienteId, excluirEmbarazoId }) {
  if (excluirEmbarazoId) {
    await resolverEmbarazoParaLectura({ pacienteId, embarazoId: excluirEmbarazoId });
  }
  return vacunasRepository.listarAntecedentes({ pacienteId, excluirEmbarazoId });
}

async function obtenerVacuna({ pacienteId, embarazoId = null, id }) {
  const vacuna = await vacunasRepository.obtenerPorId(id);
  if (!vacuna) throw new HttpError(404, 'Vacuna no encontrada');
  if (!vacuna.embarazo_id) throw new HttpError(409, 'La vacuna es un antecedente de solo lectura');
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId: vacuna.embarazo_id });
  if (embarazoId && String(vacuna.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
  }
  return vacuna;
}

async function guardarVacuna({ pacienteId, embarazoId, body, req }) {
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const numeroDosis = body.numero_dosis ?? 1;
  const before = await vacunasRepository.obtenerPorDosis({
    embarazoId,
    tipoVacuna: body.tipo_vacuna,
    momento: body.momento,
    numeroDosis,
  });
  const vacuna = await vacunasRepository.upsert({
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    tipo_vacuna: body.tipo_vacuna,
    momento: body.momento,
    numero_dosis: numeroDosis,
    fecha_dosis: emptyToNull(body.fecha_dosis),
    registrado_por: req.usuario.id,
    updated_by: req.usuario.id,
  });
  if (!vacuna) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(409, 'No fue posible guardar la vacuna');
  }

  await registrarAuditoria(req, {
    accion: before ? 'actualizar' : 'crear',
    tabla: 'vacunas_paciente',
    registroId: vacuna.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before || null,
    datosNuevos: vacuna,
    descripcion: before ? 'Vacuna actualizada por upsert' : 'Vacuna registrada',
  });

  return vacuna;
}

async function actualizarVacuna({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const before = await vacunasRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Vacuna no encontrada');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const vacuna = await vacunasRepository.actualizar({
    id,
    embarazoId,
    data: {
      tipo_vacuna: body.tipo_vacuna,
      momento: body.momento,
      numero_dosis: emptyToNull(body.numero_dosis) ?? 1,
      fecha_dosis: emptyToNull(body.fecha_dosis),
      updated_by: req.usuario.id,
    },
    pacienteId,
  });

  if (!vacuna) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Vacuna no encontrada');
  }

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'vacunas_paciente',
    registroId: vacuna.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before,
    datosNuevos: vacuna,
    descripcion: 'Vacuna actualizada',
  });

  return vacuna;
}

async function eliminarVacuna({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  const before = await vacunasRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Vacuna no encontrada');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Vacuna no encontrada en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const { vacuna, rowCount } = await vacunasRepository.eliminar({ id, embarazoId, pacienteId });

  if (rowCount === 0) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Vacuna no encontrada');
  }

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'vacunas_paciente',
    registroId: id,
    pacienteId,
    embarazoId,
    datosAnteriores: vacuna,
    descripcion: 'Vacuna eliminada',
  });

  return { message: 'Vacuna eliminada' };
}

module.exports = {
  listarVacunas,
  listarAntecedentes,
  obtenerVacuna,
  guardarVacuna,
  actualizarVacuna,
  eliminarVacuna,
};
