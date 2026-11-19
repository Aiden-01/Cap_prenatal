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
    WITH riesgo_por_comunidad AS (
      SELECT
        p.comunidad_id,
        COUNT(DISTINCT p.id)::INTEGER AS total_riesgo,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'paciente_id', p.id,
            'nombre', TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)),
            'expediente', p.no_expediente,
            'embarazo_id', e.id
          )
          ORDER BY p.apellidos, p.nombres
        ) AS pacientes_riesgo
      FROM pacientes p
      JOIN embarazos e ON e.paciente_id = p.id AND e.estado = 'activo'
      JOIN fichas_riesgo_obstetrico r
        ON r.embarazo_id = e.id AND r.tiene_riesgo = TRUE
      WHERE p.comunidad_id IS NOT NULL
        AND LOWER(BTRIM(COALESCE(p.municipio, ''))) = 'el chal'
      GROUP BY p.comunidad_id
    )
    SELECT c.id, c.nombre, c.territorio, c.sector, c.lat, c.lng,
           COALESCE(r.total_riesgo, 0)::INTEGER AS total_riesgo,
           COALESCE(r.pacientes_riesgo, '[]'::json) AS pacientes_riesgo
    FROM comunidades c
    LEFT JOIN riesgo_por_comunidad r ON r.comunidad_id = c.id
    WHERE c.activo = TRUE OR COALESCE(r.total_riesgo, 0) > 0
    ORDER BY c.territorio, c.sector, c.nombre
  `);

  res.json(rows);
}));

module.exports = router;
