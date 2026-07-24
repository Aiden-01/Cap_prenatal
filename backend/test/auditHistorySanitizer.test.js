const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CLASSIFICATIONS,
  SANITIZED_DESCRIPTION,
  classifyAuditEvent,
  isStrictlySafeEvent,
  sanitizeAuditHistoryRows,
} = require('../src/services/audit/auditHistorySanitizer');
const {
  APPLY_CONFIRMATION,
  parseAuditHistoryArguments,
  runAuditHistoryMigration,
} = require('../src/services/audit/auditHistoryMigration');

function row(overrides = {}) {
  return {
    id: 1,
    usuario_id: 7,
    accion: 'actualizar',
    modulo: 'pacientes',
    entidad_afectada: 'paciente',
    id_entidad: '44',
    tabla: 'pacientes',
    registro_id: '44',
    paciente_id: 44,
    embarazo_id: 80,
    datos_anteriores: { nombres: 'Persona sintética anterior' },
    datos_nuevos: { nombres: 'Persona sintética nueva' },
    ip: '192.0.2.20',
    user_agent: 'Synthetic Browser/1.0',
    descripcion: 'Texto legacy sintético',
    fecha_hora: new Date('2026-01-02T03:04:05.000Z'),
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    ...overrides,
  };
}

function sanitized(input) {
  const item = classifyAuditEvent(input);
  assert.ok(item.nextRow, 'La fila sintética debe proponer saneamiento');
  return item;
}

function creation(snapshot, overrides = {}) {
  return row({
    accion: 'crear',
    descripcion: 'crear',
    datos_anteriores: null,
    datos_nuevos: snapshot,
    ...overrides,
  });
}

function assertValueRemoved(field, value) {
  const item = sanitized(row({
    datos_anteriores: { [field]: `${value}-anterior` },
    datos_nuevos: { [field]: value },
  }));
  assert.ok(item.nextRow.datos_nuevos.campos_sensibles_modificados.includes(field));
  assert.doesNotMatch(JSON.stringify(item.nextRow.datos_nuevos), new RegExp(value, 'i'));
}

test('1. Evento A permanece idéntico', () => {
  const safe = row({
    datos_anteriores: null,
    datos_nuevos: {
      campos_sensibles_modificados: ['nombres'],
      politica_version: 1,
      resultado: 'exitoso',
    },
    ip: null,
    user_agent: null,
    descripcion: 'actualizar',
  });
  const item = classifyAuditEvent(safe);
  assert.equal(item.classification, CLASSIFICATIONS.SAFE);
  assert.equal(item.row, safe);
  assert.equal(item.nextRow, undefined);
  assert.equal(isStrictlySafeEvent(safe), true);
});

test('2. Creación genera campos_registrados deduplicados y ordenados', () => {
  const payload = sanitized(creation({ telefono: '5550100', nombres: 'Sintética' }))
    .nextRow.datos_nuevos;
  assert.deepEqual(payload.campos_registrados, ['nombres', 'telefono']);
});

test('3. Actualización genera campos_sensibles_modificados', () => {
  const payload = sanitized(row()).nextRow.datos_nuevos;
  assert.deepEqual(payload.campos_sensibles_modificados, ['nombres']);
});

test('4. Eliminación genera campos_eliminados', () => {
  const payload = sanitized(row({
    accion: 'eliminar',
    descripcion: 'eliminar',
    datos_anteriores: { diagnostico: 'Sintético', telefono: '5550100' },
    datos_nuevos: null,
  })).nextRow.datos_nuevos;
  assert.deepEqual(payload.campos_eliminados, ['diagnostico', 'telefono']);
});

test('5. Nombre de paciente no conserva valor', () => {
  assertValueRemoved('nombres', 'nombre_sintetico_secreto');
});

test('6. CUI no conserva valor', () => {
  assertValueRemoved('cui', 'cui_sintetico_secreto');
});

test('7. Teléfono no conserva valor', () => {
  assertValueRemoved('telefono', 'telefono_sintetico_secreto');
});

test('8. Dirección no conserva valor', () => {
  assertValueRemoved('direccion', 'direccion_sintetica_secreta');
});

test('9. VIH no conserva valor', () => {
  assertValueRemoved('vih_resultado', 'reactivo_sintetico_secreto');
});

