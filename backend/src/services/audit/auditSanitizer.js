const { defaultAuditFieldPolicy, isForbiddenField } = require('./auditFieldPolicy');

const CIRCULAR_REFERENCE = '[REFERENCIA CIRCULAR]';
const UNSUPPORTED_VALUE = '[VALOR NO SOPORTADO]';

function sanitizeAuditValue(value, {
  policy = defaultAuditFieldPolicy,
  seen = new WeakSet(),
} = {}) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? UNSUPPORTED_VALUE : value.toISOString();
  }
  if (typeof value !== 'object') return UNSUPPORTED_VALUE;

  if (seen.has(value)) return CIRCULAR_REFERENCE;
  seen.add(value);

  let sanitized;
  if (Array.isArray(value)) {
    sanitized = value.map((item) => sanitizeAuditValue(item, { policy, seen }));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      seen.delete(value);
      return UNSUPPORTED_VALUE;
    }

    sanitized = {};
    for (const key of Object.keys(value).sort()) {
      if (isForbiddenField(key, policy)) continue;
      sanitized[key] = sanitizeAuditValue(value[key], { policy, seen });
    }
  }

  seen.delete(value);
  return sanitized;
}

module.exports = {
  CIRCULAR_REFERENCE,
  UNSUPPORTED_VALUE,
  sanitizeAuditValue,
};
