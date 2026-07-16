const { z, idParam } = require('./common.schemas');

const pdfPatientParamsSchema = z.object({
  pacienteId: idParam,
});

const pdfControlParamsSchema = z.object({
  pacienteId: idParam,
  controlId: idParam,
});

const pdfQuerySchema = z.object({
  embarazo_id: idParam.optional(),
});

module.exports = {
  pdfControlParamsSchema,
  pdfPatientParamsSchema,
  pdfQuerySchema,
};
