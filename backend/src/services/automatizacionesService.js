const automatizacionesRepository = require('../repositories/automatizacionesRepository');

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

function createAutomatizacionesService({
  repository = automatizacionesRepository,
  now = () => new Date(),
  timezone = 'America/Guatemala',
} = {}) {
  async function consultarProximasCitas({ offsetDays, windowDays }) {
    const rows = await repository.obtenerResumenProximasCitas({ offsetDays, windowDays });
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new TypeError('La consulta de automatizacion no devolvio limites');
    }

    const summaryByDate = rows
      .filter((row) => row.fecha_proxima_cita)
      .map((row) => ({
        date: dateOnly(row.fecha_proxima_cita),
        total: appointmentCount(row.total),
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const total = summaryByDate.reduce((sum, row) => sum + row.total, 0);

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
      secure_path: '/dashboard',
    };
  }

  return {
    consultarProximasCitas,
  };
}

const service = createAutomatizacionesService();

module.exports = {
  ...service,
  appointmentCount,
  createAutomatizacionesService,
  dateOnly,
};
