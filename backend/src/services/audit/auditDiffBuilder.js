const {
  AUDIT_FIELD_CATEGORIES,
  AUDIT_VALUE_TYPES,
  defaultAuditFieldPolicy,
  normalizeAllowedAuditValue,
  normalizeFieldName,
  resolveFieldRule,
} = require('./auditFieldPolicy');
const { maskAuditValue } = require('./auditMask');
const { sanitizeAuditValue } = require('./auditSanitizer');

const AUDIT_POLICY_VERSION = 1;
const MISSING = Symbol('missing');

function isNullEquivalent(value) {
  return value === null || value === undefined || value === MISSING;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedObjectMap(value) {
  const result = new Map();
  if (!isPlainObject(value)) return result;

  for (const key of Object.keys(value).sort()) {
    const normalized = normalizeFieldName(key);
    if (!normalized || result.has(normalized)) continue;
    result.set(normalized, value[key]);
  }
  return result;
}

function normalizedDateTimestamp(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  if (typeof value !== 'string') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
  }

  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!isoDateTime.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function structurallyEqual(left, right) {
  if (isNullEquivalent(left) && isNullEquivalent(right)) return true;
  if (isNullEquivalent(left) || isNullEquivalent(right)) return false;
  if (Object.is(left, right)) return true;

  const leftDate = normalizedDateTimestamp(left);
  const rightDate = normalizedDateTimestamp(right);
  if (leftDate !== null || rightDate !== null) {
    return leftDate !== null && rightDate !== null && leftDate === rightDate;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => structurallyEqual(item, right[index]));
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftMap = normalizedObjectMap(left);
    const rightMap = normalizedObjectMap(right);
    const keys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();
    return keys.every((key) => structurallyEqual(
      leftMap.has(key) ? leftMap.get(key) : MISSING,
      rightMap.has(key) ? rightMap.get(key) : MISSING
    ));
  }

  return false;
}

function fieldPath(segments) {
  return segments.join('.');
}

function resolvePathRule(segments, policy, context) {
  return resolveFieldRule(segments.at(-1) || '', context, policy);
}

