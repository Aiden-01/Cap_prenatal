const crypto = require('crypto');
const automatizacionesRepository = require('../repositories/automatizacionesRepository');
const reportesService = require('./reportesService');
const { AppError } = require('../utils/appError');

const AUTOMATION_TIMEZONE = 'America/Guatemala';
const MISSED_APPOINTMENTS_TYPE = 'inasistencias_semanales';
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  throw new TypeError('Fecha de automatizacion invalida');
}

function appointmentCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError('Conteo de automatizacion invalido');
  }
  return count;
}

function operationalText(value, maxLength) {
  const normalized = value === null || value === undefined
    ? ''
    : String(value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  if (normalized.length > maxLength) {
    throw new TypeError('Dato operativo de automatizacion demasiado largo');
  }
  return normalized;
}

function zonedDateOnly(value, timezone = AUTOMATION_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Fecha de ejecucion invalida');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function isoDay(value) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(timestamp)) {
    throw new AppError(400, 'Periodo semanal invalido', {
      code: 'AUTOMATION_INVALID_PERIOD',
    });
  }
  return timestamp / DAY_MS;
}

function dayToIso(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function previousCalendarWeek(now = new Date(), timezone = AUTOMATION_TIMEZONE) {
  const today = zonedDateOnly(now, timezone);
  const todayDay = isoDay(today);
  const weekday = new Date(todayDay * DAY_MS).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const currentMonday = todayDay - daysSinceMonday;
  return {
    desde: dayToIso(currentMonday - 7),
    hasta: dayToIso(currentMonday - 1),
  };
}

function validateCompletedCalendarWeek({ desde, hasta }, {
  now = new Date(),
  timezone = AUTOMATION_TIMEZONE,
} = {}) {
  const fromDay = isoDay(desde);
  const toDay = isoDay(hasta);
  const todayDay = isoDay(zonedDateOnly(now, timezone));
  if (toDay - fromDay !== 6
    || new Date(fromDay * DAY_MS).getUTCDay() !== 1
    || new Date(toDay * DAY_MS).getUTCDay() !== 0
    || toDay >= todayDay) {
    throw new AppError(400, 'El periodo debe ser una semana calendario anterior completa', {
      code: 'AUTOMATION_INVALID_PERIOD',
    });
  }
  return { desde, hasta };
}

function cutoffIso(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(503, 'No existe una fecha de corte confiable para citas', {
      code: 'AUTOMATION_CUTOFF_UNAVAILABLE',
    });
  }
  return parsed.toISOString();
}

function normalizeMissedAppointments(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Resultado semanal invalido');
  return rows.map((row) => ({
    date: dateOnly(row.fecha_cita),
    first_name: operationalText(row.primer_nombre, 80),
    last_name: operationalText(row.primer_apellido, 80),
    phone: operationalText(row.telefono, 32),
    community: operationalText(row.comunidad, 120),
  }));
}

