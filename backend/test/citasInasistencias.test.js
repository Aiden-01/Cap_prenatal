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
    listarControlesCoincidentesPorCitas: async () => new Map([[String(CITA.id), []]]),
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
    listarControlesCoincidentesPorCitas: async () => new Map([[String(CITA.id), [control]]]),
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

test('varias citas conservan orden, estados, auditoria e idempotencia con dos lecturas', async () => {
  const citas = [
    { ...CITA, id: 701, paciente_id: 11, embarazo_id: 91 },
    { ...CITA, id: 702, paciente_id: 12, embarazo_id: 92 },
    { ...CITA, id: 703, paciente_id: 13, embarazo_id: 93, fecha_programada: '2026-09-16' },
  ];
  const states = new Map(citas.map((cita) => [cita.id, cita]));
  const reads = [];
  const transitions = [];
  const audits = [];
  const db = {};
  const repository = {
    listarProgramadasVencidas: async (_filters, client) => {
      assert.equal(client, db);
      reads.push('citas');
      return [...states.values()].filter((cita) => cita.estado === 'programada');
    },
    listarControlesCoincidentesPorCitas: async (selected, client) => {
      assert.equal(client, db);
      reads.push('controles_batch');
      assert.deepEqual(selected.map(({ id }) => id), [701, 702, 703]);
      return new Map([['701', []], ['702', [{ id: 802 }]], ['703', []]]);
    },
    marcarAtendida: async ({ citaId, controlCumplimientoId }, client) => {
      assert.equal(client, db);
      const nueva = { ...states.get(citaId), estado: 'atendida', control_cumplimiento_id: controlCumplimientoId };
      states.set(citaId, nueva);
      transitions.push([citaId, nueva.estado, controlCumplimientoId]);
      return nueva;
    },
    marcarInasistente: async ({ citaId }, client) => {
      assert.equal(client, db);
      const nueva = { ...states.get(citaId), estado: 'inasistente' };
      states.set(citaId, nueva);
      transitions.push([citaId, nueva.estado, null]);
      return nueva;
    },
  };
  await withService(repository, async (_req, event, options) => {
    assert.equal(options.db, db);
    audits.push(event);
  }, async (service) => {
    assert.deepEqual(await service.materializarEnTransaccion({ db, fechaOperativa: '2026-09-17' }), {
      total_procesado: 3, atendidas: 1, inasistentes: 2, omitido_por_bloqueo: false,
    });
    assert.equal((await service.materializarEnTransaccion({ db, fechaOperativa: '2026-09-17' })).total_procesado, 0);
  });
  assert.deepEqual(reads, ['citas', 'controles_batch', 'citas']);
  assert.deepEqual(transitions, [
    [701, 'inasistente', null], [702, 'atendida', 802], [703, 'inasistente', null],
  ]);
  assert.deepEqual(audits.map((event) => [
    event.entidadId, event.contexto.evento, event.metadata.motivo_codigo,
    event.cambios.nuevos.control_cumplimiento_id,
  ]), [
    [701, 'materializar_inasistencia', 'cita_vencida_sin_control_coincidente', null],
    [702, 'materializar_asistencia', 'control_misma_fecha_existente', 802],
    [703, 'materializar_inasistencia', 'cita_vencida_sin_control_coincidente', null],
  ]);
});

test('caracteriza ambiguedad: mas de un control aborta la transaccion completa', async () => {
  const citas = [CITA, { ...CITA, id: 702, embarazo_id: 92 }];
  const trace = [];
  const db = {};
  const repository = {
    enTransaccion: async (operation) => {
      trace.push('BEGIN');
      try {
        await operation(db);
        trace.push('COMMIT');
      } catch (error) {
        trace.push('ROLLBACK');
        throw error;
      }
    },
    adquirirBloqueoMaterializacion: async (client) => {
      assert.equal(client, db);
      return true;
    },
    listarProgramadasVencidas: async () => citas,
    listarControlesCoincidentesPorCitas: async (selected, client) => {
      assert.equal(client, db);
      assert.deepEqual(selected.map(({ id }) => id), [701, 702]);
      return new Map([['701', []], ['702', [{ id: 802 }, { id: 803 }]]]);
    },
    marcarInasistente: async (_args, client) => {
      assert.equal(client, db);
      trace.push('UPDATE:701');
      return { ...CITA, estado: 'inasistente' };
    },
  };
  await withService(repository, async (_req, _event, options) => {
    assert.equal(options.db, db);
    trace.push('AUDIT:701');
  }, async (service) => {
    await assert.rejects(service.materializarGlobal({ fechaOperativa: '2026-09-16' }),
      (error) => error.statusCode === 409 && error.code === 'CITA_CONTROL_COINCIDENTE_AMBIGUO');
  });
  assert.deepEqual(trace, ['BEGIN', 'UPDATE:701', 'AUDIT:701', 'ROLLBACK']);
});

test('repositorio consulta pares en batch con parametros, orden y FOR UPDATE; vacio no consulta', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{
        id: 802, embarazo_id: 92, fecha: '2026-09-15', cita_ids: ['702', '704'],
      }] };
    },
  };
  const repository = require(REPOSITORY_PATH);
  const citas = [
    { id: 701, embarazo_id: 91, fecha_programada: '2026-09-15' },
    { id: 702, embarazo_id: 92, fecha_programada: '2026-09-15' },
    { id: 704, embarazo_id: 92, fecha_programada: '2026-09-15' },
  ];
  const controles = await repository.listarControlesCoincidentesPorCitas(citas, db);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [[701, 702, 704]]);
  assert.match(calls[0].sql, /id = ANY\(\$1::bigint\[\]\)/);
  assert.match(calls[0].sql, /GROUP BY embarazo_id, fecha_programada/);
  assert.match(calls[0].sql, /ORDER BY pares\.fecha_programada ASC, pares\.primera_cita_id ASC, c\.id ASC/);
  assert.match(calls[0].sql, /FOR UPDATE OF c/);
  assert.deepEqual(controles.get('701'), []);
  assert.deepEqual(controles.get('702'), [{ id: 802, embarazo_id: 92, fecha: '2026-09-15' }]);
  assert.deepEqual(controles.get('704'), controles.get('702'));
  assert.deepEqual(await repository.listarControlesCoincidentesPorCitas([], db), new Map());
  assert.equal(calls.length, 1);
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