function unionObjectKeys(left, right) {
  const leftMap = normalizedObjectMap(left);
  const rightMap = normalizedObjectMap(right);
  return {
    keys: [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort(),
    leftMap,
    rightMap,
  };
}

function collectPresentFields(value, {
  path = [],
  fields,
  policy,
  context,
}) {
  if (isNullEquivalent(value)) return;

  if (path.length
    && resolvePathRule(path, policy, context).category === AUDIT_FIELD_CATEGORIES.FORBIDDEN) {
    return;
  }

  if (isPlainObject(value)) {
    const valueMap = normalizedObjectMap(value);
    for (const key of [...valueMap.keys()].sort()) {
      collectPresentFields(valueMap.get(key), {
        path: [...path, key],
        fields,
        policy,
        context,
      });
    }
    return;
  }

  if (path.length) fields.add(fieldPath(path));
}

function addPermissionChanges(pathName, previous, next, changes, sensitiveFields, rule) {
  const normalizedPrevious = normalizeAllowedAuditValue(
    rule,
    isNullEquivalent(previous) ? null : previous
  );
  const normalizedNext = normalizeAllowedAuditValue(
    rule,
    isNullEquivalent(next) ? null : next
  );

  if (!normalizedPrevious.valid || !normalizedNext.valid) {
    sensitiveFields.add(pathName);
    return;
  }

  const previousSet = new Set(normalizedPrevious.value || []);
  const nextSet = new Set(normalizedNext.value || []);
  const added = [...nextSet].filter((permission) => !previousSet.has(permission)).sort();
  const removed = [...previousSet].filter((permission) => !nextSet.has(permission)).sort();

  if (added.length) changes.permisos_agregados = added;
  if (removed.length) changes.permisos_retirados = removed;
}

function addUpdateChanges(previous, next, {
  path = [],
  changes,
  sensitiveFields,
  policy,
  context,
}) {
  if (structurallyEqual(previous, next)) return;

  const rule = path.length
    ? resolvePathRule(path, policy, context)
    : { category: AUDIT_FIELD_CATEGORIES.SENSITIVE };
  if (rule.category === AUDIT_FIELD_CATEGORIES.FORBIDDEN) return;

  if (path.length
    && rule.category === AUDIT_FIELD_CATEGORIES.FULL
    && (isPlainObject(previous) || isPlainObject(next))) {
    sensitiveFields.add(fieldPath(path));
    return;
  }

  if (isPlainObject(previous) || isPlainObject(next)) {
    if (!isPlainObject(previous) && !isNullEquivalent(previous)) {
      sensitiveFields.add(fieldPath(path));
      return;
    }
    if (!isPlainObject(next) && !isNullEquivalent(next)) {
      sensitiveFields.add(fieldPath(path));
      return;
    }

    const { keys, leftMap, rightMap } = unionObjectKeys(previous, next);
    for (const key of keys) {
      addUpdateChanges(
        leftMap.has(key) ? leftMap.get(key) : MISSING,
        rightMap.has(key) ? rightMap.get(key) : MISSING,
        {
          path: [...path, key],
          changes,
          sensitiveFields,
          policy,
          context,
        }
      );
    }
    return;
  }

  const pathName = fieldPath(path);
  if (!pathName) return;

  if (rule.category === AUDIT_FIELD_CATEGORIES.SENSITIVE) {
    sensitiveFields.add(pathName);
    return;
  }

  const oldValue = isNullEquivalent(previous) ? null : previous;
  const newValue = isNullEquivalent(next) ? null : next;
  if (rule.category === AUDIT_FIELD_CATEGORIES.MASKED) {
    changes[pathName] = {
      anterior: maskAuditValue(path.at(-1), oldValue),
      nuevo: maskAuditValue(path.at(-1), newValue),
    };
    return;
  }

  if (rule.valueType === AUDIT_VALUE_TYPES.PERMISSION_SET) {
    addPermissionChanges(pathName, previous, next, changes, sensitiveFields, rule);
    return;
  }

  const normalizedOld = normalizeAllowedAuditValue(rule, oldValue);
  const normalizedNew = normalizeAllowedAuditValue(rule, newValue);
  if (!normalizedOld.valid || !normalizedNew.valid) {
    sensitiveFields.add(pathName);
    return;
  }
  if (structurallyEqual(normalizedOld.value, normalizedNew.value)) return;

  changes[pathName] = {
    anterior: normalizedOld.value,
    nuevo: normalizedNew.value,
  };
}

function sortObject(value) {
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function buildAuditDiff(previous, next, {
  context = {},
  policy = defaultAuditFieldPolicy,
} = {}) {
  const result = { politica_version: AUDIT_POLICY_VERSION };

  if (isNullEquivalent(previous) && isPlainObject(next)) {
    const fields = new Set();
    collectPresentFields(next, { fields, policy, context });
    if (fields.size) result.campos_registrados = [...fields].sort();
    return result;
  }

  if (isPlainObject(previous) && isNullEquivalent(next)) {
    const fields = new Set();
    collectPresentFields(previous, { fields, policy, context });
    if (fields.size) result.campos_eliminados = [...fields].sort();
    return result;
  }

  const changes = {};
  const sensitiveFields = new Set();
  addUpdateChanges(previous, next, {
    changes,
    sensitiveFields,
    policy,
    context,
  });

  if (Object.keys(changes).length) result.cambios = sortObject(changes);
  if (sensitiveFields.size) {
    result.campos_sensibles_modificados = [...sensitiveFields].sort();
  }
  return sanitizeAuditValue(result, { policy });
}

module.exports = {
  AUDIT_POLICY_VERSION,
  buildAuditDiff,
  normalizedDateTimestamp,
  structurallyEqual,
};
