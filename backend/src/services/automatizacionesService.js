const crypto = require('crypto');
const automatizacionesRepository = require('../repositories/automatizacionesRepository');
const reportesService = require('./reportesService');
const { AppError } = require('../utils/appError');
const { esMunicipioElChal } = require('../domain/municipioRules');
const {
  VACCINE_RULES,
  VACCINE_TYPES,
  gestationalAgeAtDate,
} = require('../domain/vacunasRules');

const AUTOMATION_TIMEZONE = 'America/Guatemala';
const MISSED_APPOINTMENTS_TYPE = 'inasistencias_semanales';
const TDAP_FOLLOWUP_TYPE = 'seguimiento_tdap_el_chal';
const DATA_QUALITY_WATCHDOG_TYPE = 'weekly_data_quality_watchdog';
const DAY_MS = 24 * 60 * 60 * 1000;

const DATA_QUALITY_CATEGORY_CATALOG = Object.freeze([
  Object.freeze({
    code: 'patient_required_identity_missing',
    label: 'Identificacion obligatoria de paciente incompleta',
    description: 'Hay registros con campos obligatorios de identificacion vacios.',
  }),
  Object.freeze({
    code: 'pregnancy_link_missing',
    label: 'Registros prenatales sin embarazo asociado',
    description: 'Hay registros que requieren embarazo y no tienen una relacion asociada.',
  }),
  Object.freeze({
    code: 'pregnancy_patient_mismatch',
    label: 'Relaciones paciente-embarazo inconsistentes',
    description: 'Hay registros cuyo paciente no coincide con el embarazo relacionado.',
  }),
  Object.freeze({
    code: 'concurrent_open_pregnancies',
    label: 'Estados de embarazo incompatibles',
    description: 'Hay pacientes con mas de un embarazo activo o en puerperio.',
  }),
  Object.freeze({
    code: 'future_prenatal_control',
    label: 'Controles prenatales con fecha futura',
    description: 'Hay controles con una fecha posterior al dia operativo actual.',
  }),
  Object.freeze({
    code: 'scheduled_appointment_closed_pregnancy',
    label: 'Citas programadas en embarazos cerrados',
    description: 'Hay citas aun programadas dentro de embarazos cerrados.',
  }),
]);

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

function addIsoDays(value, days) {
  return dayToIso(isoDay(value) + days);
}

function visibleDate(value) {
  return dateOnly(value).split('-').reverse().join('-');
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

function tdapSnapshotPayload({ period, asOf, newOpportunities, pending }) {
  return {
    range: { from: period.desde, to: period.hasta },
    as_of: asOf,
    new_opportunities: newOpportunities,
    pending,
  };
}

function tdapSnapshotHash(report) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(tdapSnapshotPayload(report)), 'utf8')
    .digest('hex');
}

function createTdapDispatchToken(snapshotHash, randomBytes = crypto.randomBytes) {
  if (!/^[a-f0-9]{64}$/.test(snapshotHash)) {
    throw new TypeError('Hash de snapshot Tdap invalido');
  }
  const entropy = randomBytes(16);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 16) {
    throw new TypeError('Entropia de despacho Tdap invalida');
  }
  const marker = Buffer.from(snapshotHash, 'hex').subarray(0, 16);
  return Buffer.concat([entropy, marker]).toString('base64url');
}

function tdapSnapshotMarkerFromToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 ? decoded.subarray(16) : null;
}

function snapshotMatchesToken(snapshotHash, dispatchToken) {
  const marker = tdapSnapshotMarkerFromToken(dispatchToken);
  if (!marker) return false;
  return crypto.timingSafeEqual(marker, Buffer.from(snapshotHash, 'hex').subarray(0, 16));
}

function tdapOperationalRow(row) {
  return {
    first_name: operationalText(row.primer_nombre, 80),
    last_name: operationalText(row.primer_apellido, 80),
    community: operationalText(row.comunidad, 120),
  };
}

