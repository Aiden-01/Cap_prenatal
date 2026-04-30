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
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener paciente' });
  }
}

const emptyToNull = (value) => value === '' ? null : value;
const bool = (value) => value ?? false;
const num = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  return value;
};

function buildPacienteInsertData(d, usuarioId) {
  return {
    no_expediente: d.no_expediente,
    cui: emptyToNull(d.cui),

    nombre_establecimiento: emptyToNull(d.nombre_establecimiento),
    distrito: emptyToNull(d.distrito),
    area_salud: emptyToNull(d.area_salud),
    categoria_servicio: emptyToNull(d.categoria_servicio),

    nombres: d.nombres,
    apellidos: d.apellidos,
    fecha_nacimiento: emptyToNull(d.fecha_nacimiento),
    rango_edad: emptyToNull(d.rango_edad),
    clasificacion_alfa_beta: emptyToNull(d.clasificacion_alfa_beta),
    domicilio: emptyToNull(d.domicilio),
    municipio: emptyToNull(d.municipio),
    territorio: emptyToNull(d.territorio),
    sector: emptyToNull(d.sector),
    comunidad: emptyToNull(d.comunidad),
    telefono: emptyToNull(d.telefono),

    cobertura_igss: bool(d.cobertura_igss),
    cobertura_privada: bool(d.cobertura_privada),
    cobertura_privada_detalle: emptyToNull(d.cobertura_privada_detalle),
    viene_referida: bool(d.viene_referida),
    referida_de: emptyToNull(d.referida_de),

    nivel_estudios: emptyToNull(d.nivel_estudios),
    ultimo_anio_aprobado: emptyToNull(d.ultimo_anio_aprobado),
    profesion_oficio: emptyToNull(d.profesion_oficio),
    estado_civil: emptyToNull(d.estado_civil),
    vive_sola: bool(d.vive_sola),
    nombre_esposo_conviviente: emptyToNull(d.nombre_esposo_conviviente),

    es_migrante: bool(d.es_migrante),
    migrante_municipio_depto_pais: emptyToNull(d.migrante_municipio_depto_pais),
    pueblo: emptyToNull(d.pueblo),
    comunidad_linguistica: emptyToNull(d.comunidad_linguistica),

    fuma_activamente: bool(d.fuma_activamente),
    fuma_pasivamente: bool(d.fuma_pasivamente),
    consume_drogas: bool(d.consume_drogas),
    consume_alcohol: bool(d.consume_alcohol),
    fuma_activamente_1er_trimestre: bool(d.fuma_activamente_1er_trimestre),
    fuma_activamente_2do_trimestre: bool(d.fuma_activamente_2do_trimestre),
    fuma_activamente_3er_trimestre: bool(d.fuma_activamente_3er_trimestre),
    fuma_pasivamente_1er_trimestre: bool(d.fuma_pasivamente_1er_trimestre),
    fuma_pasivamente_2do_trimestre: bool(d.fuma_pasivamente_2do_trimestre),
    fuma_pasivamente_3er_trimestre: bool(d.fuma_pasivamente_3er_trimestre),
    consume_alcohol_1er_trimestre: bool(d.consume_alcohol_1er_trimestre),
    consume_alcohol_2do_trimestre: bool(d.consume_alcohol_2do_trimestre),
    consume_alcohol_3er_trimestre: bool(d.consume_alcohol_3er_trimestre),
    consume_drogas_1er_trimestre: bool(d.consume_drogas_1er_trimestre),
    consume_drogas_2do_trimestre: bool(d.consume_drogas_2do_trimestre),
    consume_drogas_3er_trimestre: bool(d.consume_drogas_3er_trimestre),
    violencia_1er_trimestre: bool(d.violencia_1er_trimestre),
    violencia_2do_trimestre: bool(d.violencia_2do_trimestre),
    violencia_3er_trimestre: bool(d.violencia_3er_trimestre),
    embarazo_abuso_sexual: bool(d.embarazo_abuso_sexual),

    fur: emptyToNull(d.fur),
    fpp: emptyToNull(d.fpp),
    eg_confiable_fur: bool(d.eg_confiable_fur),
    eg_confiable_usg: bool(d.eg_confiable_usg),

    gestas_previas: num(d.gestas_previas),
    abortos: num(d.abortos),
    partos_vaginales: num(d.partos_vaginales),
    cesareas: num(d.cesareas),
    nacidos_vivos: num(d.nacidos_vivos),
    hijos_viven: num(d.hijos_viven),
    muertos_antes_1sem: num(d.muertos_antes_1sem),
    muertos_despues_1sem: num(d.muertos_despues_1sem),
    cirugia_genito_urinaria: bool(d.cirugia_genito_urinaria),
    infertilidad: bool(d.infertilidad),
    fin_embarazo_anterior: emptyToNull(d.fin_embarazo_anterior),
    fin_embarazo_menos_1anio: bool(d.fin_embarazo_menos_1anio),
    embarazo_planeado: bool(d.embarazo_planeado),
    fracaso_metodo: emptyToNull(d.fracaso_metodo),
    clasificacion_antec_obstetrico: emptyToNull(d.clasificacion_antec_obstetrico),
    rn_menor_2500g: bool(d.rn_menor_2500g),
    rn_mayor_4000g: bool(d.rn_mayor_4000g),
    antec_vih_positivo: bool(d.antec_vih_positivo),
    antec_emb_ectopico: bool(d.antec_emb_ectopico),
    antec_violencia: bool(d.antec_violencia),

    antec_diabetes: bool(d.antec_diabetes),
    antec_diabetes_tipo: emptyToNull(d.antec_diabetes_tipo),
    antec_tbc: bool(d.antec_tbc),
    antec_hipertension: bool(d.antec_hipertension),
    antec_preeclampsia: bool(d.antec_preeclampsia),
    antec_eclampsia: bool(d.antec_eclampsia),
    antec_cardiopatia: bool(d.antec_cardiopatia),
    antec_nefropatia: bool(d.antec_nefropatia),
    antec_otra_condicion: bool(d.antec_otra_condicion),
    antec_otra_condicion_desc: emptyToNull(d.antec_otra_condicion_desc),
    cirugia_genito_urinaria_pers: bool(d.cirugia_genito_urinaria_pers),

    fam_diabetes: bool(d.fam_diabetes),
    fam_tbc: bool(d.fam_tbc),
    fam_hipertension: bool(d.fam_hipertension),
    fam_preeclampsia: bool(d.fam_preeclampsia),
    fam_eclampsia: bool(d.fam_eclampsia),
    fam_cardiopatia: bool(d.fam_cardiopatia),
    fam_gemelos: bool(d.fam_gemelos),
    fam_otra_condicion_medica_grave: bool(d.fam_otra_condicion_medica_grave),

    tiene_ficha_riesgo: bool(d.tiene_ficha_riesgo),
    registrado_por: usuarioId,
  };
}

