const express = require('express');
const { authMiddleware, permitirRoles } = require('../middleware/auth');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { catalogoSchema, catalogoIdSchema, catalogoListSchema } = require('../validations/catalogos.schemas');
const { createCatalogosController } = require('../controllers/catalogosController');
const { createCatalogosService } = require('../services/catalogosService');

// Punto único para incorporar permisos granulares en una fase futura.
const autorizarEscritura = permitirRoles('admin', 'director');
function createCatalogosRouter({ authenticate = authMiddleware, services = {} } = {}) {
  const router = express.Router();
  router.use(authenticate);
  for (const tipo of ['cargos', 'especialidades']) {
    const controller = createCatalogosController(services[tipo] || createCatalogosService(tipo));
    router.get(`/${tipo}`, validateQuery(catalogoListSchema), controller.listar);
    router.get(`/${tipo}/:id`, validateParams(catalogoIdSchema), controller.obtener);
    router.post(`/${tipo}`, autorizarEscritura, validateBody(catalogoSchema), controller.crear);
    router.put(`/${tipo}/:id`, autorizarEscritura, validateParams(catalogoIdSchema), validateBody(catalogoSchema), controller.actualizar);
    router.patch(`/${tipo}/:id/desactivar`, autorizarEscritura, validateParams(catalogoIdSchema), controller.desactivar);
    router.patch(`/${tipo}/:id/reactivar`, autorizarEscritura, validateParams(catalogoIdSchema), controller.reactivar);
  }
  return router;
}
module.exports = { createCatalogosRouter };
