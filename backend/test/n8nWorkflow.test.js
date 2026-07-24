const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW_PATH = path.join(ROOT, 'n8n', 'workflows', 'proximas-citas-v1.json');
const WORKFLOW_SOURCE = fs.readFileSync(WORKFLOW_PATH, 'utf8');
const workflow = JSON.parse(WORKFLOW_SOURCE);

const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
const byName = (name) => {
  const found = workflow.nodes.find((node) => node.name === name);
  assert.ok(found, `Nodo ausente: ${name}`);
  return found;
};
const targets = (name, output = 0) => (
  workflow.connections[name]?.main?.[output] || []
).map((connection) => connection.node);

function validContract(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-07-23T12:00:00.000Z',
    timezone: 'America/Guatemala',
    range: {
      from: '2026-07-24',
      to: '2026-07-24',
    },
    total: 3,
    summary_by_date: [
      {
        date: '2026-07-24',
        total: 3,
      },
    ],
    secure_path: '/dashboard',
    ...overrides,
  };
}

function runContractValidator(payload) {
  const code = byName('Validar contrato estrictamente').parameters.jsCode;
  const execute = new Function('$json', '$node', code);
  return execute(
    { response: payload },
    {
      'Preparar parámetros y configuración': {
        json: { recipient_alias: 'responsable_salud_reproductiva' },
      },
    }
  )[0].json;
}

function runMailBuilder({
  input = {
    range_from: '2026-07-24',
    range_to: '2026-07-24',
    total: 3,
    secure_path: '/dashboard',
    idempotency_hash: 'a'.repeat(64),
  },
  env = { CAP_SYSTEM_BASE_URL: 'https://cap-prenatal.example.test' },
  vars = {
    CAP_NOTIFICATION_RECIPIENT: 'responsable@example.test',
    CAP_NOTIFICATION_FROM: 'automatizacion@example.test',
  },
  execution = { mode: 'trigger' },
} = {}) {
  const code = byName('Construir correo agregado').parameters.jsCode;
  const execute = new Function('$json', '$env', '$vars', '$execution', code);
  return execute(input, env, vars, execution)[0].json;
}

function runRequestClassifier(attempt, payload) {
  const code = byName(`Clasificar respuesta - intento ${attempt}`).parameters.jsCode;
  const execute = new Function('$json', code);
  return execute(payload)[0].json;
}

function runInitialConfiguration({
  backendUrl,
  execution = { mode: 'trigger' },
  vars = {},
}) {
  const code = byName('Preparar parámetros y configuración').parameters.jsCode;
  const execute = new Function('$env', '$vars', '$execution', code);
  return execute(
    { CAP_BACKEND_AUTOMATION_URL: backendUrl },
    vars,
    execution
  )[0].json;
}

test('workflow JSON es válido, versionado, inactivo y sin datos fijados', () => {
  assert.equal(workflow.name, 'CAP Prenatal | Próximas citas agregadas | v1');
  assert.equal(workflow.active, false);
  assert.match(workflow.versionId, /^[0-9a-f-]{36}$/);
  assert.equal(new Set(workflow.nodes.map((node) => node.id)).size, workflow.nodes.length);
  assert.equal(Object.hasOwn(workflow, 'pinData'), false);
  assert.equal(Object.hasOwn(workflow, 'staticData'), false);
  assert.deepEqual(workflow.tags, []);
  assert.equal(workflow.meta.templateCredsSetupCompleted, false);
});

test('Schedule diario queda a las 06:00 America/Guatemala', () => {
  const schedule = byName('Ejecutar diariamente a las 06:00');
  assert.equal(schedule.type, 'n8n-nodes-base.scheduleTrigger');
  assert.deepEqual(schedule.parameters.rule.interval, [{
    field: 'days',
    daysInterval: 1,
    triggerAtHour: 6,
    triggerAtMinute: 0,
  }]);
  assert.equal(workflow.settings.timezone, 'America/Guatemala');
});

test('workflow desactiva persistencia de ejecuciones y exposición MCP', () => {
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.equal(workflow.settings.callerPolicy, 'none');
  assert.equal(workflow.settings.availableInMCP, false);
});

