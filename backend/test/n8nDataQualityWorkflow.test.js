const assert = require('node:assert/strict');
const test = require('node:test');

const workflow = require('../../n8n/workflows/watchdog-calidad-datos-resend-v1.json');

function byName(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Falta el nodo ${name}`);
  return node;
}

function runValidator(payload) {
  return new Function('$json', byName('Validar contrato de calidad').parameters.jsCode)(
    payload
  )[0].json;
}

function runEmailBuilder(payload) {
  return new Function('$json', byName('Construir resumen agregado').parameters.jsCode)(
    payload
  )[0].json;
}

function validPayload(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-08-31T15:00:00.000Z',
    timezone: 'America/Guatemala',
    report_type: 'weekly_data_quality_watchdog',
    range: { from: '2026-08-24', to: '2026-08-30' },
    as_of: '2026-08-31',
    dispatch: { status: 'ready', token: 'a'.repeat(43) },
    total: 3,
    categories: [
      {
        code: 'future_prenatal_control',
        label: 'Controles prenatales con fecha futura',
        description: 'Hay controles con una fecha posterior al dia operativo actual.',
        count: 1,
      },
      {
        code: 'scheduled_appointment_closed_pregnancy',
        label: 'Citas programadas en embarazos cerrados',
        description: 'Hay citas aun programadas dentro de embarazos cerrados.',
        count: 2,
      },
    ],
    secure_path: '/dashboard',
    ...overrides,
  };
}

test('workflow queda inactivo y programado lunes 09:00 America/Guatemala', () => {
  assert.equal(workflow.id, 'capQualityV1A1');
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.length, 7);
  assert.equal(workflow.settings.timezone, 'America/Guatemala');
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.availableInMCP, false);
  assert.ok(workflow.nodes.every((node) => !node.credentials));
  assert.deepEqual(byName('Cada lunes a las 09:00').parameters.rule.interval, [{
    field: 'weeks',
    weeksInterval: 1,
    triggerAtDay: [1],
    triggerAtHour: 9,
    triggerAtMinute: 0,
  }]);
});

test('flujo prepara, valida, corta en cero, envia una sola vez y confirma despues de Resend', () => {
  const prepare = byName('Preparar revision de calidad');
  const resend = byName('Enviar watchdog por Resend');
  const confirm = byName('Confirmar despacho en CAP');
  assert.match(prepare.parameters.url, /\/api\/automatizaciones\/v1\/calidad-datos\/preparar/);
  assert.match(confirm.parameters.url, /\/api\/automatizaciones\/v1\/calidad-datos\/confirmar/);
  assert.equal(prepare.parameters.authentication, 'genericCredentialType');
  assert.equal(prepare.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(confirm.parameters.authentication, 'genericCredentialType');
  assert.equal(resend.type, 'n8n-nodes-resend.resend');
  assert.equal(prepare.parameters.retryOnFail, undefined);
  assert.equal(resend.parameters.retryOnFail, undefined);
  assert.equal(confirm.parameters.retryOnFail, undefined);
  assert.deepEqual(
    workflow.connections['Enviar watchdog por Resend'].main[0],
    [{ node: 'Confirmar despacho en CAP', type: 'main', index: 0 }]
  );
  assert.deepEqual(workflow.connections['¿Hay incidencias?'].main[1], []);
});

test('contrato listo conserva solo resumen agregado, token y fechas operativas', () => {
  const result = runValidator(validPayload());
  assert.equal(result.should_send, true);
  assert.equal(result.dispatch_token, 'a'.repeat(43));
  assert.deepEqual(result.range, { from: '2026-08-24', to: '2026-08-30' });
  assert.equal(result.as_of, '2026-08-31');
  assert.equal(result.total, 3);
  assert.deepEqual(result.categories.map(({ code, count }) => ({ code, count })), [
    { code: 'future_prenatal_control', count: 1 },
    { code: 'scheduled_appointment_closed_pregnancy', count: 2 },
  ]);
  assert.equal('items' in result, false);
});

test('cero incidencias y already_processed terminan normalmente sin Resend', () => {
  for (const status of ['no_results', 'already_processed']) {
    const result = runValidator(validPayload({
      dispatch: { status },
      total: 0,
      categories: [],
    }));
    assert.equal(result.should_send, false);
    assert.equal(result.dispatch_token, null);
  }
});

test('contrato invalido detiene la ejecucion y no puede presentarse como cero', () => {
  const invalidPayloads = [
    validPayload({ total: 2 }),
    validPayload({ extra: true }),
    validPayload({ range: { from: '2026-08-25', to: '2026-08-30' } }),
    validPayload({ dispatch: { status: 'ready', token: 'corto' } }),
    validPayload({ dispatch: { status: 'no_results' } }),
    validPayload({
      total: 1,
      categories: [{
        code: 'categoria_no_contratada',
        label: 'Categoria no contratada',
        description: 'Descripcion que el contrato no permite.',
        count: 1,
      }],
    }),
    validPayload({ categories: [{
      code: 'duplicada', label: 'Categoria valida', description: 'Descripcion operativa valida.', count: 1,
    }, {
      code: 'duplicada', label: 'Categoria valida', description: 'Descripcion operativa valida.', count: 2,
    }] }),
  ];
  for (const payload of invalidPayloads) {
    assert.throws(() => runValidator(payload), /CONTRACT_INVALID/);
  }
});

test('correo usa DD-MM-YYYY y contiene solo categorias agregadas', () => {
  const result = runEmailBuilder(runValidator(validPayload()));
  assert.equal(result.subject, 'CAP Prenatal | Revisión semanal de calidad de datos');
  assert.match(result.html, /24-08-2026 al 30-08-2026/);
  assert.match(result.html, /Total de incidencias:<\/strong> 3/);
  assert.match(result.html, /Controles prenatales con fecha futura/);
  assert.match(result.html, /Citas programadas en embarazos cerrados/);
  assert.match(result.html, /Este resumen no contiene datos de pacientes ni información clínica/);
  assert.doesNotMatch(result.html, /2026-08-(?:24|30)/);
  assert.doesNotMatch(
    result.html.toLowerCase(),
    /cui|expediente|tel[eé]fono|direcci[oó]n|nombre de paciente|apellido|vih|laboratorio|diagn[oó]stico|morbilidad/
  );
  assert.deepEqual(Object.keys(result).sort(), ['dispatch_token', 'html', 'subject']);
});

test('workflow versionado no contiene acceso PostgreSQL, destinatarios reales ni secretos', () => {
  const serialized = JSON.stringify(workflow);
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(serialized, /\b(?:select|insert|update|delete)\s+/i);
  assert.match(serialized, /responsable@example\.invalid/);
  assert.match(serialized, /notificaciones\.example\.invalid/);
  assert.doesNotMatch(serialized, /N8N_ENCRYPTION_KEY|Bearer\s+\S+|\bre_[A-Za-z0-9_-]{8,}|password/i);
  assert.doesNotMatch(serialized, /@gmail\.com|@hotmail\.com|@outlook\.com/i);
});
