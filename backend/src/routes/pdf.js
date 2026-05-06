const express = require('express');
const { pdfControl, pdfMspas, pdfRiesgoObstetrico } = require('../controllers/pdfController');

const router = express.Router({ mergeParams: true });

router.get('/mspas/pdf', pdfMspas);
router.get('/riesgo/pdf', pdfRiesgoObstetrico);
router.get('/:id/pdf', pdfControl);

module.exports = router;
