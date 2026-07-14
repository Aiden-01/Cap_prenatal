const express = require('express');
const { obtener, guardar, actualizar, eliminar } = require('../controllers/riesgoController');
const { verificarPermiso } = require('../middleware/permisos');
const { validateBody } = require('../middleware/validate');
const { riesgoSchema } = require('../validations/riesgo.schemas');

const router = express.Router({ mergeParams: true });

router.get('/', verificarPermiso('pacientes.ver'), obtener);
router.post('/', verificarPermiso('controles.crear'), validateBody(riesgoSchema), guardar);
router.put('/', verificarPermiso('controles.editar'), validateBody(riesgoSchema), actualizar);
router.delete('/', verificarPermiso('controles.editar'), eliminar);

module.exports = router;
