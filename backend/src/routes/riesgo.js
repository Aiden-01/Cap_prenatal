const express = require('express');
const { obtener, guardar, actualizar, eliminar } = require('../controllers/riesgoController');

const router = express.Router({ mergeParams: true });

router.get('/',  obtener);
router.post('/', guardar);
router.put('/',  actualizar);
router.delete('/', eliminar);

module.exports = router;
