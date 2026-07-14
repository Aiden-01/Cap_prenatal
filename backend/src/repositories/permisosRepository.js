const pool = require('../db/pool');

const PERMISOS_POR_ROL = {
  director: null,
  admin: [
    'pacientes.crear',
    'pacientes.ver',
    'pacientes.editar',
    'controles.crear',
    'controles.editar',
    'reportes.ver',
  ],
  personal_salud: [
    'pacientes.crear',
    'pacientes.ver',
    'pacientes.editar',
    'controles.crear',
    'controles.editar',
    'mapa_riesgo.ver',
    'reportes.ver',
  ],
};

function codigosPorRol(rol) {
  return PERMISOS_POR_ROL[rol] === null ? null : [...(PERMISOS_POR_ROL[rol] || [])];
}

async function listarCatalogo() {
  const { rows } = await pool.query(
    'SELECT id, codigo, descripcion, categoria FROM permisos ORDER BY categoria, codigo'
  );
  return rows;
}

async function listarCodigosPorUsuario(usuarioId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.codigo
     FROM usuario_permisos up
     JOIN permisos p ON p.id = up.permiso_id
     WHERE up.usuario_id = $1
     ORDER BY p.codigo`,
    [usuarioId]
  );
  return rows.map((row) => row.codigo);
}

async function listarPermisosPorUsuario(usuarioId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.id, p.codigo, p.descripcion, p.categoria, up.otorgado_por, up.fecha_otorgado
     FROM usuario_permisos up
     JOIN permisos p ON p.id = up.permiso_id
     WHERE up.usuario_id = $1
     ORDER BY p.categoria, p.codigo`,
    [usuarioId]
  );
  return rows;
}

async function existenCodigos(codigos, db = pool, bloquear = false) {
  if (!codigos.length) return [];
  const bloqueo = bloquear ? ' FOR KEY SHARE' : '';
  const { rows } = await db.query(
    `SELECT codigo FROM permisos WHERE codigo = ANY($1::text[])${bloqueo}`,
    [codigos]
  );
  return rows.map((row) => row.codigo);
}

async function enTransaccion(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.warn('[permisos] No se pudo revertir la transaccion:', rollbackError.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function bloquearUsuarioPermisos(usuarioId, db) {
  const { rowCount } = await db.query(
    'SELECT id FROM usuarios WHERE id = $1 FOR UPDATE',
    [usuarioId]
  );
  return rowCount > 0;
}

async function aplicarReemplazoPermisos({ usuarioId, codigos, otorgadoPor = null }, db) {
  await db.query('DELETE FROM usuario_permisos WHERE usuario_id = $1', [usuarioId]);

  if (codigos.length) {
    await db.query(
      `INSERT INTO usuario_permisos (usuario_id, permiso_id, otorgado_por)
       SELECT $1, p.id, $3
       FROM permisos p
       WHERE p.codigo = ANY($2::text[])
       ON CONFLICT (usuario_id, permiso_id) DO UPDATE SET
         otorgado_por = EXCLUDED.otorgado_por,
         fecha_otorgado = NOW()`,
      [usuarioId, codigos, otorgadoPor]
    );
  }

  return listarPermisosPorUsuario(usuarioId, db);
}

async function reemplazarPermisosUsuario(args, db = null) {
  if (db) {
    return aplicarReemplazoPermisos(args, db);
  }

  return enTransaccion((client) => aplicarReemplazoPermisos(args, client));
}

async function asignarPermisosIniciales({ usuarioId, rol, otorgadoPor = null }) {
  const codigos = codigosPorRol(rol);
  const params = [usuarioId, otorgadoPor];
  const where = codigos === null
    ? ''
    : 'WHERE p.codigo = ANY($3::text[])';
  if (codigos !== null) params.push(codigos);

  await pool.query(
    `INSERT INTO usuario_permisos (usuario_id, permiso_id, otorgado_por)
     SELECT $1, p.id, $2
     FROM permisos p
     ${where}
     ON CONFLICT (usuario_id, permiso_id) DO NOTHING`,
    params
  );
}

async function reemplazarPermisosPorRol({ usuarioId, rol, otorgadoPor = null }) {
  const codigos = codigosPorRol(rol);
  if (codigos === null) {
    const catalogo = await listarCatalogo();
    return reemplazarPermisosUsuario({
      usuarioId,
      codigos: catalogo.map((permiso) => permiso.codigo),
      otorgadoPor,
    });
  }

  return reemplazarPermisosUsuario({
    usuarioId,
    codigos,
    otorgadoPor,
  });
}

module.exports = {
  PERMISOS_POR_ROL,
  asignarPermisosIniciales,
  bloquearUsuarioPermisos,
  codigosPorRol,
  enTransaccion,
  existenCodigos,
  listarCatalogo,
  listarCodigosPorUsuario,
  listarPermisosPorUsuario,
  reemplazarPermisosUsuario,
  reemplazarPermisosPorRol,
};
