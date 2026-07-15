const express = require('express');
const { preguntar, registrarFeedback } = require('../controllers/chatbotController');
const { authMiddleware } = require('../middleware/auth');
const {
  feedbackLimiter,
  messageLimiter,
} = require('../middleware/chatbotRateLimit');
const { validateBody } = require('../middleware/validate');
const {
  chatbotFeedbackSchema,
  chatbotMessageSchema,
} = require('../validations/chatbot.schemas');

function createChatbotRouter({
  auth = authMiddleware,
  feedbackRateLimiter = feedbackLimiter,
  messageRateLimiter = messageLimiter,
  controllers = { preguntar, registrarFeedback },
} = {}) {
  const router = express.Router();

  router.use(auth);
  router.post(
    '/mensaje',
    messageRateLimiter,
    validateBody(chatbotMessageSchema),
    controllers.preguntar
  );
  router.post(
    '/feedback',
    feedbackRateLimiter,
    validateBody(chatbotFeedbackSchema),
    controllers.registrarFeedback
  );

  return router;
}

const router = createChatbotRouter();

router.createChatbotRouter = createChatbotRouter;

module.exports = router;
