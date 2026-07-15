const fs = require('fs/promises');
const path = require('path');

const DEFAULT_RUNTIME_DIR = path.join(__dirname, '..', '..', 'runtime', 'chatbot');
const UNRECOGNIZED_LOG_FILE = 'chatbot_unrecognized.jsonl';
const FEEDBACK_LOG_FILE = 'chatbot_feedback.jsonl';

function loggingIsEnabled(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function optionalVersion(value) {
  if (typeof value !== 'string') return undefined;
  const version = value.trim();
  return version || undefined;
}

function createChatbotLogger({
  enabled = loggingIsEnabled(process.env.CHATBOT_LOGGING_ENABLED),
  runtimeDir = optionalVersion(process.env.CHATBOT_RUNTIME_DIR) || DEFAULT_RUNTIME_DIR,
  rulesVersion = optionalVersion(process.env.CHATBOT_RULES_VERSION),
  classifierVersion = optionalVersion(process.env.CHATBOT_CLASSIFIER_VERSION),
  fileSystem = fs,
  now = () => new Date(),
  reportError = (eventType, code) => {
    console.error('[chatbot-logging] No se pudo guardar metadata', {
      eventType,
      code,
    });
  },
} = {}) {
  async function appendRecord(eventType, fileName, record) {
    if (!enabled) return false;

    try {
      await fileSystem.mkdir(runtimeDir, { recursive: true });
      await fileSystem.appendFile(
        path.join(runtimeDir, fileName),
        `${JSON.stringify(record)}\n`,
        'utf8'
      );
      return true;
    } catch (error) {
      reportError(eventType, optionalVersion(error?.code) || 'WRITE_FAILED');
      return false;
    }
  }

  async function logUnrecognized({ messageLength, intent, confidence } = {}) {
    const record = {
      createdAt: now().toISOString(),
      messageLength,
      intent,
    };

    if (Number.isFinite(confidence)) record.confidence = confidence;
    if (rulesVersion) record.rulesVersion = rulesVersion;

    return appendRecord('unrecognized', UNRECOGNIZED_LOG_FILE, record);
  }

  async function logFeedback({ helpful, intent } = {}) {
    const record = {
      createdAt: now().toISOString(),
      helpful,
      intent,
    };

    if (classifierVersion) record.classifierVersion = classifierVersion;

    return appendRecord('feedback', FEEDBACK_LOG_FILE, record);
  }

  return {
    logFeedback,
    logUnrecognized,
  };
}

const chatbotLogger = createChatbotLogger();

module.exports = {
  DEFAULT_RUNTIME_DIR,
  FEEDBACK_LOG_FILE,
  UNRECOGNIZED_LOG_FILE,
  chatbotLogger,
  createChatbotLogger,
  loggingIsEnabled,
};
