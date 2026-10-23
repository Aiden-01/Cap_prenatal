const express = require('express');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { createNotasClinicasController } = require('../controllers/notasClinicasController');
const { HttpError } = require('../utils/httpError');
const { createNotasClinicasPdfController } = require('../controllers/notasClinicasPdfController');
const { notaCreateSchema, notaUpdateSchema, notaFinalizeSchema,
  notaPacienteParamsSchema, notaIdParamsSchema, notaListQuerySchema } = require('../validations/notasClinicas.schemas');

const PREFIJOS = Object.freeze({ nota_evolucion: 'notas_evolucion', nota_enfermeria: 'notas_enfermeria' });
const permitirAccion = accion => (req, _res, next) => {
  const prefijos = req.body?.tipo && Object.hasOwn(PREFIJOS, req.body.tipo)
    ? [PREFIJOS[req.body.tipo]] : Object.values(PREFIJOS);
  if (!prefijos.some(prefijo => req.usuario.permisos?.includes(`${prefijo}.${accion}`))) {
    return next(new HttpError(403, 'Permiso requerido para notas clínicas', { code: 'PERMISO_REQUERIDO' }));
  }
  if (accion === 'ver' && !req.usuario.permisos?.includes('pacientes.ver')) {
    return next(new HttpError(403, 'Permiso requerido para consultar el expediente', { code: 'PERMISO_REQUERIDO' }));
  }
  return next();
};

// pacientes.js proporciona autenticación y permisos actuales; el servicio vuelve a
// verificar sesión, permiso por tipo almacenado y pertenencia a la paciente.
function createNotasClinicasRouter({ service, pdfDependencies = {} } = {}) {
  const router = express.Router({ mergeParams: true });
  const notasService = service || require('../services/notasClinicasService');
  const controller = createNotasClinicasController(notasService);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.usuario?.id) return next(new HttpError(401, 'Autenticación requerida', { code: 'AUTHENTICATION_REQUIRED' }));
    return next();
  });
  router.get('/', permitirAccion('ver'), validateParams(notaPacienteParamsSchema), validateQuery(notaListQuerySchema), controller.listar);
  router.get('/:notaId/pdf', permitirAccion('ver'), validateParams(notaIdParamsSchema), validateQuery(notaListQuerySchema.pick({})),
    createNotasClinicasPdfController({ ...pdfDependencies, service: notasService }));
  router.get('/:notaId', permitirAccion('ver'), validateParams(notaIdParamsSchema), validateQuery(notaListQuerySchema.pick({})), controller.obtener);
  router.post('/', validateParams(notaPacienteParamsSchema), validateQuery(notaListQuerySchema.pick({})), validateBody(notaCreateSchema), permitirAccion('registrar'), controller.crear);
  router.put('/:notaId', permitirAccion('registrar'), validateParams(notaIdParamsSchema), validateQuery(notaListQuerySchema.pick({})), validateBody(notaUpdateSchema), controller.actualizar);
  router.post('/:notaId/finalizar', permitirAccion('finalizar_captura'), validateParams(notaIdParamsSchema), validateQuery(notaListQuerySchema.pick({})), validateBody(notaFinalizeSchema), controller.finalizar);
  return router;
}

module.exports = { createNotasClinicasRouter };
