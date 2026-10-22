const { createCatalogosRepository } = require('../repositories/catalogosRepository');
const { registrarEventoPrivado } = require('./auditService');
const { AppError } = require('../utils/appError');

function createCatalogosService(tipo, {
  repository = createCatalogosRepository(tipo), audit = registrarEventoPrivado,
} = {}) {
  const entidad = { cargos: 'cargo_personal', especialidades: 'especialidad_personal' }[tipo];
  if (!entidad) throw new TypeError('Catálogo no soportado');
  async function obtener(id, db, bloquear = false) {
    const row = await repository.obtener(id, db, bloquear);
    if (!row) throw new AppError(404, 'Elemento de catálogo no encontrado', { code: 'CATALOGO_NOT_FOUND' });
    return row;
  }
  async function escribir({ id, body, activo, req, evento }) {
    try {
      return await repository.enTransaccion(async (db) => {
        const before = evento === 'crear' ? null : await obtener(id, db, true);
        const fields = evento === 'cambiar_estado' ? ['activo'] : ['nombre', 'codigo', 'descripcion'];
        const next = evento === 'cambiar_estado' ? { activo } : { ...body };
        if (tipo === 'cargos' && evento !== 'cambiar_estado') {
          fields.push('clasificacion_profesional');
          next.clasificacion_profesional ??= before?.clasificacion_profesional ?? 'sin_clasificar';
        }
        const modified = fields.filter(field => !before || before[field] !== next[field]);
        if (modified.length === 0) return before;
        const result = evento === 'crear' ? await repository.crear(next, db)
          : evento === 'actualizar' ? await repository.actualizar(id, next, db)
            : await repository.estado(id, activo, db);
        // Solo nombres de campos y marcadores: jamás texto libre del catálogo.
        const marker = value => Object.fromEntries(modified.map(field => [field, value]));
        const anteriores = before ? marker('anterior') : undefined;
        const nuevos = marker('registrado');
        if (modified.includes('clasificacion_profesional')) {
          if (anteriores) anteriores.clasificacion_profesional = before.clasificacion_profesional ?? 'sin_clasificar';
          nuevos.clasificacion_profesional = next.clasificacion_profesional;
        }
        await audit(req, {
          contexto: { categoria: 'catalogos', entidad, evento },
          accion: evento === 'cambiar_estado' ? 'estado' : evento,
          entidadId: result.id,
          cambios: evento === 'cambiar_estado'
            ? { anteriores: { activo: before.activo }, nuevos: { activo } }
            : { anteriores, nuevos },
          metadata: { resultado: 'exitoso' },
        }, { db, obligatorio: true });
        return result;
      });
    } catch (error) {
      if (error.code === '23505' && /^ux_(cargos|especialidades)_personal_(nombre|codigo)$/.test(error.constraint || '')) {
        throw new AppError(409, 'Ya existe un elemento con ese nombre o código, incluso si está inactivo', {
          code: 'CATALOGO_DUPLICADO',
        });
      }
      throw error;
    }
  }
  return {
    async listar(query) {
      const filtros = { ...query, offset: (query.pagina - 1) * query.limite };
      const [data, total] = await Promise.all([repository.listar(filtros), repository.contar(filtros)]);
      return { data, total };
    },
    obtener,
    crear: (body, req) => escribir({ body, req, evento: 'crear' }),
    actualizar: (id, body, req) => escribir({ id, body, req, evento: 'actualizar' }),
    estado: (id, activo, req) => escribir({ id, activo, req, evento: 'cambiar_estado' }),
  };
}
module.exports = { createCatalogosService };
