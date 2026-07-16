const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AUDIT_FIELD_CATEGORIES,
  AUDIT_VALUE_TYPES,
  createAuditFieldPolicy,
  resolveFieldPolicy,
} = require('../src/services/audit/auditFieldPolicy');
const {
  AUDIT_POLICY_VERSION,
  buildAuditDiff,
  structurallyEqual,
} = require('../src/services/audit/auditDiffBuilder');
const { sanitizeAuditValue } = require('../src/services/audit/auditSanitizer');

const CONTEXT = Object.freeze({
  patient: Object.freeze({ categoria: 'clinica', entidad: 'paciente', evento: 'actualizar' }),
  condition: Object.freeze({ categoria: 'clinica', entidad: 'condicion_clinica', evento: 'actualizar' }),
  pregnancy: Object.freeze({ categoria: 'clinica', entidad: 'embarazo', evento: 'cambiar_estado' }),
  userUpdate: Object.freeze({ categoria: 'usuarios', entidad: 'usuario', evento: 'actualizar' }),
  userRole: Object.freeze({ categoria: 'usuarios', entidad: 'usuario', evento: 'cambiar_rol' }),
  userState: Object.freeze({ categoria: 'usuarios', entidad: 'usuario', evento: 'cambiar_estado' }),
  userPassword: Object.freeze({
    categoria: 'usuarios',
    entidad: 'usuario',
    evento: 'restablecer_password',
  }),
  userPermissions: Object.freeze({
    categoria: 'usuarios',
    entidad: 'usuario',
    evento: 'asignar_permisos',
  }),
  report: Object.freeze({ categoria: 'reportes', entidad: 'reporte', evento: 'exportar' }),
  session: Object.freeze({ categoria: 'sesiones', entidad: 'sesion', evento: 'revocar' }),
});

function serialized(value) {
  return JSON.stringify(value);
}

function assertOmits(value, ...fragments) {
  const output = serialized(value);
  for (const fragment of fragments) assert.equal(output.includes(fragment), false, fragment);
}

function assertNoForbiddenKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(
      resolveFieldPolicy(key),
      AUDIT_FIELD_CATEGORIES.FORBIDDEN,
      `La salida contiene la clave prohibida ${key}`
    );
    assertNoForbiddenKeys(child);
  }
}

