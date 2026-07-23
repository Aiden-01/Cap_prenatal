const crypto = require('crypto');
const { AppError } = require('../utils/appError');
const {
  isIpAllowed,
  normalizedIp,
  parseAllowedCidrs,
} = require('../utils/ipAllowlist');
const {
  automationRangeQuerySchema,
} = require('../validations/automatizaciones.schemas');

const EMPTY_HASH = Buffer.alloc(32);
const AUTOMATION_KEY_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function automationUnauthorized() {
  return new AppError(
    401,
    'Credenciales de automatizacion invalidas',
    { code: 'AUTOMATION_UNAUTHORIZED' }
  );
}

function hashBuffer(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : EMPTY_HASH;
}

function candidateHash(value) {
  const safeValue = typeof value === 'string' && AUTOMATION_KEY_PATTERN.test(value)
    ? value
    : '';
  return crypto.createHash('sha256').update(safeValue, 'utf8').digest();
}

function createAutomationOriginMiddleware({
  allowedCidrs,
  resolveOrigin = (req) => req.socket?.remoteAddress,
}) {
  const parsedCidrs = parseAllowedCidrs(allowedCidrs);

  return (req, _res, next) => {
    if (req.headers.origin) return next(automationUnauthorized());

    const origin = resolveOrigin(req);
    if (!isIpAllowed(origin, parsedCidrs)) return next(automationUnauthorized());

    try {
      req.automationOrigin = normalizedIp(origin);
    } catch {
      return next(automationUnauthorized());
    }
    return next();
  };
}

function createAutomationAuthentication({ currentHash, nextHash }) {
  const hasCurrent = typeof currentHash === 'string' && /^[a-f0-9]{64}$/i.test(currentHash);
  const hasNext = typeof nextHash === 'string' && /^[a-f0-9]{64}$/i.test(nextHash);
  const expectedCurrent = hashBuffer(currentHash);
  const expectedNext = hashBuffer(nextHash);

  return (req, _res, next) => {
    const receivedHash = candidateHash(req.headers['x-cap-automation-key']);
    const currentMatch = crypto.timingSafeEqual(receivedHash, expectedCurrent);
    const nextMatch = crypto.timingSafeEqual(receivedHash, expectedNext);
    const hasHumanCredentials = Boolean(
      req.headers.authorization
      || req.headers.cookie
      || req.headers['x-csrf-token']
    );

    const authenticated = (hasCurrent && currentMatch) || (hasNext && nextMatch);
    if (hasHumanCredentials || !authenticated) {
      return next(automationUnauthorized());
    }
    return next();
  };
}

function createAutomationRangeMiddleware({ startOffsetDays, windowDays }) {
  return (req, _res, next) => {
    const result = automationRangeQuerySchema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(
        400,
        'Rango de automatizacion invalido',
        { code: 'AUTOMATION_INVALID_RANGE' }
      ));
    }

    req.automationRange = {
      offsetDays: result.data.offset_days ?? startOffsetDays,
      windowDays: result.data.window_days ?? windowDays,
    };
    return next();
  };
}

module.exports = {
  AUTOMATION_KEY_PATTERN,
  automationUnauthorized,
  candidateHash,
  createAutomationAuthentication,
  createAutomationOriginMiddleware,
  createAutomationRangeMiddleware,
  hashBuffer,
};
