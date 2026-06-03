const laboratorioRepository = require('../repositories/laboratorioRepository');

function buildData({ pacienteId, body, usuarioId }) {
  const data = {
    paciente_id: pacienteId,
    numero_control: body.numero_control,
    registrado_por: usuarioId,
  };

  for (const field of laboratorioRepository.LAB_FIELDS) {
    data[field] = body[field];
  }

  return data;
}

async function listarLaboratorios(pacienteId) {
  return laboratorioRepository.listarPorPaciente(pacienteId);
}

async function guardarLaboratorio({ pacienteId, body, req }) {
  return laboratorioRepository.upsert(buildData({
    pacienteId,
    body,
    usuarioId: req.usuario.id,
  }));
}

module.exports = {
  listarLaboratorios,
  guardarLaboratorio,
};
