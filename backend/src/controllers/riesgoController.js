const pool = require('../db/pool');
const { obtenerEmbarazoActivoId } = require('../utils/embarazos');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);
const boolOrFalse = (value) => value ?? false;

// GET /api/pacientes/:pacienteId/riesgo
async function obtener(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
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
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const existe = await pool.query(
      'SELECT id FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    );
    if (existe.rows[0]) {
      return res.status(409).json({ error: 'Esta paciente ya tiene una ficha de riesgo registrada' });
    }

    const valores = [
      pacienteId, embarazoId, d.fecha, emptyToNull(d.telefono), emptyToNull(d.pueblo), boolOrFalse(d.migrante), emptyToNull(d.estado_civil),
      emptyToNull(d.escolaridad), emptyToNull(d.ocupacion), emptyToNull(d.nombre_esposo_conviviente), emptyToNull(d.edad_esposo),
      emptyToNull(d.pueblo_esposo), emptyToNull(d.escolaridad_esposo), emptyToNull(d.ocupacion_esposo),
      emptyToNull(d.distancia_servicio_km), emptyToNull(d.tiempo_horas), emptyToNull(d.fecha_ultima_regla), emptyToNull(d.fecha_probable_parto),
      emptyToNull(d.no_embarazos), emptyToNull(d.no_partos), emptyToNull(d.no_cesareas), emptyToNull(d.no_abortos), emptyToNull(d.no_hijos_vivos),
      emptyToNull(d.no_hijos_muertos), emptyToNull(d.edad_embarazo_semanas),
      // criterios 1-7
      boolOrFalse(d.muerte_fetal_neonatal_previa), boolOrFalse(d.abortos_espontaneos_3mas),
      boolOrFalse(d.gestas_3mas), boolOrFalse(d.peso_ultimo_bebe_menor_2500g),
      boolOrFalse(d.peso_ultimo_bebe_mayor_4500g), boolOrFalse(d.antec_hipertension_preeclampsia),
      boolOrFalse(d.cirugias_tracto_reproductivo),
      // criterios 8-19
      boolOrFalse(d.embarazo_multiple), boolOrFalse(d.menor_20_anos), boolOrFalse(d.mayor_35_anos),
      boolOrFalse(d.paciente_rh_negativo), boolOrFalse(d.hemorragia_vaginal),
      boolOrFalse(d.vih_positivo_sifilis), boolOrFalse(d.presion_diastolica_90mas),
      boolOrFalse(d.anemia), boolOrFalse(d.desnutricion_obesidad), boolOrFalse(d.dolor_abdominal),
      boolOrFalse(d.sintomatologia_urinaria), boolOrFalse(d.ictericia),
      // criterios 20-25
      boolOrFalse(d.diabetes), boolOrFalse(d.enfermedad_renal), boolOrFalse(d.enfermedad_corazon),
      boolOrFalse(d.hipertension_arterial), boolOrFalse(d.consumo_drogas_alcohol_tabaco),
      boolOrFalse(d.otra_enfermedad_severa), emptyToNull(d.otra_enfermedad_descripcion),
      emptyToNull(d.referida_a), emptyToNull(d.nombre_personal_atendio)
    ];

    const result = await pool.query(
      `INSERT INTO fichas_riesgo_obstetrico (
        paciente_id, embarazo_id, fecha, telefono, pueblo, migrante, estado_civil,
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
        $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54
      )
      RETURNING *, tiene_riesgo`,
      [...valores, req.usuario.id]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esta paciente ya tiene una ficha de riesgo registrada' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar ficha de riesgo' });
  }
}

async function actualizar(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.fecha) return res.status(400).json({ error: 'Fecha requerida' });

  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const valores = [
      embarazoId, d.fecha, emptyToNull(d.telefono), emptyToNull(d.pueblo), boolOrFalse(d.migrante), emptyToNull(d.estado_civil),
      emptyToNull(d.escolaridad), emptyToNull(d.ocupacion), emptyToNull(d.nombre_esposo_conviviente), emptyToNull(d.edad_esposo),
      emptyToNull(d.pueblo_esposo), emptyToNull(d.escolaridad_esposo), emptyToNull(d.ocupacion_esposo),
      emptyToNull(d.distancia_servicio_km), emptyToNull(d.tiempo_horas), emptyToNull(d.fecha_ultima_regla), emptyToNull(d.fecha_probable_parto),
      emptyToNull(d.no_embarazos), emptyToNull(d.no_partos), emptyToNull(d.no_cesareas), emptyToNull(d.no_abortos), emptyToNull(d.no_hijos_vivos),
      emptyToNull(d.no_hijos_muertos), emptyToNull(d.edad_embarazo_semanas),
      boolOrFalse(d.muerte_fetal_neonatal_previa), boolOrFalse(d.abortos_espontaneos_3mas),
      boolOrFalse(d.gestas_3mas), boolOrFalse(d.peso_ultimo_bebe_menor_2500g),
      boolOrFalse(d.peso_ultimo_bebe_mayor_4500g), boolOrFalse(d.antec_hipertension_preeclampsia),
      boolOrFalse(d.cirugias_tracto_reproductivo),
      boolOrFalse(d.embarazo_multiple), boolOrFalse(d.menor_20_anos), boolOrFalse(d.mayor_35_anos),
      boolOrFalse(d.paciente_rh_negativo), boolOrFalse(d.hemorragia_vaginal),
      boolOrFalse(d.vih_positivo_sifilis), boolOrFalse(d.presion_diastolica_90mas),
      boolOrFalse(d.anemia), boolOrFalse(d.desnutricion_obesidad), boolOrFalse(d.dolor_abdominal),
      boolOrFalse(d.sintomatologia_urinaria), boolOrFalse(d.ictericia),
      boolOrFalse(d.diabetes), boolOrFalse(d.enfermedad_renal), boolOrFalse(d.enfermedad_corazon),
      boolOrFalse(d.hipertension_arterial), boolOrFalse(d.consumo_drogas_alcohol_tabaco),
      boolOrFalse(d.otra_enfermedad_severa), emptyToNull(d.otra_enfermedad_descripcion),
      emptyToNull(d.referida_a), emptyToNull(d.nombre_personal_atendio)
    ];

    const result = await pool.query(
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
      WHERE embarazo_id=$1
      RETURNING *, tiene_riesgo`,
      valores
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Ficha de riesgo no encontrada' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar ficha de riesgo' });
  }
}

async function eliminar(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rowCount } = await pool.query(
      'DELETE FROM fichas_riesgo_obstetrico WHERE embarazo_id = $1',
      [embarazoId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Ficha de riesgo no encontrada' });
    return res.json({ message: 'Ficha de riesgo eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar ficha de riesgo' });
  }
}

module.exports = { obtener, guardar, actualizar, eliminar };
