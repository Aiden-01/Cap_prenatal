const pool = require('../db/pool');
const { obtenerEmbarazoActivoId } = require('../utils/embarazos');

const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

function buildUpdate(data, allowedFields) {
  const campos = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(data, field));
  const sets = campos.map((field, index) => `${field} = $${index + 1}`).join(', ');
  const valores = campos.map((field) => emptyToNull(data[field]));
  return { campos, sets, valores };
}

const CONTROL_FIELDS = [
  'numero_control', 'fecha', 'hora', 'motivo_consulta',
  'peligro_hemorragia_vaginal', 'peligro_palidez', 'peligro_dolor_cabeza',
  'peligro_hipertension', 'peligro_dolor_epigastrico',
  'peligro_trastornos_visuales', 'peligro_fiebre', 'peligro_otro',
  'edad_gestacional_semanas', 'nombre_acompanante', 'nombre_cargo_atiende',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca', 'frecuencia_respiratoria',
  'temperatura', 'perimetro_braquial_cm', 'peso_kg', 'talla_cm', 'imc',
  'examen_bucodental', 'examen_mamas',
  'altura_uterina_cm', 'fcf', 'movimientos_fetales',
  'situacion_fetal', 'presentacion_fetal',
  'sangre_manchado', 'verrugas_herpes_papilomas', 'flujo_vaginal', 'otros_ginecologico',
  'hematologia_realizada', 'hematologia_resultado',
  'glicemia_realizada', 'glicemia_resultado',
  'grupo_rh_realizado', 'grupo_rh_resultado',
  'orina_realizada', 'orina_bacteriuria', 'orina_proteinuria',
  'heces_realizada', 'heces_resultado',
  'vih_realizado', 'vih_resultado', 'vih_resultado_valor',
  'vdrl_realizado', 'vdrl_resultado', 'vdrl_tratamiento_indicado',
  'torch_realizado', 'torch_resultado_positivo', 'torch_resultado_valor',
  'papanicolau_ivaa_realizado', 'papanicolau_ivaa_fecha_toma', 'papanicolau_ivaa_resultado',
  'hepatitis_b_realizado', 'hepatitis_b_resultado',
  'otros_lab', 'usg_realizado', 'usg_hallazgos',
  'sulfato_ferroso', 'sulfato_ferroso_tabletas',
  'acido_folico', 'acido_folico_tabletas',
  'suplementacion_hallazgos', 'suplementacion_tratamiento',
  'orient_plan_emergencia_parto', 'orient_alimentacion_embarazo',
  'orient_senales_peligro', 'orient_lactancia_materna',
  'orient_planificacion_familiar', 'orient_importancia_postparto',
  'orient_vacunacion_nino', 'orient_pre_post_prueba_vih',
  'orient_importancia_atenciones', 'orient_tratamiento_its_pareja',
  'orient_otros', 'impresion_clinica', 'tratamiento', 'cita_siguiente',
];

const PUERPERIO_FIELDS = [
  'numero_atencion', 'fecha', 'hora', 'signos_peligro',
  'dias_despues_parto', 'lugar_atencion_parto', 'quien_atendio_parto',
  'recien_nacido_vivo', 'tipo_parto', 'tuvo_apego_inmediato',
  'lactancia_materna_exclusiva', 'herida_operatoria',
  'pa_sistolica', 'pa_diastolica', 'frecuencia_cardiaca',
  'frecuencia_respiratoria', 'temperatura',
  'examen_mamas', 'examen_ginecologico',
  'orientacion_consejeria', 'impresion_clinica', 'tratamiento',
  'nombre_cargo_atiende',
];

// ============================================================
// GET /api/pacientes/:pacienteId/controles
// ============================================================
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      `SELECT * FROM controles_prenatales
       WHERE embarazo_id = $1
       ORDER BY numero_control`,
      [embarazoId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar controles' });
  }
}

// ============================================================
// GET /api/pacientes/:pacienteId/controles/:id
// ============================================================
async function obtener(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM controles_prenatales WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Control no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener control' });
  }
}

