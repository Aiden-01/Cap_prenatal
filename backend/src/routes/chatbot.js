const express = require('express');
const { preguntar, registrarFeedback } = require('../controllers/chatbotController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.post('/mensaje', preguntar);
router.post('/feedback', registrarFeedback);

module.exports = router;
