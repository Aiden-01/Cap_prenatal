const { AppError } = require('./appError');

class HttpError extends AppError {
  constructor(status, message, options = {}) {
    super(status, message, options);
    this.name = 'HttpError';
  }
}

module.exports = { HttpError, AppError };
