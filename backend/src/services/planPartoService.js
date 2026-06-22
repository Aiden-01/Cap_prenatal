const planPartoRepository = require('../repositories/planPartoRepository');
const {
  requerirEmbarazoId,
  resolverEmbarazoParaLectura,
  validarEmbarazoEditable,
} = require('../utils/embarazos');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

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
  await validarEmbarazoEditable({ pacienteId, embarazoId });

  const existe = await planPartoRepository.obtenerPorEmbarazo(embarazoId);
  const { campos, data } = buildData(body, PLAN_PARTO_FIELDS);
  let plan;

  if (existe) {
    plan = await planPartoRepository.actualizar({
      id: existe.id,
      data,
      campos,
      updatedBy: req.usuario.id,
      embarazoId,
      pacienteId,
    });
  } else {
    plan = await planPartoRepository.insertar({
      ...data,
      paciente_id: pacienteId,
      embarazo_id: embarazoId,
      registrado_por: req.usuario.id,
      updated_by: req.usuario.id,
    });
  }

  if (!plan) {
    await validarEmbarazoEditable({ pacienteId, embarazoId });
    throw new HttpError(409, 'No fue posible guardar el plan de parto');
  }

  await registrarAuditoria(req, {
    accion: existe ? 'actualizar' : 'crear',
    tabla: 'planes_parto',
    registroId: plan.id,
    pacienteId,
    embarazoId,
    datosAnteriores: existe || null,
    datosNuevos: plan,
    descripcion: existe ? 'Plan de parto actualizado' : 'Plan de parto registrado',
  });

  return plan;
}

module.exports = {
  obtenerPlanParto,
  guardarPlanParto,
};
