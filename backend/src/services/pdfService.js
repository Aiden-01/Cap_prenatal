const pdfRepository = require('../repositories/pdfRepository');
const { obtenerEmbarazoVisibleId } = require('../utils/embarazos');

function obtenerControlConPaciente(id) {
  return pdfRepository.obtenerControlConPaciente(id);
}

async function obtenerFichaMspasData(pacienteId) {
  const embarazoId = await obtenerEmbarazoVisibleId(pacienteId);
  return pdfRepository.obtenerFichaMspasData({ pacienteId, embarazoId });
}

async function obtenerFichaRiesgoData(pacienteId) {
  const embarazoId = await obtenerEmbarazoVisibleId(pacienteId);
  return pdfRepository.obtenerFichaRiesgoData({ pacienteId, embarazoId });
}

async function obtenerPlanPartoData(pacienteId) {
  const embarazoId = await obtenerEmbarazoVisibleId(pacienteId);
  return pdfRepository.obtenerPlanPartoData({ pacienteId, embarazoId });
}

module.exports = {
  obtenerControlConPaciente,
  obtenerFichaMspasData,
  obtenerFichaRiesgoData,
  obtenerPlanPartoData,
};
