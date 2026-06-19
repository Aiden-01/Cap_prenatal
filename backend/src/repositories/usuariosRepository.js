const pool = require('../db/pool');

const USUARIO_TIENE_HISTORIAL_SQL = `(
  EXISTS (SELECT 1 FROM pacientes p WHERE p.registrado_por = u.id OR p.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM embarazos e WHERE e.registrado_por = u.id OR e.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM vacunas_paciente v WHERE v.registrado_por = u.id OR v.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM controles_prenatales c WHERE c.registrado_por = u.id OR c.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM controles_puerperio cp WHERE cp.registrado_por = u.id OR cp.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM morbilidad_embarazo m WHERE m.registrado_por = u.id OR m.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM fichas_riesgo_obstetrico f WHERE f.registrado_por = u.id OR f.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM planes_parto pp WHERE pp.registrado_por = u.id OR pp.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM referencias_efectuadas re WHERE re.registrado_por = u.id OR re.updated_by = u.id)
  OR EXISTS (
    SELECT 1 FROM auditoria_eventos ae
    WHERE ae.usuario_id = u.id
      AND (
        ae.tabla IN (
          'pacientes',
          'embarazos',
          'vacunas_paciente',
          'controles_prenatales',
          'controles_puerperio',
          'morbilidad_embarazo',
          'fichas_riesgo_obstetrico',
          'planes_parto',
          'referencias_efectuadas',
          'reportes',
          'documentos'
        )
        OR ae.accion IN ('exportar', 'generar_pdf')
      )
  )
)`;

async function listar({ actorRol } = {}) {
  const params = [];
  const where = actorRol === 'admin'
    ? "WHERE r.nombre <> 'director'"
    : '';
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol,
            u.created_at, u.updated_at, u.created_by, u.updated_by,
            ${USUARIO_TIENE_HISTORIAL_SQL} AS tiene_registros,
            NOT ${USUARIO_TIENE_HISTORIAL_SQL} AS puede_eliminarse
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ${where}
     ORDER BY u.id`,
    params
  );
  return rows;
}

async function crear({ nombreCompleto, username, passwordHash, rol, createdBy = null }) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id, created_by)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = $4), $5)
     RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by,
       (SELECT nombre FROM roles WHERE nombre = $4) AS rol`,
    [nombreCompleto, username, passwordHash, rol, createdBy]
  );
  return rows[0];
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol,
            u.created_at, u.updated_at, u.created_by, u.updated_by,
            ${USUARIO_TIENE_HISTORIAL_SQL} AS tiene_registros,
            NOT ${USUARIO_TIENE_HISTORIAL_SQL} AS puede_eliminarse
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function obtenerVisibleParaActor({ id, actorRol }) {
  const usuario = await obtenerPorId(id);
  if (actorRol === 'admin' && usuario?.rol === 'director') return null;
  return usuario;
}

async function contarAdminsActivos() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'admin' AND u.activo = TRUE`
  );
  return parseInt(rows[0].count, 10);
}

async function contarDirectoresActivos() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'director' AND u.activo = TRUE`
  );
  return parseInt(rows[0].count, 10);
}

async function actualizar({ id, nombreCompleto, activo, rol, passwordHash, updatedBy = null }) {
  if (passwordHash) {
    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre_completo=$1, activo=$2,
       rol_id=(SELECT id FROM roles WHERE nombre=$3),
       password_hash=$4, updated_at=NOW(), updated_by=$5 WHERE id=$6
       RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by,
         (SELECT nombre FROM roles WHERE nombre = $3) AS rol`,
      [nombreCompleto, activo, rol, passwordHash, updatedBy, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE usuarios SET nombre_completo=$1, activo=$2,
     rol_id=(SELECT id FROM roles WHERE nombre=$3),
     updated_at=NOW(), updated_by=$4 WHERE id=$5
     RETURNING id, nombre_completo, username, activo, created_at, updated_at, created_by, updated_by,
       (SELECT nombre FROM roles WHERE nombre = $3) AS rol`,
    [nombreCompleto, activo, rol, updatedBy, id]
  );
  return rows[0] || null;
}

async function eliminar(id) {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

module.exports = {
  listar,
  crear,
  obtenerPorId,
  obtenerVisibleParaActor,
  contarAdminsActivos,
  contarDirectoresActivos,
  actualizar,
  eliminar,
};
