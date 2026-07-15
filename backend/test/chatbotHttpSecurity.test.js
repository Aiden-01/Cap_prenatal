const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const express = require('express');
const jwt = require('jsonwebtoken');

const previousJwtSecret = process.env.JWT_SECRET;
const previousLoggingEnabled = process.env.CHATBOT_LOGGING_ENABLED;
process.env.JWT_SECRET = 'chatbot-http-security-test-secret';
process.env.CHATBOT_LOGGING_ENABLED = 'false';

const { createChatbotController } = require('../src/controllers/chatbotController');
const { csrfMiddleware } = require('../src/middleware/auth');
const {
  DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT,
  DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT,
  DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS,
  createChatbotRateLimiters,
} = require('../src/middleware/chatbotRateLimit');
const { errorHandler } = require('../src/middleware/errorHandler');
const { createChatbotLogger } = require('../src/services/chatbotLoggingService');
const chatbotRoutes = require('../src/routes/chatbot');

const { createChatbotRouter } = chatbotRoutes;
const CSRF_TOKEN = 'chatbot-http-csrf-token';
const AUTH_TOKEN = jwt.sign(
  { id: 501, username: 'chatbot-http-user' },
  process.env.JWT_SECRET,
  { expiresIn: '5m' }
);
const SECOND_AUTH_TOKEN = jwt.sign(
  { id: 502, username: 'chatbot-http-user-2' },
  process.env.JWT_SECRET,
  { expiresIn: '5m' }
);

let contractServer;
let originalConsoleError;
let capturedConsoleErrors;

function buildApp({
  controllers,
  messageLimit = 1000,
  feedbackLimit = 1000,
  windowMs = 1000,
} = {}) {
  const app = express();
  const {
    feedbackLimiter,
    messageLimiter,
  } = createChatbotRateLimiters({ messageLimit, feedbackLimit, windowMs });

  app.use(express.json());
  app.use('/api', csrfMiddleware);
  app.use('/api/chatbot', createChatbotRouter({
    controllers,
    feedbackRateLimiter: feedbackLimiter,
    messageRateLimiter: messageLimiter,
  }));
  app.use(errorHandler);

  return app;
}