test('nombres de pacientes registran solo el nombre del campo', () => {
  const result = buildAuditDiff(
    { nombres: 'NOMBRE_PERSONAL_SINTETICO_A' },
    { nombres: 'NOMBRE_PERSONAL_SINTETICO_B' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result, {
    politica_version: 1,
    campos_sensibles_modificados: ['nombres'],
  });
  assertOmits(result, 'NOMBRE_PERSONAL_SINTETICO_A', 'NOMBRE_PERSONAL_SINTETICO_B');
});

test('CUI de paciente no conserva ultimos cuatro caracteres', () => {
  const result = buildAuditDiff(
    { cui: 'CUI-SINTETICO-1111' },
    { cui: 'CUI-SINTETICO-9999' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['cui']);
  assertOmits(result, '1111', '9999', 'CUI-SINTETICO');
});

test('telefono de paciente no conserva ultimos cuatro caracteres', () => {
  const result = buildAuditDiff(
    { telefono: 'TEL-SINTETICO-1234' },
    { telefono: 'TEL-SINTETICO-9876' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['telefono']);
  assertOmits(result, '1234', '9876', 'TEL-SINTETICO');
});

test('correo de paciente no conserva dominio ni parte local', () => {
  const result = buildAuditDiff(
    { correo: 'cuenta-a@dominio-sintetico.invalid' },
    { correo: 'cuenta-b@dominio-sintetico.invalid' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['correo']);
  assertOmits(result, 'cuenta-a', 'cuenta-b', 'dominio-sintetico.invalid');
});

test('direccion y domicilio de paciente no conservan valores', () => {
  const result = buildAuditDiff(
    { direccion: 'DIRECCION_SINTETICA_A', domicilio: 'DOMICILIO_SINTETICO_A' },
    { direccion: 'DIRECCION_SINTETICA_B', domicilio: 'DOMICILIO_SINTETICO_B' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['direccion', 'domicilio']);
  assertOmits(result, 'DIRECCION_SINTETICA', 'DOMICILIO_SINTETICO');
});

test('comunidad de paciente no conserva valores', () => {
  const result = buildAuditDiff(
    { comunidad: 'UBICACION_SINTETICA_A' },
    { comunidad: 'UBICACION_SINTETICA_B' },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['comunidad']);
  assertOmits(result, 'UBICACION_SINTETICA');
});

test('datos clinicos solo registran nombres de campos', () => {
  const result = buildAuditDiff(
    {
      pa_sistolica: 'VALOR_CLINICO_SINTETICO_A',
      tratamiento: 'TRATAMIENTO_SINTETICO_A',
      vih_resultado: 'RESULTADO_SINTETICO_A',
    },
    {
      pa_sistolica: 'VALOR_CLINICO_SINTETICO_B',
      tratamiento: 'TRATAMIENTO_SINTETICO_B',
      vih_resultado: 'RESULTADO_SINTETICO_B',
    },
    { context: CONTEXT.patient }
  );

  assert.deepEqual(result, {
    politica_version: 1,
    campos_sensibles_modificados: ['pa_sistolica', 'tratamiento', 'vih_resultado'],
  });
  assertOmits(result, 'VALOR_CLINICO', 'TRATAMIENTO_SINTETICO', 'RESULTADO_SINTETICO');
});

test('texto libre nunca conserva contenido', () => {
  const result = buildAuditDiff(
    { comentario: 'TEXTO_LIBRE_SINTETICO_A', descripcion: 'DESCRIPCION_SINTETICA_A' },
    { comentario: 'TEXTO_LIBRE_SINTETICO_B', descripcion: 'DESCRIPCION_SINTETICA_B' },
    { context: CONTEXT.userUpdate }
  );

  assert.deepEqual(result.campos_sensibles_modificados, ['comentario', 'descripcion']);
  assertOmits(result, 'TEXTO_LIBRE_SINTETICO', 'DESCRIPCION_SINTETICA');
});

test('estado del embarazo conserva solo una transicion permitida', () => {
  assert.deepEqual(
    buildAuditDiff(
      { estado_embarazo: 'activo' },
      { estado_embarazo: 'puerperio' },
      { context: CONTEXT.pregnancy }
    ),
    {
      politica_version: 1,
      cambios: {
        estado_embarazo: { anterior: 'activo', nuevo: 'puerperio' },
      },
    }
  );
});

test('rol de usuario conserva una transicion de codigos controlados', () => {
  assert.deepEqual(
    buildAuditDiff(
      { rol: 'enfermeria' },
      { rol: 'direccion' },
      { context: CONTEXT.userRole }
    ),
    {
      politica_version: 1,
      cambios: {
        rol: { anterior: 'enfermeria', nuevo: 'direccion' },
      },
    }
  );
});

test('estado activo del usuario conserva una transicion booleana', () => {
  assert.deepEqual(
    buildAuditDiff(
      { activo: true },
      { activo: false },
      { context: CONTEXT.userState }
    ),
    {
      politica_version: 1,
      cambios: {
        activo: { anterior: true, nuevo: false },
      },
    }
  );
});

test('permisos conservan unicamente codigos agregados y retirados', () => {
  assert.deepEqual(
    buildAuditDiff(
      { permisos: ['reportes.ver', 'usuarios.editar'] },
      { permisos: ['reportes.exportar', 'reportes.ver'] },
      { context: CONTEXT.userPermissions }
    ),
    {
      politica_version: 1,
      cambios: {
        permisos_agregados: ['reportes.exportar'],
        permisos_retirados: ['usuarios.editar'],
      },
    }
  );
});

test('password_cambiado conserva booleanos y rechaza otros tipos', () => {
  assert.deepEqual(
    buildAuditDiff(
      { password_cambiado: false },
      { password_cambiado: true },
      { context: CONTEXT.userPassword }
    ),
    {
      politica_version: 1,
      cambios: {
        password_cambiado: { anterior: false, nuevo: true },
      },
    }
  );

  const invalid = buildAuditDiff(
    { password_cambiado: false },
    { password_cambiado: 'true' },
    { context: CONTEXT.userPassword }
  );
  assert.deepEqual(invalid, {
    politica_version: 1,
    campos_sensibles_modificados: ['password_cambiado'],
  });
  assertOmits(invalid, 'true');
});

test('password real desaparece completamente', () => {
  const result = buildAuditDiff(
    { PASSWORD: 'CREDENCIAL_SINTETICA_A' },
    { PASSWORD: 'CREDENCIAL_SINTETICA_B' },
    { context: CONTEXT.userPassword }
  );

  assert.deepEqual(result, { politica_version: 1 });
  assertOmits(result, 'PASSWORD', 'CREDENCIAL_SINTETICA');
});

test('token anidado desaparece completamente', () => {
  const result = buildAuditDiff(
    { perfil: { accessToken: 'TOKEN_SINTETICO_A', codigo_visible: 'A' } },
    { perfil: { accessToken: 'TOKEN_SINTETICO_B', codigo_visible: 'B' } },
    { context: CONTEXT.userUpdate }
  );

  assertNoForbiddenKeys(result);
  assertOmits(result, 'accessToken', 'TOKEN_SINTETICO');
  assert.deepEqual(result.campos_sensibles_modificados, ['perfil.codigo_visible']);
});

test('campo desconocido se clasifica como sensible', () => {
  assert.equal(
    resolveFieldPolicy('campo_futuro', CONTEXT.userUpdate),
    AUDIT_FIELD_CATEGORIES.SENSITIVE
  );
  assert.deepEqual(
    buildAuditDiff(
      { campo_futuro: 'VALOR_SINTETICO_A' },
      { campo_futuro: 'VALOR_SINTETICO_B' },
      { context: CONTEXT.userUpdate }
    ),
    {
      politica_version: 1,
      campos_sensibles_modificados: ['campo_futuro'],
    }
  );
});

test('sin contexto se aplica la politica mas restrictiva', () => {
  assert.deepEqual(
    buildAuditDiff({ rol: 'enfermeria' }, { rol: 'direccion' }),
    {
      politica_version: 1,
      campos_sensibles_modificados: ['rol'],
    }
  );

  const missingEvent = { categoria: 'usuarios', entidad: 'usuario' };
  assert.equal(resolveFieldPolicy('rol', missingEvent), AUDIT_FIELD_CATEGORIES.SENSITIVE);
});

test('allowlist de usuarios no se aplica a entidades clinicas', () => {
  const result = buildAuditDiff(
    { rol: 'CODIGO_SINTETICO_A', activo: true },
    { rol: 'CODIGO_SINTETICO_B', activo: false },
    { context: CONTEXT.condition }
  );

  assert.deepEqual(result, {
    politica_version: 1,
    campos_sensibles_modificados: ['activo', 'rol'],
  });
  assertOmits(result, 'CODIGO_SINTETICO');
});

test('estado clinico y unidad operativa sin justificacion conservan solo nombres', () => {
  const clinicalState = buildAuditDiff(
    { estado: 'ESTADO_CLINICO_SINTETICO_A' },
    { estado: 'ESTADO_CLINICO_SINTETICO_B' },
    { context: CONTEXT.condition }
  );
  assert.deepEqual(clinicalState, {
    politica_version: 1,
    campos_sensibles_modificados: ['estado'],
  });
  assertOmits(clinicalState, 'ESTADO_CLINICO_SINTETICO');

  const operationalUnit = buildAuditDiff(
    { unidad_operativa: 'UNIDAD_SINTETICA_A' },
    { unidad_operativa: 'UNIDAD_SINTETICA_B' },
    { context: CONTEXT.userUpdate }
  );
  assert.deepEqual(operationalUnit, {
    politica_version: 1,
    campos_sensibles_modificados: ['unidad_operativa'],
  });
  assertOmits(operationalUnit, 'UNIDAD_SINTETICA');
});

test('creacion conserva solo campos_registrados y no un snapshot', () => {
  const result = buildAuditDiff(null, {
    nombres: 'NOMBRE_PERSONAL_SINTETICO',
    cui: 'CUI-SINTETICO-1111',
    diagnostico: 'VALOR_CLINICO_SINTETICO',
    passwordHash: 'HASH_SINTETICO',
    campo_nulo: null,
  }, { context: CONTEXT.patient });

  assert.deepEqual(result, {
    politica_version: 1,
    campos_registrados: ['cui', 'diagnostico', 'nombres'],
  });
  assertOmits(result, 'NOMBRE_PERSONAL', '1111', 'VALOR_CLINICO', 'HASH_SINTETICO');
});

test('eliminacion conserva solo campos_eliminados y no un snapshot', () => {
  const result = buildAuditDiff({
    nombres: 'NOMBRE_PERSONAL_SINTETICO',
    domicilio: 'DOMICILIO_SINTETICO',
    tratamiento: 'TRATAMIENTO_SINTETICO',
    refreshToken: 'TOKEN_SINTETICO',
  }, null, { context: CONTEXT.patient });

  assert.deepEqual(result, {
    politica_version: 1,
    campos_eliminados: ['domicilio', 'nombres', 'tratamiento'],
  });
  assertOmits(result, 'NOMBRE_PERSONAL', 'DOMICILIO_SINTETICO', 'TRATAMIENTO_SINTETICO');
});

test('campos sin cambios no aparecen', () => {
  assert.deepEqual(
    buildAuditDiff(
      { rol: 'enfermeria', activo: true },
      { activo: true, rol: 'enfermeria' },
      { context: CONTEXT.userUpdate }
    ),
    { politica_version: 1 }
  );
});

test('objetos con distinto orden de claves no producen falso cambio', () => {
  const previous = { configuracion: { b: 2, a: { x: null } } };
  const next = { configuracion: { a: { x: undefined }, b: 2 } };

  assert.equal(structurallyEqual(previous, next), true);
  assert.deepEqual(
    buildAuditDiff(previous, next, { context: CONTEXT.userUpdate }),
    { politica_version: 1 }
  );
});

test('arreglos con distinto orden se consideran diferentes', () => {
  assert.equal(structurallyEqual(['A', 'B'], ['B', 'A']), false);
  assert.deepEqual(
    buildAuditDiff(
      { lista_desconocida: ['A', 'B'] },
      { lista_desconocida: ['B', 'A'] },
      { context: CONTEXT.userUpdate }
    ),
    {
      politica_version: 1,
      campos_sensibles_modificados: ['lista_desconocida'],
    }
  );
});

test('fechas ISO equivalentes no producen falso cambio', () => {
  assert.equal(
    structurallyEqual('2026-01-01T00:00:00.000Z', '2025-12-31T18:00:00-06:00'),
    true
  );
  assert.deepEqual(
    buildAuditDiff(
      { fecha_evento: '2026-01-01T00:00:00.000Z' },
      { fecha_evento: '2025-12-31T18:00:00-06:00' },
      { context: CONTEXT.userUpdate }
    ),
    { politica_version: 1 }
  );
});

test('politica_version permanece fija en 1', () => {
  assert.equal(AUDIT_POLICY_VERSION, 1);
  assert.deepEqual(
    buildAuditDiff({}, {}, { context: CONTEXT.userUpdate }),
    { politica_version: 1 }
  );
});

test('sanitizador elimina credenciales, entorno, SMTP y automatizacion recursivamente', () => {
  const result = sanitizeAuditValue({
    codigo_seguro: 'CODIGO_SINTETICO',
    DATABASE_URL: 'CONEXION_SINTETICA',
    processEnv: { DB_HOST: 'HOST_SINTETICO' },
    integraciones: [
      { smtpUser: 'SMTP_USER_SINTETICO', smtpPassword: 'SMTP_PASSWORD_SINTETICO' },
      { automationUsername: 'AUTOMATION_USER_SINTETICO', automationSecret: 'SECRET_SINTETICO' },
    ],
  });

  assert.deepEqual(result, {
    codigo_seguro: 'CODIGO_SINTETICO',
    integraciones: [{}, {}],
  });
  assertNoForbiddenKeys(result);
  assertOmits(result, 'CONEXION_SINTETICA', 'HOST_SINTETICO', 'SMTP_', 'AUTOMATION_', 'SECRET_');
});

test('una extension nunca puede reclasificar datos prohibidos o clinicos', () => {
  const policy = createAuditFieldPolicy({
    rules: [{
      categories: ['usuarios'],
      entities: ['usuario'],
      events: ['actualizar'],
      fields: ['accessToken', 'diagnostico', 'codigo_operativo'],
      valueType: AUDIT_VALUE_TYPES.CONTROLLED_CODE,
    }],
  });

  assert.equal(
    resolveFieldPolicy('accessToken', CONTEXT.userUpdate, policy),
    AUDIT_FIELD_CATEGORIES.FORBIDDEN
  );
  assert.equal(
    resolveFieldPolicy('diagnostico', CONTEXT.userUpdate, policy),
    AUDIT_FIELD_CATEGORIES.SENSITIVE
  );
  assert.equal(
    resolveFieldPolicy('codigo_operativo', CONTEXT.userUpdate, policy),
    AUDIT_FIELD_CATEGORIES.FULL
  );
});

test('reportes conservan solo metadata explicitamente permitida y tipada', () => {
  assert.deepEqual(
    buildAuditDiff(
      {
        tipo_reporte: 'censo',
        formato: 'pdf',
        cantidad_filas: 10,
        desde: '2026-01-01',
      },
      {
        tipo_reporte: 'resumen',
        formato: 'xlsx',
        cantidad_filas: 20,
        desde: '2026-02-01',
      },
      { context: CONTEXT.report }
    ),
    {
      politica_version: 1,
      cambios: {
        cantidad_filas: { anterior: 10, nuevo: 20 },
        desde: { anterior: '2026-01-01', nuevo: '2026-02-01' },
        formato: { anterior: 'pdf', nuevo: 'xlsx' },
        tipo_reporte: { anterior: 'censo', nuevo: 'resumen' },
      },
    }
  );
});

test('sesiones conservan resultado y banderas, pero no IP ni user-agent', () => {
  const result = buildAuditDiff(
    {
      resultado: 'permitido',
      sesion_revocada: false,
      ip: 'IP_SINTETICA_A',
      user_agent: 'AGENTE_SINTETICO_A',
    },
    {
      resultado: 'revocado',
      sesion_revocada: true,
      ip: 'IP_SINTETICA_B',
      user_agent: 'AGENTE_SINTETICO_B',
    },
    { context: CONTEXT.session }
  );

  assert.deepEqual(result, {
    politica_version: 1,
    cambios: {
      resultado: { anterior: 'permitido', nuevo: 'revocado' },
      sesion_revocada: { anterior: false, nuevo: true },
    },
    campos_sensibles_modificados: ['ip', 'user_agent'],
  });
  assertOmits(result, 'IP_SINTETICA', 'AGENTE_SINTETICO');
});

test('valores fuera de allowlist no se conservan aunque el campo sea permitido', () => {
  const invalidState = buildAuditDiff(
    { estado_embarazo: 'activo' },
    { estado_embarazo: 'VALOR_NO_CONTROLADO' },
    { context: CONTEXT.pregnancy }
  );
  assert.deepEqual(invalidState, {
    politica_version: 1,
    campos_sensibles_modificados: ['estado_embarazo'],
  });
  assertOmits(invalidState, 'VALOR_NO_CONTROLADO');

  const invalidPermissions = buildAuditDiff(
    { permisos: ['reportes.ver'] },
    { permisos: ['CODIGO LIBRE NO PERMITIDO'] },
    { context: CONTEXT.userPermissions }
  );
  assert.deepEqual(invalidPermissions, {
    politica_version: 1,
    campos_sensibles_modificados: ['permisos'],
  });
  assertOmits(invalidPermissions, 'CODIGO LIBRE');
});
