const assert = require('node:assert/strict');
const test = require('node:test');

const workflow = require('../../n8n/workflows/recordatorio-citas-resend-v1.json');

function byName(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Falta el nodo ${name}`);
  return node;
}

function runBuilder(payload) {
  const code = byName('Construir detalle operativo').parameters.jsCode;
  return new Function('$json', code)(payload)[0].json;
}

function validPayload() {
  return {
    schema_version: 1,
    generated_at: '2026-08-22T12:00:00.000Z',
    timezone: 'America/Guatemala',
    range: { from: '2026-08-23', to: '2026-08-23' },
    total: 1,
    summary_by_date: [{ date: '2026-08-23', total: 1 }],
    appointments: [{
      date: '2026-08-23',
      first_name: 'Ana',
      last_name: 'López',
      phone: '5555-0101',
      community: 'El Chal',
    }],
    secure_path: '/dashboard',
  };
}

test('workflow diario queda inactivo, sin credenciales y sin persistir ejecuciones', () => {
  assert.equal(workflow.id, 'NI4eHXsKQmcCB2Xg');
  assert.equal(workflow.active, false);
  assert.equal(workflow.settings.timezone, 'America/Guatemala');
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.equal(workflow.settings.availableInMCP, false);
  assert.ok(workflow.nodes.every((node) => !node.credentials));

  const serialized = JSON.stringify(workflow);
  assert.match(serialized, /\.invalid/);
  assert.doesNotMatch(serialized, /hercor-nexus\.com|yondani29@gmail\.com/);
});

test('solo la rama con citas llega a Resend y la rama vacía termina sin correo', () => {
  const branches = workflow.connections['¿Hay citas?'].main;
  assert.deepEqual(branches[0], [{
    node: 'Construir detalle operativo',
    type: 'main',
    index: 0,
  }]);
  assert.deepEqual(branches[1], []);
  assert.deepEqual(
    workflow.connections['Construir detalle operativo'].main[0],
    [{ node: 'Enviar recordatorio por Resend', type: 'main', index: 0 }]
  );
});

test('consulta protegida solicita únicamente las citas de mañana', () => {
  const request = byName('Consultar citas de mañana');
  assert.equal(request.parameters.authentication, 'genericCredentialType');
  assert.equal(request.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(request.parameters.queryParameters.parameters[0].value, 1);
  assert.equal(request.parameters.queryParameters.parameters[1].value, 1);
  assert.match(request.parameters.url, /\/api\/automatizaciones\/v1\/proximas-citas/);
  assert.equal(request.parameters.options.redirect.redirect.followRedirects, false);
});

test('correo contiene un nombre, un apellido, teléfono y comunidad con HTML escapado', () => {
  const payload = validPayload();
  payload.appointments[0] = {
    ...payload.appointments[0],
    first_name: '<Ana>',
    last_name: 'López & Hijos',
    phone: '5555-0101',
    community: 'El "Chal"',
  };
  const built = runBuilder(payload);

  assert.equal(built.subject, 'CAP Prenatal | Recordatorio de citas | 23-08-2026');
  assert.doesNotMatch(built.subject, /2026-08-23/);
  assert.match(built.html, /&lt;Ana&gt; López &amp; Hijos/);
  assert.match(built.html, /5555-0101/);
  assert.match(built.html, /El &quot;Chal&quot;/);
  assert.doesNotMatch(built.html, /<Ana>|López & Hijos|El "Chal"/);
  assert.doesNotMatch(built.html.toLowerCase(), /cui|expediente|diagnóstico|diagnostico/);
});

test('constructor rechaza campos extra, conteos inconsistentes y controles', () => {
  const extra = validPayload();
  extra.appointments[0].cui = 'dato prohibido';
  assert.throws(() => runBuilder(extra), /CONTRACT_INVALID/);

  const mismatch = validPayload();
  mismatch.total = 2;
  assert.throws(() => runBuilder(mismatch), /CONTRACT_INVALID/);

  const control = validPayload();
  control.appointments[0].community = 'El Chal\nOtra línea';
  assert.throws(() => runBuilder(control), /CONTRACT_INVALID/);
});
