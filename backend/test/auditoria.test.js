const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createAuditHistoryRepository } = require('../src/repositories/auditHistoryRepository');
const { createAuditHistoryService } = require('../src/services/auditHistoryService');
const { createAuditoriaController } = require('../src/controllers/auditoriaController');
const { createAuditoriaRouter } = require('../src/routes/auditoria');
const { auditoriaQuerySchema } = require('../src/validations/auditoria.schemas');
const { codigosPorRol } = require('../src/repositories/permisosRepository');
const { errorHandler } = require('../src/middleware/errorHandler');
const { AppError } = require('../src/utils/appError');

const FECHA = '2026-09-27T06:00:00.123456Z';
function row(id, overrides = {}) {
  return { id: String(id), fecha: FECHA, accion: 'crear', modulo: 'pacientes',
    entidad_afectada: 'paciente', usuario_id: 2, username: 'operador',
    nombre_completo: 'Operador Sintetico', ...overrides };
}
function serviceWithRows(rows, onRead = () => {}) {
  return createAuditHistoryService({ repository: { async listar(query, cursor) {
    onRead(query, cursor); return rows;
  } } });
}
async function httpTest({ permisos = [], rol = 'admin', authenticated = true,
  service = serviceWithRows([]) } = {}, callback) {
  const app = express();
  app.use('/api/auditoria', createAuditoriaRouter({
    controller: createAuditoriaController({ service }),
    authenticate(req, _res, next) {
      if (!authenticated) return next(new AppError(401, 'Autenticacion requerida'));
      req.usuario = { id: 2, rol }; next();
    },
    loadPermissions(req, _res, next) { req.usuario.permisos = permisos; next(); },
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try { await callback(`http://127.0.0.1:${server.address().port}/api/auditoria`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('Historial requiere autenticacion', async () => {
  await httpTest({ authenticated: false }, async (url) => assert.equal((await fetch(url)).status, 401));
});
test('catalogo de usuarios comparte permiso y solo devuelve allowlist', async () => {
  await httpTest({ permisos: [] }, async (url) => assert.equal((await fetch(`${url}/usuarios`)).status, 403));
  const service = createAuditHistoryService({ repository: { listarUsuarios: async () => [{
    id: 2, username: 'operador', nombre_completo: 'Operador', password_hash: 'secreto', activo: true,
  }] } });
  await httpTest({ permisos: ['auditoria.ver'], service }, async (url) => {
    const response = await fetch(`${url}/usuarios`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), [{ id: 2, username: 'operador', nombre_completo: 'Operador' }]);
  });
});
test('el rol admin o director sin permiso explicito recibe 403', async () => {
  for (const rol of ['admin', 'director', 'personal_salud']) {
    await httpTest({ rol }, async (url) => assert.equal((await fetch(url)).status, 403));
  }
});
test('personal_salud con concesion antigua no accede a ninguno de los endpoints', async () => {
  await httpTest({ permisos: ['auditoria.ver'], rol: 'personal_salud' }, async (url) => {
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(`${url}/usuarios`)).status, 403);
  });
});

test('auditoria.ver permite GET y devuelve contrato sin cache ni totales', async () => {
  await httpTest({ permisos: ['auditoria.ver'] }, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { items: [], next_cursor: null, has_more: false });
  });
});
test('solo director recibe auditoria por defecto', () => {
  assert.ok(!codigosPorRol('admin').includes('auditoria.ver'));
  assert.equal(codigosPorRol('director'), null);
  assert.ok(!codigosPorRol('personal_salud').includes('auditoria.ver'));
  const migration = fs.readFileSync(path.join(__dirname, '../src/db/migrations/018_auditoria_historial.sql'), 'utf8');
  assert.match(migration, /r.nombre = 'director'/);
  assert.match(migration, /ON CONFLICT \(usuario_id, permiso_id\) DO NOTHING/);
  const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');
  const index = /CREATE INDEX IF NOT EXISTS idx_auditoria_cursor[\s\S]*?;/;
  assert.equal(schema.match(index)[0], migration.match(index)[0]);
});
test('pagina fija de 25, cursor con microsegundos y bigint como texto', async () => {
  const rows = Array.from({ length: 26 }, (_, i) => row(9223372036854775807n - BigInt(i)));
  const page = await serviceWithRows(rows).listar({});
  assert.equal(page.items.length, 25);
  assert.equal(page.has_more, true);
  const decoded = JSON.parse(Buffer.from(page.next_cursor, 'base64url'));
  assert.equal(decoded.fecha, FECHA);
  assert.equal(decoded.id, rows[24].id);
  assert.equal(page.items[0].id, '9223372036854775807');
});
test('fechas iguales avanzan por ID sin repetir el ultimo registro', async () => {
  const rows = Array.from({ length: 26 }, (_, i) => row(30 - i));
  const page = await serviceWithRows(rows).listar({ tipo: 'crear' });
  let received;
  const next = await serviceWithRows([row(5), row(4)], (_q, cursor) => { received = cursor; })
    .listar({ tipo: 'crear', cursor: page.next_cursor });
  assert.equal(received.id, '6');
  assert.equal(received.fecha, FECHA);
  assert.deepEqual(next.items.map((item) => item.id), ['5', '4']);
  assert.equal(next.next_cursor, null);
  assert.equal(next.has_more, false);
});
test('cursor invalido o cambiado de filtros falla antes de consultar', async () => {
  const page = await serviceWithRows(Array.from({ length: 26 }, (_, i) => row(30 - i))).listar({});
  const original = JSON.parse(Buffer.from(page.next_cursor, 'base64url'));
  const malformed = [null, {}, { ...original, id: '9223372036854775808' },
    { ...original, fecha: '2026-02-30T06:00:00.000000Z' }, { ...original, v: 2 },
    { ...original, fecha: '2026-09-27T24:00:00.000000Z' }, { ...original, extra: true }];
  const service = serviceWithRows([], () => assert.fail('No debe consultar'));
  for (const value of malformed) {
    const cursor = Buffer.from(JSON.stringify(value)).toString('base64url');
    await assert.rejects(service.listar({ cursor }), (error) => error.statusCode === 400);
  }
  await assert.rejects(service.listar({ cursor: 'invalid' }), (e) => e.code === 'AUDIT_CURSOR_INVALID');
  await assert.rejects(service.listar({ cursor: page.next_cursor, modulo: 'usuarios' }),
    (e) => e.code === 'AUDIT_CURSOR_INVALID');
});
test('HTTP devuelve 400 para cursor invalido', async () => {
  await httpTest({ permisos: ['auditoria.ver'] }, async (url) => {
    assert.equal((await fetch(`${url}?cursor=invalid`)).status, 400);
  });
});
test('validacion estricta de filtros, fechas reales y rangos', () => {
  const valid = { q: ' operador ', tipo: 'crear', usuario_id: '2', modulo: 'pacientes',
    desde: '2026-09-01', hasta: '2026-09-26' };
  assert.equal(auditoriaQuerySchema.parse(valid).q, 'operador');
  for (const invalid of [{ desde: '2026-02-30' }, { desde: '0000-01-01' }, { hasta: '27/09/2026' },
    { desde: '2026-09-27', hasta: '2026-09-26' }, { usuario_id: '0' },
    { usuario_id: '2147483648' }, { usuario_id: ['1', '2'] }, { tipo: 'otro' },
    { q: ['a', 'b'] }, { limite: '100' }, { modulo: 'texto libre' }]) {
    assert.equal(auditoriaQuerySchema.safeParse(invalid).success, false);
  }
  assert.equal(auditoriaQuerySchema.safeParse({ desde: '2024-02-29' }).success, true);
});
test('SQL aplica filtros parametrizados, Guatemala y fin exclusivo del dia', async () => {
  let sql; let params;
  const repository = createAuditHistoryRepository({ db: { async query(text, values) {
    sql = text; params = values; return { rows: [] };
  } } });
  await repository.listar({ tipo: 'crear', usuario_id: '2', modulo: 'pacientes',
    desde: '2026-09-01', hasta: '2026-09-26', q: "O'Brian%_\\" }, null);
  assert.match(sql, /ae.accion = \$3/);
  assert.match(sql, /ae.usuario_id = \$4::integer/);
  assert.match(sql, /ae.modulo = \$5/);
  assert.match(sql, /AT TIME ZONE 'America\/Guatemala'/);
  assert.match(sql, /\$7::date \+ 1/);
  assert.match(sql, /ORDER BY COALESCE\(ae.fecha_hora, ae.created_at\) DESC NULLS LAST, ae.id DESC/);
  assert.match(sql, /LIMIT 26/);
  assert.ok(!sql.includes("O'Brian"));
  assert.equal(params.at(-1), "%O'Brian\\%\\_\\\\%");
  assert.doesNotMatch(sql, /datos_anteriores|datos_nuevos|descripcion|user_agent|\bae.ip\b|paciente_id|embarazo_id|SELECT \*/);
});
test('SQL del cursor usa comparacion por tupla y contempla fechas completamente nulas', async () => {
  const calls = [];
  const repository = createAuditHistoryRepository({ db: { async query(sql, params) {
    calls.push({ sql, params }); return { rows: [] };
  } } });
  await repository.listar({}, { id: '6', fecha: FECHA });
  assert.match(calls[0].sql, /\(COALESCE\(ae.fecha_hora, ae.created_at\), ae.id\) < \(\$4::timestamptz, \$3::bigint\)/);
  assert.deepEqual(calls[0].params.slice(2), ['6', FECHA]);
  await repository.listar({}, { id: '5', fecha: null });
  assert.match(calls[1].sql, /IS NULL AND ae.id < \$3::bigint/);
});
test('allowlist excluye datos sensibles incluso si el repositorio devuelve extras', async () => {
  const result = await serviceWithRows([row(1, { datos_nuevos: { diagnostico: 'secreto' },
    datos_anteriores: {}, ip: 'secreto', user_agent: 'secreto', descripcion: 'secreto',
    paciente_id: 42, embarazo_id: 12, id_entidad: 'secreto' })]).listar({});
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['entidad', 'fecha', 'id', 'modulo', 'presentacion', 'tipo', 'usuario']);
  assert.ok(!JSON.stringify(result).includes('secreto'));
  const unknown = await serviceWithRows([row(2, { modulo: 'dato nominal', entidad_afectada: 'diagnostico', usuario_id: null })]).listar({});
  assert.equal(unknown.items[0].modulo, 'desconocido');
  assert.equal(unknown.items[0].entidad, 'desconocida');
  assert.equal(unknown.items[0].usuario, null);
});
