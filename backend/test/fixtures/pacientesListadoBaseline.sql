-- CPREN-44: SQL OLD congelado solo para equivalencia y regresion.
-- No se usa en runtime ni se actualiza con el SQL productivo.
-- No es la fuente de verdad del listado.
SELECT pacientes.id, no_expediente, cui,
            nombres, apellidos,
            fecha_nacimiento, pacientes.fur, pacientes.fpp,
            municipio, comunidad, telefono,
            pacientes.created_at,
            embarazo_actual.id AS embarazo_id,
            embarazo_actual.estado AS embarazo_estado,
            embarazo_actual.fur AS embarazo_fur,
            embarazo_actual.fpp AS embarazo_fpp,
            COALESCE(riesgo_actual.tiene_riesgo, pacientes.tiene_ficha_riesgo, FALSE) AS tiene_riesgo
     FROM pacientes
     LEFT JOIN LATERAL (
       SELECT id, estado, fur, fpp
       FROM embarazos
       WHERE paciente_id = pacientes.id
       ORDER BY
         CASE estado
           WHEN 'activo' THEN 1
           WHEN 'puerperio' THEN 2
           ELSE 3
         END,
         numero_embarazo DESC
       LIMIT 1
     ) embarazo_actual ON TRUE
     LEFT JOIN LATERAL (
       SELECT tiene_riesgo
       FROM fichas_riesgo_obstetrico
       WHERE embarazo_id = embarazo_actual.id
       ORDER BY fecha DESC LIMIT 1
     ) riesgo_actual ON TRUE
     WHERE nombres ILIKE $1
        OR apellidos ILIKE $1
        OR no_expediente ILIKE $1
        OR cui ILIKE $1
     ORDER BY nombres ASC, apellidos ASC
     LIMIT $2 OFFSET $3
