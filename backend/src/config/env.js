const path = require('path');
const dotenv = require('dotenv');

const BACKEND_ENV_PATH = path.resolve(__dirname, '../../.env');
const NODE_ENV_VALUES = new Set(['development', 'test', 'production']);
const COOKIE_SAMESITE_VALUES = new Set(['lax', 'strict', 'none']);
const MIN_JWT_SECRET_BYTES = 32;
const MIN_PRODUCTION_PASSWORD_BYTES = 16;
const PRODUCTION_SEED_CONFIRMATION = 'CREATE_INITIAL_PRIVILEGED_ACCOUNT';
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
  const secret = validateSecret('JWT_SECRET', readRequired(env, 'JWT_SECRET'), {
    nodeEnv,
    minBytes: MIN_JWT_SECRET_BYTES,
  });
  const expiresIn = readOptional(env, 'JWT_EXPIRES_IN', '8h');
  if (!/^\d+[smhd]$/i.test(expiresIn)) invalid('JWT_EXPIRES_IN');
  return Object.freeze({ secret, expiresIn });
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

function validateOptionalAutomationSecret(env, { nodeEnv }) {
  const value = readOptional(env, 'AUTOMATION_SECRET');
  if (!value) return null;
  return validateSecret('AUTOMATION_SECRET', value, {
    nodeEnv,
    minBytes: MIN_JWT_SECRET_BYTES,
  });
}

function validateAppConfig(env = process.env) {
  const nodeEnv = nodeEnvForValidation(env, { required: true });
  const jwt = validateJwtConfig(env, { nodeEnv });
  const database = validateDatabaseConfig(env, { nodeEnv });
  const frontendOrigins = validateFrontendOrigins(env, { nodeEnv });
  const cookieSameSite = validateCookieSameSite(env);
  const automationSecret = validateOptionalAutomationSecret(env, { nodeEnv });
  const port = parseInteger(env, 'PORT', { fallback: 3001, min: 1, max: 65535 });
  const jsonBodyLimit = readOptional(env, 'JSON_BODY_LIMIT', '1mb');
  if (!/^\d+(?:b|kb|mb)$/i.test(jsonBodyLimit)) invalid('JSON_BODY_LIMIT');

  return Object.freeze({
    nodeEnv,
    jwt,
    database,
    frontendOrigins,
    cookieSameSite,
    automationSecret,
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
  const { expiresIn } = validateJwtConfig(process.env, { nodeEnv });
  return Object.freeze({ nodeEnv, sameSite, expiresIn });
}

function getAutomationSecret() {
  loadEnvironmentFile();
  const nodeEnv = nodeEnvForValidation(process.env);
  return validateOptionalAutomationSecret(process.env, { nodeEnv });
}

module.exports = {
  BACKEND_ENV_PATH,
  ConfigError,
  MIN_JWT_SECRET_BYTES,
  PRODUCTION_SEED_CONFIRMATION,
  getAutomationSecret,
  getCookieConfig,
  getJwtConfig,
  loadEnvironmentFile,
  nodeEnvForValidation,
  validateAppConfig,
  validateDatabaseConfig,
  validateJwtConfig,
  validateSeedConfig,
};
