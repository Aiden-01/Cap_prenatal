const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Roles
    await client.query(`
      INSERT INTO roles (nombre, descripcion) VALUES
        ('admin', 'Administrador del sistema - acceso total'),
        ('personal_salud', 'Personal de salud - registro y consulta de expedientes')
      ON CONFLICT (nombre) DO NOTHING
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

    await client.query('COMMIT');
    console.log('✅ Seed completado');
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
