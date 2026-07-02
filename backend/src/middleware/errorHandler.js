const { ZodError } = require('zod');
const { AppError } = require('../utils/appError');

function formatZodIssue(issue) {
  return {
    campo: issue.path.length ? issue.path.join('.') : 'body',
    mensaje: issue.message,
  };
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function uniqueMessage(err) {
  if (err.constraint === 'ux_embarazo_activo_paciente') {
    return 'La paciente ya tiene un embarazo activo. Cierre o pase a puerperio el embarazo actual antes de crear otro.';
  }

  if (err.constraint === 'ux_pacientes_cui_unico') {
    return 'Ya existe una paciente registrada con ese CUI';
  }

  if (String(err.constraint || '').includes('usuarios_username')) {
    return 'El nombre de usuario ya existe';
  }

  if (err.constraint === 'pacientes_no_expediente_key') {
    return 'Ya existe un expediente con ese numero';
  }

  if (err.constraint === 'ux_riesgo_embarazo_unico') {
    return 'Esta paciente ya tiene una ficha de riesgo registrada';
  }

  if (err.constraint === 'ux_plan_parto_embarazo_unico') {
    return 'Esta paciente ya tiene un plan de parto registrado para este embarazo';
  }

  if (err.constraint === 'ux_vacunas_embarazo_dosis') {
    return 'Ya existe una vacuna con esos datos para esta paciente';
  }

  if (err.constraint === 'ux_controles_embarazo_numero') {
    return 'Ya existe un control con ese numero para esta paciente';
  }

  if (err.constraint === 'ux_puerperio_embarazo_numero') {
    return 'Ya existe esa atencion de puerperio para esta paciente';
  }

  if (err.constraint === 'ux_comunidades_nombre') {
    return 'Ya existe una comunidad con ese nombre';
  }

  return 'Ya existe un registro con esos datos';
}

function fromPostgresError(err) {
  if (err.code === '23505') {
    return new AppError(409, uniqueMessage(err), { code: 'DUPLICATE_RESOURCE' });
  }

  if (err.code === '23503') {
    return new AppError(409, 'El registro esta relacionado con otros datos', { code: 'RELATED_RESOURCE' });
  }

  if (err.code === '22P02') {
    return new AppError(400, 'Identificador o dato invalido', { code: 'INVALID_DATABASE_VALUE' });
  }

  return null;
}

function normalizeError(err) {
  if (err instanceof ZodError) {
    return new AppError(400, 'Datos de entrada invalidos', {
      code: 'VALIDATION_ERROR',
      details: err.issues.map(formatZodIssue),
    });
  }

  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'JSON invalido en la solicitud', { code: 'INVALID_JSON' });
  }

  const postgresError = fromPostgresError(err);
  if (postgresError) return postgresError;

  if (err.status || err.statusCode) {
    return new AppError(err.statusCode || err.status, err.message || 'Error de solicitud', {
      code: err.code,
      details: err.details,
    });
  }

  return new AppError(500, 'Error interno del servidor', { code: 'INTERNAL_SERVER_ERROR' });
}

function logError(err, req, normalized) {
  const payload = {
    method: req.method,
    path: req.originalUrl,
    status: normalized.statusCode,
    code: normalized.code,
    message: err.message,
  };

  if (!isProduction()) {
    payload.name = err.name;
    payload.dbCode = err.code;
    payload.constraint = err.constraint;
    payload.stack = err.stack;
  }

  console.error('[error]', payload);
}

function errorHandler(err, req, res, _next) {
  const normalized = normalizeError(err);
  logError(err, req, normalized);

  const response = {
    ok: false,
    message: normalized.message,
    code: normalized.code,
  };

  if (normalized.details) {
    response.details = normalized.details;
    response.detalles = normalized.details;
  }

  if (!isProduction() && normalized.statusCode >= 500) {
    response.debug = {
      name: err.name,
      stack: err.stack,
    };
  }

  return res.status(normalized.statusCode).json(response);
}

module.exports = {
  errorHandler,
  formatZodIssue,
  normalizeError,
};
