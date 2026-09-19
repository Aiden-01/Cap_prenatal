const assert = require('node:assert/strict');
const test = require('node:test');

const SERVICE_PATH = require.resolve('../src/services/citasInasistenciasService');
const REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const AUDIT_PATH = require.resolve('../src/services/auditService');

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => previous ? (require.cache[modulePath] = previous) : delete require.cache[modulePath];
}

async function withService(repository, audit, callback) {
  const restore = [
    cacheModule(REPOSITORY_PATH, repository),
    cacheModule(AUDIT_PATH, { registrarEventoPrivado: audit }),
  ];
  const previous = require.cache[SERVICE_PATH];
  delete require.cache[SERVICE_PATH];
  try {
    return await callback(require(SERVICE_PATH));
  } finally {
    delete require.cache[SERVICE_PATH];
    if (previous) require.cache[SERVICE_PATH] = previous;
    restore.reverse().forEach((fn) => fn());
  }
}

const CITA = Object.freeze({
  id: 701, embarazo_id: 91, fecha_programada: '2026-09-15',
  estado: 'programada', control_cumplimiento_id: null,
});

test('materializa una programada vencida sin control como inasistente y audita una vez', async () => {
  let state = { ...CITA };
  const audits = [];
  const repository = {
    listarProgramadasVencidas: async () => state.estado === 'programada' ? [state] : [],
    listarControlesCoincidentes: async () => [],
    marcarInasistente: async () => (state = { ...state, estado: 'inasistente' }),
  };
  await withService(repository, async (_req, event) => audits.push(event), async (service) => {
    const first = await service.materializarEnTransaccion({ db: {}, fechaOperativa: '2026-09-16' });
    const second = await service.materializarEnTransaccion({ db: {}, fechaOperativa: '2026-09-16' });
    assert.deepEqual(first, { total_procesado: 1, atendidas: 0, inasistentes: 1, omitido_por_bloqueo: false });
    assert.equal(second.total_procesado, 0);
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].contexto.evento, 'materializar_inasistencia');
});

test('materializa como atendida cuando ya existe exactamente un control de la misma fecha', async () => {
  const control = { id: 801, embarazo_id: 91, fecha: '2026-09-15' };
  let attendedArgs;
  const audits = [];
  await withService({
    listarProgramadasVencidas: async () => [CITA],
    listarControlesCoincidentes: async () => [control],
    marcarAtendida: async (args) => {
      attendedArgs = args;
      return { ...CITA, estado: 'atendida', control_cumplimiento_id: 801 };
    },
  }, async (_req, event) => audits.push(event), async (service) => {
    const result = await service.materializarEnTransaccion({ db: {}, fechaOperativa: '2026-09-16' });
    assert.equal(result.atendidas, 1);
  });
  assert.equal(attendedArgs.controlCumplimientoId, 801);
  assert.equal(audits[0].contexto.evento, 'materializar_asistencia');
});

test('reconciliacion tardia usa fecha exacta y falla si ya existe seguimiento derivado', async () => {
  const missed = { ...CITA, estado: 'inasistente' };
  await withService({
    existeSeguimientoDerivado: async () => true,
  }, async () => {}, async (service) => {
    await assert.rejects(
      service.reconciliarAsistenciaTardia({
        cita: missed,
        control: { id: 802, fecha: '2026-09-15' },
        usuarioId: 83,
        req: { usuario: { id: 83 } },
        db: {},
      }),
      (error) => error.statusCode === 409
        && error.code === 'CITA_INASISTENCIA_CON_SEGUIMIENTO_DERIVADO'
    );
  });
});

test('reconciliacion tardia asigna el control exacto y deja auditoria especifica', async () => {
  const missed = { ...CITA, estado: 'inasistente' };
  const audits = [];
  let args;
  await withService({
    existeSeguimientoDerivado: async () => false,
    reconciliarAsistenciaTardia: async (value) => {
      args = value;
      return { ...missed, estado: 'atendida', control_cumplimiento_id: 802 };
    },
  }, async (_req, event) => audits.push(event), async (service) => {
    await service.reconciliarAsistenciaTardia({
      cita: missed,
      control: { id: 802, fecha: '2026-09-15' },
      usuarioId: 83,
      req: { usuario: { id: 83 } },
      db: {},
    });
  });
  assert.equal(args.controlCumplimientoId, 802);
  assert.equal(audits[0].contexto.evento, 'reconciliar_asistencia_tardia');
  assert.equal(audits[0].metadata.motivo_codigo, 'control_misma_fecha_registrado_tardiamente');
});

test('regla SQL de seguimiento pendiente exige ausencia de hija y control posterior', async () => {
  let sql;
  const poolPath = require.resolve('../src/db/pool');
  const restore = cacheModule(poolPath, { query: async (value) => { sql = value; return { rows: [] }; } });
  const previous = require.cache[REPOSITORY_PATH];
  delete require.cache[REPOSITORY_PATH];
  try {
    await require(REPOSITORY_PATH).listarInasistenciasConSeguimiento(91);
  } finally {
    delete require.cache[REPOSITORY_PATH];
    if (previous) require.cache[REPOSITORY_PATH] = previous;
    restore();
  }
  assert.match(sql, /seguimiento_inasistencia_desde_id = cp\.id/);
  assert.match(sql, /control_posterior\.fecha > cp\.fecha_programada/);
  assert.match(sql, /e\.estado IN \('activo', 'puerperio'\)/);
});
