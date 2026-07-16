const pdfRepository = require('../repositories/pdfRepository');
const { AppError } = require('../utils/appError');

function createPdfService({ repository = pdfRepository } = {}) {
  async function preflightPaciente(pacienteId) {
    const paciente = await repository.obtenerPacientePorId(pacienteId);
    if (!paciente) {
      throw new AppError(404, 'Paciente no encontrada', { code: 'PATIENT_NOT_FOUND' });
    }
    return paciente;
  }

  async function preflightPacienteYEmbarazo(pacienteId, embarazoIdSolicitado = null) {
    const paciente = await preflightPaciente(pacienteId);

    const embarazo = await repository.resolverEmbarazoParaPdf({
      pacienteId,
      embarazoId: embarazoIdSolicitado,
    });

    if (!embarazo) {
      const message = embarazoIdSolicitado
        ? 'Embarazo no encontrado para esta paciente'
        : 'La paciente no tiene un embarazo registrado para generar el PDF';
      throw new AppError(404, message, {
        code: 'PREGNANCY_NOT_FOUND',
      });
    }

    return { paciente, embarazo };
  }

  async function obtenerControlConPaciente({ id, pacienteId, embarazoId = null }) {
    await preflightPaciente(pacienteId);

    let embarazo = null;
    if (embarazoId) {
      embarazo = await repository.resolverEmbarazoParaPdf({ pacienteId, embarazoId });
      if (!embarazo) {
        throw new AppError(404, 'Embarazo no encontrado para esta paciente', {
          code: 'PREGNANCY_NOT_FOUND',
        });
      }
    }

    const control = await repository.obtenerControlConPaciente({
      id,
      pacienteId,
      embarazoId: embarazo?.id || null,
    });

    return control;
  }

  async function obtenerFichaMspasData(pacienteId, embarazoIdSolicitado = null) {
    const { paciente, embarazo } = await preflightPacienteYEmbarazo(pacienteId, embarazoIdSolicitado);
    const data = await repository.obtenerFichaMspasData({
      pacienteId,
      embarazoId: embarazo?.id || null,
    });
    return { paciente, embarazo, ...data };
  }

  async function obtenerFichaRiesgoData(pacienteId, embarazoIdSolicitado = null) {
    const { paciente, embarazo } = await preflightPacienteYEmbarazo(pacienteId, embarazoIdSolicitado);
    const data = await repository.obtenerFichaRiesgoData({
      pacienteId,
      embarazoId: embarazo?.id || null,
    });
    return { paciente, embarazo, ...data };
  }

  async function obtenerPlanPartoData(pacienteId, embarazoIdSolicitado = null) {
    const { paciente, embarazo } = await preflightPacienteYEmbarazo(pacienteId, embarazoIdSolicitado);
    const data = await repository.obtenerPlanPartoData({
      pacienteId,
      embarazoId: embarazo?.id || null,
    });
    return { paciente, embarazo, ...data };
  }

  return {
    obtenerControlConPaciente,
    obtenerFichaMspasData,
    obtenerFichaRiesgoData,
    obtenerPlanPartoData,
    preflightPaciente,
    preflightPacienteYEmbarazo,
  };
}

const pdfService = createPdfService();

module.exports = {
  ...pdfService,
  createPdfService,
};
