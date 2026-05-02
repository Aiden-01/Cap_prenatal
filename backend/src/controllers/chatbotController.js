const fs = require('fs/promises');
const path = require('path');
const { answerQuestion } = require('../services/chatbotService');

const logsDir = path.join(__dirname, '..', 'logs');
const unrecognizedLog = path.join(logsDir, 'chatbot_unrecognized.jsonl');
const feedbackLog = path.join(logsDir, 'chatbot_feedback.jsonl');

async function appendJsonLine(filePath, payload) {
  await fs.mkdir(logsDir, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function preguntar(req, res, next) {
  try {
    const message = req.body?.mensaje || req.body?.message || '';
    const result = answerQuestion(message);

    if (!result.recognized && String(message).trim()) {
      await appendJsonLine(unrecognizedLog, {
        message,
        userId: req.usuario?.id || null,
        username: req.usuario?.username || null,
        createdAt: new Date().toISOString(),
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function registrarFeedback(req, res, next) {
  try {
    const helpful = Boolean(req.body?.helpful);
    const intent = req.body?.intent || null;
    const message = req.body?.mensaje || req.body?.message || '';

    await appendJsonLine(feedbackLog, {
      helpful,
      intent,
      message,
      userId: req.usuario?.id || null,
      username: req.usuario?.username || null,
      createdAt: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = { preguntar, registrarFeedback };
