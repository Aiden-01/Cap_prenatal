const { isDeepStrictEqual } = require('node:util');

const {
  BASE_CONTEXTUAL_RULES,
  isForbiddenField,
  normalizeFieldName,
} = require('./auditFieldPolicy');
const { sanitizeAuditValue } = require('./auditSanitizer');
const { structurallyEqual } = require('./auditDiffBuilder');

const AUDIT_POLICY_VERSION = 1;
const AUDIT_SANITIZATION_VERSION = 1;
const SANITIZED_DESCRIPTION =
  'Evento histórico saneado conforme a la política de privacidad v1.';

const CLASSIFICATIONS = Object.freeze({
  SAFE: 'A',
  DERIVABLE: 'B',
  CONSERVATIVE: 'C',
  DELETABLE: 'D',
});

const ALLOWED_ACTIONS = new Set([
  'login',
  'logout',
  'login_fallido',
  'login_usuario_inactivo',
  'crear',
  'actualizar',
  'eliminar',
  'estado',
  'consultar',
  'generar_pdf',
  'exportar',
]);

const TECHNICAL_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'registrado_por',
  'updated_by',
]);

const AUTH_ACTIONS = new Set([
  'login',
  'logout',
  'login_fallido',
  'login_usuario_inactivo',
]);

const AUTH_IDENTITY_FIELDS = new Set([
  'username',
  'username_intentado',
  'correo',
  'email',
]);
const MARKER_ONLY_FIELDS = new Set(['password_cambiado']);

const VALID_ROLES = new Set(['director', 'admin', 'personal_salud']);
const VALID_PREGNANCY_STATES = new Set(['activo', 'puerperio', 'cerrado']);
const VALID_USER_STATES = new Set(['activo', 'inactivo']);
const VALID_RESULTS = new Set([
  'exitoso',
  'fallido',
  'sin_cambio',
  'generado',
  'sesion_creada',
  'sesion_revocada',
  'sesiones_revocadas',
  'sesion_inactiva',
  'sesion_expirada',
  'reutilizacion_refresh_detectada',
]);
const VALID_REASONS = new Set([
  'credenciales_incorrectas',
  'usuario_inactivo',
  'logout',
  'logout_all',
  'sesion_ya_revocada',
  'sesiones_ya_revocadas',
  'session_not_found',
  'already_revoked',
  'user_inactive',
  'absolute_expiration',
  'inactivity',
  'refresh_reuse_or_mismatch',
  'previous_refresh_reused',
  'refresh_reuse',
  'refresh_mismatch',
  'permissions_changed',
  'role_changed',
  'state_changed',
  'password_changed',
  'role_changed.state_changed',
  'role_changed.password_changed',
  'state_changed.password_changed',
  'role_changed.state_changed.password_changed',
  'user_deleted',
]);
const VALID_AUTH_METHODS = new Set(['password']);
const VALID_DOCUMENT_TYPES = new Set([
  'control_prenatal',
  'ficha_mspas_prenatal',
  'riesgo_obstetrico',
  'plan_parto',
]);
const VALID_REPORT_TYPES = new Set([
  'censo_embarazos_activos',
  'censo_primer_control',
]);
const VALID_FORMATS = new Set(['pdf', 'xlsx']);

const TABLE_TO_ENTITY = Object.freeze({
  pacientes: 'paciente',
  paciente: 'paciente',
  embarazos: 'embarazo',
  embarazo: 'embarazo',
  controles_prenatales: 'control_prenatal',
  control_prenatal: 'control_prenatal',
  fichas_riesgo_obstetrico: 'riesgo_obstetrico',
  riesgo_obstetrico: 'riesgo_obstetrico',
  vacunas_paciente: 'vacuna',
  vacuna: 'vacuna',
  morbilidad_embarazo: 'morbilidad',
  morbilidad: 'morbilidad',
  planes_parto: 'plan_parto',
  plan_parto: 'plan_parto',
  controles_puerperio: 'puerperio',
  puerperio: 'puerperio',
  referencias_efectuadas: 'referencia',
  referencia: 'referencia',
  comunidades: 'comunidad',
  comunidad: 'comunidad',
  usuarios: 'usuario',
  usuario: 'usuario',
  usuario_permisos: 'usuario_permisos',
  auth_sessions: 'sesion',
  sesion: 'sesion',
  documentos: 'documento',
  documento: 'documento',
  reportes: 'reporte',
  reporte: 'reporte',
  exportacion: 'exportacion',
});