async function startServer(options) {
  const app = buildApp(options);
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function post(server, endpoint, body, {
  authenticated = true,
  csrf = true,
  token = AUTH_TOKEN,
} = {}) {
  const headers = { 'content-type': 'application/json' };

  if (authenticated) headers.authorization = `Bearer ${token}`;
  if (csrf) {
    headers.cookie = `cap_prenatal_csrf=${encodeURIComponent(CSRF_TOKEN)}`;
    headers['x-csrf-token'] = CSRF_TOKEN;
  }

  const response = await fetch(`${server.baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return {
    headers: response.headers,
    payload: await response.json(),
    status: response.status,
  };
}

function assertSafeError(response, expectedStatus, expectedCode, forbiddenText) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.payload.code, expectedCode);
  assert.equal(Object.hasOwn(response.payload, 'debug'), false);
  assert.equal(Object.hasOwn(response.payload, 'stack'), false);

  const serialized = JSON.stringify(response.payload);
  assert.doesNotMatch(serialized, /Error:\s|at\s+\S+\s+\(/);
  if (forbiddenText) assert.equal(serialized.includes(forbiddenText), false);
}

before(async () => {
  originalConsoleError = console.error;
  capturedConsoleErrors = [];
  console.error = (...args) => capturedConsoleErrors.push(args);
  contractServer = await startServer();
});

after(async () => {
  if (contractServer) await contractServer.close();
  console.error = originalConsoleError;

  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;

  if (previousLoggingEnabled === undefined) delete process.env.CHATBOT_LOGGING_ENABLED;
  else process.env.CHATBOT_LOGGING_ENABLED = previousLoggingEnabled;
});

test('/mensaje sin autenticacion devuelve 401 cuando CSRF es valido', async () => {
  const response = await post(
    contractServer,
    '/api/chatbot/mensaje',
    { mensaje: 'Hola.' },
    { authenticated: false }
  );

  assertSafeError(response, 401, 'TOKEN_REQUIRED');
});

test('/mensaje autenticado sin CSRF conserva el rechazo 403', async () => {
  const response = await post(
    contractServer,
    '/api/chatbot/mensaje',
    { mensaje: 'Hola.' },
    { csrf: false }
  );

  assertSafeError(response, 403, 'CSRF_INVALID');
});

test('/mensaje con autenticacion, CSRF y payload valido devuelve 200', async () => {
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: 'Quiero registrar una paciente',
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.intent, 'registrar_paciente');
});

test('/mensaje acepta contexto seguro valido', async () => {
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: '¿Cómo agrego un control?',
    context: {
      route: '/pacientes/:id/expediente',
      module: 'expediente',
      hasPatientContext: true,
      hasPregnancyContext: true,
      pregnancyStatus: 'cerrado',
      permissions: ['controles.crear'],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.intent, 'control_prenatal');
  assert.match(response.payload.answer, /solo lectura/);
});

test('/mensaje inicia y continua una guia con conversation valido', async () => {
  const context = {
    route: '/pacientes/:id/expediente',
    module: 'expediente',
    hasPatientContext: true,
    hasPregnancyContext: true,
    pregnancyStatus: 'activo',
    permissions: ['controles.crear'],
  };
  const started = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: 'Guíame para agregar un control prenatal',
    context,
    conversation: {
      lastIntent: null,
      activeGuide: null,
      currentStep: null,
      totalSteps: null,
    },
  });

  assert.equal(started.status, 200);
  assert.equal(started.payload.conversation.currentStep, 1);
  assert.equal(started.payload.conversation.totalSteps, 7);

  const continued = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: 'Siguiente',
    context,
    conversation: started.payload.conversation,
  });

  assert.equal(continued.status, 200);
  assert.equal(continued.payload.intent, 'guia_siguiente');
  assert.equal(continued.payload.conversation.currentStep, 2);
});

test('/mensaje rechaza conversation inventado o fuera de rango', async () => {
  const invalidConversations = [
    {
      lastIntent: 'control_prenatal',
      activeGuide: 'guia_inventada',
      currentStep: 1,
      totalSteps: 7,
    },
    {
      lastIntent: 'control_prenatal',
      activeGuide: 'control_prenatal',
      currentStep: 8,
      totalSteps: 7,
    },
    {
      lastIntent: null,
      activeGuide: null,
      currentStep: null,
      totalSteps: null,
      previousQuestion: 'dato privado',
    },
  ];

  for (const conversation of invalidConversations) {
    const response = await post(contractServer, '/api/chatbot/mensaje', {
      mensaje: 'Siguiente',
      conversation,
    });
    assertSafeError(response, 400, 'VALIDATION_ERROR', 'dato privado');
  }
});

test('/mensaje rechaza contexto con datos clinicos adicionales', async () => {
  const privateText = 'diagnostico-privado-no-debe-aparecer';
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: 'Hola',
    context: {
      route: '/dashboard',
      module: 'dashboard',
      hasPatientContext: false,
      hasPregnancyContext: false,
      pregnancyStatus: null,
      permissions: [],
      diagnostico: privateText,
    },
  });

  assertSafeError(response, 400, 'VALIDATION_ERROR', privateText);
});

test('contexto declarado no permite saltarse autenticacion', async () => {
  const response = await post(
    contractServer,
    '/api/chatbot/mensaje',
    {
      mensaje: '¿Cómo creo un usuario?',
      context: {
        route: '/usuarios',
        module: 'usuarios',
        hasPatientContext: false,
        hasPregnancyContext: false,
        pregnancyStatus: null,
        permissions: ['usuarios.gestionar'],
      },
    },
    { authenticated: false }
  );

  assertSafeError(response, 401, 'TOKEN_REQUIRED');
});

test('/mensaje con payload invalido devuelve 400 VALIDATION_ERROR sin exponerlo', async () => {
  const privateText = 'dato-privado-no-debe-aparecer';
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: { privateText },
  });

  assertSafeError(response, 400, 'VALIDATION_ERROR', privateText);
});

test('/mensaje permite exactamente 500 caracteres', async () => {
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: 'z'.repeat(500),
  });

  assert.equal(response.status, 200);
});

test('/mensaje rechaza 501 caracteres', async () => {
  const privateText = 'z'.repeat(501);
  const response = await post(contractServer, '/api/chatbot/mensaje', {
    mensaje: privateText,
  });

  assertSafeError(response, 400, 'VALIDATION_ERROR', privateText);
});

for (const helpful of [true, false]) {
  test(`/feedback acepta helpful=${helpful}`, async () => {
    const response = await post(contractServer, '/api/chatbot/feedback', {
      helpful,
      intent: 'registrar_paciente',
      mensaje: 'Texto del frontend descartado por privacidad',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.payload, { ok: true });
  });
}

test('/feedback rechaza helpful="false" con VALIDATION_ERROR', async () => {
  const response = await post(contractServer, '/api/chatbot/feedback', {
    helpful: 'false',
    intent: 'registrar_paciente',
  });

  assertSafeError(response, 400, 'VALIDATION_ERROR');
});

test('/feedback tambien exige autenticacion', async () => {
  const response = await post(
    contractServer,
    '/api/chatbot/feedback',
    { helpful: true, intent: 'saludo' },
    { authenticated: false }
  );

  assertSafeError(response, 401, 'TOKEN_REQUIRED');
});

test('/feedback tambien exige CSRF', async () => {
  const response = await post(
    contractServer,
    '/api/chatbot/feedback',
    { helpful: true, intent: 'saludo' },
    { csrf: false }
  );

  assertSafeError(response, 403, 'CSRF_INVALID');
});

test('rate limit de /mensaje devuelve 429 y no ejecuta clasificador ni logging bloqueado', async () => {
  let classificationCalls = 0;
  let unrecognizedLogCalls = 0;
  let feedbackLogCalls = 0;
  const controllers = createChatbotController({
    answerQuestionFn() {
      classificationCalls += 1;
      return {
        recognized: false,
        intent: 'no_reconocida',
        answer: 'Respuesta controlada de prueba',
      };
    },
    logger: {
      async logUnrecognized() {
        unrecognizedLogCalls += 1;
      },
      async logFeedback() {
        feedbackLogCalls += 1;
      },
    },
  });
  const server = await startServer({ controllers, messageLimit: 2, feedbackLimit: 2 });

  try {
    const first = await post(server, '/api/chatbot/mensaje', { mensaje: 'primero' });
    const second = await post(server, '/api/chatbot/mensaje', { mensaje: 'segundo' });
    const blockedText = 'mensaje-privado-bloqueado';
    const blocked = await post(server, '/api/chatbot/mensaje', { mensaje: blockedText });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assertSafeError(blocked, 429, 'CHATBOT_RATE_LIMITED', blockedText);
    assert.equal(classificationCalls, 2);
    assert.equal(unrecognizedLogCalls, 2);

    assert.equal(first.headers.get('ratelimit-limit'), '2');
    assert.equal(first.headers.get('ratelimit-remaining'), '1');
    assert.equal(second.headers.get('ratelimit-remaining'), '0');
    assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
    assert.ok(Number(blocked.headers.get('ratelimit-reset')) >= 1);
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);

    const feedback = await post(server, '/api/chatbot/feedback', {
      helpful: true,
      intent: 'no_reconocida',
    });
    assert.equal(feedback.status, 200, 'La cuota de feedback debe ser independiente');
    assert.equal(feedbackLogCalls, 1);

    const anotherUser = await post(
      server,
      '/api/chatbot/mensaje',
      { mensaje: 'otro usuario' },
      { token: SECOND_AUTH_TOKEN }
    );
    assert.equal(anotherUser.status, 200, 'La cuota debe separarse por usuario');
    assert.equal(classificationCalls, 3);
  } finally {
    await server.close();
  }
});

test('rate limit independiente de /feedback devuelve 429', async () => {
  let feedbackLogCalls = 0;
  const controllers = createChatbotController({
    logger: {
      async logUnrecognized() {},
      async logFeedback() {
        feedbackLogCalls += 1;
      },
    },
  });
  const server = await startServer({ controllers, messageLimit: 30, feedbackLimit: 2 });

  try {
    const body = { helpful: false, intent: 'saludo' };
    const first = await post(server, '/api/chatbot/feedback', body);
    const second = await post(server, '/api/chatbot/feedback', body);
    const blocked = await post(server, '/api/chatbot/feedback', body);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assertSafeError(blocked, 429, 'CHATBOT_RATE_LIMITED');
    assert.equal(feedbackLogCalls, 2);
    assert.equal(first.headers.get('ratelimit-limit'), '2');
    assert.equal(blocked.headers.get('ratelimit-remaining'), '0');
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  } finally {
    await server.close();
  }
});

test('fallo best-effort del logging conserva HTTP 200', async () => {
  const reportedErrors = [];
  const logger = createChatbotLogger({
    enabled: true,
    fileSystem: {
      async mkdir() {},
      async appendFile() {
        const error = new Error('write failed');
        error.code = 'EACCES';
        throw error;
      },
    },
    reportError(eventType, code) {
      reportedErrors.push({ eventType, code });
    },
  });
  const controllers = createChatbotController({
    answerQuestionFn: () => ({
      recognized: false,
      intent: 'no_reconocida',
      answer: 'La respuesta sigue disponible',
    }),
    logger,
  });
  const server = await startServer({ controllers });

  try {
    const response = await post(server, '/api/chatbot/mensaje', {
      mensaje: 'mensaje privado no persistido',
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.answer, 'La respuesta sigue disponible');
    assert.deepEqual(reportedErrors, [{ eventType: 'unrecognized', code: 'EACCES' }]);
  } finally {
    await server.close();
  }
});

test('configuracion invalida recupera defaults y permite inyectar ventana corta', () => {
  const invalid = createChatbotRateLimiters({
    windowMs: 'no-numero',
    messageLimit: 0,
    feedbackLimit: -20,
  });

  assert.deepEqual(invalid.config, {
    windowMs: DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS,
    messageLimit: DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT,
    feedbackLimit: DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT,
  });

  const invalidTypes = createChatbotRateLimiters({
    windowMs: true,
    messageLimit: {},
    feedbackLimit: [],
  });
  assert.deepEqual(invalidTypes.config, {
    windowMs: DEFAULT_CHATBOT_RATE_LIMIT_WINDOW_MS,
    messageLimit: DEFAULT_CHATBOT_MESSAGE_RATE_LIMIT,
    feedbackLimit: DEFAULT_CHATBOT_FEEDBACK_RATE_LIMIT,
  });

  const injected = createChatbotRateLimiters({
    windowMs: 250,
    messageLimit: 2,
    feedbackLimit: 1,
  });
  assert.deepEqual(injected.config, {
    windowMs: 250,
    messageLimit: 2,
    feedbackLimit: 1,
  });
});
