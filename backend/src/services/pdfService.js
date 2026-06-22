const pdfRepository = require('../repositories/pdfRepository');
const { resolverEmbarazoParaLectura } = require('../utils/embarazos');

async function obtenerControlConPaciente({ id, pacienteId, embarazoId = null }) {
  if (embarazoId) {
    await resolverEmbarazoParaLectura({ pacienteId, embarazoId });
  }
  return pdfRepository.obtenerControlConPaciente({ id, pacienteId, embarazoId });
}

async function obtenerFichaMspasData(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return pdfRepository.obtenerFichaMspasData({ pacienteId, embarazoId: embarazo?.id || null });
}

async function obtenerFichaRiesgoData(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return pdfRepository.obtenerFichaRiesgoData({ pacienteId, embarazoId: embarazo?.id || null });
}

async function obtenerPlanPartoData(pacienteId, embarazoIdSolicitado = null) {
  const embarazo = await resolverEmbarazoParaLectura({ pacienteId, embarazoId: embarazoIdSolicitado });
  return pdfRepository.obtenerPlanPartoData({ pacienteId, embarazoId: embarazo?.id || null });
}

module.exports = {
  obtenerControlConPaciente,
  obtenerFichaMspasData,
  obtenerFichaRiesgoData,
  obtenerPlanPartoData,
};
