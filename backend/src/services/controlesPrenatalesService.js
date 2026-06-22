const controlesRepository = require('../repositories/controlesPrenatalesRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { withGuatemalaTimeFallback } = require('../utils/guatemalaTime');
const { registrarEvento: registrarAuditoria } = require('./auditService');
const { HttpError } = require('../utils/httpError');
const { filtrarCamposVih, VIH_FIELDS, puedeVerVih } = require('../utils/datosSensibles');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const CONTROL_FIELDS = [
  'numero_control', 'fecha', 'hora', 'motivo_consulta',
  'peligro_hemorragia_vaginal', 'peligro_palidez', 'peligro_dolor_cabeza',
  'peligro_hipertension', 'peligro_dolor_epigastrico',
  'peligro_trastornos_visuales', 'peligro_fiebre', 'peligro_otro',
  'edad_gestacional_semanas', 'nombre_acompanante', 'nombre_cargo_atiende',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca', 'frecuencia_respiratoria',
  'temperatura', 'perimetro_braquial_cm', 'peso_kg', 'talla_cm', 'imc',
  'examen_bucodental', 'examen_mamas',
  'altura_uterina_cm', 'fcf', 'movimientos_fetales',
  'situacion_fetal', 'presentacion_fetal',
  'sangre_manchado', 'verrugas_herpes_papilomas', 'flujo_vaginal', 'otros_ginecologico',
  'hematologia_realizada', 'hematologia_resultado',
  'glicemia_realizada', 'glicemia_resultado',
  'grupo_rh_realizado', 'grupo_rh_resultado',
  'orina_realizada', 'orina_bacteriuria', 'orina_proteinuria',
  'heces_realizada', 'heces_resultado',
  'vih_realizado', 'vih_resultado', 'vih_resultado_valor',
  'vdrl_realizado', 'vdrl_resultado', 'vdrl_tratamiento_indicado',
  'torch_realizado', 'torch_resultado_positivo', 'torch_resultado_valor',
  'papanicolau_ivaa_realizado', 'papanicolau_ivaa_fecha_toma', 'papanicolau_ivaa_resultado',
  'hepatitis_b_realizado', 'hepatitis_b_resultado',
  'otros_lab', 'usg_realizado', 'usg_hallazgos',
  'sulfato_ferroso', 'sulfato_ferroso_tabletas',
  'acido_folico', 'acido_folico_tabletas',
  'suplementacion_hallazgos', 'suplementacion_tratamiento',
  'orient_plan_emergencia_parto', 'orient_alimentacion_embarazo',
  'orient_senales_peligro', 'orient_lactancia_materna',
  'orient_planificacion_familiar', 'orient_importancia_postparto',
  'orient_vacunacion_nino', 'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones', 'orient_tratamiento_its_pareja',
  'orient_otros', 'impresion_clinica', 'tratamiento', 'cita_siguiente',
];

const CONTROL_BOOLEAN_DEFAULT_FALSE = [
  'peligro_hemorragia_vaginal',
  'peligro_palidez',
  'peligro_dolor_cabeza',
  'peligro_hipertension',
  'peligro_dolor_epigastrico',
  'peligro_trastornos_visuales',
  'peligro_fiebre',
  'sangre_manchado',
  'verrugas_herpes_papilomas',
  'flujo_vaginal',
  'hematologia_realizada',
  'glicemia_realizada',
  'grupo_rh_realizado',
  'orina_realizada',
  'heces_realizada',
  'vih_realizado',
  'vdrl_realizado',
  'vdrl_tratamiento_indicado',
  'torch_realizado',
  'papanicolau_ivaa_realizado',
  'hepatitis_b_realizado',
  'usg_realizado',
  'sulfato_ferroso',
  'acido_folico',
  'orient_plan_emergencia_parto',
  'orient_alimentacion_embarazo',
  'orient_senales_peligro',
  'orient_lactancia_materna',
  'orient_planificacion_familiar',
  'orient_importancia_postparto',
  'orient_vacunacion_nino',
  'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones',
  'orient_tratamiento_its_pareja',
];

const CONTROL_NULLABLE_BOOLEAN = [
  'examen_bucodental',
  'examen_mamas',
  'movimientos_fetales',
  'orina_bacteriuria',
  'orina_proteinuria',
  'torch_resultado_positivo',
];

function buildUpdateData(body) {
  const data = withGuatemalaTimeFallback(body, { onlyWhenHoraIsPresent: true });
  const campos = CONTROL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(data, field));
  const normalized = {};

  for (const field of campos) {
    normalized[field] = ['torch_resultado_valor', 'papanicolau_ivaa_fecha_toma'].includes(field)
      ? null
      : emptyToNull(data[field]);
  }

  return { data: normalized, campos };
}

