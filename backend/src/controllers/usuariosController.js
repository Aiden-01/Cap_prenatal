const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function listar(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, u.activo, r.nombre AS rol, u.created_at
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       ORDER BY u.id`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar usuarios' });
  }
}

async function crear(req, res) {
  const { nombre_completo, username, password, rol } = req.body;
  if (!nombre_completo || !username || !password || !rol) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }

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
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }
    return res.status(500).json({ error: 'Error al crear usuario' });
  }
}

async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre_completo, activo, rol, password } = req.body;

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, activo=$2, rol_id=(SELECT id FROM roles WHERE nombre=$3),
         password_hash=$4, updated_at=NOW() WHERE id=$5`,
        [nombre_completo, activo, rol, hash, id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre_completo=$1, activo=$2, rol_id=(SELECT id FROM roles WHERE nombre=$3),
         updated_at=NOW() WHERE id=$4`,
        [nombre_completo, activo, rol, id]
      );
    }
    return res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

module.exports = { listar, crear, actualizar };