function sortTdapRows(rows) {
  return rows.sort((left, right) => (
    left.last_name.localeCompare(right.last_name, 'es')
      || left.first_name.localeCompare(right.first_name, 'es')
      || left.community.localeCompare(right.community, 'es')
  ));
}

function classifyTdapCandidates(rows, { period, asOf }) {
  if (!Array.isArray(rows)) throw new TypeError('Resultado Tdap invalido');
  const minimumDays = VACCINE_RULES[VACCINE_TYPES.TDAP].minimumGestationalDays;
  const beforePeriod = addIsoDays(period.desde, -1);
  const newOpportunities = [];
  const pending = [];

  for (const row of rows) {
    if (!esMunicipioElChal(row.municipio)) continue;
    const fur = row.fur ? dateOnly(row.fur) : null;
    const currentAge = fur ? gestationalAgeAtDate(fur, asOf) : null;
    if (!currentAge) {
      throw new AppError(
        409,
        'No se puede determinar el seguimiento Tdap por falta de una FUR valida',
        { code: 'AUTOMATION_TDAP_GESTATIONAL_SOURCE_INCOMPLETE' }
      );
    }

    const ageBeforePeriod = gestationalAgeAtDate(fur, beforePeriod);
    const ageAtPeriodEnd = gestationalAgeAtDate(fur, period.hasta);
    const isNewOpportunity = ageAtPeriodEnd?.totalDays >= minimumDays
      && (!ageBeforePeriod || ageBeforePeriod.totalDays < minimumDays);
    const operational = tdapOperationalRow(row);
    if (isNewOpportunity) {
      newOpportunities.push(operational);
    } else if (currentAge.totalDays >= minimumDays) {
      pending.push(operational);
    }
  }

  return {
    period,
    asOf,
    newOpportunities: sortTdapRows(newOpportunities),
    pending: sortTdapRows(pending),
  };
}

function tdapDispatchResponse({
  generatedAt,
  period,
  asOf,
  status,
  token,
  report,
  timezone = AUTOMATION_TIMEZONE,
}) {
  const newTotal = report?.newOpportunities?.length || 0;
  const pendingTotal = report?.pending?.length || 0;
  const hasInformation = status === 'ready' && (newTotal > 0 || pendingTotal > 0);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    timezone,
    report_type: TDAP_FOLLOWUP_TYPE,
    range: { from: period.desde, to: period.hasta },
    as_of: asOf,
    new_opportunities: { total: newTotal },
    pending: { total: pendingTotal },
    has_information: hasInformation,
    xlsx: {
      available: hasInformation,
      download_path: '/api/automatizaciones/v1/tdap/xlsx',
      filename: hasInformation
        ? `Seguimiento_Tdap_El_Chal_${visibleDate(asOf)}.xlsx`
        : null,
    },
    dispatch: token ? { status, token } : { status },
  };
}

function normalizeDataQualityCategories(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Resultado de calidad de datos invalido');
  const byCode = new Map();
  for (const row of rows) {
    if (!row || typeof row.codigo !== 'string' || byCode.has(row.codigo)) {
      throw new TypeError('Categorias de calidad de datos invalidas');
    }
    byCode.set(row.codigo, appointmentCount(row.total));
  }
  if (byCode.size !== DATA_QUALITY_CATEGORY_CATALOG.length
    || DATA_QUALITY_CATEGORY_CATALOG.some(({ code }) => !byCode.has(code))) {
    throw new TypeError('Catalogo de calidad de datos incompleto');
  }
  return DATA_QUALITY_CATEGORY_CATALOG
    .map((category) => ({ ...category, count: byCode.get(category.code) }))
    .filter(({ count }) => count > 0);
}

function dataQualityDispatchResponse({
  generatedAt,
  period,
  asOf,
  status,
  token,
  categories = [],
  timezone = AUTOMATION_TIMEZONE,
}) {
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    timezone,
    report_type: DATA_QUALITY_WATCHDOG_TYPE,
    range: { from: period.desde, to: period.hasta },
    as_of: asOf,
    dispatch: token ? { status, token } : { status },
    total,
    categories,
    secure_path: '/dashboard',
  };
}

