const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();
router.use(authMiddleware);

router.get('/riesgo', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(`
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
    FROM comunidades c
    LEFT JOIN pacientes p ON p.comunidad_id = c.id
    LEFT JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
    LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
    GROUP BY c.id, c.nombre, c.territorio, c.sector, c.lat, c.lng
    ORDER BY c.territorio, c.sector, c.nombre
  `);

  res.json(rows);
}));

module.exports = router;
