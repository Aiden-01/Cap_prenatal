const { normalizeFieldName } = require('./auditFieldPolicy');

const MODIFIED_VALUE = '[DATO MODIFICADO]';

function scalarString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function maskLastFour(value) {
  if (value === null || value === undefined) return null;
  const text = scalarString(value);
  if (text === null) return MODIFIED_VALUE;
  if (text.length <= 4) return '*'.repeat(Math.max(text.length, 1));
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

function maskEmail(value) {
  if (value === null || value === undefined) return null;
  const text = scalarString(value);
  if (text === null) return MODIFIED_VALUE;

  const separator = text.lastIndexOf('@');
  if (separator <= 0 || separator === text.length - 1) return MODIFIED_VALUE;

  const local = text.slice(0, separator);
  const domain = text.slice(separator + 1);
  if (local.length === 1) return `***@${domain}`;
  if (local.length === 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}@${domain}`;
}

function maskAuditValue(fieldName, value) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeFieldName(fieldName);

  if (normalized === 'cui' || normalized.startsWith('telefono')) {
    return maskLastFour(value);
  }
  if (normalized === 'correo' || normalized === 'email') return maskEmail(value);
  if (normalized === 'direccion' || normalized === 'domicilio') return MODIFIED_VALUE;
  return MODIFIED_VALUE;
}

module.exports = {
  MODIFIED_VALUE,
  maskAuditValue,
  maskEmail,
  maskLastFour,
};
