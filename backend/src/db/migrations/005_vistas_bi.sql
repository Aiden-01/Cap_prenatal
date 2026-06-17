-- ============================================================
-- CAPA BI LOCAL - VISTAS PARA LOOKER STUDIO
-- CAP El Chal - Fichas clinicas prenatales MSPAS
-- ============================================================

CREATE OR REPLACE VIEW vw_censo_mensual AS
SELECT
  DATE_TRUNC('month', p.created_at)::date AS mes_registro,
  EXTRACT(YEAR FROM p.created_at)::integer AS anio,
  EXTRACT(MONTH FROM p.created_at)::integer AS mes,
  CASE
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) BETWEEN 0 AND 13
      THEN '1er trimestre'
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) BETWEEN 14 AND 27
      THEN '2do trimestre'
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) >= 28
      THEN '3er trimestre'
    ELSE 'sin edad gestacional'
  END AS trimestre_embarazo,
  COUNT(*)::integer AS total_embarazadas
FROM pacientes p
JOIN embarazos e ON e.paciente_id = p.id
WHERE e.estado = 'activo'
GROUP BY
  DATE_TRUNC('month', p.created_at)::date,
  EXTRACT(YEAR FROM p.created_at)::integer,
  EXTRACT(MONTH FROM p.created_at)::integer,
  CASE
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) BETWEEN 0 AND 13
      THEN '1er trimestre'
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) BETWEEN 14 AND 27
      THEN '2do trimestre'
    WHEN FLOOR((CURRENT_DATE - COALESCE(e.fur, p.fur)) / 7.0) >= 28
      THEN '3er trimestre'
    ELSE 'sin edad gestacional'
  END;

COMMENT ON VIEW vw_censo_mensual IS
  'Vista BI para censo mensual de embarazadas activas registradas en el modulo Datos Generales de la Paciente de la Ficha Clinica Prenatal y Puerperio MSPAS, desglosada por trimestre segun FUR del embarazo.';

CREATE OR REPLACE VIEW vw_cumplimiento_controles_prenatales AS
SELECT
  p.id AS paciente_id,
  e.id AS embarazo_id,
  p.no_expediente,
  CONCAT_WS(' ', p.nombres, p.apellidos) AS paciente,
  e.estado AS estado_embarazo,
  COALESCE(e.fur, p.fur) AS fur,
  COALESCE(e.fpp, p.fpp) AS fpp,
  COUNT(c.id)::integer AS controles_realizados,
  4::integer AS controles_minimos_mspas,
  GREATEST(4 - COUNT(c.id), 0)::integer AS controles_faltantes,
  (COUNT(c.id) >= 4) AS cumple_minimo
FROM pacientes p
JOIN embarazos e ON e.paciente_id = p.id
LEFT JOIN controles_prenatales c ON c.embarazo_id = e.id
WHERE e.estado = 'activo'
GROUP BY
  p.id,
  e.id,
  p.no_expediente,
  p.nombres,
  p.apellidos,
  e.estado,
  COALESCE(e.fur, p.fur),
  COALESCE(e.fpp, p.fpp);

COMMENT ON VIEW vw_cumplimiento_controles_prenatales IS
  'Vista BI del modulo Controles Prenatales de la Ficha Clinica Prenatal y Puerperio MSPAS; resume por embarazada activa los controles realizados frente al minimo normativo MSPAS de 4 controles prenatales.';

CREATE OR REPLACE VIEW vw_riesgo_obstetrico AS
SELECT
  CASE
    WHEN r.tiene_riesgo THEN 'alto'
    ELSE 'bajo'
  END AS nivel_riesgo,
  COUNT(DISTINCT p.id)::integer AS total_pacientes
FROM pacientes p
JOIN embarazos e ON e.paciente_id = p.id
JOIN fichas_riesgo_obstetrico r ON r.embarazo_id = e.id
WHERE e.estado = 'activo'
GROUP BY
  CASE
    WHEN r.tiene_riesgo THEN 'alto'
    ELSE 'bajo'
  END;

COMMENT ON VIEW vw_riesgo_obstetrico IS
  'Vista BI de la Ficha de Riesgo Obstetrico MSPAS; distribuye embarazadas activas con ficha registrada segun clasificacion automatica alto/bajo basada en criterios de riesgo obstetrico.';
