const express = require('express');
const controllers = require('../controllers/auditoriaController');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos, verificarPermiso } = require('../middleware/permisos');
const { validateQuery } = require('../middleware/validate');
const { auditoriaQuerySchema } = require('../validations/auditoria.schemas');
const { AppError } = require('../utils/appError');

function createAuditoriaRouter({ controller = controllers, authenticate = authMiddleware,
  loadPermissions = cargarPermisos } = {}) {
  const router = express.Router();
  router.use(authenticate, loadPermissions);
  router.use((req, _res, next) => {
    if (!['director', 'admin'].includes(req.usuario?.rol)) {
      return next(new AppError(403, 'Permiso requerido', { code: 'PERMISO_REQUERIDO' }));
    }
    return next();
  });
  router.get('/usuarios', verificarPermiso('auditoria.ver'), controller.usuarios);
  router.get('/', verificarPermiso('auditoria.ver'), validateQuery(auditoriaQuerySchema), controller.listar);
  return router;
}
module.exports = createAuditoriaRouter();
module.exports.createAuditoriaRouter = createAuditoriaRouter;
