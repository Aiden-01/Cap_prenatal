const pool = require('../db/pool');

// GET /api/reportes/censo?mes=4&anio=2025
// Genera el censo mensual de embarazadas (equivalente al formulario MSPAS)
async function censoMensual(req, res) {
  const { mes, anio } = req.query;

  if (!mes || !anio) {
    return res.status(400).json({ error: 'Parámetros mes y anio son requeridos' });
  }

  try {
    // Pacientes registradas en ese mes (primera consulta)
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.no_historia_clinica,
        p.nombre,
        p.edad,
        p.grupo_etnico,
        p.lugar_residencia,
        p.fur,
        p.no_embarazos,
        p.no_partos_eutocicos + p.no_partos_distocicos AS no_partos,
        p.no_cesarea,
        p.no_abortos,
        -- Hijos vivos = embarazos - muertes fetales/neonatales
        (p.no_embarazos - p.muerte_fetal_neonatal) AS hijos_vivos,
        p.muerte_fetal_neonatal AS hijos_muertos,
        -- FPP estimada (40 semanas desde FUR)
        p.fur + INTERVAL '280 days' AS fecha_probable_parto,
        -- Edad gestacional actual
        EXTRACT(WEEK FROM AGE(CURRENT_DATE, p.fur))::INTEGER AS semanas_gestacion,
        -- Antecedentes (resumen)
        p.diabetes OR p.hipertension_arterial OR p.cardiopatia OR
        p.its_vih_sida OR p.sifilis_positivo AS antecedentes_patologicos,
        -- Riesgo obstétrico
        COALESCE(r.tiene_riesgo, FALSE) AS tiene_riesgo,
        p.created_at
      FROM pacientes p
      LEFT JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
      WHERE EXTRACT(MONTH FROM p.created_at) = $1
        AND EXTRACT(YEAR FROM p.created_at) = $2
      ORDER BY p.nombre ASC`,
      [parseInt(mes), parseInt(anio)]
    );

    return res.json({
      mes: parseInt(mes),
      anio: parseInt(anio),
      total: rows.length,
      pacientes: rows
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al generar censo mensual' });
  }
}

// GET /api/reportes/estadisticas
// Estadísticas generales del sistema
async function estadisticas(req, res) {
  try {
    const [
      totalPacientes,
      pacientesConRiesgo,
      controlesEste_mes,
      distribucionEtnica,
      rangoEdades,
      proximasCitas
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM pacientes'),
      pool.query('SELECT COUNT(*) FROM fichas_riesgo_obstetrico WHERE tiene_riesgo = TRUE'),
      pool.query(`
        SELECT COUNT(*) FROM controles_prenatales
        WHERE EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
      `),
      pool.query(`
        SELECT
          COALESCE(grupo_etnico, 'No especificado') AS etnia,
          COUNT(*) AS total
        FROM pacientes
        GROUP BY grupo_etnico
        ORDER BY total DESC
      `),
      pool.query(`
        SELECT
          CASE
            WHEN edad < 20 THEN 'Menor de 20'
            WHEN edad BETWEEN 20 AND 35 THEN '20-35'
            WHEN edad > 35 THEN 'Mayor de 35'
            ELSE 'No especificado'
          END AS rango,
          COUNT(*) AS total
        FROM pacientes
        GROUP BY rango
        ORDER BY rango
      `),
      pool.query(`
        SELECT p.nombre, p.no_historia_clinica, c.cita_siguiente, c.numero_control
        FROM controles_prenatales c
        JOIN pacientes p ON p.id = c.paciente_id
        WHERE c.cita_siguiente BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY c.cita_siguiente ASC
        LIMIT 15
      `)
    ]);

    return res.json({
      total_pacientes: parseInt(totalPacientes.rows[0].count),
      pacientes_con_riesgo: parseInt(pacientesConRiesgo.rows[0].count),
      controles_este_mes: parseInt(controlesEste_mes.rows[0].count),
      distribucion_etnica: distribucionEtnica.rows,
      rango_edades: rangoEdades.rows,
      proximas_citas: proximasCitas.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
}

// GET /api/reportes/pacientes-riesgo
// Lista pacientes con riesgo obstétrico para seguimiento
async function pacientesConRiesgo(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
        p.id, p.no_historia_clinica, p.nombre, p.edad, p.fur,
        r.fecha AS fecha_ficha_riesgo,
        r.tiene_riesgo,
        r.referida_a,
        -- Criterios positivos
        r.muerte_fetal_neonatal_previa, r.abortos_espontaneos_3mas,
        r.embarazo_multiple, r.menor_20_anos, r.mayor_35_anos,
        r.paciente_rh_negativo, r.hemorragia_vaginal,
        r.vih_positivo_sifilis, r.presion_diastolica_90mas,
        r.anemia, r.diabetes, r.hipertension_arterial
       FROM pacientes p
       JOIN fichas_riesgo_obstetrico r ON r.paciente_id = p.id
       WHERE r.tiene_riesgo = TRUE
       ORDER BY p.nombre ASC`
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener pacientes con riesgo' });
  }
}

module.exports = { censoMensual, estadisticas, pacientesConRiesgo };