test('los tres requests usan URL configurada, Header Auth, rango fijo y timeout', () => {
  const requests = workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.httpRequest'
  );
  assert.equal(requests.length, 3);

  for (const request of requests) {
    assert.equal(request.parameters.method, 'GET');
    assert.match(request.parameters.url, /backend_url/);
    assert.equal(request.parameters.authentication, 'genericCredentialType');
    assert.equal(request.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(Object.hasOwn(request, 'credentials'), false);
    assert.equal(request.parameters.sendHeaders, false);
    assert.equal(request.parameters.options.timeout, 10000);
    assert.equal(
      request.parameters.options.redirect.redirect.followRedirects,
      false
    );
    assert.equal(
      request.parameters.options.sendCredentialsOnCrossOriginRedirect,
      false
    );
    assert.equal(
      request.parameters.options.response.response.fullResponse,
      false
    );
    assert.equal(
      request.parameters.options.response.response.responseFormat,
      'json'
    );
    assert.equal(request.onError, 'continueRegularOutput');

    const query = Object.fromEntries(
      request.parameters.queryParameters.parameters.map(
        ({ name, value }) => [name, String(value)]
      )
    );
    assert.match(query.offset_days, /1|offset_days/);
    assert.match(query.window_days, /1|window_days/);
  }

  const prepared = byName('Preparar parámetros y configuración').parameters.jsCode;
  assert.match(prepared, /\$env\.CAP_BACKEND_AUTOMATION_URL/);
  assert.match(prepared, /offsetDays = 1/);
  assert.match(prepared, /windowDays = 1/);
  assert.doesNotMatch(requests.map((node) => node.parameters.url).join('\n'), /localhost|127\.0\.0\.1|nginx|proxy/i);
  assert.doesNotMatch(WORKFLOW_SOURCE, /https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}\/api\/automatizaciones/i);
});

test('ejecución programada exige el servicio privado backend, no proxy o IP', () => {
  const internal = runInitialConfiguration({
    backendUrl: 'http://backend:3001/api/automatizaciones/v1/proximas-citas',
  });
  assert.equal(internal.configuration_valid, true);
  assert.equal(internal.offset_days, 1);
  assert.equal(internal.window_days, 1);

  for (const backendUrl of [
    'https://cap-prenatal.example.test/api/automatizaciones/v1/proximas-citas',
    'http://172.30.30.9:3001/api/automatizaciones/v1/proximas-citas',
    'http://proxy:80/api/automatizaciones/v1/proximas-citas',
  ]) {
    const result = runInitialConfiguration({ backendUrl });
    assert.equal(result.result, 'configuration_error');
    assert.equal(result.validation_detail, 'backend_url_not_private_service');
  }

  const manual = runInitialConfiguration({
    backendUrl: 'http://127.0.0.1:3001/api/automatizaciones/v1/proximas-citas',
    execution: { mode: 'manual' },
  });
  assert.equal(manual.configuration_valid, true);
});

test('reintentos HTTP son tres totales con esperas 1/5 y exclusiones explícitas', () => {
  assert.deepEqual(
    [byName('Esperar 1 minuto'), byName('Esperar 5 minutos')]
      .map((node) => [node.parameters.amount, node.parameters.unit]),
    [[1, 'minutes'], [5, 'minutes']]
  );
  const classifiers = [1, 2, 3].map(
    (attempt) => byName(`Clasificar respuesta - intento ${attempt}`).parameters.jsCode
  );
  for (const code of classifiers) {
    for (const status of [400, 401, 404, 429]) {
      assert.match(code, new RegExp(`status === ${status}`));
    }
  }
  assert.match(classifiers[0], /status >= 500/);
  assert.match(classifiers[0], /timeout\|timed out\|econn/);
  assert.doesNotMatch(classifiers[2], /return finish\([^;]+,\s*true\)/);
});

