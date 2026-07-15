const { ipKeyGenerator, rateLimit } = require('express-rate-limit');
const { AppError } = require('../utils/appError');

const DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT = 30;
const DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT = 20;

function positiveIntegerOrDefault(value, fallback) {
  if (!['number', 'string'].includes(typeof value)) return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function chatbotRateLimitKey(req) {
  const userKey = req.usuario?.id ?? req.usuario?.username;
  if (userKey !== undefined && userKey !== null && String(userKey).trim()) {
    return `user:${String(userKey)}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

function createLimiter({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    keyGenerator: chatbotRateLimitKey,
    handler(_req, _res, next) {
      return next(new AppError(
        429,
        'Demasiadas solicitudes al chatbot. Intenta nuevamente mas tarde.',
        { code: 'CHATBOT_RATE_LIMITED' }
      ));
    },
  });
}

function createChatbotRateLimiters(options = {}) {
  const windowMs = positiveIntegerOrDefault(
    options.windowMs ?? process.env.CHATBOT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS
  );
  const messageLimit = positiveIntegerOrDefault(
    options.messageLimit ?? process.env.CHATBOT_MESSAGE_RATE_LIMIT,
    DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT
  );
  const feedbackLimit = positiveIntegerOrDefault(
    options.feedbackLimit ?? process.env.CHATBOT_FEEDBACK_RATE_LIMIT,
    DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT
  );

  return {
    config: { windowMs, messageLimit, feedbackLimit },
    messageLimiter: createLimiter({ limit: messageLimit, windowMs }),
    feedbackLimiter: createLimiter({ limit: feedbackLimit, windowMs }),
  };
}

const {
  feedbackLimiter,
  messageLimiter,
} = createChatbotRateLimiters();

module.exports = {
  DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT,
  DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT,
  DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS,
  chatbotRateLimitKey,
  createChatbotRateLimiters,
  feedbackLimiter,
  messageLimiter,
  positiveIntegerOrDefault,
};
