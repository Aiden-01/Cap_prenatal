const automatizacionesService = require('../services/automatizacionesService');
const { registrarEventoPrivado } = require('../services/auditService');
const { AppError } = require('../utils/appError');

function auditEvent(result, {
  outcome = 'exitoso',
  reason = result.total > 0 ? 'consulta_completada' : 'consulta_sin_resultados',
} = {}) {
  return {
    contexto: {
      categoria: 'automatizaciones',
      entidad: 'proximas_citas',
      evento: 'consultar',
    },
    accion: 'consultar',
    metadata: {
      tipo_automatizacion: 'proximas_citas',
      resultado: outcome,
      motivo_codigo: reason,
      cantidad_citas: result.total,
      fecha_desde: result.range.from,
      fecha_hasta: result.range.to,
    },
  };
}

async function bestEffortAudit(audit, event) {
  try {
    await audit({}, event);
  } catch {
    // La auditoria informativa no cambia el resultado funcional de la consulta.
  }
}

function createAutomatizacionesController({
  service = automatizacionesService,
  audit = registrarEventoPrivado,
} = {}) {
  async function proximasCitas(req, res, next) {
    try {
      const result = await service.consultarProximasCitas(req.automationRange);
      await bestEffortAudit(audit, auditEvent(result));
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });
      return res.json(result);
    } catch {
      await bestEffortAudit(audit, {
        contexto: {
          categoria: 'automatizaciones',
          entidad: 'proximas_citas',
          evento: 'consultar',
        },
        accion: 'consultar',
        metadata: {
          tipo_automatizacion: 'proximas_citas',
          resultado: 'fallido',
          motivo_codigo: 'consulta_interna_fallida',
        },
      });
      return next(new AppError(
        500,
        'No se pudo completar la consulta de automatizacion',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  return {
    proximasCitas,
  };
}

module.exports = {
  ...createAutomatizacionesController(),
  auditEvent,
  bestEffortAudit,
  createAutomatizacionesController,
};
