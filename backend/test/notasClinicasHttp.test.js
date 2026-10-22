const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { notaCreateSchema, notaUpdateSchema, notaFinalizeSchema,
  notaPacienteParamsSchema, notaIdParamsSchema, notaListQuerySchema } = require('../src/validations/notasClinicas.schemas');
const { createNotasClinicasRouter } = require('../src/routes/notasClinicas');
const { csrfMiddleware, CSRF_COOKIE_NAME } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const { HttpError } = require('../src/utils/httpError');

const clave = 'f339ea34-9788-4b8d-92da-5c355bc8153b';
const base = { tipo: 'nota_evolucion', responsable: { tipo: 'autenticado' }, clave_idempotencia: clave };

test('notas: contrato estricto de borrador, responsable e idempotencia obligatorios', () => {
  assert.deepEqual(notaCreateSchema.parse(base), { ...base, contenido: '' });
  for (const override of [{ tipo: 'orden_medica' }, { responsable: undefined }, { clave_idempotencia: undefined },
    { clave_idempotencia: 'not-a-key' }, { embarazo_id: '2' }, { control_prenatal_id: true },
    { embarazo_id: 0 }, { control_prenatal_id: 2147483648 }, { es_principal: 'true' },
    { capturista_usuario_id: 2 }, { finalizador_usuario_id: 2 }, { estado: 'captura_finalizada' },
    { firma: 'digital' }, { validacion_clinica: true }, { paciente_id: 41 }, { contenido: null },
    { responsable: { tipo: 'autenticado', usuario_id: 2 } }]) {
    assert.equal(notaCreateSchema.safeParse({ ...base, ...override }).success, false, JSON.stringify(override));
  }
  const sinEmbarazo = notaCreateSchema.parse({ ...base, control_prenatal_id: 3 });
  assert.equal(Object.hasOwn(sinEmbarazo, 'embarazo_id'), false, 'omisión permite inferir solo en el servicio');
  assert.equal(notaCreateSchema.parse({ ...base, embarazo_id: null }).embarazo_id, null);
});

test('notas: fecha civil real, no futura, hora normalizada y narrativa plana con párrafos', () => {
  const body = notaCreateSchema.parse({ ...base, fecha_atencion: '2024-02-29', hora_atencion: '09:15',
    contenido: 'Me\u0301dica\r\n\r\nPárrafo\rotro\tvalor' });
  assert.equal(body.fecha_atencion, '2024-02-29');
  assert.equal(body.hora_atencion, '09:15:00');
  assert.equal(body.contenido, 'Médica\n\nPárrafo\notro\tvalor');
  assert.equal(notaCreateSchema.parse({ ...base, hora_atencion: '23:59:59' }).hora_atencion, '23:59:59');
  for (const override of [{ fecha_atencion: '2025-02-29' }, { fecha_atencion: '9999-12-31' }, { fecha_atencion: '0000-01-01' },
    { fecha_atencion: '2024-02-29T00:00:00Z' }, { hora_atencion: '24:00' }, { hora_atencion: '09:60' },
    { contenido: '\u0000' }, { contenido: 'texto\u202Eoculto' }, { contenido: 'x'.repeat(20001) }]) {
    assert.equal(notaCreateSchema.safeParse({ ...base, ...override }).success, false, JSON.stringify(override).slice(0, 100));
  }
  assert.equal(notaCreateSchema.parse({ ...base, contenido: 'x'.repeat(20000) }).contenido.length, 20000);
  assert.equal(notaUpdateSchema.parse({ version: 1, fecha_atencion: null }).fecha_atencion, null);
  assert.equal(notaUpdateSchema.parse({ version: 1, hora_atencion: null }).hora_atencion, null);
});

