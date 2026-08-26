const express = require('express');
const defaultController = require('../controllers/citasPrenatalesController');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { validateQuery } = require('../middleware/validate');
const { citasCalendarioQuerySchema } = require('../validations/citas.schemas');

function createCitasCalendarioRouter({
  controller = defaultController,
  authenticate = authMiddleware,
  loadPermissions = cargarPermisos,
  checkPermission = verificarPermiso,
} = {}) {
  const router = express.Router();
  router.use(authenticate);
  router.use(loadPermissions);
  router.get(
    '/calendario',
    checkPermission('pacientes.ver'),
    validateQuery(citasCalendarioQuerySchema),
    controller.calendario
  );
  return router;
}

const router = createCitasCalendarioRouter();
module.exports = router;
module.exports.createCitasCalendarioRouter = createCitasCalendarioRouter;
