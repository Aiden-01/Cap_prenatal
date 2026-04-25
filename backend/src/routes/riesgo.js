const express = require('express');
const { obtener, guardar } = require('../controllers/riesgoController');

const router = express.Router({ mergeParams: true });

router.get('/',  obtener);
router.post('/', guardar);

module.exports = router;
