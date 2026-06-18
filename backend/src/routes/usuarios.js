const express = require('express');
const { listar, crear, actualizar, eliminar } = require('../controllers/usuariosController');
const { listarUsuario, actualizarUsuario } = require('../controllers/permisosController');
const { authMiddleware, permitirRoles } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validate');
const { pacienteRootIdParam } = require('../validations/common.schemas');
const { permisosUpdateSchema } = require('../validations/permisos.schemas');
const {
  usuarioCreateSchema,
  usuarioUpdateSchema,
} = require('../validations/usuarios.schemas');

const router = express.Router();
router.use(authMiddleware, permitirRoles('admin', 'director'));

router.get('/', listar);
router.post('/', validateBody(usuarioCreateSchema), crear);
router.put('/:id', validateParams(pacienteRootIdParam), validateBody(usuarioUpdateSchema), actualizar);
router.delete('/:id', validateParams(pacienteRootIdParam), eliminar);
router.get('/:id/permisos', validateParams(pacienteRootIdParam), permitirRoles('director'), listarUsuario);
router.put('/:id/permisos', validateParams(pacienteRootIdParam), permitirRoles('director'), validateBody(permisosUpdateSchema), actualizarUsuario);

module.exports = router;