test('notas: edición versionada no cambia relaciones/tipo/principal ni acepta metadatos de autoría', () => {
  assert.deepEqual(notaUpdateSchema.parse({ version: 1, contenido: '' }), { version: 1, contenido: '' });
  for (const body of [{ contenido: 'texto' }, { version: '1', contenido: '' }, { version: 0, contenido: '' },
    { version: 1 }, { version: 2147483648, contenido: '' }]) {
    assert.equal(notaUpdateSchema.safeParse(body).success, false);
  }
  for (const [campo, value] of Object.entries({ tipo: 'nota_enfermeria', embarazo_id: 2,
    control_prenatal_id: 3, es_principal: false, clave_idempotencia: clave, capturista_usuario_id: 2,
    finalizador_usuario_id: 2, estado: 'captura_finalizada', responsable_snapshot: {} })) {
    assert.equal(notaUpdateSchema.safeParse({ version: 1, contenido: '', [campo]: value }).success, false, campo);
  }
  assert.deepEqual(notaFinalizeSchema.parse({ version: 1 }), { version: 1 });
  for (const body of [{}, { version: '1' }, { version: 1, responsable: { tipo: 'autenticado' } },
    { version: 1, contenido: 'cambio oculto' }, { version: 1, firmado: true }]) {
    assert.equal(notaFinalizeSchema.safeParse(body).success, false);
  }
});

test('notas: IDs y filtros canónicos limitados, sin coerción de booleanos ni selectores privados', () => {
  assert.deepEqual(notaPacienteParamsSchema.parse({ pacienteId: 41 }), { pacienteId: 41 });
  assert.deepEqual(notaIdParamsSchema.parse({ pacienteId: '41', notaId: '72' }), { pacienteId: 41, notaId: 72 });
  for (const id of ['', '0', '01', '-1', '1.1', '1e2', '2147483648', true]) {
    assert.equal(notaIdParamsSchema.safeParse({ pacienteId: 41, notaId: id }).success, false);
  }
  assert.deepEqual(notaListQuerySchema.parse({}), { pagina: 1, limite: 20 });
  assert.deepEqual(notaListQuerySchema.parse({ tipo: 'nota_enfermeria', embarazo_id: '2', control_prenatal_id: '3',
    estado: 'captura_finalizada', pagina: '2', limite: '50' }),
  { tipo: 'nota_enfermeria', embarazo_id: 2, control_prenatal_id: 3, estado: 'captura_finalizada', pagina: 2, limite: 50 });
  const normalizada = notaListQuerySchema.parse({ embarazo_id: '2', control_prenatal_id: '3', pagina: '2', limite: '50' });
  assert.deepEqual(notaListQuerySchema.parse(normalizada), normalizada, 'la validación repetida del servicio acepta resultados del middleware');
  for (const query of [{ limite: '51' }, { pagina: '' }, { pagina: '100001' }, { pagina: ['1', '2'] },
    { estado: 'firmada' }, { paciente_id: '42' }, { capturista_usuario_id: '2' }, { tipo: 'orden_medica' },
    { embarazo_id: '0' }, { control_prenatal_id: '01' }, { pagina: true }, { limite: false }, { embarazo_id: true }]) {
    assert.equal(notaListQuerySchema.safeParse(query).success, false, JSON.stringify(query));
  }
});

