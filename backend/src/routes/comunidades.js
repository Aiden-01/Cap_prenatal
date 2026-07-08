const express = require('express');
const {
  actualizar,
  crear,
  desactivar,
  listarActivas,
  listarAdmin,
  reactivar,
} = require('../controllers/comunidadesController');
const { authMiddleware, permitirRoles } = require('../middleware/auth');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { pacienteRootIdParam } = require('../validations/common.schemas');
const { comunidadListQuerySchema, comunidadSchema } = require('../validations/comunidades.schemas');

const router = express.Router();

router.use(authMiddleware);

router.get('/activas', listarActivas);

router.use(permitirRoles('director'));

router.get('/', validateQuery(comunidadListQuerySchema), listarAdmin);
router.post('/', validateBody(comunidadSchema), crear);
router.put('/:id', validateParams(pacienteRootIdParam), validateBody(comunidadSchema), actualizar);
router.patch('/:id/desactivar', validateParams(pacienteRootIdParam), desactivar);
router.patch('/:id/reactivar', validateParams(pacienteRootIdParam), reactivar);

module.exports = router;
