const path = require('path');
const dotenv = require('dotenv');
const { parseAllowedCidrs } = require('../utils/ipAllowlist');

const BACKEND_ENV_PATH = path.resolve(__dirname, '../../.env');
const NODE_ENV_VALUES = new Set(['development', 'test', 'production']);
const COOKIE_SAMESITE_VALUES = new Set(['lax', 'strict', 'none']);
const MIN_JWT_SECRET_BYTES = 32;
const MIN_PRODUCTION_PASSWORD_BYTES = 16;
const PRODUCTION_SEED_CONFIRMATION = 'CREATE_INITIAL_PRIVILEGED_ACCOUNT';
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'cap-prenatal-api';
const JWT_AUDIENCE = 'cap-prenatal-web';
const AUTOMATION_TIMEZONE = 'America/Guatemala';
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
let environmentFileLoaded = false;
const UNSAFE_SECRET_MARKERS = [
  /change[\s_-]*me/i,
  /cambiar/i,
  /development/i,
  /desarrollo/i,
  /default/i,
  /demo/i,
  /example/i,
  /ejemplo/i,
  /placeholder/i,
  /sample/i,
  /secreto/i,
  /secret/i,
];

class ConfigError extends Error {
  constructor(variable) {
    super(`Configuracion invalida: ${variable}`);
    this.name = 'ConfigError';
    this.code = 'CONFIG_INVALID';
    this.variable = variable;
  }
}

function invalid(variable) {
  throw new ConfigError(variable);
}

function readRequired(env, variable) {
  const value = env[variable];
  if (typeof value !== 'string' || value.trim() === '') invalid(variable);
  return value.trim();
}

