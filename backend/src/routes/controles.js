const express = require('express');
const {
  listar, obtener, crear,
  obtenerPlanParto, guardarPlanParto,
  listarPuerperio, guardarPuerperio,
} = require('../controllers/controlesController');

const router = express.Router({ mergeParams: true });

// Controles prenatales
router.get('/',     listar);
router.post('/',    crear);
router.get('/:id',  obtener);

// Plan de parto (1 por paciente)
router.get('/plan-parto',  obtenerPlanParto);
router.post('/plan-parto', guardarPlanParto);

// Puerperio (1ª y 2ª atención)
router.get('/puerperio',  listarPuerperio);
router.post('/puerperio', guardarPuerperio);

module.exports = router;