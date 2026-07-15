const express = require('express');
const { preguntar, registrarFeedback } = require('../controllers/chatbotController');
const { authMiddleware } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const {
  chatbotFeedbackSchema,
  chatbotMessageSchema,
} = require('../validations/chatbot.schemas');

const router = express.Router();

router.use(authMiddleware);
router.post('/mensaje', validateBody(chatbotMessageSchema), preguntar);
router.post('/feedback', validateBody(chatbotFeedbackSchema), registrarFeedback);

module.exports = router;
