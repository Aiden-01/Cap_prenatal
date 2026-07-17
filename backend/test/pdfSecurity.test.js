const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const express = require('express');

const { createPdfController } = require('../src/controllers/pdfController');
const {
  DEFAULT_PDF_RATE_LIMIT,
  DEFAULT_PDF_RATE_LIMIT_WINDOW_MS,
  createPdfRateLimiter,
  pdfRateLimitKey,
} = require('../src/middleware/pdfRateLimit');
const pdfRouter = require('../src/routes/pdf');
const { createPdfService } = require('../src/services/pdfService');
const { AppError } = require('../src/utils/appError');
const { randomTempBase, withPdfTempDir } = require('../src/utils/pdfTemp');
const {
  sanitizePdfFilename,
  sendPdfResponse,
} = require('../src/utils/pdfResponse');

function errorMiddleware(error, _req, res, _next) {
  return res.status(error.statusCode || error.status || 500).json({
    code: error.code || 'INTERNAL_SERVER_ERROR',
    message: error.message,
  });
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function responseStub() {
  return {
    body: null,
    headers: {},
    send(body) {
      this.body = body;
      return this;
    },
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
  };
}

test('respuesta PDF aplica cabeceras no-store y nombre sanitizado', () => {
  const res = responseStub();
  sendPdfResponse(res, Buffer.from('%PDF-test'), '../control-7\r\nX-Test: injected.pdf');

  assert.equal(res.headers['Content-Type'], 'application/pdf');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Pragma, 'no-cache');
  assert.equal(res.headers.Expires, '0');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Content-Disposition'], 'inline; filename="control-7X-Test-injected.pdf"');
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(sanitizePdfFilename('..\\..\\plan parto?.pdf'), 'plan-parto-.pdf');
});