test('clasificación HTTP maneja errores objeto/texto sin confundir contrato', () => {
  assert.deepEqual(
    runRequestClassifier(1, {
      error: { statusCode: 500, message: 'fallo interno sintetico' },
    }),
    {
      workflow_version: 1,
      request_ok: false,
      should_retry: true,
      attempt: 1,
      result: 'backend_unavailable',
      reason_code: 'BACKEND_UNAVAILABLE',
    }
  );

  assert.deepEqual(
    runRequestClassifier(1, {
      error: { statusCode: 401, message: 'rechazo sintetico' },
    }),
    {
      workflow_version: 1,
      request_ok: false,
      should_retry: false,
      attempt: 1,
      result: 'unauthorized',
      reason_code: 'AUTOMATION_UNAUTHORIZED',
    }
  );

  assert.equal(
    runRequestClassifier(1, {
      error: { code: 'ECONNREFUSED', message: 'connect failed' },
    }).should_retry,
    true
  );
  assert.equal(
    runRequestClassifier(1, {
      error: 'connect ECONNREFUSED 127.0.0.1',
    }).should_retry,
    true
  );

  const unknownContract = { error: { inesperado: true } };
  const classified = runRequestClassifier(1, unknownContract);
  assert.equal(classified.request_ok, true);
  assert.deepEqual(classified.response, unknownContract);
  assert.equal(
    runContractValidator(unknownContract).reason_code,
    'CONTRACT_INVALID'
  );

  const finalAttempt = runRequestClassifier(3, {
    error: { statusCode: 503, message: 'indisponible sintetico' },
  });
  assert.equal(finalAttempt.should_retry, false);
  assert.equal(finalAttempt.result, 'backend_unavailable');
});

test('no hay keys, hashes, credenciales o configuración SMTP real', () => {
  assert.doesNotMatch(WORKFLOW_SOURCE, /\b[a-f0-9]{64}\b/i);
  assert.doesNotMatch(WORKFLOW_SOURCE, /N8N_API_KEY_HASH_(?:CURRENT|NEXT)|AUTOMATION_SECRET/);
  assert.doesNotMatch(WORKFLOW_SOURCE, /Bearer\s+[A-Za-z0-9._-]+/);
  assert.doesNotMatch(WORKFLOW_SOURCE, /smtp\.(?:gmail|office365|outlook|amazonaws)\./i);
  assert.doesNotMatch(WORKFLOW_SOURCE, /DB_PASSWORD|DATABASE_URL|POSTGRES_PASSWORD|JWT_SECRET|SESSION_SECRET/);
  assert.equal(workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false);
  assert.match(WORKFLOW_SOURCE, /responsable@example\.invalid/);
  assert.match(WORKFLOW_SOURCE, /cap-prenatal@example\.invalid/);
});

test('no existen nodos peligrosos, PostgreSQL ni lectura global del entorno', () => {
  const types = workflow.nodes.map((node) => node.type).join('\n');
  const codeNodes = workflow.nodes
    .filter((node) => node.type === 'n8n-nodes-base.code')
    .map((node) => node.parameters.jsCode)
    .join('\n');
  assert.doesNotMatch(types, /postgres/i);
  assert.doesNotMatch(types, /executeCommand/i);
  assert.doesNotMatch(codeNodes, /process\.env|Object\.(?:keys|entries)\(\s*\$env\s*\)/);
  for (const request of workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.httpRequest'
  )) {
    assert.equal(request.parameters.sendHeaders, false);
    assert.equal(request.parameters.options.response.response.fullResponse, false);
  }
});

test('contrato válido se reduce a rango, total, secure_path y alias', () => {
  const result = runContractValidator(validContract());
  assert.deepEqual(result, {
    workflow_version: 1,
    contract_valid: true,
    range_from: '2026-07-24',
    range_to: '2026-07-24',
    total: 3,
    secure_path: '/dashboard',
    recipient_alias: 'responsable_salud_reproductiva',
  });
  assert.equal(Object.hasOwn(result, 'summary_by_date'), false);
  assert.equal(Object.hasOwn(result, 'generated_at'), false);
});

test('validador rechaza versión, timezone, ISO, rango, límite y secure_path', () => {
  const cases = [
    [validContract({ schema_version: 2 }), 'schema_version_invalid'],
    [validContract({ timezone: 'UTC' }), 'timezone_invalid'],
    [validContract({ generated_at: 'ayer' }), 'generated_at_invalid'],
    [validContract({ generated_at: '2026-02-30T12:00:00.000Z' }), 'generated_at_invalid'],
    [validContract({ range: { from: '2026-02-30', to: '2026-02-30' } }), 'range_invalid'],
    [validContract({ total: 10001, summary_by_date: [] }), 'total_invalid'],
    [validContract({ secure_path: '/admin' }), 'secure_path_invalid'],
  ];
  for (const [payload, detail] of cases) {
    const result = runContractValidator(payload);
    assert.equal(result.result, 'contract_invalid');
    assert.equal(result.reason_code, 'CONTRACT_INVALID');
    assert.equal(result.validation_detail, detail);
  }
});

