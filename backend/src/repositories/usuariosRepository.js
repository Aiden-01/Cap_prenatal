const pool = require('../db/pool');

const PERFIL_COLUMNS = `u.cargo_id, c.nombre AS cargo_nombre, c.activo AS cargo_activo,
  u.especialidad_id, ep.nombre AS especialidad_nombre, ep.activo AS especialidad_activa`;
const PERFIL_JOINS = `LEFT JOIN cargos_personal c ON c.id = u.cargo_id
  LEFT JOIN especialidades_personal ep ON ep.id = u.especialidad_id`;

const USUARIO_TIENE_HISTORIAL_SQL = `(
  EXISTS (SELECT 1 FROM pacientes p WHERE p.registrado_por = u.id OR p.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM embarazos e WHERE e.registrado_por = u.id OR e.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM vacunas_paciente v WHERE v.registrado_por = u.id OR v.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM controles_prenatales c WHERE c.registrado_por = u.id OR c.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM citas_prenatales cp WHERE cp.registrado_por = u.id OR cp.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM controles_puerperio cp WHERE cp.registrado_por = u.id OR cp.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM morbilidad_embarazo m WHERE m.registrado_por = u.id OR m.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM fichas_riesgo_obstetrico f WHERE f.registrado_por = u.id OR f.updated_by = u.id)
  OR EXISTS (SELECT 1 FROM planes_parto pp WHERE pp.registrado_por = u.id OR pp.updated_by = u.id)
  OR EXISTS (
    SELECT 1 FROM auditoria_eventos ae
    WHERE ae.usuario_id = u.id
      AND (
        ae.tabla IN (
          'pacientes',
          'embarazos',
          'vacunas_paciente',
          'controles_prenatales',
          'citas_prenatales',
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
            ${PERFIL_COLUMNS},
            u.created_at, u.updated_at, u.created_by, u.updated_by,
            ${USUARIO_TIENE_HISTORIAL_SQL} AS tiene_registros,
            NOT ${USUARIO_TIENE_HISTORIAL_SQL} AS puede_eliminarse
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ${PERFIL_JOINS}
     ${where}
     ORDER BY u.id`,
    params
  );
  return rows;
}

async function crear({ nombreCompleto, username, passwordHash, rol, createdBy = null, cargoId = null, especialidadId = null }, db = pool) {
  const { rows } = await db.query(
    `WITH nuevo AS (
      INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id, created_by, cargo_id, especialidad_id)
      VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = $4), $5, $6, $7)
      RETURNING *
    ) SELECT u.id, u.nombre_completo, u.username, u.activo, u.created_at, u.updated_at, u.created_by, u.updated_by,
      r.nombre AS rol, ${PERFIL_COLUMNS} FROM nuevo u JOIN roles r ON r.id=u.rol_id ${PERFIL_JOINS}`,
    [nombreCompleto, username, passwordHash, rol, createdBy, cargoId, especialidadId]
  );
  return rows[0];
}

async function obtenerPorId(id, db = pool) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol,
            ${PERFIL_COLUMNS},
            u.created_at, u.updated_at, u.created_by, u.updated_by,
            ${USUARIO_TIENE_HISTORIAL_SQL} AS tiene_registros,
            NOT ${USUARIO_TIENE_HISTORIAL_SQL} AS puede_eliminarse
     FROM usuarios u JOIN roles r ON r.id = u.rol_id
     ${PERFIL_JOINS}
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

async function contarAdminsActivos(db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'admin' AND u.activo = TRUE`
  );
  return parseInt(rows[0].count, 10);
}

async function contarDirectoresActivos(db = pool) {
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'director' AND u.activo = TRUE`
  );
  return parseInt(rows[0].count, 10);
}

async function actualizar({ id, nombreCompleto, activo, rol, passwordHash, updatedBy = null, cargoId, especialidadId }, db = pool) {
  const { rows } = await db.query(
    `WITH actualizado AS (
      UPDATE usuarios SET nombre_completo=$1, activo=$2,
        rol_id=(SELECT id FROM roles WHERE nombre=$3),
        password_hash=COALESCE($4, password_hash), updated_at=NOW(), updated_by=$5,
        cargo_id=CASE WHEN $7::boolean THEN $8::integer ELSE cargo_id END,
        especialidad_id=CASE WHEN $9::boolean THEN $10::integer ELSE especialidad_id END
      WHERE id=$6 RETURNING *
    ) SELECT u.id, u.nombre_completo, u.username, u.activo, u.created_at, u.updated_at, u.created_by, u.updated_by,
      r.nombre AS rol, ${PERFIL_COLUMNS} FROM actualizado u JOIN roles r ON r.id=u.rol_id ${PERFIL_JOINS}`,
    [nombreCompleto, activo, rol, passwordHash, updatedBy, id, cargoId !== undefined, cargoId ?? null,
      especialidadId !== undefined, especialidadId ?? null]
  );
  return rows[0] || null;
}

async function obtenerElementoProfesional(campo, id, db) {
  const tabla = { cargo_id: 'cargos_personal', especialidad_id: 'especialidades_personal' }[campo];
  if (!tabla) throw new TypeError('Campo profesional no soportado');
  // SHARE bloquea UPDATE de activo, además de impedir DELETE durante la asignación.
  const { rows } = await db.query(`SELECT id, activo FROM ${tabla} WHERE id=$1 FOR SHARE`, [id]);
  return rows[0] || null;
}

async function eliminar(id, db = pool) {
  await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

module.exports = {
  USUARIO_TIENE_HISTORIAL_SQL,
  listar,
  crear,
  obtenerPorId,
  obtenerVisibleParaActor,
  contarAdminsActivos,
  contarDirectoresActivos,
  actualizar,
  obtenerElementoProfesional,
  eliminar,
};