const ACTION_TO_EVENT = Object.freeze({
  crear: 'crear',
  actualizar: 'actualizar',
  eliminar: 'eliminar',
  estado: 'cambiar_estado',
  login: 'login_exitoso',
  login_fallido: 'login_fallido',
  login_usuario_inactivo: 'login_usuario_inactivo',
  logout: 'logout',
  consultar: 'consultar',
  generar_pdf: 'pdf_clinico_generado',
  exportar: 'exportacion_censo',
});

const KNOWN_EVENTS = new Set([
  ...BASE_CONTEXTUAL_RULES.flatMap((rule) => rule.events),
  ...Object.values(ACTION_TO_EVENT),
  'usuario_creado',
  'usuario_actualizado',
  'usuario_eliminado',
  'cambio_rol',
  'password_cambiado',
  'password_reiniciado',
  'permisos_reemplazados',
]);

const BASE_PAYLOAD_KEYS = new Set([
  'politica_version',
  'saneamiento_version',
  'evento_historico_saneado',
  'contenido_legacy_eliminado',
  'campos_registrados',
  'campos_sensibles_modificados',
  'campos_eliminados',
  'cambios',
  'tipo_documento',
  'tipo_reporte',
  'formato',
  'cantidad_filas',
  'desde',
  'hasta',
  'fecha_desde',
  'fecha_hasta',
  'resultado',
  'motivo_codigo',
  'metodo',
  'categoria_autenticacion',
  'password_cambiado',
  'sesion_creada',
  'sesion_revocada',
  'sesion_expirada',
  'usuario_inactivo',
  'reutilizacion_detectada',
  'cantidad_sesiones_revocadas',
]);

const STRUCTURAL_COLUMNS = Object.freeze([
  'id',
  'usuario_id',
  'paciente_id',
  'embarazo_id',
  'accion',
  'tabla',
  'created_at',
  'fecha_hora',
  'modulo',
  'entidad_afectada',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedObjectEntries(value) {
  if (!isPlainObject(value)) return [];
  const seen = new Set();
  return Object.entries(value).flatMap(([rawKey, rawValue]) => {
    const key = normalizeFieldName(rawKey);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [[key, rawValue]];
  });
}

function normalizedObjectMap(value) {
  return new Map(normalizedObjectEntries(value));
}

function normalizeControlledValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.:-]{0,99}$/.test(normalized) ? normalized : null;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function inferEntity(row) {
  const candidates = [row.entidad_afectada, row.tabla, row.modulo];
  for (const candidate of candidates) {
    const normalized = normalizeFieldName(candidate);
    if (TABLE_TO_ENTITY[normalized]) return TABLE_TO_ENTITY[normalized];
  }
  return '';
}

function inferCategory(row, entity) {
  const action = normalizeFieldName(row.accion);
  const moduleName = normalizeFieldName(row.modulo);
  if (AUTH_ACTIONS.has(action)) return 'autenticacion';
  if (entity === 'sesion' || moduleName === 'sesiones') return 'sesiones';
  if (entity === 'usuario_permisos' || moduleName === 'permisos') return 'permisos';
  if (entity === 'usuario' || moduleName === 'usuarios') return 'usuarios';
  if (entity === 'comunidad' || moduleName === 'comunidades') return 'administracion';
  if (action === 'generar_pdf' || entity === 'documento' || moduleName === 'documentos') {
    return 'documentos';
  }
  if (action === 'exportar' || entity === 'reporte' || entity === 'exportacion'
    || moduleName === 'reportes') {
    return 'reportes';
  }
  return entity ? 'clinica' : '';
}

function inferContext(row) {
  const accion = normalizeFieldName(row.accion);
  const entidad = inferEntity(row);
  const categoria = inferCategory(row, entidad);
  const description = normalizeFieldName(row.descripcion);
  const evento = KNOWN_EVENTS.has(description) ? description : ACTION_TO_EVENT[accion] || '';
  return Object.freeze({ accion, categoria, entidad, evento });
}

function isAuthenticationContext(context) {
  return AUTH_ACTIONS.has(context.accion)
    || context.categoria === 'autenticacion'
    || context.categoria === 'sesiones';
}

function isSafeFieldPath(value, { authentication = false } = {}) {
  if (typeof value !== 'string' || value.length > 300) return false;
  const segments = value.split('.');
  if (!segments.length || segments.length > 8) return false;
  return segments.every((segment) => {
    const normalized = normalizeFieldName(segment);
    return normalized === segment
      && /^[a-z][a-z0-9_]{0,99}$/.test(segment)
      && !TECHNICAL_FIELDS.has(segment)
      && !MARKER_ONLY_FIELDS.has(segment)
      && !isForbiddenField(segment)
      && (!authentication || !AUTH_IDENTITY_FIELDS.has(segment));
  });
}

function isSortedUniqueStrings(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === 'string')
    && new Set(value).size === value.length
    && isDeepStrictEqual(value, [...value].sort());
}

