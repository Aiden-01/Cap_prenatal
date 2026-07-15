const bcrypt = require('bcryptjs');
const pool = require('./pool');
const {
  loadEnvironmentFile,
  validateSeedConfig,
} = require('../config/env');

async function seed({
  db = pool,
  env = process.env,
  logger = console,
  hashPassword = (password) => bcrypt.hash(password, 12),
} = {}) {
  const config = validateSeedConfig(env);
  let client = null;
  let accountCreated = false;

  try {
    client = await db.connect();
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO roles (nombre, descripcion) VALUES
        ('director', 'Director del sistema - administracion total y datos sensibles'),
        ('admin', 'Administrador del sistema - acceso total'),
        ('personal_salud', 'Personal de salud - registro y consulta de expedientes')
      ON CONFLICT (nombre) DO NOTHING
    `);

    await client.query(`
      INSERT INTO permisos (codigo, descripcion, categoria) VALUES
        ('pacientes.crear', 'Crear pacientes', 'pacientes'),
        ('pacientes.ver', 'Ver pacientes', 'pacientes'),
        ('pacientes.editar', 'Editar pacientes', 'pacientes'),
        ('pacientes.eliminar', 'Eliminar pacientes', 'pacientes'),
        ('controles.crear', 'Crear controles prenatales', 'controles'),
        ('controles.editar', 'Editar controles prenatales', 'controles'),
        ('controles.ver_vih', 'Ver y gestionar datos VIH', 'datos_sensibles'),
        ('mapa_riesgo.ver', 'Ver mapa de riesgo', 'mapa_riesgo'),
        ('reportes.ver', 'Ver reportes', 'reportes'),
        ('reportes.exportar', 'Exportar reportes', 'reportes')
      ON CONFLICT (codigo) DO UPDATE SET
        descripcion = EXCLUDED.descripcion,
        categoria = EXCLUDED.categoria
    `);

    const existing = await client.query(
      `SELECT u.id, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.username = $1`,
      [config.username]
    );

    if (existing.rowCount > 0 && existing.rows[0].rol !== 'director') {
      throw new Error('La cuenta inicial ya existe con un rol diferente');
    }

    if (existing.rowCount === 0) {
      const passwordHash = await hashPassword(config.password);
      const inserted = await client.query(`
        INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
        VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = 'director'))
        ON CONFLICT (username) DO NOTHING
      `, [config.nombreCompleto, config.username, passwordHash]);
      accountCreated = inserted.rowCount === 1;
    }

    await client.query(`
      INSERT INTO usuario_permisos (usuario_id, permiso_id)
      SELECT u.id, p.id
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      JOIN permisos p ON (
        r.nombre = 'director'
        OR (r.nombre = 'admin' AND p.codigo IN (
          'pacientes.crear',
          'pacientes.ver',
          'pacientes.editar',
          'controles.crear',
          'controles.editar',
          'reportes.ver'
        ))
        OR (r.nombre = 'personal_salud' AND p.codigo IN (
          'pacientes.crear',
          'pacientes.ver',
          'pacientes.editar',
          'controles.crear',
          'controles.editar',
          'mapa_riesgo.ver',
          'reportes.ver'
        ))
      )
      ON CONFLICT (usuario_id, permiso_id) DO NOTHING
    `);

    await client.query('COMMIT');
    logger.log(accountCreated
      ? 'Seed completado; cuenta inicial creada'
      : 'Seed completado; la cuenta inicial ya existia y no fue modificada');
    return { ok: true, accountCreated };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    logger.error('Error en seed:', error.message);
    throw error;
  } finally {
    if (client) client.release();
    await db.end();
  }
}

if (require.main === module) {
  loadEnvironmentFile();
  seed().catch((error) => {
    console.error('Seed no ejecutado:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { seed };
