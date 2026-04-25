const pool = require('../db/pool');

// GET /api/pacientes/:pacienteId/controles
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM controles_prenatales WHERE paciente_id = $1 ORDER BY numero_control`,
      [pacienteId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar controles' });
  }
}

// GET /api/pacientes/:pacienteId/controles/:id
async function obtener(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM controles_prenatales WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Control no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener control' });
  }
}

// POST /api/pacientes/:pacienteId/controles
async function crear(req, res) {
  const { pacienteId } = req.params;
  const data = req.body;

  if (!data.numero_control || !data.fecha) {
    return res.status(400).json({ error: 'numero_control y fecha son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO controles_prenatales (
        paciente_id, numero_control, fecha,
        temperatura, respiraciones, pa_sistolica, pa_diastolica,
        pulso, au_cm, fcf, peso_kg, talla_cm, circunferencia_brazo_cm,
        edad_embarazo_semanas, imc,
        impresion_clinica, tratamiento, consejeria,
        plan_parto, plan_emergencia, cita_siguiente, personal_atendio,
        registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23
      )
      ON CONFLICT (paciente_id, numero_control)
      DO UPDATE SET
        fecha = EXCLUDED.fecha,
        temperatura = EXCLUDED.temperatura,
        respiraciones = EXCLUDED.respiraciones,
        pa_sistolica = EXCLUDED.pa_sistolica,
        pa_diastolica = EXCLUDED.pa_diastolica,
        pulso = EXCLUDED.pulso,
        au_cm = EXCLUDED.au_cm,
        fcf = EXCLUDED.fcf,
        peso_kg = EXCLUDED.peso_kg,
        talla_cm = EXCLUDED.talla_cm,
        circunferencia_brazo_cm = EXCLUDED.circunferencia_brazo_cm,
        edad_embarazo_semanas = EXCLUDED.edad_embarazo_semanas,
        imc = EXCLUDED.imc,
        impresion_clinica = EXCLUDED.impresion_clinica,
        tratamiento = EXCLUDED.tratamiento,
        consejeria = EXCLUDED.consejeria,
        plan_parto = EXCLUDED.plan_parto,
        plan_emergencia = EXCLUDED.plan_emergencia,
        cita_siguiente = EXCLUDED.cita_siguiente,
        personal_atendio = EXCLUDED.personal_atendio,
        updated_at = NOW()
      RETURNING *`,
      [
        pacienteId, data.numero_control, data.fecha,
        data.temperatura, data.respiraciones, data.pa_sistolica, data.pa_diastolica,
        data.pulso, data.au_cm, data.fcf, data.peso_kg, data.talla_cm,
        data.circunferencia_brazo_cm, data.edad_embarazo_semanas, data.imc,
        data.impresion_clinica, data.tratamiento, data.consejeria,
        data.plan_parto, data.plan_emergencia, data.cita_siguiente,
        data.personal_atendio, req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar control prenatal' });
  }
}

// ---- PLAN DE PARTO ----

async function obtenerPlanParto(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM planes_parto WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1',
      [pacienteId]
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

  // Upsert: si ya existe un plan, lo actualiza
  try {
    const existe = await pool.query(
      'SELECT id FROM planes_parto WHERE paciente_id = $1',
      [pacienteId]
    );

    const campos = Object.keys(data).filter(k => k !== 'id' && k !== 'registrado_por');
    const valores = campos.map(c => data[c]);

    let result;
    if (existe.rows[0]) {
      const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
      valores.push(existe.rows[0].id);
      result = await pool.query(
        `UPDATE planes_parto SET ${sets}, updated_at = NOW() WHERE id = $${valores.length} RETURNING *`,
        valores
      );
    } else {
      campos.push('paciente_id', 'registrado_por');
      valores.push(pacienteId, req.usuario.id);
      const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
      result = await pool.query(
        `INSERT INTO planes_parto (${campos.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        valores
      );
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar plan de parto' });
  }
}

// ---- POST PARTO ----

async function listarPostParto(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM controles_post_parto WHERE paciente_id = $1 ORDER BY numero_control',
      [pacienteId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar controles post parto' });
  }
}

async function guardarPostParto(req, res) {
  const { pacienteId } = req.params;
  const data = req.body;

  if (!data.numero_control || !data.fecha) {
    return res.status(400).json({ error: 'numero_control y fecha son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO controles_post_parto (
        paciente_id, numero_control, fecha,
        temperatura, pulso, respiraciones, pa_sistolica, pa_diastolica, peso_kg,
        involucion_utero, presencia_loquios, senales_peligro_madre, senales_peligro_rn,
        diagnostico, tratamiento, consejeria, sulfato_ferroso, acido_folico,
        cita_siguiente, personal_atendio,
        metodo_planificacion, metodo_usado_anteriormente, orientacion,
        registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
      )
      ON CONFLICT (paciente_id, numero_control)
      DO UPDATE SET
        fecha = EXCLUDED.fecha,
        temperatura = EXCLUDED.temperatura,
        pulso = EXCLUDED.pulso,
        respiraciones = EXCLUDED.respiraciones,
        pa_sistolica = EXCLUDED.pa_sistolica,
        pa_diastolica = EXCLUDED.pa_diastolica,
        peso_kg = EXCLUDED.peso_kg,
        involucion_utero = EXCLUDED.involucion_utero,
        presencia_loquios = EXCLUDED.presencia_loquios,
        senales_peligro_madre = EXCLUDED.senales_peligro_madre,
        senales_peligro_rn = EXCLUDED.senales_peligro_rn,
        diagnostico = EXCLUDED.diagnostico,
        tratamiento = EXCLUDED.tratamiento,
        consejeria = EXCLUDED.consejeria,
        sulfato_ferroso = EXCLUDED.sulfato_ferroso,
        acido_folico = EXCLUDED.acido_folico,
        cita_siguiente = EXCLUDED.cita_siguiente,
        personal_atendio = EXCLUDED.personal_atendio,
        metodo_planificacion = EXCLUDED.metodo_planificacion,
        metodo_usado_anteriormente = EXCLUDED.metodo_usado_anteriormente,
        orientacion = EXCLUDED.orientacion,
        updated_at = NOW()
      RETURNING *`,
      [
        pacienteId, data.numero_control, data.fecha,
        data.temperatura, data.pulso, data.respiraciones, data.pa_sistolica, data.pa_diastolica,
        data.peso_kg, data.involucion_utero, data.presencia_loquios, data.senales_peligro_madre,
        data.senales_peligro_rn, data.diagnostico, data.tratamiento, data.consejeria,
        data.sulfato_ferroso ?? false, data.acido_folico ?? false,
        data.cita_siguiente, data.personal_atendio,
        data.metodo_planificacion, data.metodo_usado_anteriormente, data.orientacion,
        req.usuario.id
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar control post parto' });
  }
}

module.exports = {
  listar, obtener, crear,
  obtenerPlanParto, guardarPlanParto,
  listarPostParto, guardarPostParto
};
