const pool = require('../db/pool');

const LAB_FIELDS = [
  'orina_1', 'heces_1', 'hematologia_1', 'glicemia_ayunas_1', 'grupo_rh_1',
  'vdrl_rpr_1', 'resultado_vih_1', 'hepatitis_b_1', 'papanicolaou_ivaa_1', 'torch_1',
  'orina_2', 'glicemia_ayunas_2', 'oferta_vih_2', 'vdrl_rpr_2', 'hepatitis_b_2',
  'hematologia_3', 'orina_3', 'glicemia_ayunas_3',
  'orina_4', 'glicemia_ayunas_4', 'oferta_vih_4', 'vdrl_rpr_4', 'hepatitis_b_4',
];

async function listarPorPaciente(pacienteId) {
  const { rows } = await pool.query(
    'SELECT * FROM resultados_laboratorio WHERE paciente_id = $1 ORDER BY numero_control',
    [pacienteId]
  );
  return rows;
}

async function upsert(data) {
  const campos = ['paciente_id', 'numero_control', ...LAB_FIELDS, 'registrado_por'];
  const valores = campos.map((field) => data[field]);
  const placeholders = valores.map((_, index) => `$${index + 1}`).join(',');
  const updateSet = LAB_FIELDS.map((field) => `${field} = EXCLUDED.${field}`).join(',\n      ');

  const { rows } = await pool.query(
    `INSERT INTO resultados_laboratorio (${campos.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (paciente_id, numero_control)
     DO UPDATE SET
      ${updateSet},
      updated_at = NOW()
     RETURNING *`,
    valores
  );

  return rows[0];
}

module.exports = {
  LAB_FIELDS,
  listarPorPaciente,
  upsert,
};
