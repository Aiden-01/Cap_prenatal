const AUDIT_FIELD_CATEGORIES = Object.freeze({
  FULL: 'FULL',
  MASKED: 'MASKED',
  SENSITIVE: 'SENSITIVE',
  FORBIDDEN: 'FORBIDDEN',
});

const AUDIT_VALUE_TYPES = Object.freeze({
  BOOLEAN: 'BOOLEAN',
  CONTROLLED_CODE: 'CONTROLLED_CODE',
  ENUM: 'ENUM',
  ISO_DATE: 'ISO_DATE',
  NON_NEGATIVE_INTEGER: 'NON_NEGATIVE_INTEGER',
  PERMISSION_SET: 'PERMISSION_SET',
});

const POLICY_FIELDS = Object.freeze({
  personal: Object.freeze([
    'nombres',
    'apellidos',
    'nombre_completo',
    'cui',
    'telefono',
    'telefono_conyuge',
    'telefono_emergencia',
    'correo',
    'email',
    'direccion',
    'domicilio',
    'comunidad',
    'comunidad_id',
    'municipio',
    'departamento',
    'referencia_ubicacion',
    'numero_expediente',
    'historia_clinica',
  ]),
  clinical: Object.freeze([
    'diagnostico',
    'impresion_clinica',
    'tratamiento',
    'medicamento',
    'observaciones',
    'motivo_consulta',
    'historia_enfermedad_actual',
    'revision_por_sistemas',
    'examen_fisico',
    'signos_vitales',
    'pa_sistolica',
    'pa_diastolica',
    'peso_kg',
    'talla_cm',
    'edad_gestacional',
    'temperatura',
    'frecuencia_cardiaca',
    'frecuencia_respiratoria',
    'fcf',
    'altura_uterina_cm',
    'fur',
    'fpp',
    'morbilidad',
    'factores_riesgo',
    'riesgo_obstetrico',
    'vacunas',
    'puerperio',
    'plan_parto',
    'referencia_clinica',
    'narrativa_clinica',
    'notas_clinicas',
  ]),
  freeText: Object.freeze([
    'texto',
    'contenido',
    'descripcion',
    'detalle',
    'comentario',
    'comentarios',
    'mensaje',
    'nota',
    'notas',
    'observacion',
    'observaciones',
    'justificacion',
  ]),
  forbidden: Object.freeze([
    'password',
    'password_hash',
    'hash',
    'hashes',
    'token',
    'access_token',
    'refresh_token',
    'refresh_hash',
    'refresh_token_hash',
    'jwt',
    'csrf',
    'csrf_token',
    'authorization',
    'cookie',
    'cookies',
    'secret',
    'client_secret',
    'api_key',
    'credential',
    'credentials',
    'database_url',
    'env',
    'environment',
    'variables_entorno',
    'smtp_credentials',
    'automation_credentials',
  ]),
});

const DEFAULT_FORBIDDEN_PATTERNS = Object.freeze([
  /(^|_)password($|_)/,
  /(^|_)hash(es)?($|_)/,
  /(^|_)tokens?($|_)/,
  /(^|_)jwt($|_)/,
  /(^|_)csrf($|_)/,
  /(^|_)cookies?($|_)/,
  /(^|_)authorization($|_)/,
  /(^|_)secrets?($|_)/,
  /(^|_)client_secret($|_)/,
  /(^|_)api_key($|_)/,
  /(^|_)credentials?($|_)/,
  /(^|_)database_url($|_)/,
  /(^|_)(env|environment|variables?_entorno|environment_variables?)($|_)/,
  /(^|_)smtp($|_)/,
  /(^|_)automation_(user(name)?|credentials?|password|secret|token|api_key)($|_)/,
]);

const DEFAULT_PERSONAL_PATTERNS = Object.freeze([
  /(^|_)(nombres?|apellidos?|nombre_completo)($|_)/,
  /(^|_)(cui|telefonos?|correo|email|direccion|domicilio)($|_)/,
  /(^|_)(comunidad|municipio|departamento|referencia_ubicacion)($|_)/,
  /(^|_)(numero_expediente|expediente|historia_clinica)($|_)/,
]);