test('validador rechaza campos adicionales, desorden y suma inconsistente', () => {
  const extraRoot = validContract();
  extraRoot.extra = true;
  assert.equal(
    runContractValidator(extraRoot).validation_detail,
    'root_fields_invalid'
  );

  const extraSummary = validContract();
  extraSummary.summary_by_date[0].extra = true;
  assert.equal(
    runContractValidator(extraSummary).validation_detail,
    'summary_fields_invalid'
  );

  const unordered = validContract({
    range: { from: '2026-07-24', to: '2026-07-25' },
    total: 3,
    summary_by_date: [
      { date: '2026-07-25', total: 1 },
      { date: '2026-07-24', total: 2 },
    ],
  });
  assert.equal(
    runContractValidator(unordered).validation_detail,
    'summary_dates_not_ascending'
  );

  const badSum = validContract({ total: 4 });
  assert.equal(
    runContractValidator(badSum).validation_detail,
    'summary_sum_mismatch'
  );
});

test('validador rechaza todos los nombres de campo personales o clínicos', () => {
  const forbidden = [
    'paciente_id',
    'embarazo_id',
    'nombre',
    'nombres',
    'apellidos',
    'expediente',
    'CUI',
    'teléfono',
    'dirección',
    'comunidad',
    'territorio',
    'riesgo',
    'diagnóstico',
    'observaciones',
    'HTML',
    'Markdown',
    'controles',
    'laboratorios',
  ];
  for (const field of forbidden) {
    const payload = validContract();
    payload.summary_by_date[0][field] = 'dato que no debe persistirse';
    const result = runContractValidator(payload);
    assert.equal(result.reason_code, 'CONTRACT_INVALID');
    assert.match(result.validation_detail, /^forbidden_field:/);
    assert.doesNotMatch(JSON.stringify(result), /dato que no debe persistirse/);
  }
});

test('total cero termina sin alcanzar ningún nodo de correo', () => {
  assert.deepEqual(targets('¿Total es cero?', 0), ['Salida sin citas']);
  assert.deepEqual(targets('¿Total es cero?', 1), ['Construir correo agregado']);
  assert.deepEqual(targets('Salida sin citas'), []);
  assert.equal(
    targets('¿Correo configurado?', 0)[0],
    'Enviar resumen - intento 1'
  );
});

test('deduplicación usa SHA-256 con alias y marca solo después del envío', () => {
  const crypto = byName('Calcular clave SHA-256');
  assert.equal(crypto.parameters.action, 'hash');
  assert.equal(crypto.parameters.type, 'SHA256');
  assert.equal(crypto.parameters.encoding, 'hex');
  assert.match(crypto.parameters.value, /'v1\|'/);
  assert.match(crypto.parameters.value, /recipient_alias/);
  assert.doesNotMatch(crypto.parameters.value, /mail_to|recipient@/);

  const check = byName('Comprobar duplicado').parameters.jsCode;
  const mark = byName('Marcar enviado y finalizar').parameters.jsCode;
  assert.match(check, /\$getWorkflowStaticData\('global'\)/);
  assert.match(check, /maxEntries = 90/);
  assert.match(check, /45 \* 24 \* 60 \* 60/);
  assert.doesNotMatch(check, /mail_to|mail_text|response|summary_by_date/);
  assert.match(mark, /sent_v1\[input\.idempotency_hash\] = Date\.now\(\)/);

  const incomingToMark = Object.entries(workflow.connections)
    .flatMap(([source, connection]) => (
      (connection.main || []).flatMap((output, outputIndex) => (
        output.map((target) => ({ source, outputIndex, target: target.node }))
      ))
    ))
    .filter(({ target }) => target === 'Marcar enviado y finalizar');
  assert.deepEqual(incomingToMark, [
    {
      source: '¿Envío 1 confirmado?',
      outputIndex: 0,
      target: 'Marcar enviado y finalizar',
    },
    {
      source: '¿Envío 2 confirmado?',
      outputIndex: 0,
      target: 'Marcar enviado y finalizar',
    },
  ]);
});

