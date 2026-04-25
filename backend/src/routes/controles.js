const express = require('express');
const {
  listar, obtener, crear,
  obtenerPlanParto, guardarPlanParto,
  listarPostParto, guardarPostParto
} = require('../controllers/controlesController');

const router = express.Router({ mergeParams: true });

// Controles prenatales
router.get('/',    listar);
router.post('/',   crear);
router.get('/:id', obtener);

// Plan de parto (1 por paciente)
router.get('/plan-parto',  obtenerPlanParto);
router.post('/plan-parto', guardarPlanParto);

// Post parto
router.get('/post-parto',  listarPostParto);
router.post('/post-parto', guardarPostParto);

module.exports = router;