function dispatchResponse({
  generatedAt,
  period,
  cutoffAt,
  status,
  token,
  appointments = [],
  timezone = AUTOMATION_TIMEZONE,
}) {
  const dispatch = token ? { status, token } : { status };
  return {
    schema_version: 1,
    generated_at: generatedAt,
    timezone,
    report_type: 'weekly_missed_appointments',
    range: { from: period.desde, to: period.hasta },
    cutoff_at: cutoffAt,
    dispatch,
    total: appointments.length,
    appointments,
  };
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function createAutomatizacionesService({
  repository = automatizacionesRepository,
  reportService = reportesService,
  now = () => new Date(),
  timezone = AUTOMATION_TIMEZONE,
  createDispatchToken = () => crypto.randomBytes(32).toString('base64url'),
} = {}) {
  async function consultarProximasCitas({ offsetDays, windowDays }) {
    const rows = await repository.obtenerResumenProximasCitas({ offsetDays, windowDays });
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError('La consulta de automatizacion no devolvio limites');
    }

    const appointments = rows
      .filter((row) => row.fecha_proxima_cita)
      .map((row) => ({
        date: dateOnly(row.fecha_proxima_cita),
        first_name: operationalText(row.primer_nombre, 80),
        last_name: operationalText(row.primer_apellido, 80),
        phone: operationalText(row.telefono, 32),
        community: operationalText(row.comunidad, 120),
      }))
      .sort((left, right) => left.date.localeCompare(right.date)
        || left.last_name.localeCompare(right.last_name, 'es')
        || left.first_name.localeCompare(right.first_name, 'es'));
    const totalsByDate = new Map();
    for (const appointment of appointments) {
      totalsByDate.set(appointment.date, (totalsByDate.get(appointment.date) || 0) + 1);
    }
    const summaryByDate = [...totalsByDate.entries()]
      .map(([date, total]) => ({ date, total }));
    const total = appointments.length;

    return {
      schema_version: 1,
      generated_at: now().toISOString(),
      timezone,
      range: {
        from: dateOnly(rows[0].fecha_desde),
        to: dateOnly(rows[0].fecha_hasta),
      },
      total,
      summary_by_date: summaryByDate,
      appointments,
      secure_path: '/dashboard',
    };
  }

  async function consultarResumenCensoPrimerControl({ desde, hasta }) {
    const rows = await repository.obtenerResumenCensoPrimerControl({ desde, hasta });
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new TypeError('La consulta de censo no devolvio un resumen unico');
    }

    const range = {
      from: dateOnly(rows[0].fecha_desde),
      to: dateOnly(rows[0].fecha_hasta),
    };
    if (range.from !== desde || range.to !== hasta) {
      throw new TypeError('El periodo de censo no coincide con la solicitud');
    }

    return {
      schema_version: 1,
      generated_at: now().toISOString(),
      timezone,
      report_type: 'first_prenatal_control_census',
      range,
      total: appointmentCount(rows[0].total),
      secure_path: '/reportes',
    };
  }

  async function generarCensoPrimerControlExcel({ desde, hasta }) {
    const result = await reportService.workbookCensoPrimerControl({ desde, hasta });
    if (!result?.workbook?.xlsx || !Number.isSafeInteger(result.total) || result.total < 0) {
      throw new TypeError('No se pudo construir el Excel de censo');
    }
    const content = Buffer.from(await result.workbook.xlsx.writeBuffer());
    if (content.length === 0) throw new TypeError('El Excel de censo esta vacio');
    return {
      content,
      filename: `censo_primer_control_${desde}_${hasta}.xlsx`,
      range: { from: desde, to: hasta },
      total: result.total,
    };
  }

  async function obtenerCorte(queryable) {
    const value = await repository.obtenerCorteConfiableCitas(queryable);
    if (!value) {
      throw new AppError(503, 'No existe una fecha de corte confiable para citas', {
        code: 'AUTOMATION_CUTOFF_UNAVAILABLE',
      });
    }
    return cutoffIso(value);
  }

  async function consultarInasistenciasSemanales(period) {
    const safePeriod = validateCompletedCalendarWeek(period, { now: now(), timezone });
    const cutoffAt = await obtenerCorte();
    const appointments = normalizeMissedAppointments(
      await repository.obtenerInasistenciasSemanales({
        ...safePeriod,
        corteAt: cutoffAt,
      })
    );
    return dispatchResponse({
      generatedAt: now().toISOString(),
      period: safePeriod,
      cutoffAt,
      status: 'preview',
      appointments,
      timezone,
    });
  }

  function alreadyProcessedResponse({ period, cutoffAt }) {
    return dispatchResponse({
      generatedAt: now().toISOString(),
      period,
      cutoffAt,
      status: 'already_processed',
      appointments: [],
      timezone,
    });
  }

  async function prepararDespachoInasistencias() {
    const period = previousCalendarWeek(now(), timezone);
    return repository.enTransaccion(async (client) => {
      const cutoffAt = await obtenerCorte(client);
      let existing = await repository.obtenerDespacho({
        tipo: MISSED_APPOINTMENTS_TYPE,
        ...period,
      }, client, { bloquear: true });

      if (existing && ['enviado', 'sin_resultados'].includes(existing.estado)) {
        return alreadyProcessedResponse({ period, cutoffAt });
      }
      if (existing?.estado === 'reservado') {
        throw new AppError(
          409,
          'El despacho del periodo requiere revision antes de reintentarse',
          { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
        );
      }

      const appointments = normalizeMissedAppointments(
        await repository.obtenerInasistenciasSemanales({
          ...period,
          corteAt: cutoffAt,
        }, client)
      );

      if (appointments.length === 0) {
        if (existing?.estado === 'reintento_autorizado') {
          await repository.marcarDespachoSinResultados({ despachoId: existing.id }, client);
        } else {
          const inserted = await repository.crearDespacho({
            tipo: MISSED_APPOINTMENTS_TYPE,
            ...period,
            estado: 'sin_resultados',
            total: 0,
          }, client);
          if (!inserted) {
            existing = await repository.obtenerDespacho({
              tipo: MISSED_APPOINTMENTS_TYPE,
              ...period,
            }, client, { bloquear: true });
            if (existing) return alreadyProcessedResponse({ period, cutoffAt });
            throw new TypeError('No se pudo registrar el periodo sin resultados');
          }
        }
        return dispatchResponse({
          generatedAt: now().toISOString(),
          period,
          cutoffAt,
          status: 'no_results',
          appointments: [],
          timezone,
        });
      }

      const token = createDispatchToken();
      const hash = tokenHash(token);
      if (existing?.estado === 'reintento_autorizado') {
        const renewed = await repository.renovarDespacho({
          despachoId: existing.id,
          tokenHash: hash,
          total: appointments.length,
        }, client);
        if (!renewed) throw new TypeError('No se pudo reservar el reintento autorizado');
      } else {
        const inserted = await repository.crearDespacho({
          tipo: MISSED_APPOINTMENTS_TYPE,
          ...period,
          estado: 'reservado',
          tokenHash: hash,
          total: appointments.length,
        }, client);
        if (!inserted) {
          existing = await repository.obtenerDespacho({
            tipo: MISSED_APPOINTMENTS_TYPE,
            ...period,
          }, client, { bloquear: true });
          if (existing?.estado === 'reservado') {
            throw new AppError(
              409,
              'El despacho del periodo requiere revision antes de reintentarse',
              { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
            );
          }
          return alreadyProcessedResponse({ period, cutoffAt });
        }
      }

      return dispatchResponse({
        generatedAt: now().toISOString(),
        period,
        cutoffAt,
        status: 'ready',
        token,
        appointments,
        timezone,
      });
    });
  }

  async function confirmarDespachoInasistencias({ dispatchToken }) {
    const hash = tokenHash(dispatchToken);
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespachoPorTokenHash({
        tipo: MISSED_APPOINTMENTS_TYPE,
        tokenHash: hash,
      }, client, { bloquear: true });
      if (!dispatch || !['reservado', 'enviado'].includes(dispatch.estado)) {
        throw new AppError(409, 'El despacho no puede confirmarse', {
          code: 'AUTOMATION_DISPATCH_CONFIRMATION_INVALID',
        });
      }
      const idempotent = dispatch.estado === 'enviado';
      const sent = idempotent
        ? dispatch
        : await repository.marcarDespachoEnviado({ despachoId: dispatch.id }, client);
      if (!sent) throw new TypeError('No se pudo confirmar el despacho');
      return {
        schema_version: 1,
        report_type: 'weekly_missed_appointments',
        dispatch: { status: 'sent', idempotent },
      };
    });
  }

  async function resolverDespachoInasistencias({
    desde,
    hasta,
    resolucion,
    motivoCodigo,
  }) {
    const period = validateCompletedCalendarWeek({ desde, hasta }, { now: now(), timezone });
    const expectedReason = resolucion === 'enviado'
      ? 'entrega_confirmada_en_resend'
      : 'entrega_no_realizada_confirmada';
    if (motivoCodigo !== expectedReason) {
      throw new AppError(400, 'La resolucion y el motivo no coinciden', {
        code: 'AUTOMATION_INVALID_DISPATCH_RESOLUTION',
      });
    }
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespacho({
        tipo: MISSED_APPOINTMENTS_TYPE,
        ...period,
      }, client, { bloquear: true });
      if (!dispatch || dispatch.estado !== 'reservado') {
        throw new AppError(409, 'El despacho no admite resolucion manual', {
          code: 'AUTOMATION_DISPATCH_RESOLUTION_INVALID',
        });
      }
      const estado = resolucion === 'enviado' ? 'enviado' : 'reintento_autorizado';
      const updated = await repository.resolverDespacho({
        despachoId: dispatch.id,
        estado,
        motivoCodigo,
      }, client);
      if (!updated) throw new TypeError('No se pudo resolver el despacho');
      return {
        schema_version: 1,
        report_type: 'weekly_missed_appointments',
        range: { from: desde, to: hasta },
        dispatch: { status: estado },
      };
    });
  }

  return {
    confirmarDespachoInasistencias,
    consultarInasistenciasSemanales,
    consultarProximasCitas,
    consultarResumenCensoPrimerControl,
    generarCensoPrimerControlExcel,
    prepararDespachoInasistencias,
    resolverDespachoInasistencias,
  };
}

const service = createAutomatizacionesService();

module.exports = {
  AUTOMATION_TIMEZONE,
  MISSED_APPOINTMENTS_TYPE,
  ...service,
  appointmentCount,
  cutoffIso,
  createAutomatizacionesService,
  dateOnly,
  dispatchResponse,
  normalizeMissedAppointments,
  operationalText,
  previousCalendarWeek,
  tokenHash,
  validateCompletedCalendarWeek,
  zonedDateOnly,
};
