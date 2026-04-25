const express = require('express');
const { listar, crear, actualizar } = require('../controllers/usuariosController');
const { authMiddleware, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, soloAdmin);

router.get('/', listar);
router.post('/', crear);
router.put('/:id', actualizar);

module.exports = router;
