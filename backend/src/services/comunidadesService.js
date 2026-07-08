const comunidadesRepository = require('../repositories/comunidadesRepository');
const { registrarAuditoria } = require('../utils/auditoria');
const { HttpError } = require('../utils/httpError');

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

async function assertExiste(id) {
  const comunidad = await comunidadesRepository.obtenerPorId(id);
  if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');
  return comunidad;
}

async function assertNombreDisponible({ nombre, excluirId = null }) {
  const existe = await comunidadesRepository.existeNombre({ nombre, excluirId });
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
  await assertNombreDisponible({ nombre: data.nombre });

  const comunidad = await comunidadesRepository.crear(data);

  await registrarAuditoria(req, {
    accion: 'crear',
    tabla: 'comunidades',
    registroId: comunidad.id,
    datosNuevos: comunidad,
    descripcion: 'Comunidad creada',
  });

  return comunidad;
}

async function actualizarComunidad({ id, body, req }) {
  const before = await assertExiste(id);
  const data = normalizarComunidad(body, req.usuario.id);
  await assertNombreDisponible({ nombre: data.nombre, excluirId: id });

  const comunidad = await comunidadesRepository.actualizar({ id, data });
  if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');

  await registrarAuditoria(req, {
    accion: 'actualizar',
    tabla: 'comunidades',
    registroId: id,
    datosAnteriores: before,
    datosNuevos: comunidad,
    descripcion: 'Comunidad actualizada',
  });

  return comunidad;
}

async function desactivarComunidad({ id, req }) {
  const before = await assertExiste(id);
  const totalRiesgoActivo = await comunidadesRepository.totalRiesgoActivo(id);

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
  });

  await registrarAuditoria(req, {
    accion: 'estado',
    tabla: 'comunidades',
    registroId: id,
    datosAnteriores: before,
    datosNuevos: comunidad,
    descripcion: 'Comunidad desactivada',
  });

  return comunidad;
}

async function reactivarComunidad({ id, req }) {
  const before = await assertExiste(id);
  const comunidad = await comunidadesRepository.actualizarActivo({
    id,
    activo: true,
    usuarioId: req.usuario.id,
  });

  await registrarAuditoria(req, {
    accion: 'estado',
    tabla: 'comunidades',
    registroId: id,
    datosAnteriores: before,
    datosNuevos: comunidad,
    descripcion: 'Comunidad reactivada',
  });

  return comunidad;
}

module.exports = {
  actualizarComunidad,
  crearComunidad,
  desactivarComunidad,
  listarComunidadesActivas,
  listarComunidadesAdmin,
  reactivarComunidad,
};
