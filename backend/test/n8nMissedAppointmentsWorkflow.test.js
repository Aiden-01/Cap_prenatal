const assert = require('node:assert/strict');
const test = require('node:test');

const workflow = require('../../n8n/workflows/seguimiento-inasistencias-resend-v1.json');

function byName(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Falta el nodo ${name}`);
  return node;
}

function runCode(name, payload) {
  const code = byName(name).parameters.jsCode;
  return new Function('$json', code)(payload)[0].json;
}

function validPayload(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-08-24T14:00:00.000Z',
    timezone: 'America/Guatemala',
    report_type: 'weekly_missed_appointments',
    range: { from: '2026-08-17', to: '2026-08-23' },
    cutoff_at: '2026-08-01T16:30:00.000Z',
    dispatch: { status: 'ready', token: 'a'.repeat(43) },
    total: 1,
    appointments: [{
      date: '2026-08-19',
      first_name: 'Ana',
      last_name: 'López',
      phone: '5555-0101',
      community: 'El Chal',
    }],
    ...overrides,
  };
}

test('workflow semanal queda inactivo, privado y programado lunes 08:00 Guatemala', () => {
  assert.equal(workflow.id, 'capInasistV1A1');
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.length, 7);
  assert.equal(workflow.settings.timezone, 'America/Guatemala');
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.equal(workflow.settings.availableInMCP, false);
  assert.ok(workflow.nodes.every((node) => !node.credentials));

  const interval = byName('Cada lunes a las 08:00').parameters.rule.interval;
  assert.deepEqual(interval, [{
    field: 'weeks',
    weeksInterval: 1,
    triggerAtDay: [1],
    triggerAtHour: 8,
    triggerAtMinute: 0,
  }]);
});

test('flujo prepara en backend, no envia con cero y confirma solo despues de Resend', () => {
  const prepare = byName('Preparar semana anterior');
  const confirm = byName('Confirmar despacho en CAP');
  assert.equal(prepare.parameters.method, 'POST');
  assert.match(prepare.parameters.url, /\/api\/automatizaciones\/v1\/inasistencias\/preparar/);
  assert.equal(confirm.parameters.method, 'POST');
  assert.match(confirm.parameters.url, /\/api\/automatizaciones\/v1\/inasistencias\/confirmar/);
  assert.equal(prepare.parameters.authentication, 'genericCredentialType');
  assert.equal(confirm.parameters.authentication, 'genericCredentialType');
  assert.equal(prepare.parameters.options.timeout, 10000);
  assert.equal(confirm.parameters.options.timeout, 10000);
  assert.equal(prepare.parameters.retryOnFail, undefined);
  assert.equal(confirm.parameters.retryOnFail, undefined);

  assert.deepEqual(workflow.connections['¿Hay inasistencias nuevas?'].main[1], []);
  assert.deepEqual(
    workflow.connections['Enviar seguimiento por Resend'].main[0],
    [{ node: 'Confirmar despacho en CAP', type: 'main', index: 0 }]
  );
  assert.match(confirm.parameters.jsonBody, /dispatch_token/);
  assert.match(confirm.parameters.jsonBody, /Construir mensaje operativo/);
});

test('validador acepta ready y conserva solo datos operativos permitidos', () => {
  const result = runCode('Validar contrato y reserva', validPayload());
  assert.deepEqual(Object.keys(result).sort(), [
    'appointments', 'dispatch_token', 'range', 'should_send', 'total',
  ]);
  assert.equal(result.should_send, true);
  assert.equal(result.dispatch_token, 'a'.repeat(43));
  assert.deepEqual(result.appointments[0], {
    date: '2026-08-19',
    first_name: 'Ana',
    last_name: 'López',
    phone: '5555-0101',
    community: 'El Chal',
  });
});

test('no_results y already_processed terminan sin correo', () => {
  for (const status of ['no_results', 'already_processed']) {
    const result = runCode('Validar contrato y reserva', validPayload({
      dispatch: { status },
      total: 0,
      appointments: [],
    }));
    assert.equal(result.should_send, false);
    assert.equal(result.dispatch_token, null);
  }
});

test('validador rechaza campos extra, estado no permitido, conteo y ventana invalidos', () => {
  const extra = validPayload();
  extra.appointments[0].cui = 'dato-prohibido';
  assert.throws(() => runCode('Validar contrato y reserva', extra), /CONTRACT_INVALID/);

  assert.throws(() => runCode('Validar contrato y reserva', validPayload({
    dispatch: { status: 'preview' },
  })), /CONTRACT_INVALID/);

  assert.throws(() => runCode('Validar contrato y reserva', validPayload({
    total: 2,
  })), /CONTRACT_INVALID/);

  assert.throws(() => runCode('Validar contrato y reserva', validPayload({
    range: { from: '2026-08-18', to: '2026-08-24' },
  })), /CONTRACT_INVALID/);
});

test('HTML escapa valores e incluye solo fecha, nombre, apellido, telefono y comunidad', () => {
  const payload = validPayload();
  payload.appointments[0] = {
    ...payload.appointments[0],
    first_name: '<Ana>',
    last_name: 'López & Hijos',
    phone: '5555-0101',
    community: 'El "Chal"',
  };
  const validated = runCode('Validar contrato y reserva', payload);
  const built = runCode('Construir mensaje operativo', validated);

  assert.equal(
    built.subject,
    'CAP Prenatal | Seguimiento semanal de inasistencias | 17-08-2026 al 23-08-2026'
  );
  assert.match(built.html, /&lt;Ana&gt; López &amp; Hijos/);
  assert.match(built.html, /El &quot;Chal&quot;/);
  assert.match(built.html, /19-08-2026/);
  assert.doesNotMatch(built.subject + built.html, /2026-08-(?:17|19|23)/);
  assert.match(built.html, /no contar con un control prenatal registrado posteriormente/);
  assert.match(built.html, /No responda a este correo/);
  assert.doesNotMatch(built.html, /<Ana>|López & Hijos|El "Chal"/);
  assert.doesNotMatch(
    built.html.toLowerCase(),
    /cui|expediente|direccion|vih|laboratorio|diagnostico|riesgo obstetrico|vacuna/
  );
  assert.equal(built.dispatch_token, 'a'.repeat(43));
});

test('JSON versionado no incluye secretos, credenciales ni destinatarios reales', () => {
  const serialized = JSON.stringify(workflow);
  assert.match(serialized, /\.invalid/);
  assert.doesNotMatch(serialized, /hercor-nexus\.com|yondani29@gmail\.com/);
  assert.doesNotMatch(serialized, /\bre_[A-Za-z0-9_-]{8,}|N8N_ENCRYPTION_KEY|Bearer\s+\S+|password/i);
  assert.doesNotMatch(serialized, /cita_siguiente/);
});
