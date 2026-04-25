const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');

async function listar(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol, u.created_at
       FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.id`
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: 'Error al listar usuarios' });
  }
}

async function crear(req, res) {
  const { nombre_completo, username, password, rol } = req.body;
  if (!nombre_completo || !username || !password || !rol)
    return res.status(400).json({ error: 'Todos los campos son requeridos' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = $4))
       RETURNING id, nombre_completo, username`,
      [nombre_completo, username, hash, rol]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre_completo, activo, rol, password } = req.body;
  const esSelf = String(id) === String(req.usuario.id);

  // Proteccion 1: no puedes desactivarte a ti mismo
  if (esSelf && activo === false) {
    return res.status(403).json({
      error: 'No puedes desactivar tu propia cuenta'
    });
  }

  // Proteccion 2: no puedes quitarte el rol admin si eres el unico admin activo
  if (esSelf && rol && rol !== 'admin') {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         WHERE r.nombre = 'admin' AND u.activo = TRUE`
      );
      if (parseInt(rows[0].count) <= 1) {
        return res.status(403).json({
          error: 'No puedes cambiar tu rol: eres el unico administrador activo'
        });
      }
    } catch {
      return res.status(500).json({ error: 'Error al verificar roles' });
    }
  }

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, activo=$2,
         rol_id=(SELECT id FROM roles WHERE nombre=$3),
         password_hash=$4, updated_at=NOW() WHERE id=$5`,
        [nombre_completo, activo, rol, hash, id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, activo=$2,
         rol_id=(SELECT id FROM roles WHERE nombre=$3),
         updated_at=NOW() WHERE id=$4`,
        [nombre_completo, activo, rol, id]
      );
    }
    return res.json({ message: 'Usuario actualizado' });
  } catch {
    return res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

async function eliminar(req, res) {
  const { id } = req.params;
  const esSelf = String(id) === String(req.usuario.id);

  // Proteccion 1: no puedes eliminarte a ti mismo
  if (esSelf) {
    return res.status(403).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  try {
    // Proteccion 2: no puedes eliminar al unico admin activo
    const { rows: target } = await pool.query(
      `SELECT u.id, r.nombre AS rol, u.activo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1`,
      [id]
    );

    if (!target.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (target[0].rol === 'admin') {
      const { rows: conteo } = await pool.query(
        `SELECT COUNT(*) FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         WHERE r.nombre = 'admin' AND u.activo = TRUE`
      );
      if (parseInt(conteo[0].count) <= 1) {
        return res.status(403).json({
          error: 'No puedes eliminar al unico administrador activo del sistema'
        });
      }
    }

    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    return res.json({ message: 'Usuario eliminado' });
  } catch {
    return res.status(500).json({ error: 'Error al eliminar usuario' });
  }
}

module.exports = { listar, crear, actualizar, eliminar };