test('correo es texto simple y contiene únicamente total, rango y enlace seguro', () => {
  const built = runMailBuilder();
  assert.equal(built.mail_configuration_valid, true);
  assert.equal(
    built.mail_subject,
    'CAP Prenatal | Próximas citas — 2026-07-24'
  );
  assert.equal(
    built.mail_text,
    [
      'Se identificaron 3 citas prenatales programadas para 2026-07-24.',
      '',
      'Ingrese al sistema CAP Prenatal para consultar el detalle:',
      'https://cap-prenatal.example.test/dashboard',
      '',
      'Este es un mensaje automático. No responda a este correo.',
    ].join('\n')
  );

  const mailNodes = workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.emailSend'
  );
  assert.equal(mailNodes.length, 2);
  for (const node of mailNodes) {
    assert.equal(node.parameters.emailFormat, 'text');
    assert.equal(Object.hasOwn(node.parameters, 'html'), false);
    assert.equal(Object.hasOwn(node.parameters.options, 'attachments'), false);
    assert.equal(Object.hasOwn(node.parameters.options, 'fileAttachments'), false);
    assert.equal(node.parameters.options.allowUnauthorizedCerts, false);
  }
});

test('URL del sistema exige HTTPS programado y bloquea esquemas peligrosos', () => {
  for (const url of [
    'http://cap-prenatal.example.test',
    'javascript:alert(1)',
    'data:text/plain,contenido',
    'file:///tmp/dashboard',
  ]) {
    const result = runMailBuilder({
      env: { CAP_SYSTEM_BASE_URL: url },
    });
    assert.equal(result.result, 'configuration_error');
  }

  const manual = runMailBuilder({
    env: { CAP_SYSTEM_BASE_URL: 'http://127.0.0.1:8080' },
    execution: { mode: 'manual' },
  });
  assert.equal(manual.mail_configuration_valid, true);
});

test('correo solo reintenta rechazo transitorio previo y nunca timeout ambiguo', () => {
  const classifier = byName('Clasificar envío - intento 1').parameters.jsCode;
  assert.match(classifier, /421\|450\|451\|452/);
  assert.match(classifier, /recipient\|sender\|rcpt\|mail from/);
  assert.match(classifier, /timeout\|timed out\|socket\|econnreset/);
  assert.match(classifier, /retryMail = !ambiguous/);
  assert.equal(
    workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.emailSend').length,
    2
  );
});

test('salidas finales no incorporan secretos, headers, body, SMTP o stack', () => {
  const terminalNames = [
    'Salida configuración inicial',
    'Salida controlada de backend',
    'Salida contrato inválido',
    'Salida duplicada',
    'Salida sin citas',
    'Salida configuración de correo',
    'Marcar enviado y finalizar',
    'Salida error de correo',
  ];
  for (const name of terminalNames) {
    const code = byName(name).parameters.jsCode;
    assert.doesNotMatch(
      code,
      /api[_-]?key|header|mail_to|mail_text|smtp_response|stack|backend_url|response\s*:/
    );
  }
});

test('workflow no está autoimportado, activado ni conectado a Compose', () => {
  const compose = [
    read('docker-compose.yml'),
    read('docker-compose.production.example.yml'),
  ].join('\n');
  assert.doesNotMatch(compose, /proximas-citas-v1\.json|N8N_AUTO_IMPORT|N8N_WORKFLOW_ACTIVE/i);
  assert.doesNotMatch(
    compose.match(/  n8n:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|\nnetworks:)/)?.[0] || '',
    /data_internal|postgres:5432/
  );
});

test('concurrencia operativa 1 y limitación de static data están documentadas', () => {
  const docs = [
    read('n8n', 'README.md'),
    read('docs', 'N8N.md'),
  ].join('\n');
  assert.match(docs, /concurrencia operativa(?: del workflow)?[^.\n]{0,50}\b1\b/i);
  assert.match(docs, /static data[\s\S]{0,180}(?:mejor esfuerzo|no es una garantia transaccional)/i);
});
