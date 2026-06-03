const { ZodError } = require('zod');

function formatZodIssue(issue) {
  return {
    campo: issue.path.length ? issue.path.join('.') : 'body',
    mensaje: issue.message,
  };
}

function validate(schema, source) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] || {});

    if (!result.success) {
      return res.status(400).json({
        error: 'Datos de entrada invalidos',
        detalles: result.error.issues.map(formatZodIssue),
      });
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

  return res.status(400).json({
    error: 'Datos de entrada invalidos',
    detalles: err.issues.map(formatZodIssue),
  });
}

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  validationErrorHandler,
};
