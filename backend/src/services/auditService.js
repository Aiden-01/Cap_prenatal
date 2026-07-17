const pool = require('../db/pool');
const auditRepository = require('../repositories/auditRepository');
const {
  buildAuditPayload,
  hasAuditPayload,
} = require('./audit/auditDiffBuilder');
const {
  normalizeAuditContext,
  normalizeFieldName,
} = require('./audit/auditFieldPolicy');
const { sanitizeAuditValue } = require('./audit/auditSanitizer');

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'csrfToken',
  'csrf_token',
  'authorization',
  'cookie',
]);

const MODULO_POR_ENTIDAD = {
  pacientes: 'pacientes',
  embarazos: 'pacientes',
  controles_prenatales: 'controles_prenatales',
  controles_puerperio: 'puerperio',
  vacunas_paciente: 'vacunas',
  morbilidad_embarazo: 'morbilidad',
  fichas_riesgo_obstetrico: 'riesgo_obstetrico',
  planes_parto: 'plan_parto',
  referencias_efectuadas: 'referencias',
  usuario_permisos: 'permisos',
  usuarios: 'usuarios',
  comunidades: 'comunidades',
};

const PRIVATE_ACTIONS = new Set([
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

const PRIVATE_MODULES = Object.freeze({
  autenticacion: 'autenticacion',
  seguridad: 'autenticacion',
  usuarios: 'usuarios',
  permisos: 'permisos',
  sesiones: 'autenticacion',
  documentos: 'documentos',
  reportes: 'reportes',
  clinica: 'pacientes',
});

const PRIVATE_TABLES = Object.freeze({
  usuario: 'usuarios',
  usuario_permisos: 'usuario_permisos',
  sesion: 'auth_sessions',
  documento: 'documentos',
  reporte: 'reportes',
  exportacion: 'reportes',
  paciente: 'pacientes',
  embarazo: 'embarazos',
});

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[REDACTED]' : sanitize(entry),
    ])
  );
}

function requestMeta(req = {}) {
  return {
    ip: req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null,
    userAgent: req.headers?.['user-agent'] || null,
  };
}

function normalizeEvent(req, event) {
  const entidad = event.entidadAfectada || event.entidad_afectada || event.tabla;
  const idEntidad = event.idEntidad || event.id_entidad || event.registroId || event.registro_id || null;
  const modulo = event.modulo || MODULO_POR_ENTIDAD[entidad] || entidad || 'general';
  const { ip, userAgent } = requestMeta(req);

  return {
    usuarioId: event.usuarioId || event.usuario_id || req?.usuario?.id || null,
    accion: event.accion,
    modulo,
    entidadAfectada: entidad,
    idEntidad,
    tabla: event.tabla || entidad,
    registroId: event.registroId || event.registro_id || idEntidad,
    pacienteId: event.pacienteId || event.paciente_id || null,
    embarazoId: event.embarazoId || event.embarazo_id || null,
    datosAnteriores: event.datosAnteriores || event.datos_anteriores || null,
    datosNuevos: event.datosNuevos || event.datos_nuevos || null,
    ip: event.ip || ip,
    userAgent: event.userAgent || event.user_agent || userAgent,
    descripcion: event.descripcion || null,
  };
}

async function registrarEvento(req, event, { db = pool, obligatorio = false } = {}) {
  const auditEvent = normalizeEvent(req, event);

  try {
    await db.query(
      `INSERT INTO auditoria_eventos (
        usuario_id, accion, modulo, entidad_afectada, id_entidad,
        tabla, registro_id, paciente_id, embarazo_id,
        datos_anteriores, datos_nuevos, ip, user_agent, descripcion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        auditEvent.usuarioId,
        auditEvent.accion,
        auditEvent.modulo,
        auditEvent.entidadAfectada,
        auditEvent.idEntidad ? String(auditEvent.idEntidad) : null,
        auditEvent.tabla,
        auditEvent.registroId ? String(auditEvent.registroId) : null,
        auditEvent.pacienteId,
        auditEvent.embarazoId,
        auditEvent.datosAnteriores ? sanitize(auditEvent.datosAnteriores) : null,
        auditEvent.datosNuevos ? sanitize(auditEvent.datosNuevos) : null,
        auditEvent.ip,
        auditEvent.userAgent,
        auditEvent.descripcion,
      ]
    );
  } catch (err) {
    console.warn('[audit] No se pudo registrar auditoria:', err.message);
    if (obligatorio) throw err;
  }
}

function assertPrivateContext(rawContext) {
  const context = normalizeAuditContext(rawContext);
  if (!context.completo) {
    throw new TypeError('La auditoria privada requiere categoria, entidad y evento');
  }
  if (!PRIVATE_MODULES[context.categoria] || !PRIVATE_TABLES[context.entidad]) {
    throw new TypeError('Contexto de auditoria privada no soportado');
  }
  return context;
}

function normalizePrivateId(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^[a-zA-Z0-9-]{1,100}$/.test(trimmed) ? trimmed : null;
  }
  return null;
}

function normalizePrivateEvent(req, event, context, payload) {
  const accion = normalizeFieldName(event.accion);
  if (!PRIVATE_ACTIONS.has(accion)) throw new TypeError('Accion de auditoria privada no soportada');

  const idEntidad = normalizePrivateId(event.entidadId ?? event.idEntidad ?? event.registroId);
  return {
    usuarioId: normalizePrivateId(event.usuarioId ?? req?.usuario?.id),
    accion,
    modulo: PRIVATE_MODULES[context.categoria],
    entidadAfectada: context.entidad,
    idEntidad,
    tabla: PRIVATE_TABLES[context.entidad],
    registroId: idEntidad,
    pacienteId: normalizePrivateId(event.pacienteId),
    embarazoId: normalizePrivateId(event.embarazoId),
    datosAnteriores: null,
    datosNuevos: sanitizeAuditValue(payload),
    ip: null,
    userAgent: null,
    descripcion: context.evento,
  };
}

async function registrarEventoPrivado(req, event, {
  db = pool,
  obligatorio = false,
  repository = auditRepository,
} = {}) {
  const context = assertPrivateContext(event?.contexto);
  const payload = buildAuditPayload({
    previous: event?.cambios?.anteriores,
    next: event?.cambios?.nuevos,
    metadata: event?.metadata,
  }, { context });

  if (!hasAuditPayload(payload)) return false;
  const auditEvent = normalizePrivateEvent(req, event, context, payload);

  try {
    await repository.insertarEvento(auditEvent, db);
    return true;
  } catch (err) {
    console.warn('[audit] No se pudo registrar auditoria privada:', err.message);
    if (obligatorio) throw err;
    return false;
  }
}

module.exports = {
  registrarEvento,
  registrarEventoPrivado,
  sanitize,
};
