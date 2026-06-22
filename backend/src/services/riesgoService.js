const riesgoRepository = require('../repositories/riesgoRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');
const { filtrarCamposVih, VIH_FIELDS } = require('../utils/datosSensibles');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const boolOrFalse = (value) => value ?? false;

const RIESGO_FIELDS = [
  'fecha', 'telefono', 'pueblo', 'migrante', 'estado_civil',
  'escolaridad', 'ocupacion', 'nombre_esposo_conviviente', 'edad_esposo',
  'pueblo_esposo', 'escolaridad_esposo', 'ocupacion_esposo',
  'distancia_servicio_km', 'tiempo_horas', 'fecha_ultima_regla', 'fecha_probable_parto',
  'no_embarazos', 'no_partos', 'no_cesareas', 'no_abortos', 'no_hijos_vivos',
  'no_hijos_muertos', 'edad_embarazo_semanas',
  'muerte_fetal_neonatal_previa', 'abortos_espontaneos_3mas',
  'gestas_3mas', 'peso_ultimo_bebe_menor_2500g', 'peso_ultimo_bebe_mayor_4500g',
  'antec_hipertension_preeclampsia', 'cirugias_tracto_reproductivo',
  'embarazo_multiple', 'menor_20_anos', 'mayor_35_anos',
  'paciente_rh_negativo', 'hemorragia_vaginal', 'vih_positivo_sifilis',
  'presion_diastolica_90mas', 'anemia', 'desnutricion_obesidad',
  'dolor_abdominal', 'sintomatologia_urinaria', 'ictericia',
  'diabetes', 'enfermedad_renal', 'enfermedad_corazon',
  'hipertension_arterial', 'consumo_drogas_alcohol_tabaco',
  'otra_enfermedad_severa', 'otra_enfermedad_descripcion',
  'referida_a', 'nombre_personal_atendio',
];

const BOOLEAN_FIELDS = new Set([
  'migrante',
  'muerte_fetal_neonatal_previa',
  'abortos_espontaneos_3mas',
  'gestas_3mas',
  'peso_ultimo_bebe_menor_2500g',
  'peso_ultimo_bebe_mayor_4500g',
  'antec_hipertension_preeclampsia',
  'cirugias_tracto_reproductivo',
  'embarazo_multiple',
  'menor_20_anos',
  'mayor_35_anos',
  'paciente_rh_negativo',
  'hemorragia_vaginal',
  'vih_positivo_sifilis',
  'presion_diastolica_90mas',
  'anemia',
  'desnutricion_obesidad',
  'dolor_abdominal',
  'sintomatologia_urinaria',
  'ictericia',
  'diabetes',
  'enfermedad_renal',
  'enfermedad_corazon',
  'hipertension_arterial',
  'consumo_drogas_alcohol_tabaco',
  'otra_enfermedad_severa',
]);

function normalizeField(field, body) {
  if (BOOLEAN_FIELDS.has(field)) return boolOrFalse(body[field]);
  return emptyToNull(body[field]);
}

function buildRiesgoData(body, fields = RIESGO_FIELDS) {
  const data = {};
  for (const field of fields) {
    data[field] = normalizeField(field, body);
  }
  return data;
}

function riesgoFieldsPermitidos(permisos = []) {
  const puedeVerVih = permisos.includes('controles.ver_vih');
  return puedeVerVih
    ? RIESGO_FIELDS
    : RIESGO_FIELDS.filter((field) => !VIH_FIELDS.has(field));
}

async function obtenerFichaRiesgo(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? riesgoRepository.obtenerPorEmbarazo(embarazo.id) : null;
}

async function guardarFichaRiesgo({ pacienteId, embarazoId, body, req }) {
  const fields = riesgoFieldsPermitidos(req.usuario.permisos);
  const bodyPermitido = filtrarCamposVih(body, req.usuario.permisos);
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const existe = await riesgoRepository.obtenerPorEmbarazo(embarazoId);
  if (existe) {
    throw new HttpError(409, 'Esta paciente ya tiene una ficha de riesgo registrada');
  }

  const ficha = await riesgoRepository.insertar({
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    ...buildRiesgoData(bodyPermitido, fields),
    registrado_por: req.usuario.id,
    updated_by: req.usuario.id,
  });
  if (!ficha) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(409, 'No fue posible guardar la ficha de riesgo');
  }

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'fichas_riesgo_obstetrico',
    registroId: ficha.id,
    pacienteId,
    embarazoId,
    datosNuevos: ficha,
    descripcion: 'Ficha de riesgo registrada',
  });

  return ficha;
}

async function actualizarFichaRiesgo({ pacienteId, embarazoId, body, req }) {
  const fields = riesgoFieldsPermitidos(req.usuario.permisos);
  const bodyPermitido = filtrarCamposVih(body, req.usuario.permisos);
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const before = await riesgoRepository.obtenerPorEmbarazo(embarazoId);
  const data = buildRiesgoData(bodyPermitido, fields);
  const ficha = await riesgoRepository.actualizarPorEmbarazo({
    embarazoId,
    data,
    campos: fields,
    updatedBy: req.usuario.id,
    pacienteId,
  });

  if (!ficha) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Ficha de riesgo no encontrada');
  }

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'fichas_riesgo_obstetrico',
    registroId: ficha.id,
    pacienteId,
    embarazoId,
    datosAnteriores: before,
    datosNuevos: ficha,
    descripcion: 'Ficha de riesgo actualizada',
  });

  return ficha;
}

async function eliminarFichaRiesgo({ pacienteId, embarazoId, req }) {
  requerirEmbarazoId(embarazoId);
  await validarEmbarazoEditable({ pacienteId, embarazoId });
  const { ficha, rowCount } = await riesgoRepository.eliminarPorEmbarazo({ embarazoId, pacienteId });

  if (rowCount === 0) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(404, 'Ficha de riesgo no encontrada');
  }

  await registrarAuditoria(req, {
    accion: 'eliminar',
    tabla: 'fichas_riesgo_obstetrico',
    registroId: ficha.id,
    pacienteId,
    embarazoId,
    datosAnteriores: ficha,
    descripcion: 'Ficha de riesgo eliminada',
  });

  return { message: 'Ficha de riesgo eliminada' };
}

module.exports = {
  obtenerFichaRiesgo,
  guardarFichaRiesgo,
  actualizarFichaRiesgo,
  eliminarFichaRiesgo,
};
