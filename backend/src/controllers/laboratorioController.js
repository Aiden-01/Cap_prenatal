const pool = require('../db/pool');

// GET /api/pacientes/:pacienteId/laboratorio
async function listar(req, res) {
  const { pacienteId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM resultados_laboratorio WHERE paciente_id = $1 ORDER BY numero_control',
      [pacienteId]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar laboratorios' });
  }
}

// POST /api/pacientes/:pacienteId/laboratorio
// Upsert por control (1-4)
async function guardar(req, res) {
  const { pacienteId } = req.params;
  const d = req.body;

  if (!d.numero_control) {
    return res.status(400).json({ error: 'numero_control es requerido (1-4)' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO resultados_laboratorio (
        paciente_id, numero_control,
        orina_1, heces_1, hematologia_1, glicemia_ayunas_1, grupo_rh_1,
        vdrl_rpr_1, resultado_vih_1, hepatitis_b_1, papanicolaou_ivaa_1, torch_1,
        orina_2, glicemia_ayunas_2, oferta_vih_2, vdrl_rpr_2, hepatitis_b_2,
        hematologia_3, orina_3, glicemia_ayunas_3,
        orina_4, glicemia_ayunas_4, oferta_vih_4, vdrl_rpr_4, hepatitis_b_4,
        registrado_por
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
      )
      ON CONFLICT (paciente_id, numero_control)
      DO UPDATE SET
        orina_1 = EXCLUDED.orina_1,
        heces_1 = EXCLUDED.heces_1,
        hematologia_1 = EXCLUDED.hematologia_1,
        glicemia_ayunas_1 = EXCLUDED.glicemia_ayunas_1,
        grupo_rh_1 = EXCLUDED.grupo_rh_1,
        vdrl_rpr_1 = EXCLUDED.vdrl_rpr_1,
        resultado_vih_1 = EXCLUDED.resultado_vih_1,
        hepatitis_b_1 = EXCLUDED.hepatitis_b_1,
        papanicolaou_ivaa_1 = EXCLUDED.papanicolaou_ivaa_1,
        torch_1 = EXCLUDED.torch_1,
        orina_2 = EXCLUDED.orina_2,
        glicemia_ayunas_2 = EXCLUDED.glicemia_ayunas_2,
        oferta_vih_2 = EXCLUDED.oferta_vih_2,
        vdrl_rpr_2 = EXCLUDED.vdrl_rpr_2,
        hepatitis_b_2 = EXCLUDED.hepatitis_b_2,
        hematologia_3 = EXCLUDED.hematologia_3,
        orina_3 = EXCLUDED.orina_3,
        glicemia_ayunas_3 = EXCLUDED.glicemia_ayunas_3,
        orina_4 = EXCLUDED.orina_4,
        glicemia_ayunas_4 = EXCLUDED.glicemia_ayunas_4,
        oferta_vih_4 = EXCLUDED.oferta_vih_4,
        vdrl_rpr_4 = EXCLUDED.vdrl_rpr_4,
        hepatitis_b_4 = EXCLUDED.hepatitis_b_4,
        updated_at = NOW()
      RETURNING *`,
      [
        pacienteId, d.numero_control,
        d.orina_1, d.heces_1, d.hematologia_1, d.glicemia_ayunas_1, d.grupo_rh_1,
        d.vdrl_rpr_1, d.resultado_vih_1, d.hepatitis_b_1, d.papanicolaou_ivaa_1, d.torch_1,
        d.orina_2, d.glicemia_ayunas_2, d.oferta_vih_2, d.vdrl_rpr_2, d.hepatitis_b_2,
        d.hematologia_3, d.orina_3, d.glicemia_ayunas_3,
        d.orina_4, d.glicemia_ayunas_4, d.oferta_vih_4, d.vdrl_rpr_4, d.hepatitis_b_4,
        req.usuario.id
      ]
    );
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al guardar resultados de laboratorio' });
  }
}

module.exports = { listar, guardar };
