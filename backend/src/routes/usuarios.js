const express = require('express');
const { listar, crear, actualizar, eliminar } = require('../controllers/usuariosController');
const { authMiddleware, soloAdmin } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validate');
const { pacienteRootIdParam } = require('../validations/common.schemas');
const {
  usuarioCreateSchema,
  usuarioUpdateSchema,
} = require('../validations/usuarios.schemas');

const router = express.Router();
router.use(authMiddleware, soloAdmin);

router.get('/', listar);
router.post('/', validateBody(usuarioCreateSchema), crear);
router.put('/:id', validateParams(pacienteRootIdParam), validateBody(usuarioUpdateSchema), actualizar);
router.delete('/:id', validateParams(pacienteRootIdParam), eliminar);

module.exports = router;
