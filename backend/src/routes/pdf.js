const express = require('express');
const { pdfCombinado, pdfControl, pdfMspas, pdfRiesgoObstetrico, pdfPlanParto } = require('../controllers/pdfController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateParams, validateQuery } = require('../middleware/validate');
const {
  pdfControlParamsSchema,
  pdfPatientParamsSchema,
  pdfQuerySchema,
} = require('../validations/pdf.schemas');

function createPdfRouter({
  controllers = { pdfCombinado, pdfControl, pdfMspas, pdfRiesgoObstetrico, pdfPlanParto },
  permissionMiddleware = verificarPermiso('pacientes.ver'),
} = {}) {
  const router = express.Router({ mergeParams: true });
  const combinedController = controllers.pdfCombinado || pdfCombinado;
  const patientPdfMiddlewares = [
    permissionMiddleware,
    validateParams(pdfPatientParamsSchema),
    validateQuery(pdfQuerySchema),
  ];

  router.get('/mspas/pdf', ...patientPdfMiddlewares, controllers.pdfMspas);
  router.get('/riesgo/pdf', ...patientPdfMiddlewares, controllers.pdfRiesgoObstetrico);
  router.get('/plan-parto/pdf', ...patientPdfMiddlewares, controllers.pdfPlanParto);
  router.get('/documentos/pdf', ...patientPdfMiddlewares, combinedController);
  router.get(
    '/:controlId/pdf',
    permissionMiddleware,
    validateParams(pdfControlParamsSchema),
    validateQuery(pdfQuerySchema),
    controllers.pdfControl
  );

  return router;
}

const router = createPdfRouter();
router.createPdfRouter = createPdfRouter;

module.exports = router;
