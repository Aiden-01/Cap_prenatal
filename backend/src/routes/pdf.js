const express = require('express');
const { pdfControl, pdfMspas } = require('../controllers/pdfController');

const router = express.Router({ mergeParams: true });

router.get('/mspas/pdf', pdfMspas);
router.get('/:id/pdf', pdfControl);

module.exports = router;
