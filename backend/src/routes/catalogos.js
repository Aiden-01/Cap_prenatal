const express = require('express');
const { authMiddleware, permitirRoles } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { PERMISO_GESTION_CATALOGOS } = require('../security/clinicalPermissions');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { cargoSchema, catalogoIdSchema, catalogoListSchema } = require('../validations/catalogos.schemas');
const { createCatalogosController } = require('../controllers/catalogosController');
const { createCatalogosService } = require('../services/catalogosService');

const autorizarEscritura = permitirRoles('admin', 'director');
function createCatalogosRouter({ authenticate = authMiddleware, loadPermissions = cargarPermisos, services = {} } = {}) {
  const router = express.Router();
  router.use(authenticate);
  const escritura = [autorizarEscritura, loadPermissions, verificarPermiso(PERMISO_GESTION_CATALOGOS)];
  for (const tipo of ['cargos']) {
    const controller = createCatalogosController(services[tipo] || createCatalogosService(tipo));
    const schema = cargoSchema;
    router.get(`/${tipo}`, validateQuery(catalogoListSchema), controller.listar);
    router.get(`/${tipo}/:id`, validateParams(catalogoIdSchema), controller.obtener);
    router.post(`/${tipo}`, ...escritura, validateBody(schema), controller.crear);
    router.put(`/${tipo}/:id`, ...escritura, validateParams(catalogoIdSchema), validateBody(schema), controller.actualizar);
    router.patch(`/${tipo}/:id/desactivar`, ...escritura, validateParams(catalogoIdSchema), controller.desactivar);
    router.patch(`/${tipo}/:id/reactivar`, ...escritura, validateParams(catalogoIdSchema), controller.reactivar);
  }
  return router;
}
module.exports = { createCatalogosRouter };
