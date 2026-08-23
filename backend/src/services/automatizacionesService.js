const automatizacionesRepository = require('../repositories/automatizacionesRepository');
const reportesService = require('./reportesService');

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

function createAutomatizacionesService({
  repository = automatizacionesRepository,
  reportService = reportesService,
  now = () => new Date(),
  timezone = 'America/Guatemala',
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

  return {
    consultarProximasCitas,
    consultarResumenCensoPrimerControl,
    generarCensoPrimerControlExcel,
  };
}

const service = createAutomatizacionesService();

module.exports = {
  ...service,
  appointmentCount,
  createAutomatizacionesService,
  dateOnly,
  operationalText,
};
