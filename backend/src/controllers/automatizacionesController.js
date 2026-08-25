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

function censusAuditEvent(result, {
  outcome = 'exitoso',
  reason = result.total > 0 ? 'consulta_completada' : 'consulta_sin_resultados',
} = {}) {
  return {
    contexto: {
      categoria: 'automatizaciones',
      entidad: 'censo_primer_control',
      evento: 'consultar',
    },
    accion: 'consultar',
    metadata: {
      tipo_automatizacion: 'censo_primer_control',
      resultado: outcome,
      motivo_codigo: reason,
      cantidad_registros: result.total,
      fecha_desde: result.range.from,
      fecha_hasta: result.range.to,
    },
  };
}

function censusExcelAuditEvent(result) {
  return censusAuditEvent(result, {
    outcome: 'exitoso',
    reason: result.total > 0 ? 'excel_generado' : 'excel_sin_resultados',
  });
}

function missedAppointmentsAuditEvent(result, {
  event = 'consultar',
  reason = result.dispatch?.status || 'consulta_completada',
} = {}) {
  return {
    contexto: {
      categoria: 'automatizaciones',
      entidad: 'inasistencias_semanales',
      evento: event,
    },
    accion: event === 'consultar' ? 'consultar' : 'actualizar',
    metadata: {
      tipo_automatizacion: 'inasistencias_semanales',
      resultado: 'exitoso',
      motivo_codigo: reason,
      cantidad_citas: result.total ?? 0,
      fecha_desde: result.range?.from,
      fecha_hasta: result.range?.to,
    },
  };
}

function missedAppointmentsFailureEvent(event, reason) {
  return {
    contexto: {
      categoria: 'automatizaciones',
      entidad: 'inasistencias_semanales',
      evento: event,
    },
    accion: event === 'consultar' ? 'consultar' : 'actualizar',
    metadata: {
      tipo_automatizacion: 'inasistencias_semanales',
      resultado: 'fallido',
      motivo_codigo: reason,
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

  async function censoPrimerControl(req, res, next) {
    try {
      const result = await service.consultarResumenCensoPrimerControl(req.automationPeriod);
      await bestEffortAudit(audit, censusAuditEvent(result));
      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });
      return res.json(result);
    } catch {
      await bestEffortAudit(audit, {
        contexto: {
          categoria: 'automatizaciones',
          entidad: 'censo_primer_control',
          evento: 'consultar',
        },
        accion: 'consultar',
        metadata: {
          tipo_automatizacion: 'censo_primer_control',
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

  async function censoPrimerControlExcel(req, res, next) {
    try {
      const result = await service.generarCensoPrimerControlExcel(req.automationPeriod);
      await bestEffortAudit(audit, censusExcelAuditEvent(result));
      res.set({
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-CAP-Report-Count': String(result.total),
      });
      return res.send(result.content);
    } catch {
      await bestEffortAudit(audit, {
        contexto: {
          categoria: 'automatizaciones',
          entidad: 'censo_primer_control',
          evento: 'consultar',
        },
        accion: 'consultar',
        metadata: {
          tipo_automatizacion: 'censo_primer_control',
          resultado: 'fallido',
          motivo_codigo: 'excel_interno_fallido',
        },
      });
      return next(new AppError(
        500,
        'No se pudo generar el Excel de censo',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  async function inasistencias(req, res, next) {
    try {
      const result = await service.consultarInasistenciasSemanales(req.automationPeriod);
      await bestEffortAudit(audit, missedAppointmentsAuditEvent(result));
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
      return res.json(result);
    } catch (error) {
      await bestEffortAudit(audit, missedAppointmentsFailureEvent(
        'consultar',
        error.code || 'consulta_interna_fallida'
      ));
      if (error instanceof AppError) return next(error);
      return next(new AppError(
        500,
        'No se pudo completar la consulta semanal',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  async function prepararInasistencias(req, res, next) {
    try {
      const result = await service.prepararDespachoInasistencias();
      await bestEffortAudit(audit, missedAppointmentsAuditEvent(result, {
        event: 'preparar',
      }));
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
      return res.json(result);
    } catch (error) {
      await bestEffortAudit(audit, missedAppointmentsFailureEvent(
        'preparar',
        error.code || 'preparacion_interna_fallida'
      ));
      if (error instanceof AppError) return next(error);
      return next(new AppError(
        500,
        'No se pudo preparar el despacho semanal',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  async function confirmarInasistencias(req, res, next) {
    try {
      const result = await service.confirmarDespachoInasistencias({
        dispatchToken: req.automationDispatchConfirmation.dispatch_token,
      });
      await bestEffortAudit(audit, missedAppointmentsAuditEvent(result, {
        event: 'confirmar',
        reason: result.dispatch.status,
      }));
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
      return res.json(result);
    } catch (error) {
      await bestEffortAudit(audit, missedAppointmentsFailureEvent(
        'confirmar',
        error.code || 'confirmacion_interna_fallida'
      ));
      if (error instanceof AppError) return next(error);
      return next(new AppError(
        500,
        'No se pudo confirmar el despacho semanal',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  async function resolverInasistencias(req, res, next) {
    try {
      const body = req.automationDispatchResolution;
      const result = await service.resolverDespachoInasistencias({
        desde: body.desde,
        hasta: body.hasta,
        resolucion: body.resolucion,
        motivoCodigo: body.motivo_codigo,
      });
      await bestEffortAudit(audit, missedAppointmentsAuditEvent(result, {
        event: 'resolver',
        reason: result.dispatch.status,
      }));
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
      return res.json(result);
    } catch (error) {
      await bestEffortAudit(audit, missedAppointmentsFailureEvent(
        'resolver',
        error.code || 'resolucion_interna_fallida'
      ));
      if (error instanceof AppError) return next(error);
      return next(new AppError(
        500,
        'No se pudo resolver el despacho semanal',
        { code: 'AUTOMATION_INTERNAL_ERROR' }
      ));
    }
  }

  return {
    censoPrimerControl,
    censoPrimerControlExcel,
    confirmarInasistencias,
    inasistencias,
    prepararInasistencias,
    proximasCitas,
    resolverInasistencias,
  };
}

module.exports = {
  ...createAutomatizacionesController(),
  auditEvent,
  bestEffortAudit,
  censusAuditEvent,
  censusExcelAuditEvent,
  createAutomatizacionesController,
  missedAppointmentsAuditEvent,
  missedAppointmentsFailureEvent,
};
