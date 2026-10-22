const pool = require('../db/pool');

// Identificadores SQL exclusivamente de esta lista, nunca de parámetros HTTP.
const TABLAS = Object.freeze({ cargos: 'cargos_personal', especialidades: 'especialidades_personal' });
function createCatalogosRepository(tipo, dbPool = pool) {
  const tabla = TABLAS[tipo];
  if (!tabla) throw new TypeError('Catálogo no soportado');
  return {
    async listar({ estado, limite, offset }, db = dbPool) {
      const activo = estado === 'todos' ? null : estado === 'activos';
      const { rows } = await db.query(`SELECT id, codigo, nombre, descripcion, activo, created_at, updated_at
        FROM ${tabla} WHERE ($1::boolean IS NULL OR activo = $1)
        ORDER BY nombre, id LIMIT $2 OFFSET $3`, [activo, limite, offset]);
      return rows;
    },
    async contar({ estado }, db = dbPool) {
      const activo = estado === 'todos' ? null : estado === 'activos';
      const { rows } = await db.query(`SELECT count(*)::integer AS total FROM ${tabla}
        WHERE ($1::boolean IS NULL OR activo = $1)`, [activo]);
      return rows[0].total;
    },
    async obtener(id, db = dbPool, bloquear = false) {
      const { rows } = await db.query(`SELECT * FROM ${tabla} WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
      return rows[0] || null;
    },
    async crear(data, db = dbPool) {
      const { rows } = await db.query(`INSERT INTO ${tabla} (nombre, codigo, descripcion)
        VALUES ($1, $2, $3) RETURNING *`, [data.nombre, data.codigo, data.descripcion]);
      return rows[0];
    },
    async actualizar(id, data, db = dbPool) {
      const { rows } = await db.query(`UPDATE ${tabla} SET nombre = $1, codigo = $2, descripcion = $3
        WHERE id = $4 RETURNING *`, [data.nombre, data.codigo, data.descripcion, id]);
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
