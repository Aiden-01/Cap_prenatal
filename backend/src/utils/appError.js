class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = options.code || defaultCode(statusCode);
    this.details = options.details;
    this.isOperational = true;
  }
}

function defaultCode(statusCode) {
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  return 'INTERNAL_SERVER_ERROR';
}

module.exports = { AppError };
