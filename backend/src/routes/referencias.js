const express = require('express');
const { listar, guardar, actualizar, eliminar } = require('../controllers/referenciasController');

const router = express.Router({ mergeParams: true });

router.get('/',       listar);
router.post('/',      guardar);
router.put('/:id',    actualizar);
router.delete('/:id', eliminar);

module.exports = router;