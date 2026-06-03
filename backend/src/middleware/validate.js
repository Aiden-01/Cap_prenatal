const { ZodError } = require('zod');
const { AppError } = require('../utils/appError');
const { formatZodIssue } = require('./errorHandler');

function validate(schema, source) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] || {});

    if (!result.success) {
      return next(new AppError(400, 'Datos de entrada invalidos', {
        code: 'VALIDATION_ERROR',
        details: result.error.issues.map(formatZodIssue),
      }));
    }

    return next();
  };
}

function validateBody(schema) {
  return validate(schema, 'body');
}

function validateParams(schema) {
  return validate(schema, 'params');
}

function validateQuery(schema) {
  return validate(schema, 'query');
}

function validationErrorHandler(err, _req, res, next) {
  if (!(err instanceof ZodError)) return next(err);

  return next(new AppError(400, 'Datos de entrada invalidos', {
    code: 'VALIDATION_ERROR',
    details: err.issues.map(formatZodIssue),
  }));
}

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  validationErrorHandler,
};