const DEFAULT_CLINICAL_PATTERNS = Object.freeze([
  /vih/,
  /(^|_)(laboratorio|hematologia|glicemia|grupo_rh|orina|heces|vdrl|torch)($|_)/,
  /(^|_)(papanicolau|ivaa|hepatitis|usg)($|_)/,
  /(^|_)(diagnostico|impresion_clinica|tratamiento|medicamento|antecedente)($|_)/,
  /(^|_)(signo_vital|presion|pa_sistolica|pa_diastolica|peso|talla)($|_)/,
  /(^|_)(edad_gestacional|fur|fpp|temperatura|frecuencia_cardiaca)($|_)/,
  /(^|_)(frecuencia_respiratoria|fcf|altura_uterina)($|_)/,
  /(^|_)(morbilidad|factor_riesgo|riesgo_obstetrico|vacuna|puerperio)($|_)/,
  /(^|_)(plan_parto|referencia_clinica|historia_enfermedad)($|_)/,
  /(^|_)(examen|sintoma|enfermedad|dolor|hemorragia)($|_)/,
  /(^|_)(aborto|parto|cesarea|gesta|nacido|infertilidad|cirugia)($|_)/,
  /(^|_)(movimientos_fetales|situacion_fetal|presentacion_fetal|flujo_vaginal)($|_)/,
  /(^|_)(acido_folico|sulfato_ferroso|suplementacion|orientacion)($|_)/,
]);

const DEFAULT_FREE_TEXT_PATTERNS = Object.freeze([
  /(^|_)(texto|contenido|descripcion|detalle|comentarios?|mensaje)($|_)/,
  /(^|_)(notas?|observaciones?|narrativa|justificacion)($|_)/,
]);