function normalizeCreateValue(field, body) {
  if (CONTROL_BOOLEAN_DEFAULT_FALSE.includes(field)) return body[field] ?? false;
  if (CONTROL_NULLABLE_BOOLEAN.includes(field)) return body[field] ?? null;
  if (['torch_resultado_valor', 'papanicolau_ivaa_fecha_toma'].includes(field)) return null;
  return emptyToNull(body[field]);
}

function buildCreateData({ pacienteId, embarazoId, body, usuarioId }) {
  const data = {
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
  };

  for (const field of CONTROL_FIELDS) {
    data[field] = normalizeCreateValue(field, body);
  }

  data.registrado_por = usuarioId;
  data.updated_by = usuarioId;
  return data;
}

async function listarControles(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? controlesRepository.listarPorEmbarazo(embarazo.id) : [];
}

async function obtenerControl({ pacienteId, embarazoId = null, id }) {
  const control = await controlesRepository.obtenerPorId(id);
  if (control) await resolverEmbarazoParaLectura({ pacienteId, embarazoId: control.embarazo_id });
  if (!control) throw new HttpError(404, 'Control no encontrado');
  if (embarazoId && String(control.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
  }
  return control;
}

async function crearControl({ pacienteId, embarazoId, body, req }) {
  const dataWithTime = withGuatemalaTimeFallback(body);
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const before = await controlesRepository.obtenerPorNumeroYEmbarazo(
    embarazoId,
    dataWithTime.numero_control
  );
  const data = buildCreateData({
    pacienteId,
    embarazoId,
    body: dataWithTime,
    usuarioId: req.usuario.id,
  });
  const updateFields = CONTROL_FIELDS.filter((field) =>
    field !== 'numero_control' &&
    (puedeVerVih(req.usuario.permisos) || !VIH_FIELDS.has(field))
  );
  const control = await controlesRepository.upsert({ data, updateFields });
  if (!control) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(409, 'No fue posible guardar el control');
  }

  await registrarAuditoria(req, {
    accion: before ? 'actualizar' : 'crear',
    tabla: 'controles_prenatales',
    registroId: control.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before || null,
    datosNuevos: control,
    descripcion: before ? 'Control prenatal actualizado por upsert' : 'Control prenatal registrado',
  });

  return control;
}

async function actualizarControl({ pacienteId, embarazoId, id, body, req }) {
  requerirEmbarazoId(embarazoId);
  const bodyPermitido = filtrarCamposVih(body, req.usuario.permisos);
  const { data, campos } = buildUpdateData(bodyPermitido);
  if (campos.length === 0) throw new HttpError(400, 'Sin campos para actualizar');

  const before = await controlesRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Control no encontrado');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const control = await controlesRepository.actualizar({
    id,
    embarazoId,
    data,
    campos,
    updatedBy: req.usuario.id,
    pacienteId,
  });

  if (!control) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Control no encontrado');
  }

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'controles_prenatales',
    registroId: control.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before,
    datosNuevos: control,
    descripcion: 'Control prenatal actualizado',
  });

  return control;
}

async function eliminarControl({ pacienteId, embarazoId, id, req }) {
  requerirEmbarazoId(embarazoId);
  const before = await controlesRepository.obtenerPorId(id);
  if (!before) throw new HttpError(404, 'Control no encontrado');
  if (String(before.embarazo_id) !== String(embarazoId)) {
    throw new HttpError(404, 'Control no encontrado en el embarazo seleccionado');
  }
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const { control, rowCount } = await controlesRepository.eliminar({ id, embarazoId, pacienteId });

  if (rowCount === 0) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Control no encontrado');
  }

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'controles_prenatales',
    registroId: id,
    pacienteId,
    embarazoId,
    datosAnteriores: control,
    descripcion: 'Control prenatal eliminado',
  });

  return { message: 'Control eliminado' };
}

module.exports = {
  CONTROL_FIELDS,
  listarControles,
  obtenerControl,
  crearControl,
  actualizarControl,
  eliminarControl,
};
