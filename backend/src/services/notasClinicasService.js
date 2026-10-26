const crypto = require('node:crypto');
const notasRepository = require('../repositories/notasClinicasRepository');
const autoriaService = require('./autoriaClinicaService');
const { registrarEventoPrivado } = require('./auditService');
const { validarEmbarazoEditable } = require('../utils/embarazos');
const { HttpError } = require('../utils/httpError');
const { notaCreateSchema, notaUpdateSchema, notaFinalizeSchema, notaListQuerySchema,
  notaPacienteParamsSchema, notaIdParamsSchema } = require('../validations/notasClinicas.schemas');

const PREFIJOS = Object.freeze({ nota_evolucion: 'notas_evolucion', nota_enfermeria: 'notas_enfermeria' });
const PUBLICOS = ['id', 'paciente_id', 'embarazo_id', 'control_prenatal_id', 'tipo', 'fecha_atencion',
  'hora_atencion', 'estado', 'es_principal', 'responsable_usuario_id', 'responsable_snapshot',
  'capturista_usuario_id', 'finalizador_usuario_id', 'created_at', 'updated_at', 'finalizada_at', 'version'];
const CONFIRMACION = ['id', 'paciente_id', 'tipo', 'estado', 'version', 'created_at', 'updated_at', 'finalizada_at'];
const seleccionar = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
const confirmar = row => seleccionar(row, CONFIRMACION);
const error = (status, code, message) => new HttpError(status, message, { code });
const noEncontrada = () => error(404, 'NOTA_NO_ENCONTRADA', 'Nota no encontrada para esta paciente');

function permiso(permisos, tipo, accion) {
  if (!Object.hasOwn(PREFIJOS, tipo) || !permisos.includes(`${PREFIJOS[tipo]}.${accion}`)) {
    throw error(403, 'PERMISO_REQUERIDO', 'Permiso requerido para este tipo de nota');
  }
}

function exigirExpediente(permisos) {
  if (!permisos.includes('pacientes.ver')) throw error(403, 'PERMISO_REQUERIDO', 'Permiso requerido para acceder al expediente');
}

function recursos(dependencies) {
  return { repository: dependencies.notasClinicasRepository || notasRepository,
    autoria: dependencies.autoriaClinicaService || autoriaService,
    audit: dependencies.registrarEventoPrivado || registrarEventoPrivado };
}

async function conContexto({ req, dependencies }, ejecutar) {
  const { repository, autoria } = recursos(dependencies);
  return repository.enTransaccion(db => autoria.conContextoClinico({ req, db, dependencies }, async context => {
    exigirExpediente(context.permisos);
    return ejecutar({ ...context, repository, autoria });
  }));
}

async function exigirPaciente(pacienteId, repository, db) {
  if (!await repository.obtenerPaciente(pacienteId, db)) throw error(404, 'PACIENTE_NO_ENCONTRADA', 'Paciente no encontrada');
}

// Respeta el orden de bloqueos de controles: embarazo antes del control. La
// primera consulta de control solo permite derivar su contexto, sin bloquearlo.
async function resolverContexto({ pacienteId, embarazoId, controlId, embarazoExplicito, escritura, repository, db, dependencies }) {
  await exigirPaciente(pacienteId, repository, db);
  let embarazo = embarazoId ?? null;
  let control;
  if (controlId) {
    control = await repository.obtenerControl(controlId, db);
    if (!control || control.paciente_id !== pacienteId) throw error(404, 'CONTROL_NO_ENCONTRADO', 'Control no encontrado para esta paciente');
    if (!control.embarazo_id || (embarazoExplicito && embarazo !== control.embarazo_id)) {
      throw error(400, 'CONTEXTO_NOTA_INVALIDO', 'El control debe corresponder al embarazo indicado');
    }
    embarazo = control.embarazo_id;
  }
  if (embarazo) {
    if (escritura) {
      const validar = dependencies.validarEmbarazoEditable || validarEmbarazoEditable;
      await validar({ pacienteId, embarazoId: embarazo, db, bloquear: true });
    } else {
      const record = await repository.obtenerEmbarazo(embarazo, db, { bloquear: false });
      if (!record || record.paciente_id !== pacienteId) throw error(404, 'PREGNANCY_NOT_FOUND', 'Embarazo no encontrado para esta paciente');
    }
  }
  if (control && escritura) {
    const vigente = await repository.obtenerControl(controlId, db, { bloquear: true });
    if (!vigente || vigente.paciente_id !== pacienteId || vigente.embarazo_id !== embarazo) {
      throw error(409, 'CONTEXTO_NOTA_CAMBIO', 'Cambió el contexto del control. Vuelve a consultar el expediente.');
    }
  }
  return { embarazo_id: embarazo, control_prenatal_id: controlId ?? null };
}

