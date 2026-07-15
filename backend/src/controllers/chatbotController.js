const { answerQuestion } = require('../services/chatbotService');
const { chatbotLogger } = require('../services/chatbotLoggingService');
const { generateQuickActions } = require('../services/chatbotQuickActionsService');
const { asyncHandler } = require('../middleware/asyncHandler');

function createChatbotController({
  answerQuestionFn = answerQuestion,
  quickActionsFn = generateQuickActions,
  logger = chatbotLogger,
} = {}) {
  const preguntar = asyncHandler(async (req, res) => {
    const message = req.body.mensaje.trim();
    const result = answerQuestionFn(message, req.body.context, req.body.conversation);

    if (!result.recognized) {
      await logger.logUnrecognized({
        messageLength: message.length,
        intent: result.intent,
        confidence: result.confidence,
      });
    }

    const quickActions = quickActionsFn({
      intent: result.intent,
      conversation: result.conversation || req.body.conversation,
      context: req.body.context,
    });
    const response = quickActions.length > 0
      ? { ...result, quickActions }
      : result;

    return res.json(response);
  });

  const registrarFeedback = asyncHandler(async (req, res) => {
    const helpful = req.body.helpful;
    const intent = req.body.intent.trim();

    await logger.logFeedback({ helpful, intent });

    return res.json({ ok: true });
  });

  return { preguntar, registrarFeedback };
}

const { preguntar, registrarFeedback } = createChatbotController();

module.exports = {
  createChatbotController,
  preguntar,
  registrarFeedback,
};