function readOptional(env, variable, fallback = '') {
  const value = env[variable];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function parseBoolean(env, variable, { required = false, fallback = false } = {}) {
  const value = readOptional(env, variable);
  if (!value) {
    if (required) invalid(variable);
    return fallback;
  }
  if (value !== 'true' && value !== 'false') invalid(variable);
  return value === 'true';
}

function parseInteger(env, variable, { fallback, min, max } = {}) {
  const raw = readOptional(env, variable, fallback === undefined ? '' : String(fallback));
  if (!/^\d+$/.test(raw)) invalid(variable);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(variable);
  return value;
}

function nodeEnvForValidation(env, { required = false } = {}) {
  const value = readOptional(env, 'NODE_ENV', required ? '' : 'development').toLowerCase();
  if (!NODE_ENV_VALUES.has(value)) invalid('NODE_ENV');
  return value;
}

function containsUnsafeMarker(value) {
  return UNSAFE_SECRET_MARKERS.some((pattern) => pattern.test(value));
}

function isRepeatedPattern(value) {
  const bytes = Buffer.from(value, 'utf8');
  const maxPatternLength = Math.min(16, Math.floor(bytes.length / 2));
  for (let patternLength = 1; patternLength <= maxPatternLength; patternLength += 1) {
    if (bytes.length % patternLength !== 0) continue;
    let repeated = true;
    for (let index = patternLength; index < bytes.length; index += 1) {
      if (bytes[index] !== bytes[index % patternLength]) {
        repeated = false;
        break;
      }
    }
    if (repeated) return true;
  }
  return false;
}

function validateSecret(variable, value, {
  nodeEnv,
  minBytes,
  rejectUnsafeOutsideProduction = false,
} = {}) {
  if (Buffer.byteLength(value, 'utf8') < minBytes) invalid(variable);
  if (nodeEnv === 'production' || rejectUnsafeOutsideProduction) {
    if (containsUnsafeMarker(value) || isRepeatedPattern(value)) invalid(variable);
  }
  return value;
}

function validateJwtConfig(env = process.env, options = {}) {
  const nodeEnv = options.nodeEnv || nodeEnvForValidation(env);
  const session = options.session || validateSessionConfig(env);
  const secret = validateSecret('JWT_SECRET', readRequired(env, 'JWT_SECRET'), {
    nodeEnv,
    minBytes: MIN_JWT_SECRET_BYTES,
  });
  return Object.freeze({
    secret,
    expiresIn: `${session.accessTokenTtlMinutes}m`,
    accessTokenTtlMinutes: session.accessTokenTtlMinutes,
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function validateSessionConfig(env = process.env) {
  const accessTokenTtlMinutes = parseInteger(env, 'ACCESS_TOKEN_TTL_MINUTES', {
    fallback: 10,
    min: 1,
    max: 60,
  });
  const idleTimeoutMinutes = parseInteger(env, 'SESSION_IDLE_TIMEOUT_MINUTES', {
    fallback: 15,
    min: 2,
    max: 1440,
  });
  const warningMinutes = parseInteger(env, 'SESSION_WARNING_MINUTES', {
    fallback: 13,
    min: 1,
    max: 1439,
  });
  const absoluteHours = parseInteger(env, 'SESSION_ABSOLUTE_HOURS', {
    fallback: 8,
    min: 1,
    max: 168,
  });
  const activityUpdateSeconds = parseInteger(env, 'SESSION_ACTIVITY_UPDATE_SECONDS', {
    fallback: 60,
    min: 10,
    max: 3600,
  });

  if (warningMinutes >= idleTimeoutMinutes) invalid('SESSION_WARNING_MINUTES');
  if (accessTokenTtlMinutes >= absoluteHours * 60) invalid('ACCESS_TOKEN_TTL_MINUTES');
  if (activityUpdateSeconds >= idleTimeoutMinutes * 60) {
    invalid('SESSION_ACTIVITY_UPDATE_SECONDS');
  }

  return Object.freeze({
    accessTokenTtlMinutes,
    idleTimeoutMinutes,
    warningMinutes,
    absoluteHours,
    activityUpdateSeconds,
  });
}

function databaseSslConfig(env) {
  const enabled = parseBoolean(env, 'DB_SSL', { required: true });
  const rejectUnauthorized = parseBoolean(env, 'DB_SSL_REJECT_UNAUTHORIZED', {
    fallback: false,
  });
  return enabled ? { rejectUnauthorized } : false;
}

function validateDatabasePassword(variable, password, { nodeEnv, username, database }) {
  const normalized = password.trim().toLowerCase();
  const predictable = new Set([
    'postgres',
    'password',
    String(username || '').trim().toLowerCase(),
    String(database || '').trim().toLowerCase(),
  ]);
  if (predictable.has(normalized)) invalid(variable);
  if (nodeEnv === 'production') {
    validateSecret(variable, password, {
      nodeEnv,
      minBytes: MIN_PRODUCTION_PASSWORD_BYTES,
    });
  }
  return password;
}

function validateDatabaseConfig(env = process.env, options = {}) {
  const nodeEnv = options.nodeEnv || nodeEnvForValidation(env);
  const connectionString = readOptional(env, 'DATABASE_URL');
  const ssl = databaseSslConfig(env);

  if (connectionString) {
    let parsed;
    try {
      parsed = new URL(connectionString);
    } catch {
      invalid('DATABASE_URL');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) invalid('DATABASE_URL');
    if (!parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) {
      invalid('DATABASE_URL');
    }
    let username;
    let password;
    try {
      username = decodeURIComponent(parsed.username);
      password = decodeURIComponent(parsed.password);
    } catch {
      invalid('DATABASE_URL');
    }
    if (!password.trim()) invalid('DATABASE_URL');
    validateDatabasePassword('DATABASE_URL', password, {
      nodeEnv,
      username,
      database: parsed.pathname.slice(1),
    });
    return Object.freeze({ connectionString, ssl });
  }

  const host = readRequired(env, 'DB_HOST');
  const port = parseInteger(env, 'DB_PORT', { min: 1, max: 65535 });
  const database = readRequired(env, 'DB_NAME');
  const user = readRequired(env, 'DB_USER');
  const password = validateDatabasePassword('DB_PASSWORD', readRequired(env, 'DB_PASSWORD'), {
    nodeEnv,
    username: user,
    database,
  });

  return Object.freeze({ host, port, database, user, password, ssl });
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

function validateFrontendOrigins(env, { nodeEnv }) {
  const raw = readRequired(env, 'FRONTEND_URL');
  const origins = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length) invalid('FRONTEND_URL');

  const normalized = origins.map((origin) => {
    if (origin.includes('*')) invalid('FRONTEND_URL');

    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      invalid('FRONTEND_URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== '/') {
      invalid('FRONTEND_URL');
    }
    if (nodeEnv === 'production' && (parsed.protocol !== 'https:' || isLoopbackHost(parsed.hostname))) {
      invalid('FRONTEND_URL');
    }
    return parsed.origin;
  });

  return Object.freeze([...new Set(normalized)]);
}

function validateCookieSameSite(env) {
  const value = readRequired(env, 'COOKIE_SAMESITE').toLowerCase();
  if (!COOKIE_SAMESITE_VALUES.has(value)) invalid('COOKIE_SAMESITE');
  return value;
}

function validateAutomationHash(env, variable) {
  const value = readOptional(env, variable);
  if (!value) return null;
  if (!SHA256_HEX_PATTERN.test(value)) invalid(variable);
  return value.toLowerCase();
}

function validateAutomationCidrs(env) {
  const raw = readOptional(env, 'N8N_ALLOWED_CIDRS');
  if (!raw) return Object.freeze([]);

  try {
    return Object.freeze(parseAllowedCidrs(raw).map(({ source }) => source));
  } catch {
    invalid('N8N_ALLOWED_CIDRS');
  }
}

function validateTrustedProxyCidrs(env) {
  const raw = readOptional(env, 'TRUSTED_PROXY_CIDRS');
  if (!raw) return Object.freeze([]);

  try {
    return Object.freeze(parseAllowedCidrs(raw).map(({ source }) => source));
  } catch {
    invalid('TRUSTED_PROXY_CIDRS');
  }
}

function validateAutomationConfig(env = process.env, options = {}) {
  const nodeEnv = options.nodeEnv || nodeEnvForValidation(env);
  const enabled = parseBoolean(env, 'N8N_INTEGRATION_ENABLED', { fallback: false });
  const currentHash = validateAutomationHash(env, 'N8N_API_KEY_HASH_CURRENT');
  const nextHash = validateAutomationHash(env, 'N8N_API_KEY_HASH_NEXT');
  const allowedCidrs = validateAutomationCidrs(env);
  const startOffsetDays = parseInteger(env, 'APPOINTMENT_NOTIFICATION_START_OFFSET_DAYS', {
    fallback: 1,
    min: 0,
    max: 30,
  });
  const windowDays = parseInteger(env, 'APPOINTMENT_NOTIFICATION_WINDOW_DAYS', {
    fallback: 1,
    min: 1,
    max: 7,
  });
  const timezone = readOptional(
    env,
    'APPOINTMENT_NOTIFICATION_TIMEZONE',
    AUTOMATION_TIMEZONE
  );
  if (timezone !== AUTOMATION_TIMEZONE) invalid('APPOINTMENT_NOTIFICATION_TIMEZONE');
  const rateLimitWindowMs = parseInteger(env, 'AUTOMATION_RATE_LIMIT_WINDOW_MS', {
    fallback: 15 * 60 * 1000,
    min: 1000,
    max: 24 * 60 * 60 * 1000,
  });
  const rateLimitMax = parseInteger(env, 'AUTOMATION_RATE_LIMIT_MAX', {
    fallback: 6,
    min: 1,
    max: 100,
  });
  const active = nodeEnv === 'production' && enabled;

  if (active && !currentHash) invalid('N8N_API_KEY_HASH_CURRENT');
  if (active && allowedCidrs.length === 0) invalid('N8N_ALLOWED_CIDRS');

  return Object.freeze({
    active,
    allowedCidrs,
    currentHash,
    enabled,
    nextHash,
    rateLimitMax,
    rateLimitWindowMs,
    startOffsetDays,
    timezone,
    windowDays,
  });
}

function validateAppConfig(env = process.env) {
  const nodeEnv = nodeEnvForValidation(env, { required: true });
  const session = validateSessionConfig(env);
  const jwt = validateJwtConfig(env, { nodeEnv, session });
  const database = validateDatabaseConfig(env, { nodeEnv });
  const frontendOrigins = validateFrontendOrigins(env, { nodeEnv });
  const cookieSameSite = validateCookieSameSite(env);
  const automation = validateAutomationConfig(env, { nodeEnv });
  const trustedProxyCidrs = validateTrustedProxyCidrs(env);
  const port = parseInteger(env, 'PORT', { fallback: 3001, min: 1, max: 65535 });
  const jsonBodyLimit = readOptional(env, 'JSON_BODY_LIMIT', '1mb');
  if (!/^\d+(?:b|kb|mb)$/i.test(jsonBodyLimit)) invalid('JSON_BODY_LIMIT');

  return Object.freeze({
    nodeEnv,
    jwt,
    session,
    database,
    frontendOrigins,
    cookieSameSite,
    automation,
    trustedProxyCidrs,
    port,
    jsonBodyLimit,
  });
}

function validateSeedPassword(password, username) {
  const length = Array.from(password).length;
  if (length < 12 || length > 128) invalid('SEED_DIRECTOR_PASSWORD');
  if (containsUnsafeMarker(password) || password.toLowerCase().includes(username.toLowerCase())) {
    invalid('SEED_DIRECTOR_PASSWORD');
  }
  return password;
}

function validateSeedConfig(env = process.env) {
  const nodeEnv = nodeEnvForValidation(env, { required: true });
  validateDatabaseConfig(env, { nodeEnv });

  const username = readRequired(env, 'SEED_DIRECTOR_USERNAME');
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) invalid('SEED_DIRECTOR_USERNAME');
  const nombreCompleto = readRequired(env, 'SEED_DIRECTOR_NAME');
  if (nombreCompleto.length < 3 || nombreCompleto.length > 120) invalid('SEED_DIRECTOR_NAME');
  const password = validateSeedPassword(readRequired(env, 'SEED_DIRECTOR_PASSWORD'), username);

  if (nodeEnv === 'production'
    && readOptional(env, 'SEED_CONFIRM_PRODUCTION') !== PRODUCTION_SEED_CONFIRMATION) {
    invalid('SEED_CONFIRM_PRODUCTION');
  }

  return Object.freeze({ nodeEnv, username, nombreCompleto, password });
}

function loadEnvironmentFile() {
  if (environmentFileLoaded) return;
  dotenv.config({ path: BACKEND_ENV_PATH });
  environmentFileLoaded = true;
}

function getJwtConfig() {
  loadEnvironmentFile();
  return validateJwtConfig(process.env);
}

function getCookieConfig() {
  loadEnvironmentFile();
  const nodeEnv = nodeEnvForValidation(process.env);
  const sameSite = readOptional(process.env, 'COOKIE_SAMESITE', 'lax').toLowerCase();
  if (!COOKIE_SAMESITE_VALUES.has(sameSite)) invalid('COOKIE_SAMESITE');
  const session = validateSessionConfig(process.env);
  return Object.freeze({ nodeEnv, sameSite, session });
}

function getSessionConfig() {
  loadEnvironmentFile();
  return validateSessionConfig(process.env);
}

function getAutomationConfig() {
  loadEnvironmentFile();
  const nodeEnv = nodeEnvForValidation(process.env);
  return validateAutomationConfig(process.env, { nodeEnv });
}

module.exports = {
  BACKEND_ENV_PATH,
  ConfigError,
  MIN_JWT_SECRET_BYTES,
  PRODUCTION_SEED_CONFIRMATION,
  getAutomationConfig,
  getCookieConfig,
  getJwtConfig,
  getSessionConfig,
  loadEnvironmentFile,
  nodeEnvForValidation,
  validateAutomationConfig,
  validateAppConfig,
  validateDatabaseConfig,
  validateJwtConfig,
  validateSessionConfig,
  validateSeedConfig,
  validateTrustedProxyCidrs,
};
