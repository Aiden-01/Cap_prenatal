const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { cargarPermisos } = require('../middleware/permisos');
const { validateQuery } = require('../middleware/validate');
const { profesionalesQuerySchema } = require('../validations/profesionales.schemas');
const profesionalesRepository = require('../repositories/profesionalesRepository');
const { PERMISOS_DIRECTORIO } = require('../services/autoriaClinicaService');
const { HttpError } = require('../utils/httpError');

function createProfesionalesRouter({ authenticate = authMiddleware, loadPermissions = cargarPermisos,
  repository = profesionalesRepository } = {}) {
  const router = express.Router();
  router.use(authenticate, loadPermissions);
  router.get('/', (req, _res, next) => {
    if (!req.usuario?.id || !PERMISOS_DIRECTORIO.some(codigo => req.usuario.permisos?.includes(codigo))) {
      return next(new HttpError(403, 'Permiso funcional requerido para consultar profesionales', { code: 'PERMISO_REQUERIDO' }));
    }
    return next();
  }, validateQuery(profesionalesQuerySchema), async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await repository.listar({ ...req.query, actorRol: req.usuario.rol }));
    } catch (err) { next(err); }
  });
  return router;
}

module.exports = { createProfesionalesRouter };
