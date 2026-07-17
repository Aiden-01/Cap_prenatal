const planPartoRepository = require('../repositories/planPartoRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarEventoPrivado } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'clinica', entidad: 'plan_parto', evento: 'crear' }),
  actualizar: Object.freeze({ categoria: 'clinica', entidad: 'plan_parto', evento: 'actualizar' }),
});
const RESULTADO_EXITOSO = 'exitoso';

const PLAN_PARTO_FIELDS = [
  'no_registro', 'servicio_salud', 'lugar_residencia',
  'fecha', 'nombre_conyuge', 'telefono', 'fecha_nacimiento', 'estado_civil',
  'pueblo', 'escolaridad', 'con_quien_vive', 'idioma', 'ha_tenido_atencion_prenatal',
  'no_embarazos', 'no_partos', 'no_abortos', 'no_hijos_vivos', 'no_hijos_muertos',
  'fur', 'fecha_probable_parto', 'no_cesareas', 'fecha_ultima_cesarea',
  'edad_gestacional_semanas', 'edad_gestacional_au', 'parto_anterior_hospital', 'parto_anterior_caimi',
  'parto_anterior_comadrona', 'parto_anterior_clinica_privada', 'parto_anterior_otro',
  'peligro_dolor_cabeza', 'peligro_vision_borrosa', 'peligro_embarazo_multiple',
  'peligro_hemorragia_vaginal', 'peligro_edema_mi', 'peligro_nino_transverso',
  'peligro_dolor_estomago', 'peligro_salida_liquidos', 'peligro_convulsiones',
  'peligro_fiebre', 'peligro_ausencia_mov_fetales', 'peligro_placenta_no_salia',
  'posicion_parto', 'lugar_atencion_parto', 'horas_distancia', 'kms_servicio',
  'casa_materna_cercana', 'usara_casa_materna', 'como_trasladara', 'acompana_traslado', 'acompana_parto',
  'bebida_durante_parto', 'bebida_despues_parto', 'ropa_nino', 'ropa_madre',
  'otros_articulos', 'lleva_dpi_madre', 'lleva_dpi_conyuge', 'lleva_partida_nacimiento',
  'cuenta_ahorro', 'comunicado_comite', 'con_quien_hijos', 'quien_cuida_casa',
  'telefono_vehiculo', 'responsable_activar', 'nombre_activara_plan', 'nombre_proveedor_salud',
];

const PLAN_BOOLEAN_FIELDS = new Set([
  'ha_tenido_atencion_prenatal',
  'parto_anterior_hospital',
  'parto_anterior_caimi',
  'parto_anterior_comadrona',
  'parto_anterior_clinica_privada',
  'peligro_dolor_cabeza',
  'peligro_vision_borrosa',
  'peligro_embarazo_multiple',
  'peligro_hemorragia_vaginal',
  'peligro_edema_mi',
  'peligro_nino_transverso',
  'peligro_dolor_estomago',
  'peligro_salida_liquidos',
  'peligro_convulsiones',
  'peligro_fiebre',
  'peligro_ausencia_mov_fetales',
  'peligro_placenta_no_salia',
  'casa_materna_cercana',
  'usara_casa_materna',
  'ropa_nino',
  'ropa_madre',
  'lleva_dpi_madre',
  'lleva_dpi_conyuge',
  'lleva_partida_nacimiento',
  'cuenta_ahorro',
  'comunicado_comite',
]);

function auditChangesForFields(fields, action) {
  const namedFields = [...new Set(fields)].sort();
  const marker = (value) => Object.fromEntries(namedFields.map((field) => [field, value]));
  if (action === 'crear') return { nuevos: marker('registrado') };
  return {
    anteriores: marker('anterior'),
    nuevos: marker('nuevo'),
  };
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

function valoresPlanPartoEquivalentes(field, previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;

  if (PLAN_BOOLEAN_FIELDS.has(field)) {
    const previousBoolean = booleanValue(previous);
    const nextBoolean = booleanValue(next);
    if (previousBoolean.valid && nextBoolean.valid) {
      return previousBoolean.value === nextBoolean.value;
    }
  }

  const previousNumber = numericValue(previous);
  const nextNumber = numericValue(next);
  if (previousNumber !== null && nextNumber !== null) return previousNumber === nextNumber;
  return structurallyEqual(previous, next);
}

function camposRealmenteModificados(previous, next, fields) {
  return fields.filter(
    (field) => !valoresPlanPartoEquivalentes(field, previous?.[field], next?.[field])
  );
}

function buildData(body, allowedFields) {
  const campos = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field));
  const data = {};
  for (const field of campos) data[field] = emptyToNull(body[field]);
  return { campos, data };
}

async function obtenerPlanParto(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return embarazo ? planPartoRepository.obtenerPorEmbarazo(embarazo.id) : null;
}

async function guardarPlanParto({ pacienteId, embarazoId, body, req }) {
  requerirEmbarazoId(embarazoId);
  const { campos, data } = buildData(body, PLAN_PARTO_FIELDS);
  return planPartoRepository.enTransaccion(async (client) => {
    await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
    const existe = await planPartoRepository.obtenerPorEmbarazo(embarazoId, client);
    const modifiedFields = existe
      ? camposRealmenteModificados(existe, data, campos)
      : campos;
    if (existe && modifiedFields.length === 0) return existe;

    let plan;
    if (existe) {
      const modifiedData = Object.fromEntries(
        modifiedFields.map((field) => [field, data[field]])
      );
      plan = await planPartoRepository.actualizar({
        id: existe.id,
        data: modifiedData,
        campos: modifiedFields,
        updatedBy: req.usuario.id,
        embarazoId,
        pacienteId,
      }, client);
    } else {
      plan = await planPartoRepository.insertar({
        ...data,
        paciente_id: pacienteId,
        embarazo_id: embarazoId,
        registrado_por: req.usuario.id,
        updated_by: req.usuario.id,
      }, client);
    }

    if (!plan) {
      await validarEmbarazoEditable({ pacienteId, embarazoId, db: client, bloquear: true });
      throw new HttpError(409, 'No fue posible guardar el plan de parto');
    }

    const action = existe ? 'actualizar' : 'crear';
    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT[action],
      accion: action,
      entidadId: plan.id,
      pacienteId,
      embarazoId,
      cambios: auditChangesForFields(modifiedFields, action),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return plan;
  });
}

module.exports = {
  PLAN_PARTO_FIELDS,
  valoresPlanPartoEquivalentes,
  obtenerPlanParto,
  guardarPlanParto,
};
