const pdfRepository = require('../repositories/pdfRepository');
const { AppError } = require('../utils/appError');
const { applyAgeRiskFactors, deriveAgeRiskFactors } = require('../domain/riskAgeRules');

function canonicalRiskForPdf(risk, patient) {
  if (!risk) return null;
  const derived = deriveAgeRiskFactors(patient?.fecha_nacimiento, risk.fecha);
  if (!derived.valid) {
    throw new AppError(422, 'No es posible calcular la edad clínica para generar la ficha de riesgo', {
      code: 'RISK_AGE_CONTEXT_INVALID',
    });
  }
  return applyAgeRiskFactors(risk, patient.fecha_nacimiento, risk.fecha);
}

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
    return {
      paciente,
      embarazo,
      ...data,
      riesgo: canonicalRiskForPdf(data.riesgo, paciente),
    };
  }

  async function obtenerFichaRiesgoData(pacienteId, embarazoIdSolicitado = null) {
    const { paciente, embarazo } = await preflightPacienteYEmbarazo(pacienteId, embarazoIdSolicitado);
    const data = await repository.obtenerFichaRiesgoData({
      pacienteId,
      embarazoId: embarazo?.id || null,
    });
    return {
      paciente,
      embarazo,
      ...data,
      riesgo: canonicalRiskForPdf(data.riesgo, paciente),
    };
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
