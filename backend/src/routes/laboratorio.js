const express = require('express');
const { listar, guardar } = require('../controllers/laboratorioController');
const { validateBody } = require('../middleware/validate');
const { laboratorioSchema } = require('../validations/laboratorio.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',  listar);
router.post('/', validateBody(laboratorioSchema), guardar);

module.exports = router;
