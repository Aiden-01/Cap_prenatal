const pool = require('../db/pool');

// ============================================================
// GET /api/pacientes?buscar=xxx&pagina=1&limite=20
// ============================================================
async function listar(req, res) {
  const { buscar = '', pagina = 1, limite = 20 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const q = `%${buscar}%`;

  try {
    const { rows } = await pool.query(
      `SELECT id, no_expediente, cui,
              nombres, apellidos,
              fecha_nacimiento, fur, fpp,
              municipio, comunidad, telefono,
              created_at
       FROM pacientes
       WHERE nombres ILIKE $1
          OR apellidos ILIKE $1
          OR no_expediente ILIKE $1
          OR cui ILIKE $1
       ORDER BY apellidos ASC, nombres ASC
       LIMIT $2 OFFSET $3`,
      [q, parseInt(limite), offset]
    );

    const { rows: total } = await pool.query(
      `SELECT COUNT(*) FROM pacientes
       WHERE nombres ILIKE $1 OR apellidos ILIKE $1
          OR no_expediente ILIKE $1 OR cui ILIKE $1`,
      [q]
    );

    return res.json({ data: rows, total: parseInt(total[0].count) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al listar pacientes' });
  }
}

// ============================================================
// GET /api/pacientes/:id
// ============================================================
async function obtener(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pacientes WHERE id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Paciente no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener paciente' });
  }
}

// ============================================================
// POST /api/pacientes
// ============================================================
async function crear(req, res) {
  const d = req.body;

  if (!d.no_expediente || !d.nombres || !d.apellidos) {
    return res.status(400).json({
      error: 'no_expediente, nombres y apellidos son requeridos'
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO pacientes (
        -- Identificación
        no_expediente, cui,
        -- Establecimiento
        nombre_establecimiento, distrito, area_salud, categoria_servicio,
        -- Datos personales
        nombres, apellidos, fecha_nacimiento, rango_edad, clasificacion_alfa_beta,
        domicilio, municipio, territorio, sector, comunidad, telefono,
        -- Cobertura
        cobertura_igss, cobertura_privada, cobertura_privada_detalle,
        viene_referida, referida_de,
        -- Estudios / situación
        nivel_estudios, ultimo_anio_aprobado, profesion_oficio,
        estado_civil, nombre_esposo_conviviente,
        -- Migración / etnia
        es_migrante, migrante_municipio_depto_pais, pueblo, comunidad_linguistica,
        -- Hábitos / riesgo social
        fuma_activamente, fuma_pasivamente, consume_drogas, consume_alcohol,
        violencia_1er_trimestre, violencia_2do_trimestre, violencia_3er_trimestre,
        embarazo_abuso_sexual,
        -- Gestación actual
        fur, fpp, eg_confiable_fur, eg_confiable_usg,
        -- Antecedentes obstétricos
        gestas_previas, abortos, partos_vaginales, cesareas,
        nacidos_vivos, hijos_viven, muertos_antes_1sem, muertos_despues_1sem,
        cirugia_genito_urinaria, infertilidad,
        fin_embarazo_anterior, fin_embarazo_menos_1anio,
        embarazo_planeado, fracaso_metodo,
        clasificacion_antec_obstetrico, rn_menor_2500g, rn_mayor_4000g,
        antec_vih_positivo, antec_emb_ectopico, antec_violencia,
        -- Antecedentes personales
        antec_diabetes, antec_tbc, antec_hipertension, antec_preeclampsia,
        antec_eclampsia, antec_cardiopatia, antec_nefropatia,
        antec_otra_condicion, antec_otra_condicion_desc,
        cirugia_genito_urinaria_pers,
        -- Antecedentes familiares
        fam_diabetes, fam_tbc, fam_hipertension, fam_preeclampsia,
        fam_eclampsia, fam_cardiopatia, fam_gemelos,
        -- Ficha riesgo
        tiene_ficha_riesgo,
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
        $71,$72,$73,$74,$75,$76,$77,$78,$79
      )
      RETURNING id, no_expediente, cui, nombres, apellidos`,
      [
        // Identificación
        d.no_expediente, d.cui,
        // Establecimiento
        d.nombre_establecimiento, d.distrito, d.area_salud, d.categoria_servicio,
        // Datos personales
        d.nombres, d.apellidos, d.fecha_nacimiento, d.rango_edad, d.clasificacion_alfa_beta,
        d.domicilio, d.municipio, d.territorio, d.sector, d.comunidad, d.telefono,
        // Cobertura
        d.cobertura_igss ?? false, d.cobertura_privada ?? false, d.cobertura_privada_detalle,
        d.viene_referida ?? false, d.referida_de,
        // Estudios / situación
        d.nivel_estudios, d.ultimo_anio_aprobado, d.profesion_oficio,
        d.estado_civil, d.nombre_esposo_conviviente,
        // Migración / etnia
        d.es_migrante ?? false, d.migrante_municipio_depto_pais, d.pueblo, d.comunidad_linguistica,
        // Hábitos / riesgo social
        d.fuma_activamente ?? false, d.fuma_pasivamente ?? false,
        d.consume_drogas ?? false, d.consume_alcohol ?? false,
        d.violencia_1er_trimestre ?? false, d.violencia_2do_trimestre ?? false,
        d.violencia_3er_trimestre ?? false, d.embarazo_abuso_sexual ?? false,
        // Gestación actual
        d.fur, d.fpp, d.eg_confiable_fur ?? false, d.eg_confiable_usg ?? false,
        // Antecedentes obstétricos
        d.gestas_previas ?? 0, d.abortos ?? 0, d.partos_vaginales ?? 0, d.cesareas ?? 0,
        d.nacidos_vivos ?? 0, d.hijos_viven ?? 0,
        d.muertos_antes_1sem ?? 0, d.muertos_despues_1sem ?? 0,
        d.cirugia_genito_urinaria ?? false, d.infertilidad ?? false,
        d.fin_embarazo_anterior, d.fin_embarazo_menos_1anio ?? false,
        d.embarazo_planeado ?? false, d.fracaso_metodo,
        d.clasificacion_antec_obstetrico, d.rn_menor_2500g ?? false, d.rn_mayor_4000g ?? false,
        d.antec_vih_positivo ?? false, d.antec_emb_ectopico ?? false, d.antec_violencia ?? false,
        // Antecedentes personales
        d.antec_diabetes ?? false, d.antec_tbc ?? false, d.antec_hipertension ?? false,
        d.antec_preeclampsia ?? false, d.antec_eclampsia ?? false, d.antec_cardiopatia ?? false,
        d.antec_nefropatia ?? false, d.antec_otra_condicion ?? false, d.antec_otra_condicion_desc,
        d.cirugia_genito_urinaria_pers ?? false,
        // Antecedentes familiares
        d.fam_diabetes ?? false, d.fam_tbc ?? false, d.fam_hipertension ?? false,
        d.fam_preeclampsia ?? false, d.fam_eclampsia ?? false,
        d.fam_cardiopatia ?? false, d.fam_gemelos ?? false,
        // Ficha riesgo
        d.tiene_ficha_riesgo ?? false,
        // Auditoría
        req.usuario.id
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un expediente con ese número' });
    }
    return res.status(500).json({ error: 'Error al crear paciente' });
  }
}

// ============================================================
// PUT /api/pacientes/:id  (SET dinámico)
// ============================================================
async function actualizar(req, res) {
  const { id } = req.params;
  const data = req.body;

  const CAMPOS_BLOQUEADOS = ['id', 'registrado_por', 'created_at'];
  const campos = Object.keys(data).filter(k => !CAMPOS_BLOQUEADOS.includes(k));

  if (campos.length === 0) {
    return res.status(400).json({ error: 'Sin campos para actualizar' });
  }

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const valores = campos.map(c => data[c]);
  valores.push(id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE pacientes SET ${sets}, updated_at = NOW() WHERE id = $${valores.length}`,
      valores
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    return res.json({ message: 'Paciente actualizado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar paciente' });
  }
}

// ============================================================
// GET /api/pacientes/:id/expediente  — expediente completo
// ============================================================
async function expedienteCompleto(req, res) {
  const { id } = req.params;
  try {
    const [
      paciente,
      controles,
      puerperio,
      morbilidad,
      riesgo,
      planParto,
      vacunas,
      referencias
    ] = await Promise.all([
      pool.query('SELECT * FROM pacientes WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM controles_prenatales WHERE paciente_id = $1 ORDER BY numero_control',
        [id]
      ),
      pool.query(
        'SELECT * FROM controles_puerperio WHERE paciente_id = $1 ORDER BY numero_atencion',
        [id]
      ),
      pool.query(
        'SELECT * FROM morbilidad_embarazo WHERE paciente_id = $1 ORDER BY fecha DESC',
        [id]
      ),
      pool.query(
        'SELECT * FROM fichas_riesgo_obstetrico WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1',
        [id]
      ),
      pool.query(
        'SELECT * FROM planes_parto WHERE paciente_id = $1 ORDER BY fecha DESC LIMIT 1',
        [id]
      ),
      pool.query(
        'SELECT * FROM vacunas_paciente WHERE paciente_id = $1 ORDER BY tipo_vacuna, numero_dosis',
        [id]
      ),
      pool.query(
        'SELECT * FROM referencias_efectuadas WHERE paciente_id = $1 ORDER BY fecha DESC',
        [id]
      ),
    ]);

    if (!paciente.rows[0]) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    return res.json({
      paciente:             paciente.rows[0],
      controles_prenatales: controles.rows,
      controles_puerperio:  puerperio.rows,
      morbilidad:           morbilidad.rows,
      ficha_riesgo:         riesgo.rows[0] || null,
      plan_parto:           planParto.rows[0] || null,
      vacunas:              vacunas.rows,
      referencias:          referencias.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener expediente' });
  }
}

module.exports = { listar, obtener, crear, actualizar, expedienteCompleto };