// ============================================================
// PUT /api/pacientes/:pacienteId/controles/:id
// ============================================================
async function actualizar(req, res) {
  const { pacienteId, id } = req.params;
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
  const { campos, sets, valores } = buildUpdate(req.body, CONTROL_FIELDS);

  if (campos.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  try {
    valores.push(id, embarazoId);
    const { rows } = await pool.query(
      `UPDATE controles_prenatales SET ${sets}, updated_at = NOW()
       WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
       RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ error: 'Control no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un control con ese numero para esta paciente' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar control prenatal' });
  }
}

// ============================================================
// DELETE /api/pacientes/:pacienteId/controles/:id
// ============================================================
async function eliminar(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rowCount } = await pool.query(
      'DELETE FROM controles_prenatales WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Control no encontrado' });
    return res.json({ message: 'Control eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar control prenatal' });
  }
}

// ============================================================
// POST /api/pacientes/:pacienteId/controles
// Upsert por (paciente_id, numero_control)
// ============================================================
async function crear(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.numero_control || !d.fecha) {
    return res.status(400).json({ error: 'numero_control y fecha son requeridos' });
  }

  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      `INSERT INTO controles_prenatales (
        paciente_id, embarazo_id, numero_control, fecha, hora,
        motivo_consulta,
        -- Signos de peligro
        peligro_hemorragia_vaginal, peligro_palidez, peligro_dolor_cabeza,
        peligro_hipertension, peligro_dolor_epigastrico,
        peligro_trastornos_visuales, peligro_fiebre, peligro_otro,
        -- Info de la atención
        edad_gestacional_semanas, nombre_acompanante, nombre_cargo_atiende,
        -- Examen físico
        pa_sistolica, pa_diastolica, frecuencia_cardiaca, frecuencia_respiratoria,
        temperatura, perimetro_braquial_cm, peso_kg, talla_cm, imc,
        examen_bucodental, examen_mamas,
        -- Examen obstétrico
        altura_uterina_cm, fcf, movimientos_fetales,
        situacion_fetal, presentacion_fetal,
        -- Examen ginecológico
        sangre_manchado, verrugas_herpes_papilomas, flujo_vaginal, otros_ginecologico,
        -- Laboratorios
        hematologia_realizada, hematologia_resultado,
        glicemia_realizada, glicemia_resultado,
        grupo_rh_realizado, grupo_rh_resultado,
        orina_realizada, orina_bacteriuria, orina_proteinuria,
        heces_realizada, heces_resultado,
        vih_realizado, vih_resultado, vih_resultado_valor,
        vdrl_realizado, vdrl_resultado, vdrl_tratamiento_indicado,
        torch_realizado, torch_resultado_positivo, torch_resultado_valor,
        papanicolau_ivaa_realizado, papanicolau_ivaa_fecha_toma, papanicolau_ivaa_resultado,
        hepatitis_b_realizado, hepatitis_b_resultado,
        otros_lab,
        -- USG
        usg_realizado, usg_hallazgos,
        -- Suplementación
        sulfato_ferroso, sulfato_ferroso_tabletas,
        acido_folico, acido_folico_tabletas,
        suplementacion_hallazgos, suplementacion_tratamiento,
        -- Orientaciones
        orient_plan_emergencia_parto, orient_alimentacion_embarazo,
        orient_senales_peligro, orient_lactancia_materna,
        orient_planificacion_familiar, orient_importancia_postparto,
        orient_vacunacion_nino, orient_pre_post_prueba_vih,
        orient_importancia_atenciones, orient_tratamiento_its_pareja,
        orient_otros,
        -- IC / Tx
        impresion_clinica, tratamiento, cita_siguiente,
        -- Auditoría
        registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
        $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
        $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
        $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
        $71,$72,$73,$74,$75,$76,$77,$78,$79,$80,
        $81,$82,$83,$84,$85,$86
      )
      ON CONFLICT (embarazo_id, numero_control) DO UPDATE SET
        fecha                      = EXCLUDED.fecha,
        hora                       = EXCLUDED.hora,
        motivo_consulta            = EXCLUDED.motivo_consulta,
        peligro_hemorragia_vaginal = EXCLUDED.peligro_hemorragia_vaginal,
        peligro_palidez            = EXCLUDED.peligro_palidez,
        peligro_dolor_cabeza       = EXCLUDED.peligro_dolor_cabeza,
        peligro_hipertension       = EXCLUDED.peligro_hipertension,
        peligro_dolor_epigastrico  = EXCLUDED.peligro_dolor_epigastrico,
        peligro_trastornos_visuales= EXCLUDED.peligro_trastornos_visuales,
        peligro_fiebre             = EXCLUDED.peligro_fiebre,
        peligro_otro               = EXCLUDED.peligro_otro,
        edad_gestacional_semanas   = EXCLUDED.edad_gestacional_semanas,
        nombre_acompanante         = EXCLUDED.nombre_acompanante,
        nombre_cargo_atiende       = EXCLUDED.nombre_cargo_atiende,
        pa_sistolica               = EXCLUDED.pa_sistolica,
        pa_diastolica              = EXCLUDED.pa_diastolica,
        frecuencia_cardiaca        = EXCLUDED.frecuencia_cardiaca,
        frecuencia_respiratoria    = EXCLUDED.frecuencia_respiratoria,
        temperatura                = EXCLUDED.temperatura,
        perimetro_braquial_cm      = EXCLUDED.perimetro_braquial_cm,
        peso_kg                    = EXCLUDED.peso_kg,
        talla_cm                   = EXCLUDED.talla_cm,
        imc                        = EXCLUDED.imc,
        examen_bucodental          = EXCLUDED.examen_bucodental,
        examen_mamas               = EXCLUDED.examen_mamas,
        altura_uterina_cm          = EXCLUDED.altura_uterina_cm,
        fcf                        = EXCLUDED.fcf,
        movimientos_fetales        = EXCLUDED.movimientos_fetales,
        situacion_fetal            = EXCLUDED.situacion_fetal,
        presentacion_fetal         = EXCLUDED.presentacion_fetal,
        sangre_manchado            = EXCLUDED.sangre_manchado,
        verrugas_herpes_papilomas  = EXCLUDED.verrugas_herpes_papilomas,
        flujo_vaginal              = EXCLUDED.flujo_vaginal,
        otros_ginecologico         = EXCLUDED.otros_ginecologico,
        hematologia_realizada      = EXCLUDED.hematologia_realizada,
        hematologia_resultado      = EXCLUDED.hematologia_resultado,
        glicemia_realizada         = EXCLUDED.glicemia_realizada,
        glicemia_resultado         = EXCLUDED.glicemia_resultado,
        grupo_rh_realizado         = EXCLUDED.grupo_rh_realizado,
        grupo_rh_resultado         = EXCLUDED.grupo_rh_resultado,
        orina_realizada            = EXCLUDED.orina_realizada,
        orina_bacteriuria          = EXCLUDED.orina_bacteriuria,
        orina_proteinuria          = EXCLUDED.orina_proteinuria,
        heces_realizada            = EXCLUDED.heces_realizada,
        heces_resultado            = EXCLUDED.heces_resultado,
        vih_realizado              = EXCLUDED.vih_realizado,
        vih_resultado              = EXCLUDED.vih_resultado,
        vih_resultado_valor        = EXCLUDED.vih_resultado_valor,
        vdrl_realizado             = EXCLUDED.vdrl_realizado,
        vdrl_resultado             = EXCLUDED.vdrl_resultado,
        vdrl_tratamiento_indicado  = EXCLUDED.vdrl_tratamiento_indicado,
        torch_realizado            = EXCLUDED.torch_realizado,
        torch_resultado_positivo   = EXCLUDED.torch_resultado_positivo,
        torch_resultado_valor      = EXCLUDED.torch_resultado_valor,
        papanicolau_ivaa_realizado   = EXCLUDED.papanicolau_ivaa_realizado,
        papanicolau_ivaa_fecha_toma  = EXCLUDED.papanicolau_ivaa_fecha_toma,
        papanicolau_ivaa_resultado   = EXCLUDED.papanicolau_ivaa_resultado,
        hepatitis_b_realizado      = EXCLUDED.hepatitis_b_realizado,
        hepatitis_b_resultado      = EXCLUDED.hepatitis_b_resultado,
        otros_lab                  = EXCLUDED.otros_lab,
        usg_realizado              = EXCLUDED.usg_realizado,
        usg_hallazgos              = EXCLUDED.usg_hallazgos,
        sulfato_ferroso            = EXCLUDED.sulfato_ferroso,
        sulfato_ferroso_tabletas   = EXCLUDED.sulfato_ferroso_tabletas,
        acido_folico               = EXCLUDED.acido_folico,
        acido_folico_tabletas      = EXCLUDED.acido_folico_tabletas,
        suplementacion_hallazgos   = EXCLUDED.suplementacion_hallazgos,
        suplementacion_tratamiento = EXCLUDED.suplementacion_tratamiento,
        orient_plan_emergencia_parto    = EXCLUDED.orient_plan_emergencia_parto,
        orient_alimentacion_embarazo    = EXCLUDED.orient_alimentacion_embarazo,
        orient_senales_peligro          = EXCLUDED.orient_senales_peligro,
        orient_lactancia_materna        = EXCLUDED.orient_lactancia_materna,
        orient_planificacion_familiar   = EXCLUDED.orient_planificacion_familiar,
        orient_importancia_postparto    = EXCLUDED.orient_importancia_postparto,
        orient_vacunacion_nino          = EXCLUDED.orient_vacunacion_nino,
        orient_pre_post_prueba_vih      = EXCLUDED.orient_pre_post_prueba_vih,
        orient_importancia_atenciones   = EXCLUDED.orient_importancia_atenciones,
        orient_tratamiento_its_pareja   = EXCLUDED.orient_tratamiento_its_pareja,
        orient_otros                    = EXCLUDED.orient_otros,
        impresion_clinica          = EXCLUDED.impresion_clinica,
        tratamiento                = EXCLUDED.tratamiento,
        cita_siguiente             = EXCLUDED.cita_siguiente,
        updated_at                 = NOW()
      RETURNING *`,
      [
        pacienteId, embarazoId, d.numero_control, d.fecha, d.hora || null,
        d.motivo_consulta,
        // Signos de peligro
        d.peligro_hemorragia_vaginal ?? false,
        d.peligro_palidez ?? false,
        d.peligro_dolor_cabeza ?? false,
        d.peligro_hipertension ?? false,
        d.peligro_dolor_epigastrico ?? false,
        d.peligro_trastornos_visuales ?? false,
        d.peligro_fiebre ?? false,
        d.peligro_otro || null,
        // Info atención
        d.edad_gestacional_semanas || null,
        d.nombre_acompanante || null,
        d.nombre_cargo_atiende || null,
        // Examen físico
        d.pa_sistolica || null, d.pa_diastolica || null,
        d.frecuencia_cardiaca || null, d.frecuencia_respiratoria || null,
        d.temperatura || null, d.perimetro_braquial_cm || null,
        d.peso_kg || null, d.talla_cm || null, d.imc || null,
        d.examen_bucodental ?? null, d.examen_mamas ?? null,
        // Examen obstétrico
        d.altura_uterina_cm || null, d.fcf || null,
        d.movimientos_fetales ?? null,
        d.situacion_fetal || null, d.presentacion_fetal || null,
        // Examen ginecológico
        d.sangre_manchado ?? false, d.verrugas_herpes_papilomas ?? false,
        d.flujo_vaginal ?? false, d.otros_ginecologico || null,
        // Laboratorios
        d.hematologia_realizada ?? false, d.hematologia_resultado || null,
        d.glicemia_realizada ?? false, d.glicemia_resultado || null,
        d.grupo_rh_realizado ?? false, d.grupo_rh_resultado || null,
        d.orina_realizada ?? false, d.orina_bacteriuria ?? null, d.orina_proteinuria ?? null,
        d.heces_realizada ?? false, d.heces_resultado || null,
        d.vih_realizado ?? false, d.vih_resultado || null, d.vih_resultado_valor || null,
        d.vdrl_realizado ?? false, d.vdrl_resultado || null,
        d.vdrl_tratamiento_indicado ?? false,
        d.torch_realizado ?? false, d.torch_resultado_positivo ?? null, d.torch_resultado_valor || null,
        d.papanicolau_ivaa_realizado ?? false,
        d.papanicolau_ivaa_fecha_toma || null,
        d.papanicolau_ivaa_resultado || null,
        d.hepatitis_b_realizado ?? false, d.hepatitis_b_resultado || null,
        d.otros_lab || null,
        // USG
        d.usg_realizado ?? false, d.usg_hallazgos || null,
        // Suplementación
        d.sulfato_ferroso ?? false, d.sulfato_ferroso_tabletas || null,
        d.acido_folico ?? false, d.acido_folico_tabletas || null,
        d.suplementacion_hallazgos || null, d.suplementacion_tratamiento || null,
        // Orientaciones
        d.orient_plan_emergencia_parto ?? false,
        d.orient_alimentacion_embarazo ?? false,
        d.orient_senales_peligro ?? false,
        d.orient_lactancia_materna ?? false,
        d.orient_planificacion_familiar ?? false,
        d.orient_importancia_postparto ?? false,
        d.orient_vacunacion_nino ?? false,
        d.orient_pre_post_prueba_vih ?? false,
        d.orient_importancia_atenciones ?? false,
        d.orient_tratamiento_its_pareja ?? false,
        d.orient_otros || null,
        // IC / Tx
        d.impresion_clinica || null,
        d.tratamiento || null,
        d.cita_siguiente || null,
        // Auditoría
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar control prenatal' });
  }
}

// ============================================================
// PLAN DE PARTO
// ============================================================
async function obtenerPlanParto(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM planes_parto WHERE embarazo_id = $1 ORDER BY fecha DESC LIMIT 1',
      [embarazoId]
    );
    return res.json(rows[0] || null);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener plan de parto' });
  }
}

async function guardarPlanParto(req, res) {
  const { pacienteId } = req.params;
  const data = req.body;

  if (!data.fecha) return res.status(400).json({ error: 'Fecha requerida' });

  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const existe = await pool.query(
      'SELECT id FROM planes_parto WHERE embarazo_id = $1',
      [embarazoId]
    );

    const BLOQUEADOS = ['id', 'registrado_por', 'created_at', 'updated_at'];
    const campos = Object.keys(data).filter(k => !BLOQUEADOS.includes(k));
    const valores = campos.map(c => data[c]);

    let result;
    if (existe.rows[0]) {
      const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
      valores.push(existe.rows[0].id);
      result = await pool.query(
        `UPDATE planes_parto SET ${sets}, updated_at = NOW()
         WHERE id = $${valores.length} RETURNING *`,
        valores
      );
    } else {
      campos.push('paciente_id', 'embarazo_id', 'registrado_por');
      valores.push(pacienteId, embarazoId, req.usuario.id);
      const ph = valores.map((_, i) => `$${i + 1}`).join(', ');
      result = await pool.query(
        `INSERT INTO planes_parto (${campos.join(', ')}) VALUES (${ph}) RETURNING *`,
        valores
      );
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar plan de parto' });
  }
}

// ============================================================
// PUERPERIO  (reemplaza controles_post_parto)
// ============================================================
async function listarPuerperio(req, res) {
  const { pacienteId } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM controles_puerperio WHERE embarazo_id = $1 ORDER BY numero_atencion',
      [embarazoId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar controles de puerperio' });
  }
}

async function obtenerPuerperio(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      'SELECT * FROM controles_puerperio WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Control de puerperio no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener control de puerperio' });
  }
}

async function guardarPuerperio(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.numero_atencion || !d.fecha) {
    return res.status(400).json({ error: 'numero_atencion (1|2) y fecha son requeridos' });
  }

  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rows } = await pool.query(
      `INSERT INTO controles_puerperio (
        paciente_id, embarazo_id, numero_atencion, fecha, hora,
        signos_peligro,
        dias_despues_parto, lugar_atencion_parto, quien_atendio_parto,
        recien_nacido_vivo, tipo_parto, tuvo_apego_inmediato,
        lactancia_materna_exclusiva, herida_operatoria,
        pa_sistolica, pa_diastolica, frecuencia_cardiaca,
        frecuencia_respiratoria, temperatura,
        examen_mamas, examen_ginecologico,
        orientacion_consejeria, impresion_clinica, tratamiento,
        nombre_cargo_atiende,
        registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26
      )
      ON CONFLICT (embarazo_id, numero_atencion) DO UPDATE SET
        fecha                    = EXCLUDED.fecha,
        hora                     = EXCLUDED.hora,
        signos_peligro           = EXCLUDED.signos_peligro,
        dias_despues_parto       = EXCLUDED.dias_despues_parto,
        lugar_atencion_parto     = EXCLUDED.lugar_atencion_parto,
        quien_atendio_parto      = EXCLUDED.quien_atendio_parto,
        recien_nacido_vivo       = EXCLUDED.recien_nacido_vivo,
        tipo_parto               = EXCLUDED.tipo_parto,
        tuvo_apego_inmediato     = EXCLUDED.tuvo_apego_inmediato,
        lactancia_materna_exclusiva = EXCLUDED.lactancia_materna_exclusiva,
        herida_operatoria        = EXCLUDED.herida_operatoria,
        pa_sistolica             = EXCLUDED.pa_sistolica,
        pa_diastolica            = EXCLUDED.pa_diastolica,
        frecuencia_cardiaca      = EXCLUDED.frecuencia_cardiaca,
        frecuencia_respiratoria  = EXCLUDED.frecuencia_respiratoria,
        temperatura              = EXCLUDED.temperatura,
        examen_mamas             = EXCLUDED.examen_mamas,
        examen_ginecologico      = EXCLUDED.examen_ginecologico,
        orientacion_consejeria   = EXCLUDED.orientacion_consejeria,
        impresion_clinica        = EXCLUDED.impresion_clinica,
        tratamiento              = EXCLUDED.tratamiento,
        nombre_cargo_atiende     = EXCLUDED.nombre_cargo_atiende,
        updated_at               = NOW()
      RETURNING *`,
      [
        pacienteId, embarazoId, d.numero_atencion, d.fecha, d.hora || null,
        d.signos_peligro || null,
        d.dias_despues_parto || null, d.lugar_atencion_parto || null,
        d.quien_atendio_parto || null,
        d.recien_nacido_vivo ?? null, d.tipo_parto || null,
        d.tuvo_apego_inmediato ?? null,
        d.lactancia_materna_exclusiva ?? null, d.herida_operatoria || null,
        d.pa_sistolica || null, d.pa_diastolica || null,
        d.frecuencia_cardiaca || null, d.frecuencia_respiratoria || null,
        d.temperatura || null,
        d.examen_mamas || null, d.examen_ginecologico || null,
        d.orientacion_consejeria || null, d.impresion_clinica || null,
        d.tratamiento || null, d.nombre_cargo_atiende || null,
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar control de puerperio' });
  }
}

async function actualizarPuerperio(req, res) {
  const { pacienteId, id } = req.params;
  const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
  const { campos, sets, valores } = buildUpdate(req.body, PUERPERIO_FIELDS);

  if (campos.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  try {
    valores.push(id, embarazoId);
    const { rows } = await pool.query(
      `UPDATE controles_puerperio SET ${sets}, updated_at = NOW()
       WHERE id = $${valores.length - 1} AND embarazo_id = $${valores.length}
       RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ error: 'Control de puerperio no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe esa atencion de puerperio para esta paciente' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar control de puerperio' });
  }
}

async function eliminarPuerperio(req, res) {
  const { pacienteId, id } = req.params;
  try {
    const embarazoId = await obtenerEmbarazoActivoId(pacienteId);
    const { rowCount } = await pool.query(
      'DELETE FROM controles_puerperio WHERE id = $1 AND embarazo_id = $2',
      [id, embarazoId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Control de puerperio no encontrado' });
    return res.json({ message: 'Control de puerperio eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al eliminar control de puerperio' });
  }
}

module.exports = {
  listar, obtener, crear, actualizar, eliminar,
  obtenerPlanParto, guardarPlanParto,
  listarPuerperio, obtenerPuerperio, guardarPuerperio, actualizarPuerperio, eliminarPuerperio,
};
