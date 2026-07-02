const pool = require('../db/pool');

function normalizarTextoSql(expression) {
  return `
    regexp_replace(
      translate(LOWER(BTRIM(${expression})), U&'\\00E1\\00E9\\00ED\\00F3\\00FA\\00FC\\00F1', 'aeiouun'),
      '[^a-z0-9]+',
      '',
      'g'
    )`;
}

function condicionPacienteMapaRiesgo(pacienteAlias = 'p', comunidadAlias = 'c') {
  const comunidadPacienteNorm = normalizarTextoSql(`${pacienteAlias}.comunidad`);
  const comunidadNombreNorm = normalizarTextoSql(`${comunidadAlias}.nombre`);
  const aliasNorm = normalizarTextoSql('ca.alias');

  return `
    LOWER(BTRIM(COALESCE(${pacienteAlias}.municipio, ''))) = 'el chal'
    AND (
      ${pacienteAlias}.comunidad_id = ${comunidadAlias}.id
      OR (
        ${pacienteAlias}.comunidad_id IS NULL
        AND COALESCE(BTRIM(${pacienteAlias}.comunidad), '') <> ''
        -- El conteo de riesgo activo debe coincidir con el Mapa de Riesgo; el fallback textual solo aplica para historicos de El Chal.
        AND (
          ${comunidadPacienteNorm} = ${comunidadNombreNorm}
          OR EXISTS (
            SELECT 1
            FROM comunidades_aliases ca
            WHERE ca.comunidad_id = ${comunidadAlias}.id
              AND ${comunidadPacienteNorm} LIKE '%' || ${aliasNorm} || '%'
          )
        )
      )
    )`;
}

function pacientesDirectosAgregadoLateral() {
  return `
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT p.id)::INTEGER AS total_pacientes
      FROM pacientes p
      WHERE p.comunidad_id = c.id
        AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'
    ) pacientes_directos ON TRUE`;
}

function riesgoActivoAgregadoLateral() {
  return `
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT p.id)::INTEGER AS total_riesgo_activo
      FROM pacientes p
      JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
      JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
      WHERE ${condicionPacienteMapaRiesgo('p', 'c')}
        AND COALESCE(r.tiene_riesgo, FALSE) = TRUE
    ) riesgo_activo ON TRUE`;
}

async function listarAdmin() {
  const { rows } = await pool.query(`
    SELECT
      c.id,
      c.nombre,
      c.territorio,
      c.sector,
      c.lat,
      c.lng,
      c.activo,
      COALESCE(pacientes_directos.total_pacientes, 0)::INTEGER AS total_pacientes,
      COALESCE(riesgo_activo.total_riesgo_activo, 0)::INTEGER AS total_riesgo_activo,
      c.created_at,
      c.updated_at
    FROM comunidades c
    ${pacientesDirectosAgregadoLateral()}
    ${riesgoActivoAgregadoLateral()}
    ORDER BY c.activo DESC, c.territorio, c.sector, c.nombre
  `);
  return rows;
}

async function listarActivas() {
  const { rows } = await pool.query(
    `SELECT id, nombre, territorio, sector, lat, lng
     FROM comunidades
     WHERE activo = TRUE
     ORDER BY territorio, sector, nombre`
  );
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    'SELECT * FROM comunidades WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function existeNombre({ nombre, excluirId = null }) {
  const { rowCount } = await pool.query(
    `SELECT 1
     FROM comunidades
     WHERE LOWER(regexp_replace(BTRIM(nombre), '[[:space:]]+', ' ', 'g')) = LOWER($1)
       AND ($2::integer IS NULL OR id <> $2)
     LIMIT 1`,
    [nombre, excluirId]
  );
  return rowCount > 0;
}

async function crear(data) {
  const { rows } = await pool.query(
    `INSERT INTO comunidades (
       nombre, territorio, sector, lat, lng, activo, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
     RETURNING *`,
    [
      data.nombre,
      data.territorio,
      data.sector,
      data.lat,
      data.lng,
      data.usuarioId,
    ]
  );
  return rows[0] || null;
}

async function actualizar({ id, data }) {
  const { rows } = await pool.query(
    `UPDATE comunidades SET
       nombre = $1,
       territorio = $2,
       sector = $3,
       lat = $4,
       lng = $5,
       updated_at = NOW(),
       updated_by = $6
     WHERE id = $7
     RETURNING *`,
    [
      data.nombre,
      data.territorio,
      data.sector,
      data.lat,
      data.lng,
      data.usuarioId,
      id,
    ]
  );
  return rows[0] || null;
}

async function totalRiesgoActivo(id) {
  const { rows } = await pool.query(`
    SELECT COALESCE(riesgo_activo.total_riesgo_activo, 0)::INTEGER AS total
    FROM comunidades c
    ${riesgoActivoAgregadoLateral()}
    WHERE c.id = $1
  `, [id]);
  return Number(rows[0]?.total || 0);
}

async function actualizarActivo({ id, activo, usuarioId }) {
  const { rows } = await pool.query(
    `UPDATE comunidades SET
       activo = $1,
       updated_at = NOW(),
       updated_by = $2
     WHERE id = $3
     RETURNING *`,
    [activo, usuarioId, id]
  );
  return rows[0] || null;
}

module.exports = {
  actualizar,
  actualizarActivo,
  crear,
  existeNombre,
  listarActivas,
  listarAdmin,
  obtenerPorId,
  totalRiesgoActivo,
};