test('10. Laboratorio no conserva valor', () => {
  assertValueRemoved('laboratorio_resultado', 'laboratorio_sintetico_secreto');
});

test('11. Diagnóstico no conserva valor', () => {
  assertValueRemoved('diagnostico', 'diagnostico_sintetico_secreto');
});

test('12. Tratamiento no conserva valor', () => {
  assertValueRemoved('tratamiento', 'tratamiento_sintetico_secreto');
});

test('13. Observaciones no conservan texto', () => {
  assertValueRemoved('observaciones', 'observacion_sintetica_secreta');
});

test('evento historico de referencias se reconoce y elimina lugar y diagnostico', () => {
  const item = sanitized(row({
    modulo: 'referencias',
    entidad_afectada: 'referencia',
    tabla: 'referencias_efectuadas',
    datos_anteriores: {
      lugar_referencia: 'Destino clinico sintetico anterior',
      diagnostico: 'Diagnostico sintetico anterior',
    },
    datos_nuevos: {
      lugar_referencia: 'Destino clinico sintetico nuevo',
      diagnostico: 'Diagnostico sintetico nuevo',
    },
  }));

  assert.equal(item.context.entidad, 'referencia');
  assert.equal(item.context.categoria, 'clinica');
  assert.deepEqual(
    item.nextRow.datos_nuevos.campos_sensibles_modificados,
    ['diagnostico', 'lugar_referencia']
  );
  assert.doesNotMatch(
    JSON.stringify(item.nextRow),
    /Destino clinico sintetico|Diagnostico sintetico/
  );
});

test('14. Password se elimina', () => {
  const payload = sanitized(creation({
    username: 'cuenta_sintetica',
    password: 'password_sintetico_secreto',
  }, {
    modulo: 'usuarios',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
  })).nextRow.datos_nuevos;
  assert.doesNotMatch(JSON.stringify(payload), /password_sintetico_secreto|"password"/);
});

test('15. Hash se elimina', () => {
  const payload = sanitized(creation({ hash: 'hash_sintetico_secreto' })).nextRow.datos_nuevos;
  assert.doesNotMatch(JSON.stringify(payload), /hash_sintetico_secreto|"hash"/);
});

test('16. Token anidado se elimina', () => {
  const payload = sanitized(creation({
    seguridad: { token: 'token_sintetico_secreto', estado_publico: 'ok' },
  })).nextRow.datos_nuevos;
  assert.doesNotMatch(JSON.stringify(payload), /token_sintetico_secreto|token/);
});

test('17. Objetos dentro de arreglos no filtran claves ni valores', () => {
  const payload = sanitized(creation({
    items: [{ token: 'token_en_arreglo_secreto', diagnostico: 'diagnostico_en_arreglo' }],
  })).nextRow.datos_nuevos;
  assert.deepEqual(payload.campos_registrados, ['items']);
  assert.doesNotMatch(JSON.stringify(payload), /token_en_arreglo|diagnostico_en_arreglo/);
});

test('18. Login no conserva username', () => {
  const payload = sanitized(row({
    accion: 'login',
    modulo: 'autenticacion',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
    datos_anteriores: null,
    datos_nuevos: { username: 'login_sintetico_secreto', resultado: 'exitoso', metodo: 'password' },
  })).nextRow.datos_nuevos;
  assert.equal(payload.resultado, 'exitoso');
  assert.equal(payload.metodo, 'password');
  assert.doesNotMatch(JSON.stringify(payload), /login_sintetico_secreto|username/);
});

test('19. Login fallido no conserva username_intentado', () => {
  const payload = sanitized(row({
    accion: 'login_fallido',
    modulo: 'autenticacion',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
    datos_anteriores: null,
    datos_nuevos: {
      username_intentado: 'intento_sintetico_secreto',
      resultado: 'fallido',
      motivo_codigo: 'credenciales_incorrectas',
    },
  })).nextRow.datos_nuevos;
  assert.equal(payload.motivo_codigo, 'credenciales_incorrectas');
  assert.doesNotMatch(JSON.stringify(payload), /intento_sintetico_secreto|username/);
});

