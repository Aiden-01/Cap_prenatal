const pool = require('../db/pool');

// GET /api/pacientes?buscar=xxx&pagina=1&limite=20
async function listar(req, res) {
  const { buscar = '', pagina = 1, limite = 20 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const q = `%${buscar}%`;

  try {
    const { rows } = await pool.query(
      `SELECT id, no_historia_clinica, nombre, edad, fur, created_at,
              pa_sistolica, pa_diastolica, peso_lbs, talla_cm
       FROM pacientes
       WHERE nombre ILIKE $1 OR no_historia_clinica ILIKE $1
       ORDER BY nombre ASC
       LIMIT $2 OFFSET $3`,
      [q, parseInt(limite), offset]
    );

    const { rows: total } = await pool.query(
      `SELECT COUNT(*) FROM pacientes WHERE nombre ILIKE $1 OR no_historia_clinica ILIKE $1`,
      [q]
    );

    return res.json({ data: rows, total: parseInt(total[0].count) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar pacientes' });
  }
}

// GET /api/pacientes/:id
async function obtener(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM pacientes WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Paciente no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener paciente' });
  }
}

// POST /api/pacientes
async function crear(req, res) {
  const data = req.body;

  // Campos requeridos
  if (!data.no_historia_clinica || !data.nombre) {
    return res.status(400).json({ error: 'No. historia clínica y nombre son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO pacientes (
        no_historia_clinica, nombre_servicio_salud, area_salud,
        nombre, edad, lugar_residencia, grupo_etnico, poblacion_migrante,
        motivo_consulta, historia_problema_actual,
        fur, no_embarazos, fecha_ultimo_embarazo,
        no_partos_eutocicos, no_partos_distocicos, no_abortos, no_cesarea,
        muerte_fetal_neonatal, ninos_nacidos_antes_8m, ultimo_rn_menor_5lbs,
        ultimo_rn_mayor_9lbs, embarazos_multiples, incompatibilidad_sanguinea,
        tuberculosis, cancer, asma_bronquial, diabetes, hipertension_arterial,
        cardiopatia, its_vih_sida, nefropatia, infecciones_urinarias,
        enfermedad_mental, chagas, sifilis_positivo,
        no_legrados_uterinos, no_cesareas_previas, otra_cirugia,
        fuma, cigarros_dia, ingiere_alcohol, consume_drogas, vacuna_td,
        papanicolaou_fecha, papanicolaou_resultado,
        toma_medicamentos, otros_antecedentes,
        pa_sistolica, pa_diastolica, temperatura, peso_lbs, talla_cm,
        frecuencia_cardiaca, respiraciones,
        palidez, palma_manos, conjuntivas, unas, icteria,
        estado_animo, estado_nutricional, circunferencia_brazo_cm, imc,
        hemorragia_vaginal, papilomas, flujo_vaginal, herpes, ulcera,
        impresion_clinica, tratamiento, consejeria, plan_parto, plan_emergencia,
        cita_siguiente, personal_atendio, registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
        $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
        $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
        $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
        $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
        $71,$72,$73
      )
      RETURNING id, no_historia_clinica, nombre`,
      [
        data.no_historia_clinica, data.nombre_servicio_salud, data.area_salud,
        data.nombre, data.edad, data.lugar_residencia, data.grupo_etnico, data.poblacion_migrante ?? false,
        data.motivo_consulta, data.historia_problema_actual,
        data.fur, data.no_embarazos ?? 0, data.fecha_ultimo_embarazo,
        data.no_partos_eutocicos ?? 0, data.no_partos_distocicos ?? 0, data.no_abortos ?? 0, data.no_cesarea ?? 0,
        data.muerte_fetal_neonatal ?? 0, data.ninos_nacidos_antes_8m ?? false, data.ultimo_rn_menor_5lbs ?? false,
        data.ultimo_rn_mayor_9lbs ?? false, data.embarazos_multiples ?? false, data.incompatibilidad_sanguinea ?? false,
        data.tuberculosis ?? false, data.cancer ?? false, data.asma_bronquial ?? false,
        data.diabetes ?? false, data.hipertension_arterial ?? false,
        data.cardiopatia ?? false, data.its_vih_sida ?? false, data.nefropatia ?? false,
        data.infecciones_urinarias ?? false, data.enfermedad_mental ?? false,
        data.chagas ?? false, data.sifilis_positivo ?? false,
        data.no_legrados_uterinos ?? 0, data.no_cesareas_previas ?? 0, data.otra_cirugia,
        data.fuma ?? false, data.cigarros_dia ?? 0,
        data.ingiere_alcohol ?? false, data.consume_drogas ?? false, data.vacuna_td ?? false,
        data.papanicolaou_fecha, data.papanicolaou_resultado,
        data.toma_medicamentos, data.otros_antecedentes,
        data.pa_sistolica, data.pa_diastolica, data.temperatura, data.peso_lbs, data.talla_cm,
        data.frecuencia_cardiaca, data.respiraciones,
        data.palidez, data.palma_manos, data.conjuntivas, data.unas, data.icteria,
        data.estado_animo, data.estado_nutricional, data.circunferencia_brazo_cm, data.imc,
        data.hemorragia_vaginal ?? false, data.papilomas ?? false, data.flujo_vaginal ?? false,
        data.herpes ?? false, data.ulcera ?? false,
        data.impresion_clinica, data.tratamiento, data.consejeria,
        data.plan_parto, data.plan_emergencia,
        data.cita_siguiente, data.personal_atendio, req.usuario.id
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un paciente con ese No. de historia clínica' });
    }
    return res.status(500).json({ error: 'Error al crear paciente' });
  }
}

// PUT /api/pacientes/:id
async function actualizar(req, res) {
  const { id } = req.params;
  const data = req.body;

  // Construir SET dinámico con los campos enviados
  const campos = Object.keys(data).filter(k => k !== 'id' && k !== 'registrado_por');
  if (campos.length === 0) {
    return res.status(400).json({ error: 'Sin campos para actualizar' });
  }

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const valores = campos.map(c => data[c]);
  valores.push(id);

  try {
    await pool.query(
      `UPDATE pacientes SET ${sets}, updated_at = NOW() WHERE id = $${valores.length}`,
      valores
    );
    return res.json({ message: 'Paciente actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar paciente' });
  }
}

// GET /api/pacientes/:id/expediente — retorna todo el expediente completo
async function expedienteCompleto(req, res) {
  const { id } = req.params;
  try {
    const [paciente, controles, postParto, riesgo, laboratorio, planParto, inmunizaciones, micronutrientes] =
      await Promise.all([
        pool.query('SELECT * FROM pacientes WHERE id = $1', [id]),
        pool.query('SELECT * FROM controles_prenatales WHERE paciente_id = $1 ORDER BY numero_control', [id]),
        pool.query('SELECT * FROM controles_post_parto WHERE paciente_id = $1 ORDER BY numero_control', [id]),
        pool.query('SELECT * FROM fichas_riesgo_obstetrico WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1', [id]),
        pool.query('SELECT * FROM resultados_laboratorio WHERE paciente_id = $1 ORDER BY numero_control', [id]),
        pool.query('SELECT * FROM planes_parto WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1', [id]),
        pool.query('SELECT * FROM inmunizaciones WHERE paciente_id = $1 ORDER BY fecha_aplicacion', [id]),
        pool.query('SELECT * FROM micronutrientes WHERE paciente_id = $1 ORDER BY fecha', [id]),
      ]);

    if (!paciente.rows[0]) return res.status(404).json({ error: 'Paciente no encontrado' });

    return res.json({
      paciente: paciente.rows[0],
      controles_prenatales: controles.rows,
      controles_post_parto: postParto.rows,
      ficha_riesgo: riesgo.rows[0] || null,
      laboratorio: laboratorio.rows,
      plan_parto: planParto.rows[0] || null,
      inmunizaciones: inmunizaciones.rows,
      micronutrientes: micronutrientes.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener expediente' });
  }
}

module.exports = { listar, obtener, crear, actualizar, expedienteCompleto };
