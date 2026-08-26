const assert = require('node:assert/strict');
const test = require('node:test');

const workflow = require('../../n8n/workflows/seguimiento-tdap-el-chal-resend-v1.json');

function byName(name) {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Falta el nodo ${name}`);
  return node;
}

function runValidator(payload) {
  return new Function('$json', byName('Validar contrato y construir correo').parameters.jsCode)(
    payload
  )[0].json;
}

function runEmailBuilder(payload) {
  const $input = { first: () => ({ json: payload }) };
  return new Function('$input', byName('Construir correo con listas').parameters.jsCode)(
    $input
  )[0].json;
}

function validPayload(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-08-31T14:00:00.000Z',
    timezone: 'America/Guatemala',
    report_type: 'seguimiento_tdap_el_chal',
    range: { from: '2026-08-24', to: '2026-08-30' },
    as_of: '2026-08-31',
    new_opportunities: { total: 2 },
    pending: { total: 4 },
    has_information: true,
    xlsx: {
      available: true,
      download_path: '/api/automatizaciones/v1/tdap/xlsx',
      filename: 'Seguimiento_Tdap_El_Chal_31-08-2026.xlsx',
    },
    dispatch: { status: 'ready', token: 'a'.repeat(43) },
    ...overrides,
  };
}

test('workflow unico queda inactivo y programado lunes 08:00 America/Guatemala', () => {
  assert.equal(workflow.id, 'capTdapChalV1A1');
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.length, 14);
  assert.equal(workflow.settings.timezone, 'America/Guatemala');
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
  assert.equal(workflow.settings.availableInMCP, false);
  assert.ok(workflow.nodes.every((node) => !node.credentials));
  assert.deepEqual(byName('Cada lunes a las 08:00').parameters.rule.interval, [{
    field: 'weeks',
    weeksInterval: 1,
    triggerAtDay: [1],
    triggerAtHour: 8,
    triggerAtMinute: 0,
  }]);
});

test('flujo prepara, descarga como binario, materializa base64, envia una vez y confirma despues de Resend', () => {
  const prepare = byName('Preparar seguimiento Tdap');
  const download = byName('Descargar XLSX Tdap');
  const resend = byName('Enviar seguimiento por Resend');
  const confirm = byName('Confirmar despacho en CAP');
  const materialize = byName('Materializar XLSX en base64');
  assert.match(prepare.parameters.url, /\/api\/automatizaciones\/v1\/tdap\/preparar/);
  assert.match(download.parameters.url, /\/api\/automatizaciones\/v1\/tdap\/xlsx/);
  assert.match(confirm.parameters.url, /\/api\/automatizaciones\/v1\/tdap\/confirmar/);
  assert.equal(download.parameters.options.response.response.responseFormat, 'file');
  assert.equal(download.parameters.options.response.response.outputPropertyName, 'data');
  assert.equal(download.parameters.headerParameters.parameters[0].name, 'X-CAP-Dispatch-Token');
  assert.equal(materialize.parameters.operation, 'binaryToPropery');
  assert.equal(materialize.parameters.binaryPropertyName, 'data');
  assert.equal(materialize.parameters.destinationKey, 'attachment_base64');
  assert.equal(resend.type, 'n8n-nodes-base.httpRequest');
  assert.equal(resend.parameters.url, 'https://api.resend.com/emails');
  assert.equal(resend.parameters.authentication, 'predefinedCredentialType');
  assert.equal(resend.parameters.nodeCredentialType, 'resendApi');
  assert.match(resend.parameters.jsonBody, /content: \$json\.attachment_base64/);
  assert.match(resend.parameters.jsonBody, /filename: \$json\.filename/);
  assert.equal(prepare.parameters.retryOnFail, undefined);
  assert.equal(download.parameters.retryOnFail, undefined);
  assert.equal(resend.parameters.retryOnFail, undefined);
  assert.equal(confirm.parameters.retryOnFail, undefined);
  assert.deepEqual(
    workflow.connections['Enviar seguimiento por Resend'].main[0],
    [{ node: 'Confirmar despacho en CAP', type: 'main', index: 0 }]
  );
  assert.deepEqual(workflow.connections['¿Hay información para enviar?'].main[1], []);
});

test('contrato listo conserva solo conteos, token, correo y fechas visibles DD-MM-YYYY', () => {
  const result = runValidator(validPayload());
  assert.equal(result.should_send, true);
  assert.equal(result.dispatch_token, 'a'.repeat(43));
  assert.equal(result.filename, 'Seguimiento_Tdap_El_Chal_31-08-2026.xlsx');
  assert.equal(result.subject, 'CAP Prenatal | Seguimiento oportuno Tdap - El Chal');
  assert.match(result.html, /24-08-2026 al 30-08-2026/);
  assert.match(result.html, /Nuevas pacientes que alcanzaron 20 semanas la semana pasada: 2/);
  assert.match(result.html, /Pacientes pendientes de Tdap actualmente: 4/);
  assert.match(result.html, /Primer nombre/);
  assert.match(result.html, /Primer apellido/);
  assert.match(result.html, /Comunidad/);
  assert.doesNotMatch(result.subject + result.html, /2026-08-(?:24|30|31)/);
  assert.doesNotMatch(
    result.html.toLowerCase(),
    /cui|expediente|tel[eé]fono|direcci[oó]n|edad gestacional exacta|fur|fpp|riesgo obst[eé]trico|diagn[oó]stico|laboratorio|vih|morbilidad/
  );
});

test('ambos cero y already_processed terminan sin ejecutar Resend', () => {
  for (const status of ['no_results', 'already_processed']) {
    const result = runValidator(validPayload({
      new_opportunities: { total: 0 },
      pending: { total: 0 },
      has_information: false,
      xlsx: {
        available: false,
        download_path: '/api/automatizaciones/v1/tdap/xlsx',
        filename: null,
      },
      dispatch: { status },
    }));
    assert.equal(result.should_send, false);
    assert.equal(result.dispatch_token, null);
  }
});

test('orquestacion acepta solo nuevas, solo pendientes y ambos con un unico correo', () => {
  for (const [newTotal, pendingTotal] of [[2, 0], [0, 3], [2, 3]]) {
    const result = runValidator(validPayload({
      new_opportunities: { total: newTotal },
      pending: { total: pendingTotal },
    }));
    assert.equal(result.should_send, true);
    assert.match(result.html, new RegExp(`semana pasada: ${newTotal}`));
    assert.match(result.html, new RegExp(`actualmente: ${pendingTotal}`));
  }
  assert.equal(
    workflow.nodes.filter((node) => node.parameters.url === 'https://api.resend.com/emails').length,
    1
  );
});

test('correo muestra ambas listas con solo nombre, apellido y comunidad y adjunta base64 XLSX', () => {
  const base = runValidator(validPayload());
  const result = runEmailBuilder({
    ...base,
    attachment_base64: `UEsDB${'A'.repeat(1600)}`,
    new_rows: [
      { 'Primer nombre': 'Ana', 'Primer apellido': 'Prueba', Comunidad: 'Comunidad & Uno' },
      { 'Primer nombre': 'Bea', 'Primer apellido': 'Ejemplo', Comunidad: 'Comunidad Dos' },
    ],
    pending_rows: [
      { 'Primer nombre': 'Carla', 'Primer apellido': 'Sintética', Comunidad: 'Comunidad Tres' },
      { 'Primer nombre': 'Dora', 'Primer apellido': 'Control', Comunidad: 'Comunidad Cuatro' },
      { 'Primer nombre': 'Elena', 'Primer apellido': 'Demostración', Comunidad: 'Comunidad Cinco' },
      { 'Primer nombre': 'Fabiola', 'Primer apellido': 'Ensayo', Comunidad: 'Comunidad Seis' },
    ],
  });
  assert.equal(result.filename, 'Seguimiento_Tdap_El_Chal_31-08-2026.xlsx');
  assert.match(result.html, /Nuevas oportunidades Tdap/);
  assert.match(result.html, /Pendientes de Tdap/);
  assert.match(result.html, /Primer nombre/);
  assert.match(result.html, /Primer apellido/);
  assert.match(result.html, /Comunidad &amp; Uno/);
  assert.doesNotMatch(
    result.html.toLowerCase(),
    /cui|expediente|tel[eé]fono|direcci[oó]n|fur|fpp|riesgo|diagn[oó]stico|laboratorio|vih/
  );
  assert.ok(result.attachment_size > 1000);
});

test('correo rechaza diferencias entre conteos y filas o adjunto que no sea XLSX base64', () => {
  const base = runValidator(validPayload({
    new_opportunities: { total: 1 },
    pending: { total: 1 },
  }));
  const rows = {
    new_rows: [{ 'Primer nombre': 'Ana', 'Primer apellido': 'Prueba', Comunidad: 'Sintética' }],
    pending_rows: [{ 'Primer nombre': 'Ana', 'Primer apellido': 'Prueba', Comunidad: 'Sintética' }],
  };
  assert.throws(() => runEmailBuilder({
    ...base,
    ...rows,
    attachment_base64: 'filesystem-v2:workflows/example',
  }), /TDAP_EMAIL_DATA_INVALID/);
  assert.throws(() => runEmailBuilder({
    ...base,
    ...rows,
    new_rows: [],
    attachment_base64: `UEsDB${'A'.repeat(1600)}`,
  }), /TDAP_EMAIL_DATA_INVALID/);
});

test('validador rechaza campos extra, fechas, conteos, filename y estados inconsistentes', () => {
  const extra = validPayload();
  extra.patient_id = 1;
  assert.throws(() => runValidator(extra), /CONTRACT_INVALID/);
  assert.throws(() => runValidator(validPayload({
    range: { from: '2026-08-25', to: '2026-08-31' },
  })), /CONTRACT_INVALID/);
  assert.throws(() => runValidator(validPayload({
    as_of: '2026-09-01',
  })), /CONTRACT_INVALID/);
  assert.throws(() => runValidator(validPayload({
    new_opportunities: { total: -1 },
  })), /CONTRACT_INVALID/);
  assert.throws(() => runValidator(validPayload({
    xlsx: {
      available: true,
      download_path: '/api/automatizaciones/v1/tdap/xlsx',
      filename: 'Seguimiento_Tdap_El_Chal_2026-08-31.xlsx',
    },
  })), /CONTRACT_INVALID/);
  assert.throws(() => runValidator(validPayload({
    dispatch: { status: 'already_processed' },
  })), /CONTRACT_INVALID/);
});

test('n8n no calcula gestacion, no consulta PostgreSQL y no contiene secretos ni destinatarios reales', () => {
  const serialized = JSON.stringify(workflow);
  const code = byName('Validar contrato y construir correo').parameters.jsCode;
  assert.match(serialized, /responsable@example\.invalid/);
  assert.match(serialized, /citas@notificaciones\.example\.invalid/);
  assert.doesNotMatch(serialized, /hercor-nexus\.com|yondani29@gmail\.com/);
  assert.doesNotMatch(serialized, /\bre_[A-Za-z0-9_-]{8,}|N8N_ENCRYPTION_KEY|Bearer\s+\S+|password/i);
  assert.doesNotMatch(serialized, /n8n-nodes-resend\.resend/);
  assert.doesNotMatch(code, /gestationalAge|fecha_ultima_regla|\bfur\b|vacunas_paciente|postgres|SELECT\s/i);
});
