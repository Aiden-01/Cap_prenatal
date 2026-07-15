const { answerQuestion } = require('../services/chatbotService');
const { chatbotLogger } = require('../services/chatbotLoggingService');
const { asyncHandler } = require('../middleware/asyncHandler');

function createChatbotController({
  answerQuestionFn = answerQuestion,
  logger = chatbotLogger,
} = {}) {
  const preguntar = asyncHandler(async (req, res) => {
    const message = req.body.mensaje.trim();
    const result = answerQuestionFn(message);

    if (!result.recognized) {
      await logger.logUnrecognized({
        messageLength: message.length,
        intent: result.intent,
        confidence: result.confidence,
      });
    }

    return res.json(result);
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