function comprobarBorrador(row, version) {
  if (row.estado !== 'borrador') throw error(409, 'NOTA_FINALIZADA', 'La captura está finalizada y no admite modificaciones');
  if (row.version !== version) throw conflictoVersion();
}

function conflictoVersion() {
  return error(409, 'NOTA_VERSION_CONFLICT', 'Otra persona modificó la nota. Recupera la versión más reciente antes de guardar.');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function huellaSolicitud(pacienteId, body, principal) {
  const data = { paciente_id: pacienteId, tipo: body.tipo, embarazo_id: body.embarazo_id ?? null,
    control_prenatal_id: body.control_prenatal_id ?? null, es_principal: principal,
    fecha_atencion: body.fecha_atencion ?? null, hora_atencion: body.hora_atencion ?? null,
    contenido: body.contenido, responsable: body.responsable };
  // Solo DB interna, jamás respuesta/auditoría: reconoce reintentos del mismo capturista.
  return crypto.createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
}

function replay(row, hash) {
  if (row.solicitud_hash !== hash) throw error(409, 'NOTA_IDEMPOTENCIA_CONFLICT', 'Esta clave de idempotencia ya corresponde a otra solicitud');
  return { nota: confirmar(row), reutilizada: true };
}

async function auditar({ req, evento, before, after, responsableCambiado = false, db, audit }) {
  const campos = row => row ? { estado_nota: row.estado, version: row.version,
    responsable_usuario_id: row.responsable_usuario_id,
    capturista_usuario_id: row.capturista_usuario_id, finalizador_usuario_id: row.finalizador_usuario_id } : null;
  await audit(req, {
    contexto: { categoria: 'clinica', entidad: 'nota_clinica', evento },
    accion: evento === 'finalizar_captura' ? 'estado' : evento,
    entidadId: after.id, pacienteId: after.paciente_id, embarazoId: after.embarazo_id,
    cambios: { anteriores: campos(before), nuevos: campos(after) },
    metadata: { resultado: 'exitoso', tipo_nota: after.tipo,
      ...(evento === 'actualizar' ? { responsable_cambiado: responsableCambiado } : {}) },
  }, { db, obligatorio: true });
}

async function listarNotas({ pacienteId, query = {}, req, dependencies = {} }) {
  ({ pacienteId } = notaPacienteParamsSchema.parse({ pacienteId }));
  query = notaListQuerySchema.parse(query);
  return conContexto({ req, dependencies }, async ({ permisos, repository, db }) => {
    const tipos = Object.keys(PREFIJOS).filter(tipo => permisos.includes(`${PREFIJOS[tipo]}.ver`));
    if (query.tipo) permiso(permisos, query.tipo, 'ver');
    if (!tipos.length) throw error(403, 'PERMISO_REQUERIDO', 'Permiso requerido para consultar notas');
    await resolverContexto({ pacienteId, embarazoId: query.embarazo_id, controlId: query.control_prenatal_id,
      embarazoExplicito: query.embarazo_id !== undefined, escritura: false, repository, db, dependencies });
    const result = await repository.listarPorPaciente({ pacienteId, tipos: query.tipo ? [query.tipo] : tipos,
      embarazoId: query.embarazo_id, controlPrenatalId: query.control_prenatal_id,
      estado: query.estado, pagina: query.pagina, limite: query.limite }, db);
    return { ...result, data: result.data.map(row => seleccionar(row, PUBLICOS)) };
  });
}

async function obtenerNota({ pacienteId, notaId, req, dependencies = {} }) {
  ({ pacienteId, notaId } = notaIdParamsSchema.parse({ pacienteId, notaId }));
  return conContexto({ req, dependencies }, async ({ permisos, repository, db }) => {
    const row = await repository.obtenerPorId(notaId, db);
    if (!row || row.paciente_id !== pacienteId) throw noEncontrada();
    permiso(permisos, row.tipo, 'ver');
    return seleccionar(row, [...PUBLICOS, 'contenido']);
  });
}

async function crearBorrador({ pacienteId, body, req, dependencies = {} }) {
  ({ pacienteId } = notaPacienteParamsSchema.parse({ pacienteId }));
  body = notaCreateSchema.parse(body);
  const principal = body.es_principal ?? Boolean(body.control_prenatal_id);
  if (principal && !body.control_prenatal_id) throw error(400, 'CONTEXTO_NOTA_INVALIDO', 'Una nota principal requiere control prenatal');
  if (body.control_prenatal_id && body.embarazo_id === null) throw error(400, 'CONTEXTO_NOTA_INVALIDO', 'El control requiere su embarazo correspondiente');
  const hash = huellaSolicitud(pacienteId, body, principal);
  try {
    return await conContexto({ req, dependencies }, async ({ actor, permisos, repository, autoria, db }) => {
      permiso(permisos, body.tipo, 'registrar');
      const anterior = await repository.obtenerPorClaveIdempotencia(actor.id, body.clave_idempotencia, db);
      if (anterior) return replay(anterior, hash);
      const contexto = await resolverContexto({ pacienteId, embarazoId: body.embarazo_id, controlId: body.control_prenatal_id,
        embarazoExplicito: Object.hasOwn(body, 'embarazo_id'), escritura: true, repository, db, dependencies });
      const identidad = await autoria.prepararAutoriaClinica({ tipoDocumento: body.tipo, accion: 'registrar',
        responsable: body.responsable, req, db, dependencies });
      const row = await repository.crear({ paciente_id: pacienteId, ...contexto, tipo: body.tipo,
        fecha_atencion: body.fecha_atencion ?? null, hora_atencion: body.hora_atencion ?? null,
        contenido: body.contenido, es_principal: principal, responsable_usuario_id: identidad.responsable.usuario_id,
        responsable_snapshot: identidad.responsable, capturista_usuario_id: identidad.capturista_usuario_id,
        clave_idempotencia: body.clave_idempotencia, solicitud_hash: hash }, db);
      if (!row) {
        const existente = await repository.obtenerPorClaveIdempotencia(actor.id, body.clave_idempotencia, db);
        if (!existente) throw conflictoVersion();
        return replay(existente, hash);
      }
      await auditar({ req, evento: 'crear', after: row, db, audit: recursos(dependencies).audit });
      return { nota: confirmar(row), reutilizada: false };
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'ux_notas_clinicas_control_tipo_principal') {
      throw error(409, 'NOTA_PRINCIPAL_EXISTENTE', 'Ya existe una nota principal de este tipo para el control');
    }
    throw err;
  }
}

async function mutarBorrador({ pacienteId, notaId, body, req, dependencies, finalizar }) {
  return conContexto({ req, dependencies }, async ({ permisos, repository, autoria, db }) => {
    const preliminar = await repository.obtenerPorId(notaId, db);
    if (!preliminar || preliminar.paciente_id !== pacienteId) throw noEncontrada();
    permiso(permisos, preliminar.tipo, finalizar ? 'finalizar_captura' : 'registrar');
    await resolverContexto({ pacienteId, embarazoId: preliminar.embarazo_id,
      controlId: preliminar.control_prenatal_id, embarazoExplicito: true,
      escritura: true, repository, db, dependencies });
    const before = await repository.obtenerPorId(notaId, db, { bloquear: true });
    if (!before || before.paciente_id !== pacienteId) throw noEncontrada();
    comprobarBorrador(before, body.version);
    let after;
    if (finalizar) {
      if (!before.fecha_atencion || !before.hora_atencion || !before.contenido?.trim()) {
        throw error(400, 'NOTA_INCOMPLETA', 'Completa fecha, hora y contenido de la atención antes de finalizar');
      }
      const identidad = await autoria.prepararAutoriaClinica({ tipoDocumento: before.tipo,
        accion: 'finalizar_captura', req, db, dependencies });
      after = await repository.finalizarCaptura({ id: notaId, version: body.version,
        finalizadorUsuarioId: identidad.finalizador_usuario_id }, db);
    } else {
      const data = seleccionar(body, ['fecha_atencion', 'hora_atencion', 'contenido']);
      if (body.responsable !== undefined) {
        const identidad = await autoria.prepararAutoriaClinica({ tipoDocumento: before.tipo, accion: 'registrar',
          responsable: body.responsable, req, db, dependencies });
        data.responsable_usuario_id = identidad.responsable.usuario_id;
        data.responsable_snapshot = identidad.responsable;
      }
      after = await repository.actualizarBorrador({ id: notaId, version: body.version, ...data }, db);
    }
    if (!after) throw conflictoVersion();
    await auditar({ req, evento: finalizar ? 'finalizar_captura' : 'actualizar', before, after,
      responsableCambiado: body.responsable !== undefined, db, audit: recursos(dependencies).audit });
    return confirmar(after);
  });
}

async function actualizarBorrador({ pacienteId, notaId, body, req, dependencies = {} }) {
  ({ pacienteId, notaId } = notaIdParamsSchema.parse({ pacienteId, notaId }));
  body = notaUpdateSchema.parse(body);
  return mutarBorrador({ pacienteId, notaId, body, req, dependencies, finalizar: false });
}

async function finalizarCaptura({ pacienteId, notaId, body, req, dependencies = {} }) {
  ({ pacienteId, notaId } = notaIdParamsSchema.parse({ pacienteId, notaId }));
  body = notaFinalizeSchema.parse(body);
  return mutarBorrador({ pacienteId, notaId, body, req, dependencies, finalizar: true });
}

async function obtenerNotaParaPdf({ pacienteId, notaId, req, dependencies = {} }) {
  ({ pacienteId, notaId } = notaIdParamsSchema.parse({ pacienteId, notaId }));
  return conContexto({ req, dependencies }, async ({ permisos, repository, db }) => {
    const row = await repository.obtenerPorId(notaId, db);
    if (!row || row.paciente_id !== pacienteId) throw noEncontrada();
    permiso(permisos, row.tipo, 'ver');
    const contexto = await repository.obtenerPacientePdf(pacienteId, db,
      { controlId: row.control_prenatal_id, embarazoId: row.embarazo_id });
    const paciente = contexto && seleccionar(contexto, ['id', 'nombres', 'apellidos', 'no_expediente']);
    if (!paciente) throw noEncontrada();
    return { nota: seleccionar(row, [...PUBLICOS, 'contenido']), paciente,
      control: contexto.control_numero != null || contexto.control_fecha != null
        ? { numero: contexto.control_numero, fecha: contexto.control_fecha } : null };
  });
}

module.exports = { listarNotas, obtenerNota, crearBorrador, actualizarBorrador, finalizarCaptura, obtenerNotaParaPdf };
