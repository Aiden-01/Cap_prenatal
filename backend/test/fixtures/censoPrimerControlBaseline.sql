-- SQL OLD congelado para equivalencia/regresión CPREN-45.
-- Fuera de runtime; no es fuente de verdad ni debe sincronizarse automáticamente
-- con el SQL productivo.
WITH primer_control AS (
  SELECT DISTINCT ON (c.embarazo_id)
    c.id,
    c.paciente_id,
    c.embarazo_id,
    c.fecha,
    c.edad_gestacional_semanas
  FROM controles_prenatales c
  WHERE c.numero_control = 1
  ORDER BY c.embarazo_id, c.fecha ASC, c.id ASC
)
SELECT
  p.id,
  e.numero_embarazo,
  e.estado AS estado_embarazo,
  p.no_expediente,
  p.cui,
  p.nombres || ' ' || p.apellidos AS nombre_completo,
  DATE_PART('year', AGE(pc.fecha, p.fecha_nacimiento))::INTEGER AS edad,
  p.pueblo AS etnia,
  COALESCE(com.nombre, p.comunidad) AS comunidad,
  COALESCE(e.fur, p.fur) AS fur,
  COALESCE(e.fpp, p.fpp) AS fpp,
  pc.fecha AS fecha_primer_control,
  COALESCE(
    pc.edad_gestacional_semanas,
    CASE
      WHEN COALESCE(e.fur, p.fur) IS NOT NULL
        AND COALESCE(e.fur, p.fur) <= pc.fecha
      THEN FLOOR((pc.fecha - COALESCE(e.fur, p.fur)) / 7.0)::INTEGER
      ELSE NULL
    END
  ) AS semanas_gestacion,
  COALESCE(p.gestas_previas, 0) AS gestas,
  COALESCE(p.partos_vaginales, 0) + COALESCE(p.cesareas, 0) AS partos,
  COALESCE(p.abortos, 0) AS abortos,
  COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo
FROM primer_control pc
JOIN embarazos e ON e.id = pc.embarazo_id
JOIN pacientes p ON p.id = pc.paciente_id
LEFT JOIN comunidades com ON com.id = p.comunidad_id
LEFT JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
WHERE pc.fecha BETWEEN $1::date AND $2::date
ORDER BY pc.fecha ASC, p.apellidos ASC, p.nombres ASC, e.numero_embarazo ASC
