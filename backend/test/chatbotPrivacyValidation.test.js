const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { after, before, test } = require('node:test');

const express = require('express');
const jwt = require('jsonwebtoken');

const previousJwtSecret = process.env.JWT_SECRET;
const previousLoggingEnabled = process.env.CHATBOT_LOGGING_ENABLED;
process.env.JWT_SECRET = 'chatbot-privacy-test-secret';
process.env.CHATBOT_LOGGING_ENABLED = 'false';

const chatbotRoutes = require('../src/routes/chatbot');
const { createChatbotController } = require('../src/controllers/chatbotController');
const { normalizeError } = require('../src/middleware/errorHandler');
const {
  createChatbotLogger,
  loggingIsEnabled,
} = require('../src/services/chatbotLoggingService');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const AUTH_TOKEN = jwt.sign(
  { id: 77, username: 'usuario-de-prueba' },
  process.env.JWT_SECRET,
  { expiresIn: '5m' }
);

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chatbot', chatbotRoutes);
  app.use((error, _req, res, _next) => {
    const normalized = normalizeError(error);
    res.status(normalized.statusCode).json({
      ok: false,
      message: normalized.message,
      code: normalized.code,
      details: normalized.details,
    });
  });

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;

  if (previousLoggingEnabled === undefined) delete process.env.CHATBOT_LOGGING_ENABLED;
  else process.env.CHATBOT_LOGGING_ENABLED = previousLoggingEnabled;
});

