const {
  z,
  requiredInt,
  optionalText,
} = require('./common.schemas');

const labFields = [
  'orina_1', 'heces_1', 'hematologia_1', 'glicemia_ayunas_1', 'grupo_rh_1',
  'vdrl_rpr_1', 'resultado_vih_1', 'hepatitis_b_1', 'papanicolaou_ivaa_1', 'torch_1',
  'orina_2', 'glicemia_ayunas_2', 'oferta_vih_2', 'vdrl_rpr_2', 'hepatitis_b_2',
  'hematologia_3', 'orina_3', 'glicemia_ayunas_3',
  'orina_4', 'glicemia_ayunas_4', 'oferta_vih_4', 'vdrl_rpr_4', 'hepatitis_b_4',
];

const laboratorioShape = {
  numero_control: requiredInt(1, 4),
};

for (const field of labFields) {
  laboratorioShape[field] = optionalText(200);
}

const laboratorioSchema = z.object(laboratorioShape).passthrough();

module.exports = {
  laboratorioSchema,
};