test('20. Logout sin JSON se convierte en C', () => {
  const item = sanitized(row({
    accion: 'logout',
    modulo: 'autenticacion',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
    datos_anteriores: null,
    datos_nuevos: null,
  }));
  assert.equal(item.classification, CLASSIFICATIONS.CONSERVATIVE);
  assert.deepEqual(item.nextRow.datos_nuevos, {
    contenido_legacy_eliminado: true,
    evento_historico_saneado: true,
    politica_version: 1,
    saneamiento_version: 1,
  });
});

test('21. Transición válida de embarazo se conserva', () => {
  const payload = sanitized(row({
    accion: 'estado',
    modulo: 'pacientes',
    entidad_afectada: 'embarazo',
    tabla: 'embarazos',
    datos_anteriores: { estado: 'activo' },
    datos_nuevos: { estado: 'puerperio' },
  })).nextRow.datos_nuevos;
  assert.deepEqual(payload.cambios.estado_embarazo, {
    anterior: 'activo',
    nuevo: 'puerperio',
  });
});

test('22. Transición inválida pierde valores', () => {
  const payload = sanitized(row({
    accion: 'estado',
    modulo: 'pacientes',
    entidad_afectada: 'embarazo',
    tabla: 'embarazos',
    datos_anteriores: { estado: 'activo' },
    datos_nuevos: { estado: 'valor_clinico_invalido' },
  })).nextRow.datos_nuevos;
  assert.equal(payload.cambios, undefined);
  assert.deepEqual(payload.campos_sensibles_modificados, ['estado_embarazo']);
  assert.doesNotMatch(JSON.stringify(payload), /valor_clinico_invalido/);
});

test('23. password_cambiado true se conserva', () => {
  const payload = sanitized(row({
    modulo: 'usuarios',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
    datos_anteriores: {},
    datos_nuevos: { password_cambiado: true },
  })).nextRow.datos_nuevos;
  assert.equal(payload.password_cambiado, true);
});

test('24. password_cambiado no booleano se elimina', () => {
  const payload = sanitized(row({
    modulo: 'usuarios',
    entidad_afectada: 'usuario',
    tabla: 'usuarios',
    datos_anteriores: {},
    datos_nuevos: { password_cambiado: 'sí-sintético' },
  })).nextRow.datos_nuevos;
  assert.equal(payload.password_cambiado, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /password_cambiado|sí-sintético/);
});

test('25. PDF permitido conserva tipo', () => {
  const payload = sanitized(row({
    accion: 'generar_pdf',
    modulo: 'documentos',
    entidad_afectada: 'documento',
    tabla: 'documentos',
    datos_anteriores: null,
    datos_nuevos: { tipo_documento: 'ficha_mspas_prenatal', formato: 'pdf', resultado: 'generado' },
  })).nextRow.datos_nuevos;
  assert.equal(payload.tipo_documento, 'ficha_mspas_prenatal');
  assert.equal(payload.formato, 'pdf');
});

test('26. PDF desconocido no conserva tipo', () => {
  const payload = sanitized(row({
    accion: 'generar_pdf',
    modulo: 'documentos',
    entidad_afectada: 'documento',
    tabla: 'documentos',
    datos_anteriores: null,
    datos_nuevos: { tipo_documento: 'ficha_desconocida_sintetica', formato: 'pdf' },
  })).nextRow.datos_nuevos;
  assert.equal(payload.tipo_documento, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /ficha_desconocida_sintetica/);
});

test('27. Campos técnicos se excluyen', () => {
  const payload = sanitized(creation({
    id: 8,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    registrado_por: 7,
    updated_by: 7,
    nombres: 'Sintética',
  })).nextRow.datos_nuevos;
  assert.deepEqual(payload.campos_registrados, ['nombres']);
});

test('28. registro_id interno válido se conserva', () => {
  const item = sanitized(row({ registro_id: '123', id_entidad: '123' }));
  assert.equal(item.nextRow.registro_id, '123');
  assert.equal(item.nextRow.id_entidad, '123');
});

test('29. registro_id nominal se anula', () => {
  const item = sanitized(row({
    registro_id: 'expediente-sintetico-nominal',
    id_entidad: 'usuario.sintetico',
  }));
  assert.equal(item.nextRow.registro_id, null);
  assert.equal(item.nextRow.id_entidad, null);
  assert.equal(item.identifiersNullified, 2);
});