function isValidFieldList(value, context) {
  return isSortedUniqueStrings(value)
    && value.every((field) => isSafeFieldPath(field, {
      authentication: isAuthenticationContext(context),
    }));
}

function validTransition(field, value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  if (!isDeepStrictEqual(keys, ['anterior', 'nuevo'])) return false;
  const previous = value.anterior;
  const next = value.nuevo;
  if (field === 'estado_embarazo') {
    return VALID_PREGNANCY_STATES.has(previous) && VALID_PREGNANCY_STATES.has(next);
  }
  if (field === 'rol') return VALID_ROLES.has(previous) && VALID_ROLES.has(next);
  if (field === 'activo') return typeof previous === 'boolean' && typeof next === 'boolean';
  if (field === 'estado') return VALID_USER_STATES.has(previous) && VALID_USER_STATES.has(next);
  return false;
}

function validPermissionDelta(value) {
  return isSortedUniqueStrings(value)
    && value.every((permission) => /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(permission));
}

function validChanges(value, context) {
  if (!isPlainObject(value) || Object.keys(value).length === 0) return false;
  return Object.entries(value).every(([field, transition]) => {
    if (field === 'permisos_agregados' || field === 'permisos_retirados') {
      return context.entidad === 'usuario' || context.entidad === 'usuario_permisos'
        ? validPermissionDelta(transition)
        : false;
    }
    if (!['estado_embarazo', 'rol', 'activo', 'estado'].includes(field)) return false;
    if (field === 'estado_embarazo' && context.entidad !== 'embarazo') return false;
    if (['rol', 'estado'].includes(field) && context.entidad !== 'usuario') return false;
    if (field === 'activo' && !['usuario', 'comunidad'].includes(context.entidad)) return false;
    return validTransition(field, transition);
  });
}