// ============================================================
// POST /api/pacientes
// ============================================================
async function crear(req, res) {
  const d = req.body;

  if (!d.no_expediente || !d.nombres || !d.apellidos) {
    return res.status(400).json({
      error: 'no_expediente, nombres y apellidos son requeridos',
    });
  }

  try {
    const data = buildPacienteInsertData(d, req.usuario.id);
    const campos = Object.keys(data);
    const placeholders = campos.map((_, i) => `$${i + 1}`).join(', ');
    const valores = campos.map((campo) => data[campo]);

    const { rows } = await pool.query(
      `INSERT INTO pacientes (${campos.join(', ')})
       VALUES (${placeholders})
       RETURNING id, no_expediente, cui, nombres, apellidos`,
      valores
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un expediente con ese numero' });
    }
    return res.status(500).json({ error: 'Error al crear paciente' });
  }
}

// ============================================================
// PUT /api/pacientes/:id  (SET dinamico)
// ============================================================
async function actualizar(req, res) {
  const { id } = req.params;
  const data = req.body;

  const CAMPOS_BLOQUEADOS = ['id', 'registrado_por', 'created_at', 'updated_at', 'edad_manual', 'edad_calculada'];
  const campos = Object.keys(data).filter(k => !CAMPOS_BLOQUEADOS.includes(k));

  if (campos.length === 0) {
    return res.status(400).json({ error: 'Sin campos para actualizar' });
  }

  const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const valores = campos.map(c => emptyToNull(data[c]));
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
// GET /api/pacientes/:id/expediente  - expediente completo
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
      referencias,
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
