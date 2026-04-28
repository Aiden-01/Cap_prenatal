const express = require('express');
const { listar, guardar, eliminar } = require('../controllers/vacunasController');

const router = express.Router({ mergeParams: true });

router.get('/',       listar);
router.post('/',      guardar);
router.delete('/:id', eliminar);

module.exports = router;