function validMetadataEntry(key, value, context) {
  switch (key) {
    case 'tipo_documento':
      return context.categoria === 'documentos' && VALID_DOCUMENT_TYPES.has(value);
    case 'tipo_reporte':
      return context.categoria === 'reportes' && VALID_REPORT_TYPES.has(value);
    case 'formato':
      return ['documentos', 'reportes'].includes(context.categoria) && VALID_FORMATS.has(value);
    case 'cantidad_filas':
    case 'cantidad_sesiones_revocadas':
      return Number.isSafeInteger(value) && value >= 0;
    case 'desde':
    case 'hasta':
    case 'fecha_desde':
    case 'fecha_hasta':
      return ['documentos', 'reportes'].includes(context.categoria) && isIsoDate(value);
    case 'resultado':
      return VALID_RESULTS.has(value);
    case 'motivo_codigo':
      return VALID_REASONS.has(value);
    case 'metodo':
      return isAuthenticationContext(context) && VALID_AUTH_METHODS.has(value);
    case 'categoria_autenticacion':
      return isAuthenticationContext(context) && value === 'password';
    case 'password_cambiado':
      return context.entidad === 'usuario' && value === true;
    case 'sesion_creada':
    case 'sesion_revocada':
    case 'sesion_expirada':
    case 'usuario_inactivo':
    case 'reutilizacion_detectada':
      return isAuthenticationContext(context) && value === true;
    default:
      return false;
  }
}

function containsForbiddenKey(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) {
    const found = value.some((item) => containsForbiddenKey(item, seen));
    seen.delete(value);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenField(key) || containsForbiddenKey(child, seen)) {
      seen.delete(value);
      return true;
    }
  }
  seen.delete(value);
  return false;
}

function validateFinalPayload(payload, context) {
  if (!isPlainObject(payload) || payload.politica_version !== AUDIT_POLICY_VERSION) return false;
  if (containsForbiddenKey(payload)) return false;

  const keys = Object.keys(payload);
  if (keys.some((key) => !BASE_PAYLOAD_KEYS.has(key))) return false;

  const sanitizedMarker = Object.hasOwn(payload, 'saneamiento_version')
    || Object.hasOwn(payload, 'evento_historico_saneado')
    || Object.hasOwn(payload, 'contenido_legacy_eliminado');
  if (sanitizedMarker) {
    if (payload.saneamiento_version !== AUDIT_SANITIZATION_VERSION
      || payload.evento_historico_saneado !== true) return false;
  } else if (Object.hasOwn(payload, 'saneamiento_version')
    || Object.hasOwn(payload, 'evento_historico_saneado')) {
    return false;
  }

  if (Object.hasOwn(payload, 'contenido_legacy_eliminado')) {
    return payload.contenido_legacy_eliminado === true
      && keys.length === 4
      && keys.every((key) => [
        'politica_version',
        'saneamiento_version',
        'evento_historico_saneado',
        'contenido_legacy_eliminado',
      ].includes(key));
  }

  if (!context.categoria || !context.entidad || !context.evento) return false;

  for (const [key, value] of Object.entries(payload)) {
    if (['politica_version', 'saneamiento_version', 'evento_historico_saneado'].includes(key)) {
      continue;
    }
    if (['campos_registrados', 'campos_sensibles_modificados', 'campos_eliminados'].includes(key)) {
      if (!isValidFieldList(value, context)) return false;
      continue;
    }
    if (key === 'cambios') {
      if (!validChanges(value, context)) return false;
      continue;
    }
    if (!validMetadataEntry(key, value, context)) return false;
  }

  const sanitizedAgain = sanitizeAuditValue(payload);
  return isDeepStrictEqual(sanitizedAgain, payload);
}

function hasSafeDescription(row, payload) {
  if (payload.evento_historico_saneado === true) {
    return row.descripcion === SANITIZED_DESCRIPTION;
  }
  const description = normalizeFieldName(row.descripcion);
  return typeof row.descripcion === 'string'
    && description === row.descripcion
    && KNOWN_EVENTS.has(description);
}

function isStrictlySafeEvent(row) {
  const context = inferContext(row);
  return row.datos_anteriores === null
    && row.ip === null
    && row.user_agent === null
    && (row.registro_id === null || isValidTextIdentifier(row.registro_id, context))
    && (row.id_entidad === null || isValidTextIdentifier(row.id_entidad, context))
    && validateFinalPayload(row.datos_nuevos, context)
    && hasSafeDescription(row, row.datos_nuevos);
}

