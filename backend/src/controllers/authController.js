const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, u.password_hash, u.activo,
              r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.username = $1`,
      [username]
    );

    const usuario = rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, username: usuario.username, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre_completo: usuario.nombre_completo,
        username: usuario.username,
        rol: usuario.rol,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function me(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo, u.username, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { login, me };
