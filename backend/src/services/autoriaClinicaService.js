const permisosRepository = require('../repositories/permisosRepository');
const profesionalesRepository = require('../repositories/profesionalesRepository');
const authSessionsRepository = require('../repositories/authSessionsRepository');
const { getSessionConfig } = require('../config/env');
const { stateOfSession } = require('./sessionService');
const { responsableSchema } = require('../validations/profesionales.schemas');
const { HttpError } = require('../utils/httpError');

const POLITICAS = Object.freeze({
  nota_evolucion: Object.freeze({ prefijo: 'notas_evolucion', captura: 'registrar', clases: ['medico'] }),
  nota_enfermeria: Object.freeze({ prefijo: 'notas_enfermeria', captura: 'registrar', clases: ['enfermeria_ae', 'enfermeria_ep'] }),
  orden_medica: Object.freeze({ prefijo: 'ordenes_medicas', captura: 'transcribir', clases: ['medico'] }),
});
const PERMISOS_DIRECTORIO = Object.freeze([
  'notas_evolucion.registrar', 'notas_evolucion.finalizar_captura',
  'notas_enfermeria.registrar', 'notas_enfermeria.finalizar_captura',
  'ordenes_medicas.transcribir', 'ordenes_medicas.finalizar_captura', 'ordenes_medicas.emitir',
]);

function error(status, code, message) { return new HttpError(status, message, { code }); }

function snapshotUsuario(persona) {
  return {
    tipo: 'usuario', usuario_id: persona.id, nombre_completo: persona.nombre_completo,
    cargo_id: persona.cargo_id, cargo_nombre: persona.cargo_nombre,
    clasificacion_profesional: persona.clasificacion_profesional,
    especialidad_id: persona.especialidad_id, especialidad_nombre: persona.especialidad_nombre,
  };
}

async function resolverResponsable({ responsable, actor, politica, db, repository }) {
  const parsed = responsableSchema.safeParse(responsable);
  if (!parsed.success) throw error(400, 'RESPONSABLE_INVALIDO', 'Identidad profesional inválida');
  const identidad = parsed.data;
  if (identidad.tipo === 'externo') {
    if (!politica.clases.includes(identidad.clasificacion_profesional)) {
      throw error(400, 'CLASIFICACION_PROFESIONAL_INVALIDA', 'El responsable no corresponde al tipo de documento');
    }
    return {
      tipo: 'externo', usuario_id: null, nombre_completo: identidad.nombre_completo,
      cargo_id: null, cargo_nombre: identidad.cargo,
      clasificacion_profesional: identidad.clasificacion_profesional,
      especialidad_id: null, especialidad_nombre: identidad.especialidad,
    };
  }
  const id = identidad.tipo === 'autenticado' ? actor.id : identidad.usuario_id;
  const persona = await repository.obtenerParaAutoria(id, db);
  if (!persona || !persona.activo || !persona.cargo_activo
    || (actor.rol !== 'director' && persona.rol === 'director')) {
    throw error(404, 'PROFESIONAL_NO_DISPONIBLE', 'Profesional no disponible');
  }
  if (!politica.clases.includes(persona.clasificacion_profesional)) {
    throw error(403, 'ATRIBUCION_CLINICA_REQUERIDA', 'El perfil profesional no corresponde al documento');
  }
  return snapshotUsuario(persona);
}

// Punto compartido: los servicios clínicos mantienen estos bloqueos hasta escribir
// y auditar. También permite conservar un responsable histórico sin reatribuirlo.
async function conContextoClinico({ req, db, dependencies = {} }, ejecutar) {
  if (!Number.isInteger(req?.usuario?.id) || !req?.authSession?.id
    || String(req.authSession.usuario_id) !== String(req.usuario.id)) {
    throw error(401, 'AUTHENTICATION_REQUIRED', 'Autenticación requerida');
  }
  const permisosRepo = dependencies.permisosRepository || permisosRepository;
  const repository = dependencies.profesionalesRepository || profesionalesRepository;
  const sessions = dependencies.authSessionsRepository || authSessionsRepository;
  const config = dependencies.getSessionConfig || getSessionConfig;
  const now = dependencies.clock || (() => new Date());
  const autorizar = async (client) => {
    // Igual orden que los cambios de rol/permisos: usuario antes de sesión.
    // SHARE serializa la decisión con bloqueo UPDATE/revocación de permisos.
    const actor = await repository.obtenerActor(req.usuario.id, client);
    const session = await sessions.obtenerConUsuarioPorId(req.authSession.id, client, { bloquear: true });
    if (!actor?.activo || !session || String(session.usuario_id) !== String(actor.id)
      || stateOfSession(session, config(), now())) {
      throw error(401, 'AUTHENTICATION_REQUIRED', 'La sesión ya no está activa');
    }
    const permisos = await permisosRepo.listarCodigosPorUsuario(actor.id, client);
    return ejecutar({ actor, permisos, db: client });
  };
  return db ? autorizar(db) : permisosRepo.enTransaccion(autorizar);
}

// Solo prepara identidades, sin guardar documentos ni conferir firma/acreditación.
// El servicio llamador comparte SU transacción para persistencia y auditoría.
async function prepararAutoriaClinica({ tipoDocumento, accion, responsable, req, db, dependencies = {} }) {
  const politica = Object.hasOwn(POLITICAS, tipoDocumento) ? POLITICAS[tipoDocumento] : null;
  const acciones = politica ? [politica.captura, 'finalizar_captura', ...(tipoDocumento === 'orden_medica' ? ['emitir'] : [])] : [];
  if (!acciones.includes(accion)) throw error(400, 'ACCION_CLINICA_INVALIDA', 'Acción o documento no soportado');
  const repository = dependencies.profesionalesRepository || profesionalesRepository;
  return conContextoClinico({ req, db, dependencies }, async ({ actor, permisos, db: client }) => {
    if (accion === 'finalizar_captura' && responsable !== undefined) {
      throw error(400, 'RESPONSABLE_NO_MODIFICABLE', 'Finalizar captura no modifica al responsable');
    }
    if (!permisos.includes(`${politica.prefijo}.${accion}`)) {
      throw error(403, 'PERMISO_REQUERIDO', 'Permiso requerido');
    }
    const comun = { tipo_documento: tipoDocumento, firma: 'manuscrita', validacion_clinica: false };
    if (accion === 'finalizar_captura') return { ...comun, finalizador_usuario_id: actor.id };
    const identidad = await resolverResponsable({ responsable, actor, politica, db: client, repository });
    if (accion === 'emitir') {
      if (identidad.tipo !== 'usuario' || identidad.usuario_id !== actor.id) {
        throw error(403, 'EMISION_PROPIA_REQUERIDA', 'Solo el médico responsable puede emitir su propia orden');
      }
      return { ...comun, responsable: identidad, emisor_usuario_id: actor.id };
    }
    return { ...comun, responsable: identidad, capturista_usuario_id: actor.id };
  });
}

module.exports = { POLITICAS, PERMISOS_DIRECTORIO, prepararAutoriaClinica, conContextoClinico };
