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
    WITH comunidades_base AS (
      SELECT
        c.*,
        regexp_replace(
          translate(LOWER(BTRIM(c.nombre)), 'áéíóúüñ', 'aeiouun'),
          '[^a-z0-9]+',
          '',
          'g'
        ) AS nombre_norm
      FROM comunidades c
    )
    SELECT
      c.id,
      c.nombre,
      c.territorio,
      c.sector,
      c.lat,
      c.lng,
      COUNT(DISTINCT p.id) FILTER (
        WHERE COALESCE(r.tiene_riesgo, FALSE) = TRUE
      )::INTEGER AS total_riesgo,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'paciente_id', p.id,
            'nombre', TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)),
            'expediente', p.no_expediente,
            'embarazo_id', e.id
          )
          ORDER BY p.apellidos, p.nombres
        ) FILTER (
          WHERE COALESCE(r.tiene_riesgo, FALSE) = TRUE
            AND p.id IS NOT NULL
        ),
        '[]'::json
      ) AS pacientes_riesgo
    FROM comunidades_base c
    LEFT JOIN LATERAL (
      SELECT DISTINCT p.*
      FROM pacientes p
      WHERE p.comunidad_id = c.id
         OR (
           p.comunidad_id IS NULL
           AND COALESCE(BTRIM(p.comunidad), '') <> ''
           AND (
             regexp_replace(
               translate(LOWER(BTRIM(p.comunidad)), 'áéíóúüñ', 'aeiouun'),
               '[^a-z0-9]+',
               '',
               'g'
             ) = c.nombre_norm
             OR EXISTS (
               SELECT 1
               FROM comunidades_aliases ca
               WHERE ca.comunidad_id = c.id
                 AND regexp_replace(
                   translate(LOWER(BTRIM(p.comunidad)), 'áéíóúüñ', 'aeiouun'),
                   '[^a-z0-9]+',
                   '',
                   'g'
                 ) LIKE '%' || regexp_replace(
                   translate(LOWER(BTRIM(ca.alias)), 'áéíóúüñ', 'aeiouun'),
                   '[^a-z0-9]+',
                   '',
                   'g'
                 ) || '%'
             )
           )
         )
    ) p ON TRUE
    LEFT JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    GROUP BY c.id, c.nombre, c.territorio, c.sector, c.lat, c.lng
    ORDER BY c.territorio, c.sector, c.nombre
  `);

  res.json(rows);
}));

module.exports = router;
