const riesgoRepository = require('../repositories/riesgoRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarEventoPrivado: registrarAuditoria } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');
const { filtrarCamposVih, VIH_FIELDS } = require('../utils/datosSensibles');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const boolOrFalse = (value) => value ?? false;
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'riesgo_obstetrico', evento: 'crear' }),
  actualizar: Object.freeze({
    categoria: 'clinica',
    entidad: 'riesgo_obstetrico',
    evento: 'actualizar',
  }),
  eliminar: Object.freeze({ categoria: 'clinica', entidad: 'riesgo_obstetrico', evento: 'eliminar' }),
});
const RESULTADO_EXITOSO = 'exitoso';

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

const RISK_FACTOR_FIELDS = [
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
];

const BOOLEAN_FIELDS = new Set(['migrante', ...RISK_FACTOR_FIELDS]);

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

function riesgoAuditFields(fields, { includeDerivedRisk = false } = {}) {
  const riskFactorSet = new Set(RISK_FACTOR_FIELDS);
  const result = new Set(fields.filter((field) => !riskFactorSet.has(field)));
  if (fields.some((field) => riskFactorSet.has(field))) result.add('factores_riesgo');
  if (includeDerivedRisk) result.add('tiene_riesgo');
  return [...result].sort();
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (!/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  if (typeof value === 'boolean') return { valid: true, value };
  if (value === 1 || value === '1' || value === 'true') return { valid: true, value: true };
  if (value === 0 || value === '0' || value === 'false') return { valid: true, value: false };
  return { valid: false, value: null };
}

function valoresRiesgoEquivalentes(field, previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  if (BOOLEAN_FIELDS.has(field) || field === 'tiene_riesgo') {
    const previousBoolean = booleanValue(previous);
    const nextBoolean = booleanValue(next);
    if (previousBoolean.valid && nextBoolean.valid) {
      return previousBoolean.value === nextBoolean.value;
    }
  }

  const previousNumber = numericValue(previous);
  const nextNumber = numericValue(next);
  if (previousNumber !== null && nextNumber !== null) {
    return previousNumber === nextNumber;
  }
  return structurallyEqual(previous, next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresRiesgoEquivalentes(field, previous?.[field], next?.[field])
  );
}

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
  requerirEmbarazoId(embarazoId);
  return riesgoRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const existe = await riesgoRepository.obtenerPorEmbarazo(embarazoId, client);
    if (existe) {
      throw new HttpError(409, 'Esta paciente ya tiene una ficha de riesgo registrada');
    }

    const data = {
      paciente_id: pacienteId,
      embarazo_id: embarazoId,
      ...buildRiesgoData(body, RIESGO_FIELDS),
      registrado_por: req.usuario.id,
      updated_by: req.usuario.id,
    };
    const ficha = await riesgoRepository.insertar(data, client);
    if (!ficha) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar la ficha de riesgo');
    }

    const auditFields = riesgoAuditFields(RIESGO_FIELDS, { includeDerivedRisk: true });
    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.crear,
      accion: 'crear',
      entidadId: ficha.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(auditFields, 'crear'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return ficha;
  });
}

async function actualizarFichaRiesgo({ pacienteId, embarazoId, body, req }) {
  const fields = riesgoFieldsPermitidos(req.usuario.permisos);
  const bodyPermitido = filtrarCamposVih(body, req.usuario.permisos);
  requerirEmbarazoId(embarazoId);
  const data = buildRiesgoData(bodyPermitido, fields);
  return riesgoRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await riesgoRepository.obtenerPorEmbarazo(embarazoId, client);
    if (!before) throw new HttpError(404, 'Ficha de riesgo no encontrada');

    const modifiedFields = camposRealmenteModificados(before, data, fields);
    if (modifiedFields.length === 0) return before;

    const modifiedData = Object.fromEntries(
      modifiedFields.map((field) => [field, data[field]])
    );
    const ficha = await riesgoRepository.actualizarPorEmbarazo({
      embarazoId,
      data: modifiedData,
      campos: modifiedFields,
      updatedBy: req.usuario.id,
      pacienteId,
    }, client);

    if (!ficha) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Ficha de riesgo no encontrada');
    }

    const derivedRiskChanged = !valoresRiesgoEquivalentes(
      'tiene_riesgo',
      before.tiene_riesgo,
      ficha.tiene_riesgo
    );
    const auditFields = riesgoAuditFields(modifiedFields, {
      includeDerivedRisk: derivedRiskChanged,
    });
    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: ficha.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(auditFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return ficha;
  });
}

async function eliminarFichaRiesgo({ pacienteId, embarazoId, req }) {
  requerirEmbarazoId(embarazoId);
  return riesgoRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const before = await riesgoRepository.obtenerPorEmbarazo(embarazoId, client);
    if (!before) throw new HttpError(404, 'Ficha de riesgo no encontrada');
    const { ficha, rowCount } = await riesgoRepository.eliminarPorEmbarazo(
      { embarazoId, pacienteId },
      client
    );

    if (rowCount === 0) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(404, 'Ficha de riesgo no encontrada');
    }

    const auditFields = riesgoAuditFields(RIESGO_FIELDS, { includeDerivedRisk: true });
    await registrarAuditoria(req, {
      contexto: AUDIT_CONTEXT.eliminar,
      accion: 'eliminar',
      entidadId: ficha?.id || before.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(auditFields, 'eliminar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return { message: 'Ficha de riesgo eliminada' };
  });
}

module.exports = {
  RIESGO_FIELDS,
  RISK_FACTOR_FIELDS,
  valoresRiesgoEquivalentes,
  obtenerFichaRiesgo,
  guardarFichaRiesgo,
  actualizarFichaRiesgo,
  eliminarFichaRiesgo,
};
