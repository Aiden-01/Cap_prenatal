const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const CASES = [
  {
    file: 'censo-primer-control-26-25-resend-v1.json',
    id: 'capCenso2625V1A1',
    name: 'CAP Prenatal | Censo 26 a 25 | Resend | v1',
    scheduleName: 'Cada 26 a las 06:00',
    triggerDay: 26,
    periodNode: 'Calcular periodo 26 a 25',
  },
  {
    file: 'censo-primer-control-mes-cerrado-resend-v1.json',
    id: 'capCensoMesV1A1',
    name: 'CAP Prenatal | Censo mes cerrado | Resend | v1',
    scheduleName: 'Cada 3 a las 06:00',
    triggerDay: 3,
    periodNode: 'Calcular mes calendario anterior',
  },
].map((entry) => {
  const source = fs.readFileSync(path.join(ROOT, 'n8n', 'workflows', entry.file), 'utf8');
  return { ...entry, source, workflow: JSON.parse(source) };
});

function byName(workflow, name) {
  const found = workflow.nodes.find((node) => node.name === name);
  assert.ok(found, 'Nodo ausente: ' + name);
  return found;
}

function runPeriod(workflow, nodeName, iso) {
  const code = byName(workflow, nodeName).parameters.jsCode;
  const execute = new Function('$now', code);
  return execute({ toISO: () => iso })[0].json;
}

function validContract(from, to, total = 4) {
  return {
    schema_version: 1,
    generated_at: '2026-08-26T12:00:00.000Z',
    timezone: 'America/Guatemala',
    report_type: 'first_prenatal_control_census',
    range: { from, to },
    total,
    secure_path: '/reportes',
  };
}

function runMailBuilder(entry, contract, period) {
  const code = byName(entry.workflow, 'Validar y preparar correo').parameters.jsCode;
  const execute = new Function('$json', '$node', code);
  return execute(
    contract,
    { [entry.periodNode]: { json: period } }
  )[0].json;
}

function targets(workflow, name, output = 0) {
  return (workflow.connections[name]?.main?.[output] || []).map(({ node }) => node);
}

test('workflows mensuales son validos, inactivos y no versionan credenciales', () => {
  for (const entry of CASES) {
    const { workflow, source } = entry;
    assert.equal(workflow.id, entry.id);
    assert.equal(workflow.name, entry.name);
    assert.equal(workflow.active, false);
    assert.match(workflow.versionId, /^[0-9a-f-]{36}$/);
    assert.equal(new Set(workflow.nodes.map((node) => node.id)).size, workflow.nodes.length);
    assert.deepEqual(workflow.tags, []);
    assert.equal(workflow.meta.templateCredsSetupCompleted, false);
    assert.equal(Object.hasOwn(workflow, 'pinData'), false);
    assert.equal(Object.hasOwn(workflow, 'staticData'), false);
    assert.doesNotMatch(source, /yondani29|hercor-nexus|XOdJoEZxrFQXEoFF|cwe8N3uYVbmr5leD/i);
    assert.equal(workflow.nodes.some((node) => Object.hasOwn(node, 'credentials')), false);
  }
});

test('schedules mensuales usan el dia solicitado a las 06:00 de Guatemala', () => {
  for (const entry of CASES) {
    const schedule = byName(entry.workflow, entry.scheduleName);
    assert.deepEqual(schedule.parameters.rule.interval, [{
      field: 'months',
      monthsInterval: 1,
      triggerAtDayOfMonth: entry.triggerDay,
      triggerAtHour: 6,
      triggerAtMinute: 0,
    }]);
    assert.equal(entry.workflow.settings.timezone, 'America/Guatemala');
  }
});

test('periodo 26 a 25 elige el ultimo corte completo, incluso antes del dia 26', () => {
  const entry = CASES[0];
  assert.deepEqual(
    runPeriod(entry.workflow, entry.periodNode, '2026-08-26T12:00:00.000Z'),
    {
      timezone: 'America/Guatemala',
      period_kind: 'day_26_to_25',
      desde: '2026-07-26',
      hasta: '2026-08-25',
    }
  );
  assert.deepEqual(
    runPeriod(entry.workflow, entry.periodNode, '2026-08-22T12:00:00.000Z'),
    {
      timezone: 'America/Guatemala',
      period_kind: 'day_26_to_25',
      desde: '2026-06-26',
      hasta: '2026-07-25',
    }
  );
});

test('mes cerrado usa el calendario anterior y respeta febrero bisiesto', () => {
  const entry = CASES[1];
  assert.deepEqual(
    runPeriod(entry.workflow, entry.periodNode, '2026-03-03T12:00:00.000Z'),
    {
      timezone: 'America/Guatemala',
      period_kind: 'closed_calendar_month',
      desde: '2026-02-01',
      hasta: '2026-02-28',
    }
  );
  assert.deepEqual(
    runPeriod(entry.workflow, entry.periodNode, '2028-03-03T12:00:00.000Z'),
    {
      timezone: 'America/Guatemala',
      period_kind: 'closed_calendar_month',
      desde: '2028-02-01',
      hasta: '2028-02-29',
    }
  );
});

