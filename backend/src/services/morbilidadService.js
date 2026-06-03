const morbilidadRepository = require('../repositories/morbilidadRepository');
const { obtenerEmbarazoSeguimientoId } = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const MORBILIDAD_FIELDS = [
  'fecha',
  'hora',
  'motivo_consulta',
  'historia_enfermedad_actual',
  'revision_por_sistemas',
  'examen_fisico',
  'impresion_clinica',
  'tratamiento_referencia',
  'nombre_cargo_atiende',
];

function buildUpdateData(body) {
  const dataWithTime = withGuatemalaTimeFallback(body);
  const campos = MORBILIDAD_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(dataWithTime, field));
  const data = {};
  for (const field of campos) data[field] = emptyToNull(dataWithTime[field]);
  return { campos, data };
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const dataWithTime = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  return {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    fecha: dataWithTime.fecha,
    hora: emptyToNull(dataWithTime.hora),
    motivo_consulta: dataWithTime.motivo_consulta,
    historia_enfermedad_actual: emptyToNull(dataWithTime.historia_enfermedad_actual),
    revision_por_sistemas: emptyToNull(dataWithTime.revision_por_sistemas),
    examen_fisico: emptyToNull(dataWithTime.examen_fisico),
    impresion_clinica: emptyToNull(dataWithTime.impresion_clinica),
    tratamiento_referencia: emptyToNull(dataWithTime.tratamiento_referencia),
    nombre_cargo_atiende: emptyToNull(dataWithTime.nombre_cargo_atiende),
    registrado_por: usuarioId,
  };
}

async function getEmbarazoSeguimientoOrConflict(pacienteId) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  if (!embarazoId) {
    throw new HttpError(409, 'No hay embarazo activo o en puerperio para guardar morbilidad');
  }
  return embarazoId;
}

async function listarMorbilidad(pacienteId) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  return morbilidadRepository.listarPorEmbarazo(embarazoId);
}

async function obtenerMorbilidad({ pacienteId, id }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const registro = await morbilidadRepository.obtenerPorIdYEmbarazo(id, embarazoId);
  if (!registro) throw new HttpError(404, 'Registro no encontrado');
  return registro;
}

async function guardarMorbilidad({ pacienteId, body, req }) {
  const embarazoId = await getEmbarazoSeguimientoOrConflict(pacienteId);
  const registro = await morbilidadRepository.insertar(buildCreateData({
    pacienteId,
    embarazoId,
    body,
    usuarioId: req.usuario.id,
  }));

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'morbilidad_embarazo',
    registroId: registro.id,
    pacienteId,
    embarazoId,
    datosNuevos: registro,
    descripcion: 'Registro de morbilidad creado',
  });

  return registro;
}

async function actualizarMorbilidad({ pacienteId, id, body, req }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  const before = await morbilidadRepository.obtenerPorIdYEmbarazo(id, embarazoId);
  const { registro, rowCount } = await morbilidadRepository.actualizar({ id, embarazoId, data, campos });

  if (rowCount === 0) throw new HttpError(404, 'Registro no encontrado');

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'morbilidad_embarazo',
    registroId: id,
    pacienteId,
    embarazoId,
    datosAnteriores: before,
    datosNuevos: registro,
    descripcion: 'Registro de morbilidad actualizado',
  });

  return { message: 'Registro actualizado' };
}

async function eliminarMorbilidad({ pacienteId, id, req }) {
  const embarazoId = await obtenerEmbarazoSeguimientoId(pacienteId);
  const { registro, rowCount } = await morbilidadRepository.eliminar({ id, embarazoId });

  if (rowCount === 0) throw new HttpError(404, 'Registro no encontrado');

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'morbilidad_embarazo',
    registroId: id,
    pacienteId,
    embarazoId,
    datosAnteriores: registro,
    descripcion: 'Registro de morbilidad eliminado',
  });

  return { message: 'Registro eliminado' };
}

module.exports = {
  listarMorbilidad,
  obtenerMorbilidad,
  guardarMorbilidad,
  actualizarMorbilidad,
  eliminarMorbilidad,
};