test('30. descripcion se reemplaza por constante exacta', () => {
  assert.equal(sanitized(row()).nextRow.descripcion, SANITIZED_DESCRIPTION);
});

test('31. IP y user-agent se anulan', () => {
  const next = sanitized(row()).nextRow;
  assert.equal(next.ip, null);
  assert.equal(next.user_agent, null);
});

test('32. Segunda ejecución produce cero cambios', () => {
  const first = sanitized(row()).nextRow;
  const second = classifyAuditEvent(first);
  assert.equal(second.classification, CLASSIFICATIONS.SAFE);
  assert.equal(second.nextRow, undefined);
  const result = sanitizeAuditHistoryRows([first]);
  assert.equal(result.statistics.filas_que_serian_modificadas, 0);
});

test('33. politica_version permanece en 1 y no basta por sí sola para A', () => {
  const unsafe = row({
    datos_anteriores: null,
    datos_nuevos: { politica_version: 1, nombre_paciente: 'valor_sintetico_secreto' },
    ip: null,
    user_agent: null,
    descripcion: 'actualizar',
  });
  const item = sanitized(unsafe);
  assert.notEqual(item.classification, CLASSIFICATIONS.SAFE);
  assert.equal(item.nextRow.datos_nuevos.politica_version, 1);
  assert.doesNotMatch(JSON.stringify(item.nextRow.datos_nuevos), /valor_sintetico_secreto/);
});

test('34. saneamiento_version permanece en 1', () => {
  const first = sanitized(row()).nextRow;
  assert.equal(first.datos_nuevos.saneamiento_version, 1);
  assert.equal(classifyAuditEvent(first).row.datos_nuevos.saneamiento_version, 1);
});

test('35. La cantidad de filas no cambia y D es cero', () => {
  const rows = [row({ id: 1 }), creation({ nombres: 'Otra' }, { id: 2 })];
  const result = sanitizeAuditHistoryRows(rows);
  assert.equal(result.plan.length, rows.length);
  assert.equal(result.statistics.total_filas, rows.length);
  assert.equal(result.statistics.clasificacion.D, 0);
});

test('UUID solo se conserva para una entidad de sesión', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';
  const session = sanitized(row({
    accion: 'estado',
    modulo: 'autenticacion',
    entidad_afectada: 'sesion',
    tabla: 'auth_sessions',
    registro_id: uuid,
    id_entidad: uuid,
    datos_anteriores: null,
    datos_nuevos: { resultado: 'sesion_revocada' },
  }));
  assert.equal(session.nextRow.registro_id, uuid);
  const patient = sanitized(row({ registro_id: uuid, id_entidad: uuid }));
  assert.equal(patient.nextRow.registro_id, null);
  assert.equal(patient.nextRow.id_entidad, null);
});

test('dry-run es predeterminado y apply exige ambas confirmaciones', () => {
  assert.deepEqual(parseAuditHistoryArguments([]), {
    mode: 'dry-run',
    backupConfirmed: false,
    confirmation: null,
  });
  assert.throws(() => parseAuditHistoryArguments(['--apply']), /APPLY_CONFIRMATION_REQUIRED/);
  assert.throws(
    () => parseAuditHistoryArguments(['--apply', '--backup-confirmed']),
    /APPLY_CONFIRMATION_REQUIRED/
  );
  assert.deepEqual(parseAuditHistoryArguments([
    '--apply',
    '--backup-confirmed',
    '--confirmation',
    APPLY_CONFIRMATION,
  ]), {
    mode: 'apply',
    backupConfirmed: true,
    confirmation: APPLY_CONFIRMATION,
  });
});

test('dry-run abre una transacción read-only, no actualiza y hace rollback', async () => {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith('SELECT id,')) return { rows: [row()] };
      return { rows: [], rowCount: 0 };
    },
  };
  const result = await runAuditHistoryMigration({ client });
  assert.match(statements[0], /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE')), false);
  assert.equal(result.statistics.filas_modificadas, 0);
  assert.equal(result.statistics.filas_que_serian_modificadas, 1);
  assert.equal(result.statistics.aserciones, 'ok');
});
