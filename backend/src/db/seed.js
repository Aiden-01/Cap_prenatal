const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Roles
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

    // Usuario admin por defecto
    const hash = await bcrypt.hash('Admin2024*', 12);
    await client.query(`
      INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
      VALUES (
        'Administrador CAP El Chal',
        'admin',
        $1,
        (SELECT id FROM roles WHERE nombre = 'admin')
      )
      ON CONFLICT (username) DO NOTHING
    `, [hash]);

    // Usuario director por defecto
    const directorHash = await bcrypt.hash('Director2024*', 12);
    await client.query(`
      INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
      VALUES (
        'Director CAP El Chal',
        'director',
        $1,
        (SELECT id FROM roles WHERE nombre = 'director')
      )
      ON CONFLICT (username) DO NOTHING
    `, [directorHash]);

    // Usuario de ejemplo para personal de salud
    const hash2 = await bcrypt.hash('Personal2024*', 12);
    await client.query(`
      INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id)
      VALUES (
        'Enfermera Ejemplo',
        'enfermera01',
        $1,
        (SELECT id FROM roles WHERE nombre = 'personal_salud')
      )
      ON CONFLICT (username) DO NOTHING
    `, [hash2]);

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
    console.log('✅ Seed completado');
    console.log('   👤 director / Director2024*  (rol: director)');
    console.log('   👤 admin / Admin2024*  (rol: admin)');
    console.log('   👤 enfermera01 / Personal2024*  (rol: personal_salud)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