test('requests usan endpoints M2M, Header Auth, fechas calculadas y descarga binaria', () => {
  for (const entry of CASES) {
    const requests = [
      byName(entry.workflow, 'Consultar resumen agregado'),
      byName(entry.workflow, 'Descargar Excel del censo'),
    ];
    for (const request of requests) {
      assert.equal(request.parameters.authentication, 'genericCredentialType');
      assert.equal(request.parameters.genericAuthType, 'httpHeaderAuth');
      assert.equal(request.parameters.sendHeaders, false);
      assert.match(request.parameters.url, /censo-primer-control/);
      assert.match(request.parameters.url, /127\.0\.0\.1/);
      assert.match(request.parameters.url, /http:\/\/backend:3001/);
      assert.equal(request.parameters.options.redirect.redirect.followRedirects, false);
      assert.equal(request.parameters.options.sendCredentialsOnCrossOriginRedirect, false);
    }
    assert.equal(requests[0].parameters.options.timeout, 10000);
    assert.equal(requests[0].parameters.options.response.response.responseFormat, 'json');
    assert.equal(requests[1].parameters.options.timeout, 30000);
    assert.equal(requests[1].parameters.options.response.response.responseFormat, 'file');
    assert.equal(requests[1].parameters.options.response.response.outputPropertyName, 'data');
    assert.deepEqual(
      requests[0].parameters.queryParameters.parameters.map(({ name, value }) => [name, value]),
      [['desde', '={{ $json.desde }}'], ['hasta', '={{ $json.hasta }}']]
    );
    assert.deepEqual(
      requests[1].parameters.queryParameters.parameters.map(({ name, value }) => [name, value]),
      [['desde', '={{ $json.range_from }}'], ['hasta', '={{ $json.range_to }}']]
    );
  }
});

test('correo con datos prepara nombre seguro y adjunto Excel, sin URL de reporte', () => {
  for (const entry of CASES) {
    const period = runPeriod(
      entry.workflow,
      entry.periodNode,
      entry.triggerDay === 26
        ? '2026-08-26T12:00:00.000Z'
        : '2026-08-03T12:00:00.000Z'
    );
    const mail = runMailBuilder(
      entry,
      validContract(period.desde, period.hasta),
      period
    );
    assert.equal(mail.total, 4);
    assert.equal(mail.has_data, true);
    assert.match(mail.subject, new RegExp(period.desde + ' al ' + period.hasta));
    assert.match(mail.html, /Se adjunta el censo de 4 captadas en primer control/);
    if (entry.triggerDay === 26) {
      assert.match(mail.subject, /mes logístico/);
      assert.match(mail.html, /mes logístico/);
    }
    assert.match(mail.filename, /^censo_(?:mes_logistico|mes_cerrado)_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.doesNotMatch(mail.html, /https?:\/\/|\/reportes/);
    assert.doesNotMatch(mail.html.toLowerCase(), /cui|expediente|telefono|diagnostico|nombre de paciente/);

    assert.deepEqual(targets(entry.workflow, '¿Hay datos para adjuntar?', 0), [
      'Descargar Excel del censo',
    ]);
    assert.deepEqual(targets(entry.workflow, 'Descargar Excel del censo'), [
      'Enviar correo con Excel',
    ]);
    const attached = byName(entry.workflow, 'Enviar correo con Excel');
    assert.deepEqual(
      attached.parameters.additionalOptions.attachments.attachments,
      [{
        attachmentType: 'binaryData',
        binaryPropertyName: 'data',
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: '={{ $node["Validar y preparar correo"].json.filename }}',
      }]
    );
  }
});

test('correo mensual de total cero se envia como reporte sin registros', () => {
  const entry = CASES[1];
  const period = runPeriod(entry.workflow, entry.periodNode, '2026-08-03T12:00:00.000Z');
  const mail = runMailBuilder(
    entry,
    validContract(period.desde, period.hasta, 0),
    period
  );
  assert.equal(mail.total, 0);
  assert.equal(mail.has_data, false);
  assert.match(mail.html, /No se registraron captadas/);
  assert.deepEqual(targets(entry.workflow, '¿Hay datos para adjuntar?', 1), [
    'Enviar aviso sin datos',
  ]);
  assert.deepEqual(byName(entry.workflow, 'Enviar aviso sin datos').parameters.additionalOptions, {});
});

test('contrato alterado o periodo distinto se detiene antes de Resend', () => {
  for (const entry of CASES) {
    const period = runPeriod(
      entry.workflow,
      entry.periodNode,
      entry.triggerDay === 26
        ? '2026-08-26T12:00:00.000Z'
        : '2026-08-03T12:00:00.000Z'
    );
    assert.throws(
      () => runMailBuilder(
        entry,
        { ...validContract(period.desde, period.hasta), pacientes: [] },
        period
      ),
      /CONTRACT_INVALID/
    );
    assert.throws(
      () => runMailBuilder(
        entry,
        validContract('2026-01-01', '2026-01-31'),
        period
      ),
      /CONTRACT_INVALID/
    );
  }
});

test('workflows deshabilitan persistencia de ejecuciones y exposicion MCP', () => {
  for (const { workflow } of CASES) {
    assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
    assert.equal(workflow.settings.saveDataErrorExecution, 'none');
    assert.equal(workflow.settings.saveManualExecutions, false);
    assert.equal(workflow.settings.saveExecutionProgress, false);
    assert.equal(workflow.settings.callerPolicy, 'none');
    assert.equal(workflow.settings.availableInMCP, false);
  }
});