function addLeafFields(value, fields, {
  path = [],
  authentication = false,
} = {}) {
  if (!path.length && !isPlainObject(value)) return;
  if (isPlainObject(value)) {
    for (const [key, child] of normalizedObjectEntries(value)) {
      if (TECHNICAL_FIELDS.has(key) || isForbiddenField(key)
        || MARKER_ONLY_FIELDS.has(key)
        || (authentication && AUTH_IDENTITY_FIELDS.has(key))) continue;
      addLeafFields(child, fields, { path: [...path, key], authentication });
    }
    return;
  }
  if (path.length) {
    const field = path.join('.');
    if (isSafeFieldPath(field, { authentication })) fields.add(field);
  }
}

function addChangedFields(previous, next, fields, {
  path = [],
  authentication = false,
} = {}) {
  if (structurallyEqual(previous, next)) return;
  if (isPlainObject(previous) || isPlainObject(next)) {
    if ((!isPlainObject(previous) && previous !== null && previous !== undefined)
      || (!isPlainObject(next) && next !== null && next !== undefined)) {
      if (path.length) fields.add(path.join('.'));
      return;
    }
    const previousMap = normalizedObjectMap(previous);
    const nextMap = normalizedObjectMap(next);
    const keys = [...new Set([...previousMap.keys(), ...nextMap.keys()])].sort();
    for (const key of keys) {
      if (TECHNICAL_FIELDS.has(key) || isForbiddenField(key)
        || MARKER_ONLY_FIELDS.has(key)
        || (authentication && AUTH_IDENTITY_FIELDS.has(key))) continue;
      addChangedFields(previousMap.get(key), nextMap.get(key), fields, {
        path: [...path, key],
        authentication,
      });
    }
    return;
  }
  if (path.length) {
    const field = path.join('.');
    if (isSafeFieldPath(field, { authentication })) fields.add(field);
  }
}

function directValue(object, field) {
  const map = normalizedObjectMap(object);
  return map.has(field) ? map.get(field) : undefined;
}

