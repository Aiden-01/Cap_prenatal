const puerperioRepository = require('../repositories/puerperioRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const PUERPERIO_FIELDS = [
  'numero_atencion', 'fecha', 'hora', 'signos_peligro',
  'dias_despues_parto', 'lugar_atencion_parto', 'quien_atendio_parto',
  'recien_nacido_vivo', 'tipo_parto', 'tuvo_apego_inmediato',
  'lactancia_materna_exclusiva', 'herida_operatoria',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca',
  'frecuencia_respiratoria', 'temperatura',
  'examen_mamas', 'examen_ginecologico',
  'orientacion_consejeria', 'impresion_clinica', 'tratamiento',
  'nombre_cargo_atiende',
];

const NULLABLE_BOOLEAN_FIELDS = [
  'recien_nacido_vivo',
  'tuvo_apego_inmediato',
  'lactancia_materna_exclusiva',
];

function buildUpdateData(body) {
  const dataWithTime = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  const campos = PUERPERIO_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(dataWithTime, field));
  const data = {};
  for (const field of campos) data[field] = emptyToNull(dataWithTime[field]);
  return { campos, data };
}

function normalizeCreateValue(field, body) {
  if (NULLABLE_BOOLEAN_FIELDS.includes(field)) return body[field] ?? null;
  return emptyToNull(body[field]);
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const data = {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
  };

  for (const field of PUERPERIO_FIELDS) {
    data[field] = normalizeCreateValue(field, body);
  }

  data.registrado_por = usuarioId;
  data.updated_by = usuarioId;
  return data;
}

async function listarPuerperio(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? puerperioRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function obtenerPuerperio({ pacienteId, embarazoId = null, id }) {
  const control = await puerperioRepository.obtenerPorId(id);
  if (!control) throw new HttpError(404, 'Control de puerperio no encontrado');
  await resolverEmbarazoParaLectura({ pacienteId, embarazoId: control.embarazo_id });
  if (embarazoId && String(control.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
  }
  return control;
}

async function guardarPuerperio({ pacienteId, embarazoId, body, req }) {
  const dataWithTime = withGuatemalaTimeFallback(body);
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const data = buildCreateData({
    pacienteId,
    embarazoId,
    body: dataWithTime,
    usuarioId: req.usuario.id,
  });
  const updateFields = PUERPERIO_FIELDS.filter((field) => field !== 'numero_atencion');
  const {
    embarazoBefore,
    embarazoActualizado,
    before,
    control,
  } = await puerperioRepository.enTransaccion(async (client) => {
    const embarazoBloqueado = await puerperioRepository.obtenerEmbarazoParaActualizar(
      { embarazoId, pacienteId },
      client
    );
    if (!embarazoBloqueado) {
      throw new HttpError(404, 'Embarazo no encontrado para esta paciente', {
        code: 'PREGNANCY_NOT_FOUND',
      });
    }
    if (!['activo', 'puerperio'].includes(embarazoBloqueado.estado)) {
      throw new HttpError(409, 'El embarazo esta cerrado y su expediente es de solo lectura', {
        code: 'PREGNANCY_READ_ONLY',
      });
    }

    const embarazoCambiado = await puerperioRepository.marcarEmbarazoEnPuerperio({
      embarazoId,
      pacienteId,
      fechaCierre: dataWithTime.fecha,
      updatedBy: req.usuario.id,
    }, client);
    const controlBefore = await puerperioRepository.obtenerPorNumeroYEmbarazo(
      embarazoId,
      dataWithTime.numero_atencion,
      client
    );
    const controlGuardado = await puerperioRepository.upsert({ data, updateFields }, client);
    if (!controlGuardado) {
      throw new HttpError(409, 'No fue posible guardar el control de puerperio');
    }

    return {
      embarazoBefore: embarazoBloqueado,
      embarazoActualizado: embarazoCambiado,
      before: controlBefore,
      control: controlGuardado,
    };
  });

  if (embarazoActualizado) {
    await registrarAuditoria(req, {
      accion: 'estado',
      tabla: 'embarazos',
      registroId: embarazoId,
      pacienteId,
      embarazoId,
      datosAnteriores: embarazoBefore,
      datosNuevos: embarazoActualizado,
      descripcion: 'Embarazo marcado como puerperio al registrar control de puerperio',
    });
  }

  await registrarAuditoria(req, {
    accion: before ? 'actualizar' : 'crear',
    tabla: 'controles_puerperio',
    registroId: control.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before || null,
    datosNuevos: control,
    descripcion: before ? 'Control de puerperio actualizado por upsert' : 'Control de puerperio registrado',
  });

  return control;
}

async function actualizarPuerperio({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const { campos, data } = buildUpdateData(body);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  const before = await puerperioRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Control de puerperio no encontrado');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const control = await puerperioRepository.actualizar({
    id,
    embarazoId,
    data,
    campos,
    updatedBy: req.usuario.id,
    pacienteId,
  });

  if (!control) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Control de puerperio no encontrado');
  }

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'controles_puerperio',
    registroId: control.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before,
    datosNuevos: control,
    descripcion: 'Control de puerperio actualizado',
  });

  return control;
}

async function eliminarPuerperio({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  const before = await puerperioRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Control de puerperio no encontrado');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control de puerperio no encontrado en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const { control, rowCount } = await puerperioRepository.eliminar({ id, embarazoId, pacienteId });

  if (rowCount === 0) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Control de puerperio no encontrado');
  }

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'controles_puerperio',
    registroId: id,
    pacienteId,
    embarazoId,
    datosAnteriores: control,
    descripcion: 'Control de puerperio eliminado',
  });

  return { message: 'Control de puerperio eliminado' };
}

module.exports = {
  listarPuerperio,
  obtenerPuerperio,
  guardarPuerperio,
  actualizarPuerperio,
  eliminarPuerperio,
};