async function withServer(service, callback) {
  const app = express();
  app.use(express.json());
  app.use(csrfMiddleware);
  app.use((req, _res, next) => {
    if (!req.headers['x-test-anon']) req.usuario = { id: 7, permisos: String(req.headers['x-test-permisos'] || '').split(',').filter(Boolean) };
    next();
  });
  app.use('/api/pacientes/:pacienteId/notas-clinicas', createNotasClinicasRouter({ service }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = (suffix = '', { method = 'GET', body, permisos = [], anon = false, csrf = true, pacienteId = '41' } = {}) => {
    const headers = { 'content-type': 'application/json', 'x-test-permisos': permisos.join(',') };
    if (csrf) { headers.cookie = `${CSRF_COOKIE_NAME}=synthetic-only`; headers['x-csrf-token'] = 'synthetic-only'; }
    if (anon) headers['x-test-anon'] = '1';
    return fetch(`http://127.0.0.1:${server.address().port}/api/pacientes/${pacienteId}/notas-clinicas${suffix}`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try { await callback(send); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('HTTP notas: lectura exige pacientes.ver y permiso ver; registro/cierre no confieren lectura', async () => {
  let llamadas = 0;
  await withServer({ listarNotas: async ({ pacienteId, query }) => {
    llamadas++; assert.equal(pacienteId, 41); assert.deepEqual(query, { pagina: 1, limite: 20 }); return { data: [], total: 0 };
  }, obtenerNota: async () => ({ id: 72 }) }, async send => {
    for (const permisos of [[], ['pacientes.ver'], ['notas_evolucion.ver'], ['pacientes.ver', 'notas_evolucion.registrar'],
      ['pacientes.ver', 'notas_evolucion.finalizar_captura']]) assert.equal((await send('', { permisos })).status, 403);
    assert.equal((await send('', { anon: true })).status, 401);
    const response = await send('', { permisos: ['pacientes.ver', 'notas_evolucion.ver'] });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { data: [], total: 0 });
    assert.equal((await send('/72?contenido=privado', { permisos: ['pacientes.ver', 'notas_evolucion.ver'] })).status, 400);
  });
  assert.equal(llamadas, 1);
});

test('HTTP notas: crear exige permiso del tipo y CSRF; replay 200 devuelve solo metadatos', async () => {
  let calls = 0;
  const nota = { id: 72, paciente_id: 41, tipo: 'nota_evolucion', estado: 'borrador', version: 1 };
  await withServer({ crearBorrador: async args => {
    calls++; assert.equal(args.pacienteId, 41); assert.equal(args.req.usuario.id, 7);
    assert.deepEqual(args.body, { ...base, contenido: '' }); return { nota, reutilizada: calls > 1 };
  } }, async send => {
    const options = { method: 'POST', body: base, permisos: ['notas_evolucion.registrar'] };
    assert.equal((await send('', { ...options, csrf: false })).status, 403);
    assert.equal((await send('', { ...options, permisos: ['notas_enfermeria.registrar'] })).status, 403);
    assert.equal((await send('', { ...options, body: { ...base, capturista_usuario_id: 9 } })).status, 400);
    assert.equal((await send('', { ...options, pacienteId: '0' })).status, 400);
    const created = await send('', options); assert.equal(created.status, 201); assert.deepEqual(await created.json(), nota);
    const replay = await send('', options); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), nota);
  });
  assert.equal(calls, 2);
});

test('HTTP notas: actualización y finalización envían ambos IDs/version al servicio sin ruta DELETE', async () => {
  const calls = [];
  await withServer({ actualizarBorrador: async args => { calls.push(['actualizar', args]); return { id: args.notaId, version: 2 }; },
    finalizarCaptura: async args => { calls.push(['finalizar', args]); return { id: args.notaId, version: 3, estado: 'captura_finalizada' }; },
    obtenerNota: async () => { throw new HttpError(404, 'Nota no encontrada', { code: 'NOTA_NO_ENCONTRADA' }); },
  }, async send => {
    const update = { method: 'PUT', body: { version: 1, contenido: 'Narrativa sintética' }, permisos: ['notas_evolucion.registrar'] };
    assert.equal((await send('/72', update)).status, 200);
    assert.equal((await send('/72', { ...update, permisos: ['notas_evolucion.ver'] })).status, 403);
    const close = { method: 'POST', body: { version: 2 }, permisos: ['notas_evolucion.finalizar_captura'] };
    assert.equal((await send('/72/finalizar', close)).status, 200);
    assert.equal((await send('/72/finalizar', { ...close, permisos: ['notas_evolucion.registrar'] })).status, 403);
    assert.equal((await send('/72/finalizar', { ...close, body: { version: 2, responsable: { tipo: 'autenticado' } } })).status, 400);
    assert.equal((await send('/72', { method: 'DELETE', permisos: ['notas_evolucion.registrar'] })).status, 404);
    assert.equal((await send('/72', { permisos: ['pacientes.ver', 'notas_evolucion.ver'] })).status, 404);
  });
  assert.equal(calls.length, 2);
  for (const [, args] of calls) { assert.equal(args.pacienteId, 41); assert.equal(args.notaId, 72); assert.equal(args.req.usuario.id, 7); }
  assert.deepEqual(calls[1][1].body, { version: 2 });
});