const BASE_CONTEXTUAL_RULES = Object.freeze([
  Object.freeze({
    categories: ['usuarios'],
    entities: ['usuario'],
    events: ['actualizar', 'usuario_actualizado', 'cambiar_rol', 'cambio_rol'],
    fields: ['rol'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['usuarios'],
    entities: ['usuario'],
    events: [
      'actualizar',
      'usuario_actualizado',
      'cambiar_estado',
      'usuario_activado',
      'usuario_desactivado',
    ],
    fields: ['activo'],
    valueType: AUDIT_VALUE_TYPES.BOOLEAN,
  }),
  Object.freeze({
    categories: ['usuarios'],
    entities: ['usuario'],
    events: ['actualizar', 'cambiar_estado'],
    fields: ['estado'],
    valueType: AUDIT_VALUE_TYPES.ENUM,
    allowedValues: ['activo', 'inactivo'],
  }),
  Object.freeze({
    categories: ['usuarios'],
    entities: ['usuario'],
    events: [
      'actualizar',
      'cambiar_password',
      'restablecer_password',
      'password_cambiado',
      'password_reiniciado',
    ],
    fields: ['password_cambiado'],
    valueType: AUDIT_VALUE_TYPES.BOOLEAN,
  }),
  Object.freeze({
    categories: ['usuarios', 'permisos'],
    entities: ['usuario', 'usuario_permisos'],
    events: [
      'actualizar',
      'asignar_permisos',
      'retirar_permisos',
      'permisos_reemplazados',
      'permisos_agregados',
      'permisos_retirados',
    ],
    fields: ['permisos'],
    valueType: AUDIT_VALUE_TYPES.PERMISSION_SET,
  }),
  Object.freeze({
    categories: ['usuarios'],
    entities: ['usuario'],
    events: ['actualizar', 'cambiar_rol', 'cambiar_estado', 'restablecer_password'],
    fields: ['motivo_codigo'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['clinica'],
    entities: ['embarazo'],
    events: ['actualizar', 'cambiar_estado', 'cerrar', 'iniciar_puerperio'],
    fields: ['estado_embarazo'],
    valueType: AUDIT_VALUE_TYPES.ENUM,
    allowedValues: ['activo', 'puerperio', 'cerrado'],
  }),
  Object.freeze({
    categories: ['seguridad', 'autenticacion', 'sesiones'],
    entities: ['sesion', 'usuario'],
    events: [
      'autenticar',
      'login',
      'login_exitoso',
      'login_fallido',
      'login_usuario_inactivo',
      'logout',
      'logout_all',
      'revocar',
      'expirar',
      'actualizar',
      'sesion_creada',
      'sesion_revocada',
      'sesiones_revocadas',
      'sesion_inactiva',
      'sesion_expirada',
      'reutilizacion_refresh_detectada',
    ],
    fields: ['resultado', 'motivo_codigo'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['seguridad', 'autenticacion'],
    entities: ['usuario'],
    events: [
      'autenticar',
      'login',
      'login_exitoso',
      'login_fallido',
      'login_usuario_inactivo',
      'logout',
      'logout_all',
    ],
    fields: ['metodo', 'categoria_autenticacion'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['seguridad', 'autenticacion', 'sesiones'],
    entities: ['sesion', 'usuario'],
    events: [
      'autenticar',
      'login',
      'login_exitoso',
      'login_fallido',
      'login_usuario_inactivo',
      'logout',
      'logout_all',
      'revocar',
      'expirar',
      'actualizar',
      'sesion_creada',
      'sesion_revocada',
      'sesiones_revocadas',
      'sesion_inactiva',
      'sesion_expirada',
      'reutilizacion_refresh_detectada',
    ],
    fields: [
      'sesion_creada',
      'sesion_revocada',
      'sesion_expirada',
      'usuario_inactivo',
      'reutilizacion_detectada',
    ],
    valueType: AUDIT_VALUE_TYPES.BOOLEAN,
  }),
  Object.freeze({
    categories: ['sesiones'],
    entities: ['sesion', 'usuario'],
    events: ['sesiones_revocadas', 'logout_all'],
    fields: ['cantidad_sesiones_revocadas'],
    valueType: AUDIT_VALUE_TYPES.NON_NEGATIVE_INTEGER,
  }),
  Object.freeze({
    categories: ['documentos'],
    entities: ['documento', 'exportacion'],
    events: ['crear', 'generar', 'exportar', 'descargar', 'pdf_clinico_generado'],
    fields: ['tipo_documento', 'formato', 'resultado', 'motivo_codigo'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['reportes'],
    entities: ['reporte', 'exportacion'],
    events: [
      'generar',
      'exportar',
      'descargar',
      'consultar',
      'excel_generado',
      'reporte_pdf_generado',
      'exportacion_censo',
    ],
    fields: ['tipo_reporte', 'formato', 'resultado', 'motivo_codigo'],
    valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
  }),
  Object.freeze({
    categories: ['documentos', 'reportes'],
    entities: ['documento', 'reporte', 'exportacion'],
    events: [
      'crear',
      'generar',
      'exportar',
      'descargar',
      'consultar',
      'pdf_clinico_generado',
      'excel_generado',
      'reporte_pdf_generado',
      'exportacion_censo',
    ],
    fields: ['cantidad_filas'],
    valueType: AUDIT_VALUE_TYPES.NON_NEGATIVE_INTEGER,
  }),
  Object.freeze({
    categories: ['documentos', 'reportes'],
    entities: ['documento', 'reporte', 'exportacion'],
    events: [
      'crear',
      'generar',
      'exportar',
      'descargar',
      'consultar',
      'pdf_clinico_generado',
      'excel_generado',
      'reporte_pdf_generado',
      'exportacion_censo',
    ],
    fields: ['desde', 'hasta', 'fecha_desde', 'fecha_hasta'],
    valueType: AUDIT_VALUE_TYPES.ISO_DATE,
  }),
]);

const SENSITIVE_RULE = Object.freeze({ category: AUDIT_FIELD_CATEGORIES.SENSITIVE });
const FORBIDDEN_RULE = Object.freeze({ category: AUDIT_FIELD_CATEGORIES.FORBIDDEN });

function normalizeFieldName(fieldName) {
  return String(fieldName ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase();
}

function normalizedSet(values = []) {
  return new Set(values.map(normalizeFieldName).filter(Boolean));
}

function matchesAnyPattern(fieldName, patterns) {
  return patterns.some((pattern) => pattern instanceof RegExp && pattern.test(fieldName));
}

function normalizeAuditContext(context = {}) {
  const normalized = {
    categoria: normalizeFieldName(context.categoria),
    entidad: normalizeFieldName(context.entidad),
    evento: normalizeFieldName(context.evento),
  };
  normalized.completo = Boolean(normalized.categoria && normalized.entidad && normalized.evento);
  return Object.freeze(normalized);
}

function compileRule(rule) {
  return Object.freeze({
    category: AUDIT_FIELD_CATEGORIES.FULL,
    categories: normalizedSet(rule.categories),
    entities: normalizedSet(rule.entities),
    events: normalizedSet(rule.events),
    fields: normalizedSet(rule.fields),
    valueType: rule.valueType,
    allowedValues: rule.allowedValues
      ? Object.freeze([...normalizedSet(rule.allowedValues)])
      : undefined,
  });
}

function matchesContextualRule(rule, fieldName, context) {
  return rule.fields.has(fieldName)
    && rule.categories.has(context.categoria)
    && rule.entities.has(context.entidad)
    && rule.events.has(context.evento);
}

function isForbiddenName(fieldName) {
  if (!fieldName || fieldName === 'password_cambiado') return false;
  return POLICY_FIELDS.forbidden.includes(fieldName)
    || matchesAnyPattern(fieldName, DEFAULT_FORBIDDEN_PATTERNS);
}

function isPatientPersonalField(fieldName, context) {
  const patientContext = context.entidad === 'paciente' || context.categoria === 'clinica';
  return patientContext && (
    POLICY_FIELDS.personal.includes(fieldName)
    || matchesAnyPattern(fieldName, DEFAULT_PERSONAL_PATTERNS)
  );
}

function isClinicalOrFreeTextField(fieldName) {
  return POLICY_FIELDS.clinical.includes(fieldName)
    || POLICY_FIELDS.freeText.includes(fieldName)
    || matchesAnyPattern(fieldName, DEFAULT_CLINICAL_PATTERNS)
    || matchesAnyPattern(fieldName, DEFAULT_FREE_TEXT_PATTERNS);
}

function createAuditFieldPolicy({ rules = [] } = {}) {
  const baseRules = BASE_CONTEXTUAL_RULES.map(compileRule);
  const extensionRules = rules.map(compileRule);

  return Object.freeze({
    resolveRule(fieldName, rawContext = {}) {
      const normalized = normalizeFieldName(fieldName);
      const context = normalizeAuditContext(rawContext);
      if (!normalized) return SENSITIVE_RULE;
      if (isForbiddenName(normalized)) return FORBIDDEN_RULE;
      if (!context.completo) return SENSITIVE_RULE;

      const baseRule = baseRules.find((rule) => matchesContextualRule(rule, normalized, context));
      if (baseRule) return baseRule;

      if (isPatientPersonalField(normalized, context) || isClinicalOrFreeTextField(normalized)) {
        return SENSITIVE_RULE;
      }

      const extensionRule = extensionRules.find(
        (rule) => matchesContextualRule(rule, normalized, context)
      );
      return extensionRule || SENSITIVE_RULE;
    },
  });
}

const defaultAuditFieldPolicy = createAuditFieldPolicy();

function resolveFieldRule(fieldName, context = {}, policy = defaultAuditFieldPolicy) {
  return policy.resolveRule(fieldName, context);
}

function resolveFieldPolicy(fieldName, context = {}, policy = defaultAuditFieldPolicy) {
  return resolveFieldRule(fieldName, context, policy).category;
}

function isForbiddenField(fieldName, policy = defaultAuditFieldPolicy) {
  return resolveFieldRule(fieldName, {}, policy).category === AUDIT_FIELD_CATEGORIES.FORBIDDEN;
}

function normalizeControlledCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.:-]{0,99}$/.test(normalized) ? normalized : null;
}

function normalizeIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function normalizePermissionSet(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value.map(normalizeControlledCode);
  if (normalized.some((item) => item === null)) return null;
  if (normalized.some((item) => !/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(item))) {
    return null;
  }
  return [...new Set(normalized)].sort();
}

function normalizeAllowedAuditValue(rule, value) {
  if (value === null || value === undefined) return { valid: true, value: null };
  if (!rule || rule.category !== AUDIT_FIELD_CATEGORIES.FULL) {
    return { valid: false, value: null };
  }

  switch (rule.valueType) {
    case AUDIT_VALUE_TYPES.BOOLEAN:
      return typeof value === 'boolean'
        ? { valid: true, value }
        : { valid: false, value: null };
    case AUDIT_VALUE_TYPES.CONTROLLED_CODE: {
      const normalized = normalizeControlledCode(value);
      return normalized === null
        ? { valid: false, value: null }
        : { valid: true, value: normalized };
    }
    case AUDIT_VALUE_TYPES.ENUM: {
      const normalized = normalizeControlledCode(value);
      return normalized !== null
        && Array.isArray(rule.allowedValues)
        && rule.allowedValues.includes(normalized)
        ? { valid: true, value: normalized }
        : { valid: false, value: null };
    }
    case AUDIT_VALUE_TYPES.ISO_DATE: {
      const normalized = normalizeIsoDate(value);
      return normalized === null
        ? { valid: false, value: null }
        : { valid: true, value: normalized };
    }
    case AUDIT_VALUE_TYPES.NON_NEGATIVE_INTEGER:
      return Number.isSafeInteger(value) && value >= 0
        ? { valid: true, value }
        : { valid: false, value: null };
    case AUDIT_VALUE_TYPES.PERMISSION_SET: {
      const normalized = normalizePermissionSet(value);
      return normalized === null
        ? { valid: false, value: null }
        : { valid: true, value: normalized };
    }
    default:
      return { valid: false, value: null };
  }
}

module.exports = {
  AUDIT_FIELD_CATEGORIES,
  AUDIT_VALUE_TYPES,
  BASE_CONTEXTUAL_RULES,
  POLICY_FIELDS,
  createAuditFieldPolicy,
  defaultAuditFieldPolicy,
  isForbiddenField,
  normalizeAllowedAuditValue,
  normalizeAuditContext,
  normalizeFieldName,
  resolveFieldPolicy,
  resolveFieldRule,
};