test('temporales PDF se eliminan despues de exito', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-pdf-test-'));
  let generatedDir;

  try {
    const result = await withPdfTempDir(async (tempDir) => {
      generatedDir = tempDir;
      fs.writeFileSync(path.join(tempDir, `${randomTempBase(() => 'ok')}.pdf`), 'clinical-test');
      return 'ok';
    }, { tmpRoot: testRoot });

    assert.equal(result, 'ok');
    assert.equal(fs.existsSync(generatedDir), false);
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('temporales PDF se eliminan tambien despues de error', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-pdf-test-'));
  let generatedDir;

  try {
    await assert.rejects(
      withPdfTempDir(async (tempDir) => {
        generatedDir = tempDir;
        fs.writeFileSync(path.join(tempDir, `${randomTempBase(() => 'error')}.json`), 'clinical-test');
        throw new Error('fallo intencional');
      }, { tmpRoot: testRoot }),
      /fallo intencional/
    );
    assert.equal(fs.existsSync(generatedDir), false);
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test('rate limit PDF usa 20 solicitudes por 5 minutos y clave de usuario', () => {
  const { config } = createPdfRateLimiter();
  assert.deepEqual(config, {
    limit: DEFAULT_PDF_RATE_LIMIT,
    windowMs: DEFAULT_PDF_RATE_LIMIT_WINDOW_MS,
  });
  assert.equal(DEFAULT_PDF_RATE_LIMIT, 20);
  assert.equal(DEFAULT_PDF_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000);
  assert.equal(
    pdfRateLimitKey({ user: { id: 92 }, usuario: { id: 91 }, ip: '127.0.0.1' }),
    'user:92'
  );
  assert.equal(pdfRateLimitKey({ usuario: { id: 91 }, ip: '127.0.0.1' }), 'user:91');
  assert.match(pdfRateLimitKey({ ip: '127.0.0.1' }), /^ip:/);
  assert.throws(
    () => pdfRateLimitKey({ user: { username: 'sin-id' }, ip: '127.0.0.1' }),
    (error) => error.statusCode === 500 && error.code === 'AUTHENTICATED_USER_ID_REQUIRED'
  );
});

test('rate limit PDF cuenta por usuario y no por IP compartida', () => {
  const { consume } = createPdfRateLimiter({ limit: 2, windowMs: 60_000 });
  const user7 = { user: { id: 7 }, ip: '127.0.0.1' };
  const user8 = { user: { id: 8 }, ip: '127.0.0.1' };

  assert.equal(consume(user7).remaining, 1);
  assert.equal(consume(user7).remaining, 0);
  assert.throws(
    () => consume(user7),
    (error) => error.statusCode === 429 && error.code === 'PDF_RATE_LIMITED'
  );
  assert.equal(consume(user8).remaining, 1);
});

function createPdfRouteTestApp({ calls, beforeController = () => {} }) {
  const app = express();
  const controller = (name) => (req, res) => {
    beforeController(req);
    calls.push(name);
    res.status(204).end();
  };

  app.use('/api/pacientes/:pacienteId', (req, _res, next) => {
    if (req.headers.authorization !== 'Bearer test') {
      return next(new AppError(401, 'Autenticacion requerida', { code: 'AUTHENTICATION_REQUIRED' }));
    }
    req.usuario = {
      id: 55,
      permisos: String(req.headers['x-permissions'] || '').split(',').filter(Boolean),
    };
    return next();
  }, pdfRouter.createPdfRouter({
    controllers: {
      pdfControl: controller('control'),
      pdfMspas: controller('mspas'),
      pdfPlanParto: controller('plan'),
      pdfRiesgoObstetrico: controller('riesgo'),
    },
  }));
  app.use(errorMiddleware);
  return app;
}

test('las cuatro rutas PDF exigen autenticacion y pacientes.ver, no controles.ver_vih', async () => {
  const calls = [];
  const app = createPdfRouteTestApp({ calls });
  const urls = [
    '/api/pacientes/41/mspas/pdf?embarazo_id=9',
    '/api/pacientes/41/riesgo/pdf?embarazo_id=9',
    '/api/pacientes/41/plan-parto/pdf?embarazo_id=9',
    '/api/pacientes/41/17/pdf?embarazo_id=9',
  ];

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}${urls[0]}`);
    assert.equal(unauthenticated.status, 401);

    for (const url of urls) {
      const forbidden = await fetch(`${baseUrl}${url}`, {
        headers: { authorization: 'Bearer test' },
      });
      assert.equal(forbidden.status, 403, url);
    }
    assert.equal(calls.length, 0);

    for (const url of urls) {
      const allowed = await fetch(`${baseUrl}${url}`, {
        headers: {
          authorization: 'Bearer test',
          'x-permissions': 'pacientes.ver',
        },
      });
      assert.equal(allowed.status, 204, url);
    }
    assert.deepEqual(calls, ['mspas', 'riesgo', 'plan', 'control']);
  });
});

test('fallos de autenticacion y autorizacion no consumen cupo PDF', async () => {
  const calls = [];
  const { consume } = createPdfRateLimiter({ limit: 1, windowMs: 60_000 });
  const app = createPdfRouteTestApp({ calls, beforeController: consume });

  await withServer(app, async (baseUrl) => {
    const url = '/api/pacientes/41/mspas/pdf?embarazo_id=9';
    const unauthenticated = await fetch(`${baseUrl}${url}`);
    const forbidden = await fetch(`${baseUrl}${url}`, {
      headers: { authorization: 'Bearer test' },
    });
    const allowed = await fetch(`${baseUrl}${url}`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });
    const blocked = await fetch(`${baseUrl}${url}`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });

    assert.equal(unauthenticated.status, 401);
    assert.equal(forbidden.status, 403);
    assert.equal(allowed.status, 204);
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, 'PDF_RATE_LIMITED');
    assert.deepEqual(calls, ['mspas']);
  });
});

test('permiso y validacion de IDs ocurren antes del consumo de cupo', async () => {
  const calls = [];
  const { consume } = createPdfRateLimiter({ limit: 1, windowMs: 60_000 });
  const app = createPdfRouteTestApp({
    calls,
    beforeController: consume,
  });

  await withServer(app, async (baseUrl) => {
    const invalidWithoutPermission = await fetch(`${baseUrl}/api/pacientes/not-an-id/bad/pdf?embarazo_id=no`, {
      headers: { authorization: 'Bearer test' },
    });
    assert.equal(invalidWithoutPermission.status, 403);

    const invalidPatient = await fetch(`${baseUrl}/api/pacientes/not-an-id/mspas/pdf`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });
    const invalidControl = await fetch(`${baseUrl}/api/pacientes/41/not-an-id/pdf`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });
    const invalidPregnancy = await fetch(`${baseUrl}/api/pacientes/41/riesgo/pdf?embarazo_id=no`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });

    assert.equal(invalidPatient.status, 400);
    assert.equal(invalidControl.status, 400);
    assert.equal(invalidPregnancy.status, 400);
    assert.equal(calls.length, 0);

    const valid = await fetch(`${baseUrl}/api/pacientes/41/mspas/pdf?embarazo_id=9`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });
    assert.equal(valid.status, 204);

    const blocked = await fetch(`${baseUrl}/api/pacientes/41/mspas/pdf?embarazo_id=9`, {
      headers: { authorization: 'Bearer test', 'x-permissions': 'pacientes.ver' },
    });
    assert.equal(blocked.status, 429);
    assert.deepEqual(calls, ['mspas']);
  });
});

test('servicio PDF rechaza paciente inexistente antes de resolver embarazo o datos', async () => {
  const calls = [];
  const service = createPdfService({
    repository: {
      obtenerPacientePorId: async () => null,
      resolverEmbarazoParaPdf: async () => calls.push('embarazo'),
      obtenerFichaMspasData: async () => calls.push('datos'),
    },
  });

  await assert.rejects(
    service.obtenerFichaMspasData(404, null),
    (error) => error.statusCode === 404 && error.code === 'PATIENT_NOT_FOUND'
  );
  assert.deepEqual(calls, []);
});

test('servicio PDF rechaza embarazo ajeno o ausencia de embarazo antes de consultar datos', async () => {
  let dataCalls = 0;
  const repository = {
    obtenerPacientePorId: async () => ({ id: 41 }),
    resolverEmbarazoParaPdf: async () => null,
    obtenerFichaMspasData: async () => {
      dataCalls += 1;
      return {};
    },
  };
  const service = createPdfService({ repository });

  await assert.rejects(
    service.obtenerFichaMspasData(41, 999),
    (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
  );
  await assert.rejects(
    service.obtenerFichaMspasData(41, null),
    (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
  );
  assert.equal(dataCalls, 0);
});

test('servicio PDF entrega solo datos del embarazo prevalidado', async () => {
  const calls = [];
  const paciente = { id: 41, nombres: 'Paciente' };
  const embarazo = { id: 91, paciente_id: 41 };
  const service = createPdfService({
    repository: {
      obtenerPacientePorId: async (id) => {
        calls.push(['paciente', id]);
        return paciente;
      },
      resolverEmbarazoParaPdf: async (args) => {
        calls.push(['embarazo', args]);
        return embarazo;
      },
      obtenerFichaMspasData: async (args) => {
        calls.push(['datos', args]);
        return { controles: [{ id: 1 }] };
      },
    },
  });

  const data = await service.obtenerFichaMspasData(41, 91);
  assert.equal(data.paciente, paciente);
  assert.equal(data.embarazo, embarazo);
  assert.deepEqual(data.controles, [{ id: 1 }]);
  assert.deepEqual(calls[2], ['datos', { pacienteId: 41, embarazoId: 91 }]);
});

test('servicio PDF conserva el enlace control-paciente-embarazo', async () => {
  let controlArgs;
  const service = createPdfService({
    repository: {
      obtenerPacientePorId: async () => ({ id: 41 }),
      resolverEmbarazoParaPdf: async () => ({ id: 91, paciente_id: 41 }),
      obtenerControlConPaciente: async (args) => {
        controlArgs = args;
        return null;
      },
    },
  });

  const result = await service.obtenerControlConPaciente({
    id: 17,
    pacienteId: 41,
    embarazoId: 91,
  });
  assert.equal(result, null);
  assert.deepEqual(controlArgs, { id: 17, pacienteId: 41, embarazoId: 91 });
});

test('control historico sin query no se filtra por el embarazo visible predeterminado', async () => {
  let pregnancyResolverCalls = 0;
  let controlArgs;
  const historicalControl = { id: 17, paciente_id: 41, embarazo_id: 12 };
  const service = createPdfService({
    repository: {
      obtenerPacientePorId: async () => ({ id: 41 }),
      resolverEmbarazoParaPdf: async () => {
        pregnancyResolverCalls += 1;
        return { id: 91, paciente_id: 41 };
      },
      obtenerControlConPaciente: async (args) => {
        controlArgs = args;
        return historicalControl;
      },
    },
  });

  const result = await service.obtenerControlConPaciente({
    id: 17,
    pacienteId: 41,
    embarazoId: null,
  });
  assert.equal(result, historicalControl);
  assert.equal(pregnancyResolverCalls, 0);
  assert.deepEqual(controlArgs, { id: 17, pacienteId: 41, embarazoId: null });
});

test('control con embarazo_id ajeno se rechaza antes de consultar el control', async () => {
  let controlCalls = 0;
  const service = createPdfService({
    repository: {
      obtenerPacientePorId: async () => ({ id: 41 }),
      resolverEmbarazoParaPdf: async () => null,
      obtenerControlConPaciente: async () => {
        controlCalls += 1;
        return null;
      },
    },
  });

  await assert.rejects(
    service.obtenerControlConPaciente({ id: 17, pacienteId: 41, embarazoId: 999 }),
    (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
  );
  assert.equal(controlCalls, 0);
});

test('repositorio PDF refuerza paciente-embarazo en consultas SQL', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/repositories/pdfRepository.js'), 'utf8');
  assert.match(source, /WHERE e\.paciente_id = \$1/);
  assert.match(source, /c\.paciente_id = \$2/);
  assert.ok((source.match(/e\.paciente_id = \$2/g) || []).length >= 8);
});

test('control inexistente no inicia Chromium', async () => {
  let launches = 0;
  let quotaConsumes = 0;
  const controller = createPdfController({
    consumePdfQuota: () => { quotaConsumes += 1; },
    pdfService: { obtenerControlConPaciente: async () => null },
    puppeteerClient: { launch: async () => { launches += 1; } },
  });

  await assert.rejects(
    controller.pdfControl({ params: { pacienteId: 41, controlId: 99 }, query: {} }, responseStub()),
    (error) => error.statusCode === 404 && error.code === 'CONTROL_NOT_FOUND'
  );
  assert.equal(launches, 0);
  assert.equal(quotaConsumes, 0);
});

test('paciente inexistente no consume cupo ni invoca el generador MSPAS', async () => {
  let generatorCalls = 0;
  let quotaConsumes = 0;
  const controller = createPdfController({
    consumePdfQuota: () => { quotaConsumes += 1; },
    generarFichaClinicaPrenatalPdf: async () => {
      generatorCalls += 1;
      return Buffer.from('unexpected');
    },
    pdfService: {
      obtenerFichaMspasData: async () => {
        throw new AppError(404, 'Paciente no encontrada', { code: 'PATIENT_NOT_FOUND' });
      },
    },
  });

  await assert.rejects(
    controller.pdfMspas(
      { params: { pacienteId: 404 }, query: {}, user: { id: 30 } },
      responseStub()
    ),
    (error) => error.statusCode === 404 && error.code === 'PATIENT_NOT_FOUND'
  );
  assert.equal(quotaConsumes, 0);
  assert.equal(generatorCalls, 0);
});

test('IDs incompatibles no consumen cupo ni invocan el generador MSPAS', async () => {
  let generatorCalls = 0;
  let auditCalls = 0;
  let incompatiblePregnancy = true;
  const { consume } = createPdfRateLimiter({ limit: 1, windowMs: 60_000 });
  const req = {
    params: { pacienteId: 41 },
    query: { embarazo_id: 999 },
    user: { id: 31 },
  };
  const controller = createPdfController({
    consumePdfQuota: consume,
    generarFichaClinicaPrenatalPdf: async () => {
      generatorCalls += 1;
      return Buffer.from('%PDF-test');
    },
    pdfService: {
      obtenerFichaMspasData: async () => {
        if (incompatiblePregnancy) {
          throw new AppError(404, 'Embarazo no encontrado', { code: 'PREGNANCY_NOT_FOUND' });
        }
        return { paciente: { id: 41 }, embarazo: { id: 91 } };
      },
    },
    registrarEventoPrivado: async () => { auditCalls += 1; },
  });

  await assert.rejects(
    controller.pdfMspas(req, responseStub()),
    (error) => error.statusCode === 404 && error.code === 'PREGNANCY_NOT_FOUND'
  );
  incompatiblePregnancy = false;
  await controller.pdfMspas(req, responseStub());
  await assert.rejects(
    controller.pdfMspas(req, responseStub()),
    (error) => error.statusCode === 429 && error.code === 'PDF_RATE_LIMITED'
  );
  assert.equal(generatorCalls, 1);
  assert.equal(auditCalls, 1);
});

test('error interno previo a invocar el generador no consume cupo', async () => {
  let failBeforeGenerator = true;
  let launches = 0;
  const { consume } = createPdfRateLimiter({ limit: 1, windowMs: 60_000 });
  const req = {
    params: { pacienteId: 41, controlId: 17 },
    query: {},
    user: { id: 32 },
  };
  const controller = createPdfController({
    consumePdfQuota: consume,
    fsApi: {
      readFileSync: () => {
        if (failBeforeGenerator) throw new Error('template read failed');
        return '<p>{{nombre}}</p>';
      },
    },
    pdfService: { obtenerControlConPaciente: async () => controlFixture() },
    puppeteerClient: {
      launch: async () => {
        launches += 1;
        return {
          close: async () => {},
          newPage: async () => ({
            pdf: async () => Buffer.from('%PDF-control'),
            setContent: async () => {},
          }),
        };
      },
    },
    registrarEventoPrivado: async () => {},
  });

  await assert.rejects(
    controller.pdfControl(req, responseStub()),
    (error) => error.statusCode === 500 && error.code === 'PDF_GENERATION_ERROR'
  );
  failBeforeGenerator = false;
  await controller.pdfControl(req, responseStub());
  await assert.rejects(
    controller.pdfControl(req, responseStub()),
    (error) => error.statusCode === 429 && error.code === 'PDF_RATE_LIMITED'
  );
  assert.equal(launches, 1);
});

test('error despues de iniciar el generador consume cupo', async () => {
  let generatorCalls = 0;
  const { consume } = createPdfRateLimiter({ limit: 1, windowMs: 60_000 });
  const req = {
    params: { pacienteId: 41 },
    query: { embarazo_id: 91 },
    user: { id: 33 },
  };
  const controller = createPdfController({
    consumePdfQuota: consume,
    generarFichaClinicaPrenatalPdf: async () => {
      generatorCalls += 1;
      throw new Error('generator failed');
    },
    pdfService: {
      obtenerFichaMspasData: async () => ({
        paciente: { id: 41 },
        embarazo: { id: 91 },
      }),
    },
  });

  await assert.rejects(
    controller.pdfMspas(req, responseStub()),
    (error) => error.statusCode === 500 && error.code === 'MSPAS_PDF_GENERATION_ERROR'
  );
  await assert.rejects(
    controller.pdfMspas(req, responseStub()),
    (error) => error.statusCode === 429 && error.code === 'PDF_RATE_LIMITED'
  );
  assert.equal(generatorCalls, 1);
});

test('20 intentos validos se permiten y el intento 21 no ejecuta el generador', async () => {
  let generatorCalls = 0;
  let auditCalls = 0;
  const { consume } = createPdfRateLimiter({ limit: 20, windowMs: 5 * 60_000 });
  const req = {
    params: { pacienteId: 41 },
    query: { embarazo_id: 91 },
    user: { id: 34 },
  };
  const controller = createPdfController({
    consumePdfQuota: consume,
    generarFichaClinicaPrenatalPdf: async () => {
      generatorCalls += 1;
      return Buffer.from('%PDF-test');
    },
    pdfService: {
      obtenerFichaMspasData: async () => ({
        paciente: { id: 41 },
        embarazo: { id: 91 },
      }),
    },
    registrarEventoPrivado: async () => { auditCalls += 1; },
  });

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await controller.pdfMspas(req, responseStub());
  }

  await assert.rejects(
    controller.pdfMspas(req, responseStub()),
    (error) => error.statusCode === 429 && error.code === 'PDF_RATE_LIMITED'
  );
  assert.equal(generatorCalls, 20);
  assert.equal(auditCalls, 20);
});

function controlFixture() {
  return {
    id: 17,
    paciente_id: 41,
    embarazo_id: 91,
    nombres: 'Paciente',
    apellidos: 'Prueba',
    no_expediente: 'EXP-1',
  };
}

test('Chromium se cierra despues de generar control y antes de responder', async () => {
  const events = [];
  const browser = {
    close: async () => events.push('close'),
    newPage: async () => ({
      pdf: async () => {
        events.push('pdf');
        return Buffer.from('%PDF-control');
      },
      setContent: async () => events.push('setContent'),
    }),
  };
  const controller = createPdfController({
    fsApi: { readFileSync: () => '<p>{{nombre}}</p>' },
    pdfService: { obtenerControlConPaciente: async () => controlFixture() },
    puppeteerClient: { launch: async () => browser },
    registrarEventoPrivado: async () => events.push('audit'),
    sendPdfResponse: (_res, _pdf, filename) => events.push(`send:${filename}`),
  });

  await controller.pdfControl({ params: { pacienteId: 41, controlId: 17 }, query: { embarazo_id: 91 } }, responseStub());
  assert.deepEqual(events, ['setContent', 'pdf', 'close', 'audit', 'send:control-17.pdf']);
});

test('Chromium se cierra si falla la generacion de control', async () => {
  let closes = 0;
  let audits = 0;
  const controller = createPdfController({
    fsApi: { readFileSync: () => '<p>{{nombre}}</p>' },
    pdfService: { obtenerControlConPaciente: async () => controlFixture() },
    puppeteerClient: {
      launch: async () => ({
        close: async () => { closes += 1; },
        newPage: async () => ({
          pdf: async () => { throw new Error('chromium failure'); },
          setContent: async () => {},
        }),
      }),
    },
    registrarEventoPrivado: async () => { audits += 1; },
  });

  await assert.rejects(
    controller.pdfControl({ params: { pacienteId: 41, controlId: 17 }, query: {} }, responseStub()),
    (error) => error.statusCode === 500 && error.code === 'PDF_GENERATION_ERROR'
  );
  assert.equal(closes, 1);
  assert.equal(audits, 0);
});

test('PDF exitoso audita solo metadata minima y aplica cabeceras seguras', async () => {
  const auditEvents = [];
  const res = responseStub();
  const req = {
    params: { pacienteId: 41 },
    query: { embarazo_id: 91 },
    usuario: { id: 7 },
  };
  const controller = createPdfController({
    generarFichaClinicaPrenatalPdf: async (data) => {
      assert.equal(data.secreto_clinico, 'NO_AUDITAR');
      return Buffer.from('%PDF-mspas');
    },
    pdfService: {
      obtenerFichaMspasData: async () => ({
        paciente: { id: 41 },
        embarazo: { id: 91 },
        secreto_clinico: 'NO_AUDITAR',
      }),
    },
    registrarEventoPrivado: async (auditReq, event) => auditEvents.push({ auditReq, event }),
  });

  await controller.pdfMspas(req, res);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].auditReq.usuario.id, 7);
  assert.deepEqual(auditEvents[0].event.metadata, {
    tipo_documento: 'ficha_mspas_prenatal',
    formato: 'pdf',
    resultado: 'generado',
  });
  assert.equal(auditEvents[0].event.pacienteId, 41);
  assert.equal(auditEvents[0].event.embarazoId, 91);
  assert.doesNotMatch(JSON.stringify(auditEvents[0].event), /NO_AUDITAR|%PDF|cookie|token/i);
  assert.equal(res.headers['Content-Disposition'], 'inline; filename="ficha-prenatal.pdf"');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('mapeo VIH permanece presente en la ficha oficial sin controles.ver_vih', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/fichaClinicaPrenatalPdf.js'),
    'utf8'
  );
  assert.match(source, /p\.antec_vih_positivo[\s\S]*c\.yesNo\.antecVih/);
  assert.match(source, /markPositiveNegative\(page, font, control\.vih_resultado, lab\.vih/);
  assert.doesNotMatch(source, /controles\.ver_vih/);
});
