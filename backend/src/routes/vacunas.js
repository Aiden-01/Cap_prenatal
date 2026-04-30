const express = require('express');
const { listar, obtener, guardar, actualizar, eliminar } = require('../controllers/vacunasController');

const router = express.Router({ mergeParams: true });

router.get('/',       listar);
router.post('/',      guardar);
router.get('/:id',    obtener);
router.put('/:id',    actualizar);
router.delete('/:id', eliminar);

module.exports = router;
