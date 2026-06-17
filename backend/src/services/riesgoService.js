const riesgoRepository = require('../repositories/riesgoRepository');
const { obtenerEmbarazoActivoId, obtenerEmbarazoActivoRequeridoId } = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');
const n8nNotifier = require('./n8nNotifier');

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

function buildRiesgoData(body) {
  const data = {};
  for (const field of RIESGO_FIELDS) {
    data[field] = normalizeField(field, body);
  }
  return data;
}

function buildRiesgoEventPayload({ accion, pacienteId, embarazoId, ficha }) {
  return {
    accion,
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    ficha_id: ficha.id,
    tiene_riesgo: ficha.tiene_riesgo,
    referida_a: ficha.referida_a,
    fecha: ficha.fecha,
  };
}

async function notifyRiesgoDetectado({ accion, pacienteId, embarazoId, ficha }) {
  if (!ficha?.tiene_riesgo) return;

  await n8nNotifier.sendEvent('riesgo_obstetrico.detectado', buildRiesgoEventPayload({
    accion,
    pacienteId,
    embarazoId,
    ficha,
  }));
}

async function obtenerFichaRiesgo(pacienteId) {
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
  if (!embarazoId) return null;
  return riesgoRepository.obtenerPorEmbarazo(embarazoId);
}

async function guardarFichaRiesgo({ pacienteId, body, req }) {
  const embarazoId = await obtenerEmbarazoActivoRequeridoId(pacienteId);
  const existe = await riesgoRepository.obtenerPorEmbarazo(embarazoId);
  if (existe) {
    throw new HttpError(409, 'Esta paciente ya tiene una ficha de riesgo registrada');
  }

  const ficha = await riesgoRepository.insertar({
    paciente_id: pacienteId,
    embarazo_id: embarazoId,
    ...buildRiesgoData(body),
    registrado_por: req.usuario.id,
    updated_by: req.usuario.id,
  });

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'fichas_riesgo_obstetrico',
    registroId: ficha.id,
    pacienteId,
    embarazoId,
    datosNuevos: ficha,
    descripcion: 'Ficha de riesgo registrada',
  });

  await notifyRiesgoDetectado({
    accion: 'crear',
    pacienteId,
    embarazoId,
    ficha,
  });

  return ficha;
}

async function actualizarFichaRiesgo({ pacienteId, body, req }) {
  const embarazoId = await obtenerEmbarazoActivoRequeridoId(pacienteId);
  const before = await riesgoRepository.obtenerPorEmbarazo(embarazoId);
  const data = buildRiesgoData(body);
  const ficha = await riesgoRepository.actualizarPorEmbarazo({
    embarazoId,
    data,
    campos: RIESGO_FIELDS,
    updatedBy: req.usuario.id,
  });

  if (!ficha) throw new HttpError(404, 'Ficha de riesgo no encontrada');

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

  const riesgoNuevo = Boolean(ficha.tiene_riesgo);
  const riesgoAnterior = Boolean(before?.tiene_riesgo);
  if (riesgoNuevo && !riesgoAnterior) {
    await notifyRiesgoDetectado({
      accion: 'actualizar',
      pacienteId,
      embarazoId,
      ficha,
    });
  }

  return ficha;
}

async function eliminarFichaRiesgo({ pacienteId, req }) {
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
  const { ficha, rowCount } = await riesgoRepository.eliminarPorEmbarazo(embarazoId);

  if (rowCount === 0) throw new HttpError(404, 'Ficha de riesgo no encontrada');

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
