const express = require('express');
const { listar, guardar } = require('../controllers/laboratorioController');

const router = express.Router({ mergeParams: true });

router.get('/',  listar);
router.post('/', guardar);

module.exports = router;
