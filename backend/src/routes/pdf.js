const express = require('express');
const { pdfControl } = require('../controllers/pdfController');

const router = express.Router({ mergeParams: true });

router.get('/:id/pdf', pdfControl);

module.exports = router;