const vacunasRepository = require('../repositories/vacunasRepository');
const { obtenerEmbarazoSeguimientoId } = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

async function getEmbarazoSeguimientoOrConflict(pacienteId) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  if (!embarazoId) {
    throw new HttpError(409, 'No hay embarazo activo o en puerperio para guardar vacunas');
  }
  return embarazoId;
}

async function listarVacunas(pacienteId) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  return vacunasRepository.listarPorEmbarazo(embarazoId);
}

async function obtenerVacuna({ pacienteId, id }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const vacuna = await vacunasRepository.obtenerPorIdYEmbarazo(id, embarazoId);
  if (!vacuna) throw new HttpError(404, 'Vacuna no encontrada');
  return vacuna;
}

async function guardarVacuna({ pacienteId, body, req }) {
  const embarazoId = await getEmbarazoSeguimientoOrConflict(pacienteId);
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
  });

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

async function actualizarVacuna({ pacienteId, id, body, req }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const before = await vacunasRepository.obtenerPorIdYEmbarazo(id, embarazoId);
  const vacuna = await vacunasRepository.actualizar({
    id,
    embarazoId,
    data: {
      tipo_vacuna: body.tipo_vacuna,
      momento: body.momento,
      numero_dosis: emptyToNull(body.numero_dosis) ?? 1,
      fecha_dosis: emptyToNull(body.fecha_dosis),
      registrado_por: req.usuario.id,
    },
  });

  if (!vacuna) throw new HttpError(404, 'Vacuna no encontrada');

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

async function eliminarVacuna({ pacienteId, id, req }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const { vacuna, rowCount } = await vacunasRepository.eliminar({ id, embarazoId });

  if (rowCount === 0) throw new HttpError(404, 'Vacuna no encontrada');

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
  obtenerVacuna,
  guardarVacuna,
  actualizarVacuna,
  eliminarVacuna,
};
