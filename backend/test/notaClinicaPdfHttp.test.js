const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createNotasClinicasRouter } = require('../src/routes/notasClinicas');
const { createPdfRateLimiter } = require('../src/middleware/pdfRateLimit');
const { HttpError } = require('../src/utils/httpError');
const { errorHandler } = require('../src/middleware/errorHandler');
const { buildAuditPayload } = require('../src/services/audit/auditDiffBuilder');

async function withPdfServer({ renderFailure = false, auditFailure = false } = {}, run) {
  const calls = { render: 0, quota: 0, audit: [] };
  const limiter = createPdfRateLimiter({ limit: 1 });
  const app = express();
  app.use((req, _res, next) => { if (!req.headers['x-anon']) req.usuario = { id: 1, permisos: String(req.headers['x-permisos'] || '').split(',') }; next(); });
  app.use('/pacientes/:pacienteId/notas-clinicas', createNotasClinicasRouter({
    service: { obtenerNotaParaPdf: async ({ pacienteId, notaId, req }) => {
      if (pacienteId !== 1 || notaId !== 7) throw new HttpError(404, 'No encontrada', { code: 'NOTA_NO_ENCONTRADA' });
      if (!req.usuario.permisos.includes('notas_evolucion.ver')) throw new HttpError(403, 'Sin permiso', { code: 'PERMISO_REQUERIDO' });
      return { nota: { id: 7, paciente_id: 1, tipo: 'nota_evolucion', contenido: 'NARRATIVA-CANARIO', responsable_snapshot: { nombre_completo: 'NOMBRE-CANARIO' } }, paciente: {} };
    } },
    pdfDependencies: { quota: req => { calls.quota++; limiter.consume(req); }, render: async () => {
      calls.render++; if (renderFailure) throw new Error('NARRATIVA-CANARIO'); return Buffer.from('%PDF-synthetic');
    }, audit: async (_req, event, opts) => {
      assert.equal(opts.obligatorio, true); if (auditFailure) throw new Error('audit unavailable');
      calls.audit.push(buildAuditPayload({ metadata: event.metadata }, { context: event.contexto }));
    } },
  }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const send = (suffix = '1/notas-clinicas/7/pdf', permisos = 'pacientes.ver,notas_evolucion.ver', anon = false) => fetch(
    `http://127.0.0.1:${server.address().port}/pacientes/${suffix}`, { headers: { 'x-permisos': permisos, ...(anon ? { 'x-anon': '1' } : {}) } });
  try { await run(send, calls); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('PDF notas HTTP: autenticación, permiso por tipo, pertenencia y validación preceden generación y cuota', async () => {
  await withPdfServer({}, async (send, calls) => {
    assert.equal((await send(undefined, undefined, true)).status, 401);
    for (const permisos of ['pacientes.ver,notas_evolucion.registrar', 'notas_evolucion.ver', 'pacientes.ver,notas_enfermeria.ver']) {
      const response = await send(undefined, permisos); assert.equal(response.status, 403);
      assert.ok(response.headers.get('cache-control').includes('no-store'));
    }
    assert.equal((await send('2/notas-clinicas/7/pdf')).status, 404);
    assert.equal((await send('1/notas-clinicas/07/pdf')).status, 400);
    assert.equal((await send('1/notas-clinicas/7/pdf?tipo=nota_enfermeria')).status, 400);
    assert.equal(calls.quota, 0); assert.equal(calls.render, 0);
    const response = await send(); assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.ok(response.headers.get('cache-control').includes('private, no-store'));
    assert.equal(response.headers.get('pragma'), 'no-cache'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('content-disposition').includes('nota-clinica-7.pdf'));
    assert.equal(await response.text(), '%PDF-synthetic');
    assert.equal(calls.audit.length, 1);
    assert.ok(!JSON.stringify(calls.audit).includes('CANARIO'));
    assert.equal((await send()).status, 429); assert.equal(calls.render, 1);
  });
});

test('PDF notas HTTP: fallos no filtran narrativa ni entregan PDF sin auditoría', async () => {
  for (const opts of [{ renderFailure: true }, { auditFailure: true }]) {
    await withPdfServer(opts, async send => {
      const response = await send(); assert.equal(response.status, 500);
      const body = await response.text(); assert.ok(!body.includes('CANARIO')); assert.ok(!body.startsWith('%PDF'));
      assert.ok(response.headers.get('cache-control').includes('no-store'));
    });
  }
});
