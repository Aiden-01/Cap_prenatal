const express = require('express');
const { listarCatalogo } = require('../controllers/permisosController');
const { authMiddleware, permitirRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, permitirRoles('director'), listarCatalogo);

module.exports = router;
