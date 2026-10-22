const pool = require('../db/pool');

// Identificadores SQL exclusivamente de esta lista, nunca de parámetros HTTP.
const TABLAS = Object.freeze({ cargos: 'cargos_personal', especialidades: 'especialidades_personal' });
function createCatalogosRepository(tipo, dbPool = pool) {
  const tabla = TABLAS[tipo];
  if (!tabla) throw new TypeError('Catálogo no soportado');
  const clasificacion = tipo === 'cargos' ? ', clasificacion_profesional' : '';
  return {
    async listar({ estado, limite, offset, buscar = '' }, db = dbPool) {
      const activo = estado === 'todos' ? null : estado === 'activos';
      const { rows } = await db.query(`SELECT id, codigo, nombre, descripcion, activo, created_at, updated_at${clasificacion}
        FROM ${tabla} WHERE ($1::boolean IS NULL OR activo = $1)
        AND strpos(catalogo_personal_clave(nombre || ' ' || COALESCE(codigo, '')), catalogo_personal_clave($2)) > 0
        ORDER BY nombre, id LIMIT $3 OFFSET $4`, [activo, buscar, limite, offset]);
      return rows;
    },
    async contar({ estado, buscar = '' }, db = dbPool) {
      const activo = estado === 'todos' ? null : estado === 'activos';
      const { rows } = await db.query(`SELECT count(*)::integer AS total FROM ${tabla}
        WHERE ($1::boolean IS NULL OR activo = $1)
        AND strpos(catalogo_personal_clave(nombre || ' ' || COALESCE(codigo, '')), catalogo_personal_clave($2)) > 0`, [activo, buscar]);
      return rows[0].total;
    },
    async obtener(id, db = dbPool, bloquear = false) {
      const { rows } = await db.query(`SELECT * FROM ${tabla} WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
      return rows[0] || null;
    },
    async crear(data, db = dbPool) {
      const params = [data.nombre, data.codigo, data.descripcion];
      if (tipo === 'cargos') params.push(data.clasificacion_profesional ?? 'sin_clasificar');
      const { rows } = await db.query(`INSERT INTO ${tabla} (nombre, codigo, descripcion${clasificacion})
        VALUES ($1, $2, $3${tipo === 'cargos' ? ', $4' : ''}) RETURNING *`, params);
      return rows[0];
    },
    async actualizar(id, data, db = dbPool) {
      const params = [data.nombre, data.codigo, data.descripcion, id];
      if (tipo === 'cargos') params.push(data.clasificacion_profesional ?? null);
      const { rows } = await db.query(`UPDATE ${tabla} SET nombre = $1, codigo = $2, descripcion = $3
        ${tipo === 'cargos' ? ', clasificacion_profesional = COALESCE($5, clasificacion_profesional)' : ''}
        WHERE id = $4 RETURNING *`, params);
      return rows[0];
    },
    async estado(id, activo, db = dbPool) {
      const { rows } = await db.query(`UPDATE ${tabla} SET activo = $1 WHERE id = $2 RETURNING *`, [activo, id]);
      return rows[0];
    },
    async enTransaccion(callback) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
module.exports = { createCatalogosRepository };
