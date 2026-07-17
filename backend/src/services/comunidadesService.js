const comunidadesRepository = require('../repositories/comunidadesRepository');
const { registrarEventoPrivado } = require('./auditService');
const { structurallyEqual } = require('./audit/auditDiffBuilder');
const { HttpError } = require('../utils/httpError');

const COMUNIDAD_FIELDS = ['nombre', 'territorio', 'sector', 'lat', 'lng'];
const AUDIT_CONTEXT = Object.freeze({
  crear: Object.freeze({ categoria: 'administracion', entidad: 'comunidad', evento: 'crear' }),
  actualizar: Object.freeze({
    categoria: 'administracion',
    entidad: 'comunidad',
    evento: 'actualizar',
  }),
  estado: Object.freeze({
    categoria: 'administracion',
    entidad: 'comunidad',
    evento: 'cambiar_estado',
  }),
});
const RESULTADO_EXITOSO = 'exitoso';

function auditChangesForFields(fields, action) {
  const namedFields = [...new Set(fields)].sort();
  const marker = (value) => Object.fromEntries(namedFields.map((field) => [field, value]));
  if (action === 'crear') return { nuevos: marker('registrado') };
  return {
    anteriores: marker('anterior'),
    nuevos: marker('nuevo'),
  };
}

function valoresComunidadEquivalentes(previous, next) {
  const previousEmpty = previous === null || previous === undefined || previous === '';
  const nextEmpty = next === null || next === undefined || next === '';
  if (previousEmpty || nextEmpty) return previousEmpty && nextEmpty;
  const previousNumber = Number(previous);
  const nextNumber = Number(next);
  if (Number.isFinite(previousNumber) && Number.isFinite(nextNumber)) {
    return previousNumber === nextNumber;
  }
  return structurallyEqual(previous, next);
}

function camposComunidadModificados(previous, next) {
  return COMUNIDAD_FIELDS.filter(
    (field) => !valoresComunidadEquivalentes(previous?.[field], next?.[field])
  );
}

function normalizarNombre(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ');
}

function normalizarComunidad(body, usuarioId) {
  return {
    nombre: normalizarNombre(body.nombre),
    territorio: Number(body.territorio),
    sector: String(body.sector || '').trim().toUpperCase(),
    lat: Number(body.lat),
    lng: Number(body.lng),
    usuarioId,
  };
}

async function assertExiste(id, db) {
  const comunidad = await comunidadesRepository.obtenerPorId(id, db);
  if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');
  return comunidad;
}

async function assertNombreDisponible({ nombre, excluirId = null }, db) {
  const existe = await comunidadesRepository.existeNombre({ nombre, excluirId }, db);
  if (existe) {
    throw new HttpError(409, 'Ya existe una comunidad con ese nombre', {
      code: 'COMUNIDAD_DUPLICADA',
    });
  }
}

async function listarComunidadesAdmin(query = {}) {
  const {
    buscar = '',
    estado = 'activas',
    territorio = 'todos',
    sector = 'todos',
    pagina = 1,
    limite = 10,
  } = query;
  const paginaActual = Math.max(parseInt(pagina, 10) || 1, 1);
  const limiteActual = Math.min(Math.max(parseInt(limite, 10) || 10, 1), 100);
  const offset = (paginaActual - 1) * limiteActual;
  const filtros = {
    q: String(buscar || '').trim(),
    estado,
    territorio,
    sector,
  };

  const [data, total] = await Promise.all([
    comunidadesRepository.listarAdmin({ ...filtros, limite: limiteActual, offset }),
    comunidadesRepository.contarAdmin(filtros),
  ]);

  return { data, total };
}

async function listarComunidadesActivas() {
  return comunidadesRepository.listarActivas();
}

async function crearComunidad({ body, req }) {
  const data = normalizarComunidad(body, req.usuario.id);
  return comunidadesRepository.enTransaccion(async (client) => {
    await assertNombreDisponible({ nombre: data.nombre }, client);
    const comunidad = await comunidadesRepository.crear(data, client);

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.crear,
      accion: 'crear',
      entidadId: comunidad.id,
      cambios: auditChangesForFields([...COMUNIDAD_FIELDS, 'activo'], 'crear'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return comunidad;
  });
}

async function actualizarComunidad({ id, body, req }) {
  const data = normalizarComunidad(body, req.usuario.id);
  return comunidadesRepository.enTransaccion(async (client) => {
    const before = await assertExiste(id, client);
    await assertNombreDisponible({ nombre: data.nombre, excluirId: id }, client);
    const modifiedFields = camposComunidadModificados(before, data);
    if (modifiedFields.length === 0) return before;

    const comunidad = await comunidadesRepository.actualizar({ id, data }, client);
    if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.actualizar,
      accion: 'actualizar',
      entidadId: id,
      cambios: auditChangesForFields(modifiedFields, 'actualizar'),
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return comunidad;
  });
}

async function desactivarComunidad({ id, req }) {
  return comunidadesRepository.enTransaccion(async (client) => {
    const before = await assertExiste(id, client);
    if (before.activo === false) return before;
    const totalRiesgoActivo = await comunidadesRepository.totalRiesgoActivo(id, client);

    if (totalRiesgoActivo > 0) {
      throw new HttpError(
        409,
        'No se puede desactivar esta comunidad porque tiene casos de riesgo activo asociados.',
        { code: 'COMUNIDAD_CON_RIESGO_ACTIVO' }
      );
    }

    const comunidad = await comunidadesRepository.actualizarActivo({
      id,
      activo: false,
      usuarioId: req.usuario.id,
    }, client);
    if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.estado,
      accion: 'estado',
      entidadId: id,
      cambios: {
        anteriores: { activo: true },
        nuevos: { activo: false },
      },
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return comunidad;
  });
}

async function reactivarComunidad({ id, req }) {
  return comunidadesRepository.enTransaccion(async (client) => {
    const before = await assertExiste(id, client);
    if (before.activo === true) return before;
    const comunidad = await comunidadesRepository.actualizarActivo({
      id,
      activo: true,
      usuarioId: req.usuario.id,
    }, client);
    if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');

    await registrarEventoPrivado(req, {
      contexto: AUDIT_CONTEXT.estado,
      accion: 'estado',
      entidadId: id,
      cambios: {
        anteriores: { activo: false },
        nuevos: { activo: true },
      },
      metadata: { resultado: RESULTADO_EXITOSO },
    }, { db: client, obligatorio: true });

    return comunidad;
  });
}

module.exports = {
  actualizarComunidad,
  crearComunidad,
  desactivarComunidad,
  listarComunidadesActivas,
  listarComunidadesAdmin,
  reactivarComunidad,
};