function findValue(objects, field) {
  for (const object of objects) {
    const direct = directValue(object, field);
    if (direct !== undefined) return direct;
    const metadata = directValue(object, 'metadata');
    const nested = directValue(metadata, field);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function findRecursiveValue(value, field, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  if (isPlainObject(value)) {
    for (const [key, child] of normalizedObjectEntries(value)) {
      if (key === field) return child;
      const nested = findRecursiveValue(child, field, seen);
      if (nested !== undefined) return nested;
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findRecursiveValue(item, field, seen);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function addControlledMetadata(payload, objects, context) {
  const fields = [
    ['resultado', VALID_RESULTS],
    ['motivo_codigo', VALID_REASONS],
    ['metodo', VALID_AUTH_METHODS],
  ];
  for (const [field, allowed] of fields) {
    const normalized = normalizeControlledValue(findValue(objects, field));
    if (normalized && allowed.has(normalized)
      && validMetadataEntry(field, normalized, context)) payload[field] = normalized;
  }

  if (context.categoria === 'documentos') {
    const type = normalizeControlledValue(findValue(objects, 'tipo_documento'));
    if (type && VALID_DOCUMENT_TYPES.has(type)) payload.tipo_documento = type;
  }
  if (context.categoria === 'reportes') {
    const type = normalizeControlledValue(findValue(objects, 'tipo_reporte'));
    if (type && VALID_REPORT_TYPES.has(type)) payload.tipo_reporte = type;
  }
  if (['documentos', 'reportes'].includes(context.categoria)) {
    const format = normalizeControlledValue(findValue(objects, 'formato'));
    if (format && VALID_FORMATS.has(format)) payload.formato = format;
    const count = findValue(objects, 'cantidad_filas');
    if (Number.isSafeInteger(count) && count >= 0) payload.cantidad_filas = count;
    for (const field of ['desde', 'hasta', 'fecha_desde', 'fecha_hasta']) {
      const date = findValue(objects, field);
      if (isIsoDate(date)) payload[field] = date;
    }
  }

  if (isAuthenticationContext(context)) {
    for (const field of [
      'sesion_creada',
      'sesion_revocada',
      'sesion_expirada',
      'usuario_inactivo',
      'reutilizacion_detectada',
    ]) {
      if (findValue(objects, field) === true) payload[field] = true;
    }
    const count = findValue(objects, 'cantidad_sesiones_revocadas');
    if (Number.isSafeInteger(count) && count >= 0) {
      payload.cantidad_sesiones_revocadas = count;
    }
  }
}

function addTransitions(payload, previous, next, context, sensitiveFields) {
  const changes = {};
  const transitions = [];
  if (context.entidad === 'embarazo') {
    transitions.push(['estado_embarazo', VALID_PREGNANCY_STATES]);
    transitions.push(['estado', VALID_PREGNANCY_STATES]);
  }
  if (context.entidad === 'usuario') {
    transitions.push(['rol', VALID_ROLES]);
    transitions.push(['estado', VALID_USER_STATES]);
    transitions.push(['activo', null]);
  }

  for (const [sourceField, allowed] of transitions) {
    const oldValue = directValue(previous, sourceField);
    const newValue = directValue(next, sourceField);
    if (oldValue === undefined || newValue === undefined || structurallyEqual(oldValue, newValue)) {
      continue;
    }
    const targetField = context.entidad === 'embarazo' ? 'estado_embarazo' : sourceField;
    sensitiveFields.delete(sourceField);
    if ((allowed && allowed.has(oldValue) && allowed.has(newValue))
      || (!allowed && typeof oldValue === 'boolean' && typeof newValue === 'boolean')) {
      changes[targetField] = { anterior: oldValue, nuevo: newValue };
      sensitiveFields.delete(targetField);
    } else {
      sensitiveFields.add(targetField);
    }
  }

  if (Object.keys(changes).length) payload.cambios = changes;
}

function buildDerivablePayload(row, context) {
  const previous = isPlainObject(row.datos_anteriores) ? row.datos_anteriores : null;
  const next = isPlainObject(row.datos_nuevos) ? row.datos_nuevos : null;
  const objects = [next, previous].filter(Boolean);
  const payload = {
    politica_version: AUDIT_POLICY_VERSION,
    saneamiento_version: AUDIT_SANITIZATION_VERSION,
    evento_historico_saneado: true,
  };

  if (isAuthenticationContext(context)) {
    addControlledMetadata(payload, objects, context);
  } else if (context.accion === 'crear') {
    const fields = new Set();
    addLeafFields(next, fields);
    if (fields.size) payload.campos_registrados = [...fields].sort();
  } else if (context.accion === 'eliminar') {
    const fields = new Set();
    addLeafFields(previous, fields);
    if (fields.size) payload.campos_eliminados = [...fields].sort();
  } else if (context.accion === 'actualizar' || context.accion === 'estado') {
    const fields = new Set();
    addChangedFields(previous, next, fields);
    addTransitions(payload, previous, next, context, fields);
    if (fields.size) payload.campos_sensibles_modificados = [...fields].sort();
  }

  addControlledMetadata(payload, objects, context);
  const passwordChanged = objects
    .map((object) => findRecursiveValue(object, 'password_cambiado'))
    .find((value) => value !== undefined);
  if (context.entidad === 'usuario' && passwordChanged === true) {
    payload.password_cambiado = true;
  }

  const sanitized = sanitizeAuditValue(payload);
  if (!validateFinalPayload(sanitized, context)) {
    throw new TypeError('El payload reconstruido no cumple la allowlist histórica');
  }
  return sanitized;
}

function conservativePayload(context) {
  const payload = sanitizeAuditValue({
    politica_version: AUDIT_POLICY_VERSION,
    saneamiento_version: AUDIT_SANITIZATION_VERSION,
    evento_historico_saneado: true,
    contenido_legacy_eliminado: true,
  });
  if (!validateFinalPayload(payload, context)) {
    throw new TypeError('El marcador conservador no cumple la allowlist histórica');
  }
  return payload;
}

function isRecognizableLegacy(row, context) {
  if (!context.categoria || !context.entidad || !context.evento) return false;
  const previousObject = isPlainObject(row.datos_anteriores);
  const nextObject = isPlainObject(row.datos_nuevos);
  if (!previousObject && !nextObject) return false;
  if (isAuthenticationContext(context)) return true;
  if (['generar_pdf', 'exportar', 'consultar'].includes(context.accion)) return true;
  if (context.accion === 'crear') return nextObject;
  if (context.accion === 'eliminar') return previousObject;
  if (['actualizar', 'estado'].includes(context.accion)) return previousObject || nextObject;
  return false;
}

function isValidTextIdentifier(value, context) {
  if (value === null || value === undefined || value === '') return false;
  const text = String(value);
  if (/^[1-9]\d*$/.test(text)) return true;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return context.entidad === 'sesion' && uuid.test(text);
}

function sanitizedTextIdentifier(value, context) {
  return isValidTextIdentifier(value, context) ? String(value) : null;
}

function classifyAuditEvent(row) {
  if (!isPlainObject(row)) throw new TypeError('Fila de auditoría inválida');
  const context = inferContext(row);
  if (isStrictlySafeEvent(row)) {
    return Object.freeze({ classification: CLASSIFICATIONS.SAFE, context, row });
  }

  const classification = isRecognizableLegacy(row, context)
    ? CLASSIFICATIONS.DERIVABLE
    : CLASSIFICATIONS.CONSERVATIVE;
  const payload = classification === CLASSIFICATIONS.DERIVABLE
    ? buildDerivablePayload(row, context)
    : conservativePayload(context);
  const registroId = sanitizedTextIdentifier(row.registro_id, context);
  const idEntidad = sanitizedTextIdentifier(row.id_entidad, context);
  const nextRow = {
    ...row,
    registro_id: registroId,
    id_entidad: idEntidad,
    datos_anteriores: null,
    datos_nuevos: payload,
    ip: null,
    user_agent: null,
    descripcion: SANITIZED_DESCRIPTION,
  };
  return Object.freeze({
    classification,
    context,
    row,
    nextRow,
    identifiersNullified:
      Number(row.registro_id !== null && registroId === null)
      + Number(row.id_entidad !== null && idEntidad === null),
  });
}

function safeEntityStat(context) {
  return context.entidad || 'desconocida';
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildStatistics(plan, durationMs = 0) {
  const byAction = new Map();
  const byEntity = new Map();
  let transitionsPreserved = 0;
  let passwordMarkersPreserved = 0;
  let pdfTypesPreserved = 0;
  let identifiersNullified = 0;
  for (const item of plan) {
    const action = ALLOWED_ACTIONS.has(item.context.accion) ? item.context.accion : 'desconocida';
    const entity = safeEntityStat(item.context);
    byAction.set(action, (byAction.get(action) || 0) + 1);
    byEntity.set(entity, (byEntity.get(entity) || 0) + 1);
    const payload = item.nextRow?.datos_nuevos;
    transitionsPreserved += payload?.cambios ? Object.keys(payload.cambios).length : 0;
    passwordMarkersPreserved += Number(payload?.password_cambiado === true);
    pdfTypesPreserved += Number(typeof payload?.tipo_documento === 'string');
    identifiersNullified += item.identifiersNullified || 0;
  }
  const classificationCounts = Object.fromEntries(
    Object.values(CLASSIFICATIONS).map((classification) => [
      classification,
      plan.filter((item) => item.classification === classification).length,
    ])
  );
  return {
    total_filas: plan.length,
    clasificacion: classificationCounts,
    filas_que_serian_modificadas:
      classificationCounts.B + classificationCounts.C,
    filas_modificadas: 0,
    por_accion: sortedCounts(byAction),
    por_entidad: sortedCounts(byEntity),
    transiciones_conservadas: transitionsPreserved,
    marcadores_password_conservados: passwordMarkersPreserved,
    tipos_pdf_conservados: pdfTypesPreserved,
    identificadores_text_anulados: identifiersNullified,
    duracion_ms: durationMs,
    aserciones: 'pendiente',
  };
}

function structuralColumnsUnchanged(original, candidate) {
  return STRUCTURAL_COLUMNS.every((column) => isDeepStrictEqual(original[column], candidate[column]));
}

function validatePlan(plan, expectedTotal = plan.length) {
  const assertions = [
    ['cantidad_total_sin_cambios', plan.length === expectedTotal],
    ['categoria_d_cero', plan.every((item) => item.classification !== CLASSIFICATIONS.DELETABLE)],
    ['acciones_permitidas', plan.every((item) => ALLOWED_ACTIONS.has(item.context.accion))],
    ['eventos_a_no_actualizados', plan
      .filter((item) => item.classification === CLASSIFICATIONS.SAFE)
      .every((item) => !item.nextRow)],
    ['columnas_estructurales_preservadas', plan
      .filter((item) => item.nextRow)
      .every((item) => structuralColumnsUnchanged(item.row, item.nextRow))],
    ['datos_anteriores_limpiados', plan
      .filter((item) => item.nextRow)
      .every((item) => item.nextRow.datos_anteriores === null)],
    ['red_limpiada', plan
      .filter((item) => item.nextRow)
      .every((item) => item.nextRow.ip === null && item.nextRow.user_agent === null)],
    ['versiones_correctas', plan
      .filter((item) => item.nextRow)
      .every((item) => item.nextRow.datos_nuevos.politica_version === 1
        && item.nextRow.datos_nuevos.saneamiento_version === 1)],
    ['payloads_finales_validos', plan
      .filter((item) => item.nextRow)
      .every((item) => validateFinalPayload(item.nextRow.datos_nuevos, item.context))],
    ['sin_claves_prohibidas', plan
      .filter((item) => item.nextRow)
      .every((item) => !containsForbiddenKey(item.nextRow.datos_nuevos))],
    ['identificadores_text_validos', plan
      .filter((item) => item.nextRow)
      .every((item) => [item.nextRow.registro_id, item.nextRow.id_entidad]
        .every((value) => value === null || isValidTextIdentifier(value, item.context)))],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    ok: failed.length === 0,
    failed,
    counts: Object.fromEntries(assertions.map(([name, passed]) => [name, Number(passed)])),
  });
}

function sanitizeAuditHistoryRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Se esperaba un arreglo de filas de auditoría');
  const plan = rows.map(classifyAuditEvent);
  const validation = validatePlan(plan, rows.length);
  if (!validation.ok) {
    const error = new Error('Validación histórica fallida');
    error.code = 'AUDIT_HISTORY_VALIDATION_FAILED';
    error.stage = 'in_memory_validation';
    error.counts = validation.counts;
    throw error;
  }
  return Object.freeze({ plan, validation, statistics: buildStatistics(plan) });
}

module.exports = {
  ALLOWED_ACTIONS,
  AUDIT_POLICY_VERSION,
  AUDIT_SANITIZATION_VERSION,
  CLASSIFICATIONS,
  SANITIZED_DESCRIPTION,
  STRUCTURAL_COLUMNS,
  buildStatistics,
  classifyAuditEvent,
  inferContext,
  isStrictlySafeEvent,
  isValidTextIdentifier,
  sanitizeAuditHistoryRows,
  validateFinalPayload,
  validatePlan,
};