function createAutomatizacionesService({
  repository = automatizacionesRepository,
  reportService = reportesService,
  now = () => new Date(),
  timezone = AUTOMATION_TIMEZONE,
  createDispatchToken = () => crypto.randomBytes(32).toString('base64url'),
  createTdapToken = (snapshotHash) => createTdapDispatchToken(snapshotHash),
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

  async function obtenerReporteTdap(queryable, period) {
    const asOf = addIsoDays(period.hasta, 1);
    const rows = await repository.obtenerCandidatasTdapElChal(queryable);
    return classifyTdapCandidates(rows, { period, asOf });
  }

  function alreadyProcessedTdapResponse(period) {
    return tdapDispatchResponse({
      generatedAt: now().toISOString(),
      period,
      asOf: addIsoDays(period.hasta, 1),
      status: 'already_processed',
      report: null,
      timezone,
    });
  }

  async function prepararDespachoTdap() {
    const period = previousCalendarWeek(now(), timezone);
    return repository.enTransaccion(async (client) => {
      let existing = await repository.obtenerDespacho({
        tipo: TDAP_FOLLOWUP_TYPE,
        ...period,
      }, client, { bloquear: true });

      if (existing && ['enviado', 'sin_resultados'].includes(existing.estado)) {
        return alreadyProcessedTdapResponse(period);
      }
      if (existing?.estado === 'reservado') {
        throw new AppError(
          409,
          'El despacho Tdap del periodo requiere revision antes de reintentarse',
          { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
        );
      }

      const report = await obtenerReporteTdap(client, period);
      const totalRows = report.newOpportunities.length + report.pending.length;
      if (totalRows === 0) {
        if (existing?.estado === 'reintento_autorizado') {
          await repository.marcarDespachoSinResultados({ despachoId: existing.id }, client);
        } else {
          const inserted = await repository.crearDespacho({
            tipo: TDAP_FOLLOWUP_TYPE,
            ...period,
            estado: 'sin_resultados',
            total: 0,
          }, client);
          if (!inserted) {
            existing = await repository.obtenerDespacho({
              tipo: TDAP_FOLLOWUP_TYPE,
              ...period,
            }, client, { bloquear: true });
            if (existing) return alreadyProcessedTdapResponse(period);
            throw new TypeError('No se pudo registrar el periodo Tdap sin resultados');
          }
        }
        return tdapDispatchResponse({
          generatedAt: now().toISOString(),
          period,
          asOf: report.asOf,
          status: 'no_results',
          report,
          timezone,
        });
      }

      const token = createTdapToken(tdapSnapshotHash(report));
      const hash = tokenHash(token);
      if (existing?.estado === 'reintento_autorizado') {
        const renewed = await repository.renovarDespacho({
          despachoId: existing.id,
          tokenHash: hash,
          total: totalRows,
        }, client);
        if (!renewed) throw new TypeError('No se pudo reservar el reintento Tdap autorizado');
      } else {
        const inserted = await repository.crearDespacho({
          tipo: TDAP_FOLLOWUP_TYPE,
          ...period,
          estado: 'reservado',
          tokenHash: hash,
          total: totalRows,
        }, client);
        if (!inserted) {
          existing = await repository.obtenerDespacho({
            tipo: TDAP_FOLLOWUP_TYPE,
            ...period,
          }, client, { bloquear: true });
          if (existing?.estado === 'reservado') {
            throw new AppError(
              409,
              'El despacho Tdap del periodo requiere revision antes de reintentarse',
              { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
            );
          }
          return alreadyProcessedTdapResponse(period);
        }
      }

      return tdapDispatchResponse({
        generatedAt: now().toISOString(),
        period,
        asOf: report.asOf,
        status: 'ready',
        token,
        report,
        timezone,
      });
    });
  }

  async function generarSeguimientoTdapExcel({ dispatchToken }) {
    const hash = tokenHash(dispatchToken);
    const snapshot = await repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespachoPorTokenHash({
        tipo: TDAP_FOLLOWUP_TYPE,
        tokenHash: hash,
      }, client, { bloquear: true });
      if (!dispatch || dispatch.estado !== 'reservado') {
        throw new AppError(409, 'El Excel Tdap no puede descargarse', {
          code: 'AUTOMATION_DISPATCH_DOWNLOAD_INVALID',
        });
      }
      const period = {
        desde: dateOnly(dispatch.periodo_desde),
        hasta: dateOnly(dispatch.periodo_hasta),
      };
      const report = await obtenerReporteTdap(client, period);
      const totalRows = report.newOpportunities.length + report.pending.length;
      if (totalRows !== Number(dispatch.total_registros)
        || !snapshotMatchesToken(tdapSnapshotHash(report), dispatchToken)) {
        throw new AppError(409, 'El contenido Tdap cambio despues de reservar el despacho', {
          code: 'AUTOMATION_DISPATCH_SNAPSHOT_CHANGED',
        });
      }
      return report;
    });

    const workbook = reportService.crearWorkbookSeguimientoTdap({
      nuevasOportunidades: snapshot.newOpportunities,
      pendientes: snapshot.pending,
    });
    const content = Buffer.from(await workbook.xlsx.writeBuffer());
    if (content.length === 0) throw new TypeError('El Excel Tdap esta vacio');
    return {
      content,
      filename: `Seguimiento_Tdap_El_Chal_${visibleDate(snapshot.asOf)}.xlsx`,
      range: { from: snapshot.period.desde, to: snapshot.period.hasta },
      asOf: snapshot.asOf,
      newTotal: snapshot.newOpportunities.length,
      pendingTotal: snapshot.pending.length,
    };
  }

  async function confirmarDespachoTdap({ dispatchToken }) {
    const hash = tokenHash(dispatchToken);
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespachoPorTokenHash({
        tipo: TDAP_FOLLOWUP_TYPE,
        tokenHash: hash,
      }, client, { bloquear: true });
      if (!dispatch || !['reservado', 'enviado'].includes(dispatch.estado)) {
        throw new AppError(409, 'El despacho Tdap no puede confirmarse', {
          code: 'AUTOMATION_DISPATCH_CONFIRMATION_INVALID',
        });
      }
      const idempotent = dispatch.estado === 'enviado';
      const sent = idempotent
        ? dispatch
        : await repository.marcarDespachoEnviado({ despachoId: dispatch.id }, client);
      if (!sent) throw new TypeError('No se pudo confirmar el despacho Tdap');
      return {
        schema_version: 1,
        report_type: TDAP_FOLLOWUP_TYPE,
        dispatch: { status: 'sent', idempotent },
      };
    });
  }

  async function resolverDespachoTdap({ desde, hasta, resolucion, motivoCodigo }) {
    const period = validateCompletedCalendarWeek({ desde, hasta }, { now: now(), timezone });
    const expectedReason = resolucion === 'enviado'
      ? 'entrega_confirmada_en_resend'
      : 'entrega_no_realizada_confirmada';
    if (motivoCodigo !== expectedReason) {
      throw new AppError(400, 'La resolucion Tdap y el motivo no coinciden', {
        code: 'AUTOMATION_INVALID_DISPATCH_RESOLUTION',
      });
    }
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespacho({
        tipo: TDAP_FOLLOWUP_TYPE,
        ...period,
      }, client, { bloquear: true });
      if (!dispatch || dispatch.estado !== 'reservado') {
        throw new AppError(409, 'El despacho Tdap no admite resolucion manual', {
          code: 'AUTOMATION_DISPATCH_RESOLUTION_INVALID',
        });
      }
      const estado = resolucion === 'enviado' ? 'enviado' : 'reintento_autorizado';
      const updated = await repository.resolverDespacho({
        despachoId: dispatch.id,
        estado,
        motivoCodigo,
      }, client);
      if (!updated) throw new TypeError('No se pudo resolver el despacho Tdap');
      return {
        schema_version: 1,
        report_type: TDAP_FOLLOWUP_TYPE,
        range: { from: desde, to: hasta },
        dispatch: { status: estado },
      };
    });
  }

  async function obtenerReporteCalidadDatos(queryable) {
    return normalizeDataQualityCategories(
      await repository.obtenerResumenCalidadDatos(queryable)
    );
  }

  function alreadyProcessedDataQualityResponse(period) {
    return dataQualityDispatchResponse({
      generatedAt: now().toISOString(),
      period,
      asOf: addIsoDays(period.hasta, 1),
      status: 'already_processed',
      categories: [],
      timezone,
    });
  }

  async function prepararWatchdogCalidadDatos() {
    const period = previousCalendarWeek(now(), timezone);
    const asOf = addIsoDays(period.hasta, 1);
    return repository.enTransaccion(async (client) => {
      let existing = await repository.obtenerDespacho({
        tipo: DATA_QUALITY_WATCHDOG_TYPE,
        ...period,
      }, client, { bloquear: true });

      if (existing && ['enviado', 'sin_resultados'].includes(existing.estado)) {
        return alreadyProcessedDataQualityResponse(period);
      }
      if (existing?.estado === 'reservado') {
        throw new AppError(
          409,
          'El despacho de calidad de datos requiere revision antes de reintentarse',
          { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
        );
      }

      const categories = await obtenerReporteCalidadDatos(client);
      const total = categories.reduce((sum, category) => sum + category.count, 0);
      if (total === 0) {
        if (existing?.estado === 'reintento_autorizado') {
          await repository.marcarDespachoSinResultados({ despachoId: existing.id }, client);
        } else {
          const inserted = await repository.crearDespacho({
            tipo: DATA_QUALITY_WATCHDOG_TYPE,
            ...period,
            estado: 'sin_resultados',
            total: 0,
          }, client);
          if (!inserted) {
            existing = await repository.obtenerDespacho({
              tipo: DATA_QUALITY_WATCHDOG_TYPE,
              ...period,
            }, client, { bloquear: true });
            if (existing) return alreadyProcessedDataQualityResponse(period);
            throw new TypeError('No se pudo registrar el periodo sin incidencias');
          }
        }
        return dataQualityDispatchResponse({
          generatedAt: now().toISOString(),
          period,
          asOf,
          status: 'no_results',
          categories: [],
          timezone,
        });
      }

      const token = createDispatchToken();
      const hash = tokenHash(token);
      if (existing?.estado === 'reintento_autorizado') {
        const renewed = await repository.renovarDespacho({
          despachoId: existing.id,
          tokenHash: hash,
          total,
        }, client);
        if (!renewed) throw new TypeError('No se pudo reservar el reintento de calidad');
      } else {
        const inserted = await repository.crearDespacho({
          tipo: DATA_QUALITY_WATCHDOG_TYPE,
          ...period,
          estado: 'reservado',
          tokenHash: hash,
          total,
        }, client);
        if (!inserted) {
          existing = await repository.obtenerDespacho({
            tipo: DATA_QUALITY_WATCHDOG_TYPE,
            ...period,
          }, client, { bloquear: true });
          if (existing?.estado === 'reservado') {
            throw new AppError(
              409,
              'El despacho de calidad de datos requiere revision antes de reintentarse',
              { code: 'AUTOMATION_DISPATCH_UNCERTAIN' }
            );
          }
          return alreadyProcessedDataQualityResponse(period);
        }
      }

      return dataQualityDispatchResponse({
        generatedAt: now().toISOString(),
        period,
        asOf,
        status: 'ready',
        token,
        categories,
        timezone,
      });
    });
  }

  async function confirmarWatchdogCalidadDatos({ dispatchToken }) {
    const hash = tokenHash(dispatchToken);
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespachoPorTokenHash({
        tipo: DATA_QUALITY_WATCHDOG_TYPE,
        tokenHash: hash,
      }, client, { bloquear: true });
      if (!dispatch || !['reservado', 'enviado'].includes(dispatch.estado)) {
        throw new AppError(409, 'El despacho de calidad no puede confirmarse', {
          code: 'AUTOMATION_DISPATCH_CONFIRMATION_INVALID',
        });
      }
      const idempotent = dispatch.estado === 'enviado';
      const sent = idempotent
        ? dispatch
        : await repository.marcarDespachoEnviado({ despachoId: dispatch.id }, client);
      if (!sent) throw new TypeError('No se pudo confirmar el despacho de calidad');
      return {
        schema_version: 1,
        report_type: DATA_QUALITY_WATCHDOG_TYPE,
        dispatch: { status: 'sent', idempotent },
      };
    });
  }

  async function resolverWatchdogCalidadDatos({ desde, hasta, resolucion, motivoCodigo }) {
    const period = validateCompletedCalendarWeek({ desde, hasta }, { now: now(), timezone });
    const expectedReason = resolucion === 'enviado'
      ? 'entrega_confirmada_en_resend'
      : 'entrega_no_realizada_confirmada';
    if (motivoCodigo !== expectedReason) {
      throw new AppError(400, 'La resolucion de calidad y el motivo no coinciden', {
        code: 'AUTOMATION_INVALID_DISPATCH_RESOLUTION',
      });
    }
    return repository.enTransaccion(async (client) => {
      const dispatch = await repository.obtenerDespacho({
        tipo: DATA_QUALITY_WATCHDOG_TYPE,
        ...period,
      }, client, { bloquear: true });
      if (!dispatch || dispatch.estado !== 'reservado') {
        throw new AppError(409, 'El despacho de calidad no admite resolucion manual', {
          code: 'AUTOMATION_DISPATCH_RESOLUTION_INVALID',
        });
      }
      const estado = resolucion === 'enviado' ? 'enviado' : 'reintento_autorizado';
      const updated = await repository.resolverDespacho({
        despachoId: dispatch.id,
        estado,
        motivoCodigo,
      }, client);
      if (!updated) throw new TypeError('No se pudo resolver el despacho de calidad');
      return {
        schema_version: 1,
        report_type: DATA_QUALITY_WATCHDOG_TYPE,
        range: { from: desde, to: hasta },
        dispatch: { status: estado },
      };
    });
  }

  return {
    confirmarWatchdogCalidadDatos,
    confirmarDespachoInasistencias,
    confirmarDespachoTdap,
    consultarInasistenciasSemanales,
    consultarProximasCitas,
    consultarResumenCensoPrimerControl,
    generarCensoPrimerControlExcel,
    generarSeguimientoTdapExcel,
    prepararDespachoInasistencias,
    prepararDespachoTdap,
    prepararWatchdogCalidadDatos,
    resolverDespachoInasistencias,
    resolverDespachoTdap,
    resolverWatchdogCalidadDatos,
  };
}

const service = createAutomatizacionesService();

module.exports = {
  AUTOMATION_TIMEZONE,
  DATA_QUALITY_CATEGORY_CATALOG,
  DATA_QUALITY_WATCHDOG_TYPE,
  MISSED_APPOINTMENTS_TYPE,
  TDAP_FOLLOWUP_TYPE,
  ...service,
  addIsoDays,
  appointmentCount,
  classifyTdapCandidates,
  cutoffIso,
  createAutomatizacionesService,
  createTdapDispatchToken,
  dateOnly,
  dataQualityDispatchResponse,
  dispatchResponse,
  normalizeMissedAppointments,
  normalizeDataQualityCategories,
  operationalText,
  previousCalendarWeek,
  snapshotMatchesToken,
  tdapDispatchResponse,
  tdapSnapshotHash,
  tdapSnapshotMarkerFromToken,
  tokenHash,
  validateCompletedCalendarWeek,
  visibleDate,
  zonedDateOnly,
};
