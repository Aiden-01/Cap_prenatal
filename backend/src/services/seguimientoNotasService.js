const repository = require('../repositories/seguimientoNotasRepository');
const notas = require('../repositories/notasClinicasRepository');
const autoria = require('./autoriaClinicaService');
const { registrarEventoPrivado } = require('./auditService');
const { validarEmbarazoEditable } = require('../utils/embarazos');
const { HttpError } = require('../utils/httpError');
const { paramsSchema, controlParamsSchema, querySchema, bodySchema } = require('../validations/seguimientoNotas.schemas');
const PREFIJOS = { nota_evolucion: 'notas_evolucion', nota_enfermeria: 'notas_enfermeria' };
const error = (status, code, message) => new HttpError(status, message, { code });

async function contexto(req, dependencies, action) {
  const repo = dependencies.repository || repository;
  return repo.enTransaccion(db => autoria.conContextoClinico({ req, db, dependencies }, async context => {
    if (!context.permisos.includes('pacientes.ver')) throw error(403, 'PERMISO_REQUERIDO', 'Permiso requerido para el expediente');
    return action({ ...context, repo, db });
  }));
}

async function listar({ pacienteId, query, req, dependencies = {} }) {
  ({ pacienteId } = paramsSchema.parse({ pacienteId }));
  query = querySchema.parse(query);
  return contexto(req, dependencies, async ({ permisos, repo, db }) => {
    const tipos = Object.keys(PREFIJOS).filter(tipo => permisos.includes(`${PREFIJOS[tipo]}.ver`));
    if (!tipos.length) throw error(403, 'PERMISO_REQUERIDO', 'Permiso de lectura documental requerido');
    const embarazo = await (dependencies.notas || notas).obtenerEmbarazo(query.embarazo_id, db, { bloquear: false });
    if (!embarazo || embarazo.paciente_id !== pacienteId) throw error(404, 'PREGNANCY_NOT_FOUND', 'Embarazo no encontrado para esta paciente');
    const rows = await repo.listar({ pacienteId, embarazoId: query.embarazo_id, ids: query.controles_ids, tipos }, db);
    if (new Set(rows.map(row => row.control_prenatal_id)).size !== query.controles_ids.length) {
      throw error(404, 'CONTROL_NO_ENCONTRADO', 'Control no encontrado en el contexto solicitado');
    }
    const data = new Map();
    for (const row of rows) {
      if (!data.has(row.control_prenatal_id)) data.set(row.control_prenatal_id, {
        control_prenatal_id: row.control_prenatal_id, elegible: row.version !== null,
        documentos: [],
      });
      if (row.tipo) data.get(row.control_prenatal_id).documentos.push({ tipo: row.tipo,
        estado: row.estado_nota || 'pendiente', nota_id: row.nota_id, nota_version: row.nota_version,
        responsable_previsto: row.responsable_previsto, responsable_nota: row.responsable_nota });
    }
    return { data: [...data.values()], tipos_autorizados: tipos };
  });
}

async function confirmar({ pacienteId, controlId, body, req, dependencies = {} }) {
  ({ pacienteId, id: controlId } = controlParamsSchema.parse({ pacienteId, id: controlId }));
  body = bodySchema.parse(body);
  return contexto(req, dependencies, async ({ permisos, actor, repo, db }) => {
    const prefijo = PREFIJOS[body.tipo];
    if (!permisos.includes(`${prefijo}.ver`) || !permisos.includes(`${prefijo}.registrar`)) {
      throw error(403, 'PERMISO_REQUERIDO', 'Se requiere lectura y registro de este tipo documental');
    }
    const control = await (dependencies.notas || notas).obtenerControl(controlId, db);
    if (!control || control.paciente_id !== pacienteId || control.embarazo_id !== body.embarazo_id) {
      throw error(404, 'CONTROL_NO_ENCONTRADO', 'Control no encontrado en el contexto solicitado');
    }
    await (dependencies.validarEmbarazoEditable || validarEmbarazoEditable)({ pacienteId, embarazoId: body.embarazo_id, db, bloquear: true });
    const seguimiento = await repo.bloquear(controlId, db);
    if (!seguimiento) throw error(409, 'CONTROL_HISTORICO', 'Este control histórico no activa pendientes documentales');
    const existente = await repo.obtenerRequerimiento(controlId, body.tipo, db);
    if (existente) {
      const identity = body.responsable;
      const snapshot = existente.responsable_snapshot;
      const mismo = identity.tipo === 'autenticado' ? snapshot.usuario_id === actor.id
        : identity.tipo === 'usuario' ? snapshot.usuario_id === identity.usuario_id
          : snapshot.tipo === 'externo' && snapshot.nombre_completo === identity.nombre_completo
            && snapshot.cargo_nombre === identity.cargo && snapshot.especialidad_nombre === identity.especialidad
            && snapshot.clasificacion_profesional === identity.clasificacion_profesional;
      if (mismo) return { reutilizada: true, tipo: body.tipo };
      throw error(409, 'SEGUIMIENTO_YA_CONFIRMADO', 'El responsable de este tipo ya fue confirmado. No se reemplazará.');
    }
    // Versión por tipo: 1 significa aún no confirmado. La PK + lock serializan adiciones.
    if (body.version !== 1) throw error(409, 'SEGUIMIENTO_VERSION_CONFLICT', 'Actualiza el seguimiento antes de confirmar');
    const identidad = await autoria.prepararAutoriaClinica({ tipoDocumento: body.tipo, accion: 'registrar',
      responsable: body.responsable, req, db, dependencies });
    const result = await repo.agregar({ controlId, tipo: body.tipo, snapshot: identidad.responsable,
      actorId: actor.id, version: seguimiento.version }, db);
    if (!result) throw error(409, 'SEGUIMIENTO_VERSION_CONFLICT', 'Otra persona modificó el seguimiento');
    const registrado = await (dependencies.audit || registrarEventoPrivado)(req, {
      contexto: { categoria: 'clinica', entidad: 'control_prenatal', evento: 'seguimiento_nota_confirmado' },
      accion: 'actualizar', entidadId: controlId, pacienteId, embarazoId: body.embarazo_id,
      cambios: { nuevos: { version: result.version } },
      metadata: { resultado: 'exitoso', tipo_nota: body.tipo },
    }, { db, obligatorio: true });
    if (registrado !== true) throw error(500, 'AUDITORIA_REQUERIDA', 'No se pudo registrar la operación');
    return { reutilizada: false, tipo: body.tipo };
  });
}
module.exports = { listar, confirmar };
