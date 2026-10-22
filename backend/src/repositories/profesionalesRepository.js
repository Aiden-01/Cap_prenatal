const pool = require('../db/pool');

// Lista explícita: nunca reutilizar SELECT * ni la respuesta administrativa de usuarios.
const COLUMNAS = `u.id, u.nombre_completo, u.activo,
  c.id AS cargo_id, c.nombre AS cargo_nombre, c.activo AS cargo_activo,
  c.clasificacion_profesional, e.id AS especialidad_id,
  e.nombre AS especialidad_nombre, e.activo AS especialidad_activa`;
const JOINS = `JOIN roles r ON r.id = u.rol_id
  JOIN cargos_personal c ON c.id = u.cargo_id
  LEFT JOIN especialidades_personal e ON e.id = u.especialidad_id`;

async function listar({ buscar, pagina, limite, clasificacion_profesional, actorRol }, db = pool) {
  const params = [buscar, actorRol, clasificacion_profesional ?? null];
  const where = `u.activo = TRUE AND c.activo = TRUE
    AND c.clasificacion_profesional IN ('medico', 'enfermeria_ae', 'enfermeria_ep')
    AND ($2::text = 'director' OR r.nombre <> 'director')
    AND ($3::text IS NULL OR c.clasificacion_profesional = $3)
    AND ($1::text = '' OR strpos(catalogo_personal_clave(u.nombre_completo), catalogo_personal_clave($1)) > 0
      OR strpos(catalogo_personal_clave(c.nombre), catalogo_personal_clave($1)) > 0
      OR strpos(catalogo_personal_clave(COALESCE(e.nombre, '')), catalogo_personal_clave($1)) > 0)`;
  // Una sentencia conserva el mismo snapshot para total y página, incluso si la página está vacía.
  const { rows } = await db.query(`WITH elegibles AS (
      SELECT ${COLUMNAS} FROM usuarios u ${JOINS} WHERE ${where}
    ), pagina AS (
      SELECT * FROM elegibles ORDER BY nombre_completo, id LIMIT $4 OFFSET $5
    ) SELECT (SELECT COUNT(*)::integer FROM elegibles) AS total,
      COALESCE((SELECT json_agg(pagina ORDER BY nombre_completo, id) FROM pagina), '[]'::json) AS data`,
  [...params, limite, (pagina - 1) * limite]);
  return { data: rows[0].data, total: rows[0].total, pagina, limite };
}

async function obtenerActor(id, db) {
  const { rows } = await db.query(`SELECT u.id, u.activo, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 FOR SHARE OF u`, [id]);
  return rows[0] || null;
}

async function obtenerParaAutoria(id, db) {
  const { rows } = await db.query(`SELECT ${COLUMNAS}, r.nombre AS rol
    FROM usuarios u ${JOINS} WHERE u.id = $1 FOR SHARE OF u, c`, [id]);
  return rows[0] || null;
}

module.exports = { listar, obtenerActor, obtenerParaAutoria };
