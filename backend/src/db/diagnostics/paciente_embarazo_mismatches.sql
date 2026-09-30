-- CPREN-51: solo conteos; lectura consistente, sin identificadores ni datos clinicos.
SELECT 'controles_prenatales' AS tabla, COUNT(*) AS mismatches
FROM controles_prenatales t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id
UNION ALL
SELECT 'vacunas_paciente', COUNT(*)
FROM vacunas_paciente t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id
UNION ALL
SELECT 'controles_puerperio', COUNT(*)
FROM controles_puerperio t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id
UNION ALL
SELECT 'morbilidad_embarazo', COUNT(*)
FROM morbilidad_embarazo t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id
UNION ALL
SELECT 'planes_parto', COUNT(*)
FROM planes_parto t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id
UNION ALL
SELECT 'fichas_riesgo_obstetrico', COUNT(*)
FROM fichas_riesgo_obstetrico t JOIN embarazos e ON e.id=t.embarazo_id
WHERE t.embarazo_id IS NOT NULL AND e.paciente_id <> t.paciente_id;
