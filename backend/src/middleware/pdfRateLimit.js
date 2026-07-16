const { ipKeyGenerator } = require('express-rate-limit');
const { AppError } = require('../utils/appError');

const DEFAULT_PDF_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_PDF_RATE_LIMIT = 20;

function positiveIntegerOrDefault(value, fallback) {
  if (!['number', 'string'].includes(typeof value)) return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pdfRateLimitKey(req) {
  const authenticatedUser = req.user ?? req.usuario;
  if (authenticatedUser) {
    const userId = req.user?.id ?? req.usuario?.id;
    if (userId !== undefined && userId !== null && String(userId).trim()) {
      return `user:${String(userId)}`;
    }

    throw new AppError(
      500,
      'No se pudo identificar al usuario autenticado para generar el PDF.',
      { code: 'AUTHENTICATED_USER_ID_REQUIRED' }
    );
  }

  const remoteAddress = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ipKeyGenerator(remoteAddress)}`;
}

function createPdfRateLimiter(options = {}) {
  const windowMs = positiveIntegerOrDefault(
    options.windowMs ?? process.env.PDF_RATE_LIMIT_WINDOW_MS,
    DEFAULT_PDF_RATE_LIMIT_WINDOW_MS
  );
  const limit = positiveIntegerOrDefault(
    options.limit ?? process.env.PDF_RATE_LIMIT,
    DEFAULT_PDF_RATE_LIMIT
  );
  const now = options.now || Date.now;
  const counters = options.counters || new Map();

  function consume(req) {
    const key = pdfRateLimitKey(req);
    const currentTime = now();
    let entry = counters.get(key);

    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      counters.set(key, entry);
    }

    if (entry.count >= limit) {
      throw new AppError(
        429,
        'Demasiadas solicitudes de generacion de PDF. Intenta nuevamente mas tarde.',
        {
          code: 'PDF_RATE_LIMITED',
          details: { limit, retryAfterMs: Math.max(0, entry.resetAt - currentTime) },
        }
      );
    }

    entry.count += 1;
    return {
      key,
      limit,
      remaining: limit - entry.count,
      resetAt: entry.resetAt,
    };
  }

  function reset() {
    counters.clear();
  }

  return {
    config: { limit, windowMs },
    consume,
    reset,
  };
}

const { consume: consumePdfQuota } = createPdfRateLimiter();

module.exports = {
  DEFAULT_PDF_RATE_LIMIT,
  DEFAULT_PDF_RATE_LIMIT_WINDOW_MS,
  consumePdfQuota,
  createPdfRateLimiter,
  pdfRateLimitKey,
  positiveIntegerOrDefault,
};
