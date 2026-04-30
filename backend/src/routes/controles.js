const express = require('express');
const {
  listar, obtener, crear, actualizar, eliminar,
  obtenerPlanParto, guardarPlanParto,
  listarPuerperio, obtenerPuerperio, guardarPuerperio, actualizarPuerperio, eliminarPuerperio,
} = require('../controllers/controlesController');

const router = express.Router({ mergeParams: true });

// Plan de parto (1 por paciente)
router.get('/plan-parto',  obtenerPlanParto);
router.post('/plan-parto', guardarPlanParto);

// Puerperio (1a y 2a atencion)
router.get('/puerperio',        listarPuerperio);
router.post('/puerperio',       guardarPuerperio);
router.get('/puerperio/:id',    obtenerPuerperio);
router.put('/puerperio/:id',    actualizarPuerperio);
router.delete('/puerperio/:id', eliminarPuerperio);

// Controles prenatales
router.get('/',       listar);
router.post('/',      crear);
router.get('/:id',    obtener);
router.put('/:id',    actualizar);
router.delete('/:id', eliminar);

module.exports = router;