async function post(endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${AUTH_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function invoke(handler, req) {
  let responseBody;
  let nextError;

  await handler(
    req,
    {
      json(payload) {
        responseBody = payload;
        return payload;
      },
    },
    (error) => {
      nextError = error;
    }
  );

  if (nextError) throw nextError;
  return responseBody;
}

function parseWrittenRecord(appendArgs) {
  assert.ok(appendArgs, 'El logger no intento escribir');
  assert.equal(appendArgs.encoding, 'utf8');
  assert.match(appendArgs.data, /\n$/);
  return JSON.parse(appendArgs.data);
}

test('POST /mensaje acepta un mensaje valido', async () => {
  const response = await post('/api/chatbot/mensaje', {
    mensaje: 'Quiero registrar una paciente',
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.intent, 'registrar_paciente');
});

test('POST /mensaje recorta espacios antes de responder', async () => {
  const response = await post('/api/chatbot/mensaje', { mensaje: '   Hola.   ' });

  assert.equal(response.status, 200);
  assert.equal(response.payload.intent, 'saludo');
});

const invalidMessagePayloads = [
  ['ausente', {}],
  ['null', { mensaje: null }],
  ['numero', { mensaje: 123 }],
  ['objeto', { mensaje: { texto: 'hola' } }],
  ['arreglo', { mensaje: ['hola'] }],
  ['string vacio', { mensaje: '' }],
  ['solo espacios', { mensaje: '     ' }],
];

for (const [label, payload] of invalidMessagePayloads) {
  test(`POST /mensaje rechaza mensaje ${label} con VALIDATION_ERROR`, async () => {
    const response = await post('/api/chatbot/mensaje', payload);

    assert.equal(response.status, 400);
    assert.equal(response.payload.code, 'VALIDATION_ERROR');
  });
}

test('POST /mensaje acepta exactamente 500 caracteres', async () => {
  const response = await post('/api/chatbot/mensaje', { mensaje: 'z'.repeat(500) });

  assert.equal(response.status, 200);
  assert.equal(response.payload.intent, 'no_reconocida');
});

test('POST /mensaje rechaza 501 caracteres', async () => {
  const response = await post('/api/chatbot/mensaje', { mensaje: 'z'.repeat(501) });

  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'VALIDATION_ERROR');
});

for (const helpful of [true, false]) {
  test(`POST /feedback acepta helpful=${helpful} como booleano real`, async () => {
    const response = await post('/api/chatbot/feedback', {
      helpful,
      intent: 'registrar_paciente',
      mensaje: 'Texto del frontend que debe descartarse',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.payload, { ok: true });
  });
}

test('POST /feedback rechaza helpful="false"', async () => {
  const response = await post('/api/chatbot/feedback', {
    helpful: 'false',
    intent: 'registrar_paciente',
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'VALIDATION_ERROR');
});

const otherInvalidHelpfulValues = [
  ['string true', 'true'],
  ['numero 1', 1],
  ['numero 0', 0],
  ['null', null],
  ['objeto', {}],
  ['arreglo', []],
];

for (const [label, helpful] of otherInvalidHelpfulValues) {
  test(`POST /feedback rechaza helpful de tipo invalido: ${label}`, async () => {
    const response = await post('/api/chatbot/feedback', {
      helpful,
      intent: 'registrar_paciente',
    });

    assert.equal(response.status, 400);
    assert.equal(response.payload.code, 'VALIDATION_ERROR');
  });
}

test('POST /feedback rechaza helpful ausente', async () => {
  const response = await post('/api/chatbot/feedback', {
    intent: 'registrar_paciente',
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload.code, 'VALIDATION_ERROR');
});

const invalidIntentValues = [
  ['ausente', undefined],
  ['null', null],
  ['numero', 1],
  ['vacio', ''],
  ['espacios', '   '],
  ['mas de 100 caracteres', 'i'.repeat(101)],
];

for (const [label, intent] of invalidIntentValues) {
  test(`POST /feedback rechaza intent invalido: ${label}`, async () => {
    const body = { helpful: true };
    if (intent !== undefined) body.intent = intent;

    const response = await post('/api/chatbot/feedback', body);
    assert.equal(response.status, 400);
    assert.equal(response.payload.code, 'VALIDATION_ERROR');
  });
}

test('controller recorta el mensaje y no entrega texto crudo ni identidad al logger', async () => {
  const rawMessage = '   dato clinico privado   ';
  let classifiedMessage;
  let loggedMetadata;
  const expectedResult = {
    recognized: false,
    intent: 'no_reconocida',
    answer: 'Respuesta segura',
  };
  const { preguntar } = createChatbotController({
    answerQuestionFn(message) {
      classifiedMessage = message;
      return expectedResult;
    },
    logger: {
      async logUnrecognized(metadata) {
        loggedMetadata = metadata;
      },
      async logFeedback() {},
    },
  });

  const response = await invoke(preguntar, {
    body: { mensaje: rawMessage },
    usuario: { id: 9, username: 'identidad-privada' },
  });

  assert.equal(classifiedMessage, 'dato clinico privado');
  assert.deepEqual(loggedMetadata, {
    messageLength: 'dato clinico privado'.length,
    intent: 'no_reconocida',
    confidence: undefined,
  });
  assert.equal(JSON.stringify(loggedMetadata).includes('dato clinico'), false);
  assert.equal(JSON.stringify(loggedMetadata).includes('identidad-privada'), false);
  assert.deepEqual(response, expectedResult);
});

test('controller entrega contexto solo al clasificador y nunca al logger', async () => {
  const safeContext = {
    route: '/pacientes/:id/expediente',
    module: 'expediente',
    hasPatientContext: true,
    hasPregnancyContext: true,
    pregnancyStatus: 'activo',
    permissions: ['pacientes.editar'],
  };
  let classifiedContext;
  let loggedMetadata;
  const { preguntar } = createChatbotController({
    answerQuestionFn(_message, context) {
      classifiedContext = context;
      return {
        recognized: false,
        intent: 'no_reconocida',
        answer: 'Respuesta segura',
      };
    },
    logger: {
      async logUnrecognized(metadata) {
        loggedMetadata = metadata;
      },
      async logFeedback() {},
    },
  });

  await invoke(preguntar, {
    body: { mensaje: 'consulta segura', context: safeContext },
    usuario: { id: 9 },
  });

  assert.strictEqual(classifiedContext, safeContext);
  assert.deepEqual(loggedMetadata, {
    messageLength: 'consulta segura'.length,
    intent: 'no_reconocida',
    confidence: undefined,
  });
  assert.equal(JSON.stringify(loggedMetadata).includes('context'), false);
  assert.equal(JSON.stringify(loggedMetadata).includes('/pacientes'), false);
});

test('feedback descarta respuesta adicional e identidad antes del logger', async () => {
  let loggedMetadata;
  const { registrarFeedback } = createChatbotController({
    logger: {
      async logUnrecognized() {},
      async logFeedback(metadata) {
        loggedMetadata = metadata;
      },
    },
  });

  const response = await invoke(registrarFeedback, {
    body: {
      helpful: false,
      intent: '  no_reconocida  ',
      mensaje: 'Respuesta completa de Lia que no debe persistirse',
      message: 'Pregunta original que no debe persistirse',
    },
    usuario: { id: 15, username: 'identidad-privada' },
  });

  assert.deepEqual(loggedMetadata, {
    helpful: false,
    intent: 'no_reconocida',
  });
  assert.deepEqual(response, { ok: true });
});

test('registro no reconocido contiene solo metadata permitida', async () => {
  let appendArgs;
  const logger = createChatbotLogger({
    enabled: true,
    runtimeDir: path.join(REPOSITORY_ROOT, 'directorio-falso-no-usado'),
    rulesVersion: 'rules-2026-07',
    now: () => new Date('2026-07-14T12:00:00.000Z'),
    fileSystem: {
      async mkdir() {},
      async appendFile(filePath, data, encoding) {
        appendArgs = { filePath, data, encoding };
      },
    },
    reportError() {},
  });

  await logger.logUnrecognized({
    messageLength: 42,
    intent: 'no_reconocida',
    confidence: 0.2,
    message: 'texto que la API del logger debe ignorar',
    username: 'identidad que debe ignorar',
  });

  assert.deepEqual(parseWrittenRecord(appendArgs), {
    createdAt: '2026-07-14T12:00:00.000Z',
    messageLength: 42,
    intent: 'no_reconocida',
    confidence: 0.2,
    rulesVersion: 'rules-2026-07',
  });
  assert.equal(path.basename(appendArgs.filePath), 'chatbot_unrecognized.jsonl');
});

test('registro de feedback no contiene respuesta, pregunta ni identidad', async () => {
  let appendArgs;
  const logger = createChatbotLogger({
    enabled: true,
    runtimeDir: path.join(REPOSITORY_ROOT, 'directorio-falso-no-usado'),
    classifierVersion: 'classifier-1',
    now: () => new Date('2026-07-14T12:00:00.000Z'),
    fileSystem: {
      async mkdir() {},
      async appendFile(filePath, data, encoding) {
        appendArgs = { filePath, data, encoding };
      },
    },
    reportError() {},
  });

  await logger.logFeedback({
    helpful: false,
    intent: 'no_reconocida',
    mensaje: 'respuesta privada',
    question: 'pregunta privada',
    userId: 44,
    username: 'identidad privada',
  });

  assert.deepEqual(parseWrittenRecord(appendArgs), {
    createdAt: '2026-07-14T12:00:00.000Z',
    helpful: false,
    intent: 'no_reconocida',
    classifierVersion: 'classifier-1',
  });
  assert.equal(path.basename(appendArgs.filePath), 'chatbot_feedback.jsonl');
});

test('fallo de escritura no falla la respuesta normal de Lia', async () => {
  const reportedErrors = [];
  const logger = createChatbotLogger({
    enabled: true,
    fileSystem: {
      async mkdir() {},
      async appendFile() {
        const error = new Error('No se puede escribir');
        error.code = 'EACCES';
        throw error;
      },
    },
    reportError(eventType, code) {
      reportedErrors.push({ eventType, code });
    },
  });
  const expectedResult = {
    recognized: false,
    intent: 'no_reconocida',
    answer: 'Lia sigue respondiendo',
  };
  const { preguntar } = createChatbotController({
    answerQuestionFn: () => expectedResult,
    logger,
  });

  const response = await invoke(preguntar, {
    body: { mensaje: 'informacion privada' },
    usuario: { username: 'identidad privada' },
  });

  assert.deepEqual(response, expectedResult);
  assert.deepEqual(reportedErrors, [{ eventType: 'unrecognized', code: 'EACCES' }]);
  assert.equal(JSON.stringify(reportedErrors).includes('informacion privada'), false);
  assert.equal(JSON.stringify(reportedErrors).includes('identidad privada'), false);
});

test('logging desactivado no crea directorio ni intenta escribir', async () => {
  let operations = 0;
  const logger = createChatbotLogger({
    enabled: false,
    fileSystem: {
      async mkdir() {
        operations += 1;
      },
      async appendFile() {
        operations += 1;
      },
    },
    reportError() {
      operations += 1;
    },
  });

  assert.equal(await logger.logUnrecognized({ messageLength: 4, intent: 'x' }), false);
  assert.equal(await logger.logFeedback({ helpful: true, intent: 'x' }), false);
  assert.equal(operations, 0);
  assert.equal(loggingIsEnabled(undefined), false);
  assert.equal(loggingIsEnabled('false'), false);
  assert.equal(loggingIsEnabled('true'), true);
});

test('archivos runtime y JSONL heredados estan ignorados y fuera del indice Git', () => {
  for (const filePath of [
    'backend/runtime/chatbot/chatbot_unrecognized.jsonl',
    'backend/runtime/chatbot/chatbot_feedback.jsonl',
    'backend/src/logs/chatbot_unrecognized.jsonl',
    'backend/src/logs/chatbot_feedback.jsonl',
  ]) {
    execFileSync('git', ['check-ignore', '--no-index', '-q', '--', filePath], {
      cwd: REPOSITORY_ROOT,
      stdio: 'ignore',
    });
  }

  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'backend/src/logs/chatbot_unrecognized.jsonl',
      'backend/src/logs/chatbot_feedback.jsonl',
    ],
    { cwd: REPOSITORY_ROOT, encoding: 'utf8' }
  );
  assert.equal(tracked.trim(), '');
});
