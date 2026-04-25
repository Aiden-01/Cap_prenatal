const pool = require('../db/pool');

// GET /api/pacientes/:pacienteId/riesgo
async function obtener(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM fichas_riesgo_obstetrico WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1',
      [pacienteId]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener ficha de riesgo' });
  }
}

// POST /api/pacientes/:pacienteId/riesgo
async function guardar(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.fecha) return res.status(400).json({ error: 'Fecha requerida' });

  try {
    // Upsert basado en paciente (una ficha activa por paciente)
    const existe = await pool.query(
      'SELECT id FROM fichas_riesgo_obstetrico WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1',
      [pacienteId]
    );

    let result;
    const valores = [
      pacienteId, d.fecha, d.telefono, d.pueblo, d.migrante ?? false, d.estado_civil,
      d.escolaridad, d.ocupacion, d.nombre_esposo_conviviente, d.edad_esposo,
      d.pueblo_esposo, d.escolaridad_esposo, d.ocupacion_esposo,
      d.distancia_servicio_km, d.tiempo_horas, d.fecha_ultima_regla, d.fecha_probable_parto,
      d.no_embarazos, d.no_partos, d.no_cesareas, d.no_abortos, d.no_hijos_vivos,
      d.no_hijos_muertos, d.edad_embarazo_semanas,
      // criterios 1-7
      d.muerte_fetal_neonatal_previa ?? false, d.abortos_espontaneos_3mas ?? false,
      d.gestas_3mas ?? false, d.peso_ultimo_bebe_menor_2500g ?? false,
      d.peso_ultimo_bebe_mayor_4500g ?? false, d.antec_hipertension_preeclampsia ?? false,
      d.cirugias_tracto_reproductivo ?? false,
      // criterios 8-19
      d.embarazo_multiple ?? false, d.menor_20_anos ?? false, d.mayor_35_anos ?? false,
      d.paciente_rh_negativo ?? false, d.hemorragia_vaginal ?? false,
      d.vih_positivo_sifilis ?? false, d.presion_diastolica_90mas ?? false,
      d.anemia ?? false, d.desnutricion_obesidad ?? false, d.dolor_abdominal ?? false,
      d.sintomatologia_urinaria ?? false, d.ictericia ?? false,
      // criterios 20-25
      d.diabetes ?? false, d.enfermedad_renal ?? false, d.enfermedad_corazon ?? false,
      d.hipertension_arterial ?? false, d.consumo_drogas_alcohol_tabaco ?? false,
      d.otra_enfermedad_severa ?? false, d.otra_enfermedad_descripcion,
      d.referida_a, d.nombre_personal_atendio
    ];

    if (existe.rows[0]) {
      result = await pool.query(
        `UPDATE fichas_riesgo_obstetrico SET
          fecha=$2, telefono=$3, pueblo=$4, migrante=$5, estado_civil=$6,
          escolaridad=$7, ocupacion=$8, nombre_esposo_conviviente=$9, edad_esposo=$10,
          pueblo_esposo=$11, escolaridad_esposo=$12, ocupacion_esposo=$13,
          distancia_servicio_km=$14, tiempo_horas=$15, fecha_ultima_regla=$16,
          fecha_probable_parto=$17, no_embarazos=$18, no_partos=$19, no_cesareas=$20,
          no_abortos=$21, no_hijos_vivos=$22, no_hijos_muertos=$23,
          edad_embarazo_semanas=$24,
          muerte_fetal_neonatal_previa=$25, abortos_espontaneos_3mas=$26,
          gestas_3mas=$27, peso_ultimo_bebe_menor_2500g=$28,
          peso_ultimo_bebe_mayor_4500g=$29, antec_hipertension_preeclampsia=$30,
          cirugias_tracto_reproductivo=$31,
          embarazo_multiple=$32, menor_20_anos=$33, mayor_35_anos=$34,
          paciente_rh_negativo=$35, hemorragia_vaginal=$36,
          vih_positivo_sifilis=$37, presion_diastolica_90mas=$38,
          anemia=$39, desnutricion_obesidad=$40, dolor_abdominal=$41,
          sintomatologia_urinaria=$42, ictericia=$43,
          diabetes=$44, enfermedad_renal=$45, enfermedad_corazon=$46,
          hipertension_arterial=$47, consumo_drogas_alcohol_tabaco=$48,
          otra_enfermedad_severa=$49, otra_enfermedad_descripcion=$50,
          referida_a=$51, nombre_personal_atendio=$52, updated_at=NOW()
        WHERE paciente_id=$1
        RETURNING *, tiene_riesgo`,
        valores
      );
    } else {
      result = await pool.query(
        `INSERT INTO fichas_riesgo_obstetrico (
          paciente_id, fecha, telefono, pueblo, migrante, estado_civil,
          escolaridad, ocupacion, nombre_esposo_conviviente, edad_esposo,
          pueblo_esposo, escolaridad_esposo, ocupacion_esposo,
          distancia_servicio_km, tiempo_horas, fecha_ultima_regla, fecha_probable_parto,
          no_embarazos, no_partos, no_cesareas, no_abortos, no_hijos_vivos,
          no_hijos_muertos, edad_embarazo_semanas,
          muerte_fetal_neonatal_previa, abortos_espontaneos_3mas,
          gestas_3mas, peso_ultimo_bebe_menor_2500g, peso_ultimo_bebe_mayor_4500g,
          antec_hipertension_preeclampsia, cirugias_tracto_reproductivo,
          embarazo_multiple, menor_20_anos, mayor_35_anos,
          paciente_rh_negativo, hemorragia_vaginal, vih_positivo_sifilis,
          presion_diastolica_90mas, anemia, desnutricion_obesidad,
          dolor_abdominal, sintomatologia_urinaria, ictericia,
          diabetes, enfermedad_renal, enfermedad_corazon,
          hipertension_arterial, consumo_drogas_alcohol_tabaco,
          otra_enfermedad_severa, otra_enfermedad_descripcion,
          referida_a, nombre_personal_atendio, registrado_por
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
          $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53
        )
        RETURNING *, tiene_riesgo`,
        [...valores, req.usuario.id]
      );
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar ficha de riesgo' });
  }
}

module.exports = { obtener, guardar };
