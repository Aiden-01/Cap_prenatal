const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authMiddleware);
router.use(cargarPermisos);

router.get('/riesgo', verificarPermiso('mapa_riesgo.ver'), asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`
    WITH comunidades_base AS MATERIALIZED (
      SELECT
        c.*,
        regexp_replace(
          translate(LOWER(BTRIM(c.nombre)), U&'\\00E1\\00E9\\00ED\\00F3\\00FA\\00FC\\00F1', 'aeiouun'),
          '[^a-z0-9]+',
          '',
          'g'
        ) AS nombre_norm
      FROM comunidades c
    ),
    pacientes_legacy AS MATERIALIZED (
      SELECT
        p.id, p.no_expediente, p.nombres, p.apellidos,
        regexp_replace(
          translate(LOWER(BTRIM(p.comunidad)), U&'\\00E1\\00E9\\00ED\\00F3\\00FA\\00FC\\00F1', 'aeiouun'),
          '[^a-z0-9]+',
          '',
          'g'
        ) AS comunidad_norm
      FROM pacientes p
      WHERE p.comunidad_id IS NULL
        AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'
        AND COALESCE(BTRIM(p.comunidad), '') <> ''
    ),
    aliases_norm AS MATERIALIZED (
      SELECT
        ca.comunidad_id,
        regexp_replace(
          translate(LOWER(BTRIM(ca.alias)), U&'\\00E1\\00E9\\00ED\\00F3\\00FA\\00FC\\00F1', 'aeiouun'),
          '[^a-z0-9]+',
          '',
          'g'
        ) AS alias_norm
      FROM comunidades_aliases ca
    ),
    coincidencias_legacy AS (
      SELECT c.id AS comunidad_id, p.id AS paciente_id,
             p.no_expediente, p.nombres, p.apellidos
      FROM pacientes_legacy p
      JOIN comunidades_base c ON p.comunidad_norm = c.nombre_norm

      UNION ALL

      SELECT ca.comunidad_id, p.id AS paciente_id,
             p.no_expediente, p.nombres, p.apellidos
      FROM pacientes_legacy p
      JOIN aliases_norm ca
        ON p.comunidad_norm LIKE '%' || ca.alias_norm || '%'
    ),
    legacy_unicas AS MATERIALIZED (
      SELECT DISTINCT comunidad_id, paciente_id,
                      no_expediente, nombres, apellidos
      FROM coincidencias_legacy
    ),
    asignaciones AS (
      SELECT p.comunidad_id, p.id AS paciente_id,
             p.no_expediente, p.nombres, p.apellidos
      FROM pacientes p
      WHERE p.comunidad_id IS NOT NULL
        AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'

      UNION ALL

      SELECT comunidad_id, paciente_id, no_expediente, nombres, apellidos
      FROM legacy_unicas
    ),
    riesgo_por_comunidad AS (
      SELECT
        p.comunidad_id,
        COUNT(DISTINCT p.paciente_id)::INTEGER AS total_riesgo,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'paciente_id', p.paciente_id,
            'nombre', TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)),
            'expediente', p.no_expediente,
            'embarazo_id', e.id
          )
          ORDER BY p.apellidos, p.nombres
        ) AS pacientes_riesgo
      FROM asignaciones p
      JOIN embarazos e ON e.paciente_id = p.paciente_id AND e.estado = 'activo'
      JOIN fichas_riesgo_obstetrico r
        ON r.embarazo_id = e.id AND r.tiene_riesgo = TRUE
      GROUP BY p.comunidad_id
    )
    SELECT c.id, c.nombre, c.territorio, c.sector, c.lat, c.lng,
           COALESCE(r.total_riesgo, 0)::INTEGER AS total_riesgo,
           COALESCE(r.pacientes_riesgo, '[]'::json) AS pacientes_riesgo
    FROM comunidades_base c
    LEFT JOIN riesgo_por_comunidad r ON r.comunidad_id = c.id
    WHERE c.activo = TRUE OR COALESCE(r.total_riesgo, 0) > 0
    ORDER BY c.territorio, c.sector, c.nombre
  `);

  res.json(rows);
}));

module.exports = router;
