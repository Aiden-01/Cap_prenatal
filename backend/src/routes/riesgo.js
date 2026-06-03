const express = require('express');
const { obtener, guardar, actualizar, eliminar } = require('../controllers/riesgoController');
const { validateBody } = require('../middleware/validate');
const { riesgoSchema } = require('../validations/riesgo.schemas');

const router = express.Router({ mergeParams: true });

router.get('/',  obtener);
router.post('/', validateBody(riesgoSchema), guardar);
router.put('/',  validateBody(riesgoSchema), actualizar);
router.delete('/', eliminar);

module.exports = router;
