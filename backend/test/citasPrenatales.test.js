const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPOSITORY_PATH = require.resolve('../src/repositories/citasPrenatalesRepository');
const POOL_PATH = require.resolve('../src/db/pool');
const MIGRATION_FILENAME = '014_citas_prenatales.sql';
const MIGRATION_PATH = path.resolve(__dirname, '../src/db/migrations', MIGRATION_FILENAME);
const SCHEMA_PATH = path.resolve(__dirname, '../src/db/schema.sql');

function cacheModule(modulePath, exports) {
  const previous = require.cache[modulePath];
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
  return () => {
    if (previous) require.cache[modulePath] = previous;
    else delete require.cache[modulePath];
  };
}

async function withRepository(pool, callback) {
  const restorePool = cacheModule(POOL_PATH, pool);
  const previousRepository = require.cache[REPOSITORY_PATH];
  delete require.cache[REPOSITORY_PATH];
  try {
    return await callback(require(REPOSITORY_PATH));
  } finally {
    delete require.cache[REPOSITORY_PATH];
    if (previousRepository) require.cache[REPOSITORY_PATH] = previousRepository;
    restorePool();
  }
}

test('014 crea citas prenatales de forma aditiva y no reconstruye historicos', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS citas_prenatales/);
  assert.match(sql, /No reconstruye citas historicas/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+citas_prenatales[\s\S]*SELECT/i);
  assert.doesNotMatch(sql, /UPDATE\s+controles_prenatales|DELETE\s+FROM|DROP\s+TABLE/i);
});

test('schema final y migracion declaran el mismo modelo de cita', () => {
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  for (const field of [
    'embarazo_id',
    'fecha_programada',
    'estado',
    'control_origen_id',
    'control_cumplimiento_id',
    'reprogramada_desde_id',
    'registrado_por',
    'updated_by',
    'created_at',
    'updated_at',
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`));
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }
});

test('estado admite exactamente programada, atendida, cancelada y reprogramada', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const stateCheck = sql.match(/CONSTRAINT citas_prenatales_estado_check CHECK \(([\s\S]*?)\n  \)/)?.[1];
  assert.ok(stateCheck);
  assert.deepEqual(
    [...stateCheck.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    ['programada', 'atendida', 'cancelada', 'reprogramada']
  );
});

test('origen y cumplimiento se restringen al mismo embarazo', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /FOREIGN KEY \(control_origen_id, embarazo_id\)[\s\S]*REFERENCES controles_prenatales\(id, embarazo_id\)/);
  assert.match(sql, /FOREIGN KEY \(control_cumplimiento_id, embarazo_id\)[\s\S]*REFERENCES controles_prenatales\(id, embarazo_id\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_controles_id_embarazo/);
});

test('un control origina una sola cita raiz, permite su cadena y cumple como maximo una cita', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_origen_raiz/);
  assert.match(sql, /ON citas_prenatales\(control_origen_id\)[\s\S]*WHERE reprogramada_desde_id IS NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_control_cumplimiento/);
  assert.match(sql, /WHERE control_cumplimiento_id IS NOT NULL/);
  assert.match(sql, /estado = 'atendida' AND control_cumplimiento_id IS NOT NULL/);
  assert.match(sql, /estado <> 'atendida' AND control_cumplimiento_id IS NULL/);
});

test('reprogramacion conserva una relacion uno a uno, no circular y dentro del embarazo', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /reprogramada_desde_id IS NULL OR reprogramada_desde_id <> id/);
  assert.match(sql, /FOREIGN KEY \(reprogramada_desde_id, embarazo_id\)[\s\S]*REFERENCES citas_prenatales\(id, embarazo_id\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_reprogramada_desde/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_programada_embarazo/);
  assert.match(sql, /ON citas_prenatales\(embarazo_id\)[\s\S]*estado = 'programada'[\s\S]*control_cumplimiento_id IS NULL/);
});

test('indices cubren seguimiento por estado-fecha y consulta por embarazo', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /idx_citas_programadas_fecha[\s\S]*\(fecha_programada\)[\s\S]*estado = 'programada'/);
  assert.match(sql, /idx_citas_embarazo_fecha[\s\S]*\(embarazo_id, fecha_programada DESC\)/);
  assert.doesNotMatch(sql, /CREATE\s+INDEX[\s\S]*\(estado\)\s*;/i);
});

test('calendario y automatizacion leen citas_prenatales sin usar cita_siguiente como fuente', () => {
  const citasRepository = fs.readFileSync(
    path.resolve(__dirname, '../src/repositories/citasPrenatalesRepository.js'),
    'utf8'
  );
  const automationRepository = fs.readFileSync(
    path.resolve(__dirname, '../src/repositories/automatizacionesRepository.js'),
    'utf8'
  );
  for (const source of [citasRepository, automationRepository]) {
    assert.match(source, /FROM citas_prenatales cp/);
    assert.doesNotMatch(source, /lc\.cita_siguiente|ROW_NUMBER\(\)[\s\S]*cita_siguiente/);
  }
});

test('repositorio crea programada con trazabilidad y parametros, sin SQL dinamico', async () => {
  const calls = [];
  const created = {
    id: 701,
    embarazo_id: 91,
    control_origen_id: 302,
    fecha_programada: '2026-07-13',
    estado: 'programada',
    registrado_por: 83,
    updated_by: 83,
  };

  await withRepository({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [created] };
    },
  }, async (repository) => {
    assert.equal(await repository.crearProgramadaDesdeControl({
      embarazoId: 91,
      controlOrigenId: 302,
      fechaProgramada: '2026-07-13',
      usuarioId: 83,
    }), created);
  });

  assert.deepEqual(calls[0].params, [91, 302, '2026-07-13', 83]);
  assert.match(calls[0].sql, /'programada'/);
  assert.match(calls[0].sql, /registrado_por, updated_by/);
  assert.match(calls[0].sql, /ON CONFLICT \(control_origen_id\) WHERE reprogramada_desde_id IS NULL DO NOTHING/);
  assert.doesNotMatch(calls[0].sql, /\$\{|\+\s*embarazoId/);
});

test('repositorio trata un retry equivalente como idempotente', async () => {
  const existing = {
    id: 701,
    embarazo_id: 91,
    control_origen_id: 302,
    fecha_programada: new Date('2026-07-13T00:00:00.000Z'),
    estado: 'programada',
  };
  let calls = 0;

  await withRepository({
    async query() {
      calls += 1;
      return calls === 1 ? { rows: [] } : { rows: [existing] };
    },
  }, async (repository) => {
    assert.equal(await repository.crearProgramadaDesdeControl({
      embarazoId: 91,
      controlOrigenId: 302,
      fechaProgramada: '2026-07-13',
      usuarioId: 83,
    }), existing);
  });

  assert.equal(calls, 2);
});

test('repositorio rechaza un conflicto incompatible para el mismo origen', async () => {
  let calls = 0;
  await withRepository({
    async query() {
      calls += 1;
      return calls === 1
        ? { rows: [] }
        : { rows: [{ embarazo_id: 92, fecha_programada: '2026-07-20' }] };
    },
  }, async (repository) => {
    await assert.rejects(
      repository.crearProgramadaDesdeControl({
        embarazoId: 91,
        controlOrigenId: 302,
        fechaProgramada: '2026-07-13',
        usuarioId: 83,
      }),
      (error) => error.code === 'CITA_ORIGEN_CONFLICT'
    );
  });
});

test('repositorio detecta cualquier relacion de una cita con el control', async () => {
  let captured;
  await withRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{ existe: true }] };
    },
  }, async (repository) => {
    assert.equal(await repository.existeRelacionConControl({
      controlId: 302,
      embarazoId: 91,
    }), true);
  });
  assert.deepEqual(captured.params, [302, 91]);
  assert.match(captured.sql, /control_origen_id = \$1 OR control_cumplimiento_id = \$1/);
  assert.match(captured.sql, /embarazo_id = \$2/);
});

test('repositorio localiza la cita raiz del control y permite bloquearla', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{ id: 701, estado: 'programada', control_origen_id: 302 }] };
    },
  };

  await withRepository(pool, async (repository) => {
    assert.deepEqual(await repository.obtenerOriginadaPorControl({
      controlId: 302,
      embarazoId: 91,
    }, pool, { bloquear: true }), {
      id: 701,
      estado: 'programada',
      control_origen_id: 302,
    });
  });

  assert.deepEqual(captured.params, [302, 91]);
  assert.match(captured.sql, /control_origen_id = \$1/);
  assert.match(captured.sql, /embarazo_id = \$2/);
  assert.match(captured.sql, /reprogramada_desde_id IS NULL/);
  assert.match(captured.sql, /FOR UPDATE/);
});

test('repositorio localiza la ultima cita de la cadena del control', async () => {
  let captured;
  const latest = {
    id: 702,
    estado: 'programada',
    control_origen_id: 302,
    reprogramada_desde_id: 701,
  };
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [latest] };
    },
  };

  await withRepository(pool, async (repository) => {
    assert.equal(await repository.obtenerUltimaPorControl({
      controlId: 302,
      embarazoId: 91,
    }, pool, { bloquear: true }), latest);
  });

  assert.deepEqual(captured.params, [302, 91]);
  assert.match(captured.sql, /control_origen_id = \$1/);
  assert.match(captured.sql, /embarazo_id = \$2/);
  assert.match(captured.sql, /ORDER BY created_at DESC, id DESC/);
  assert.doesNotMatch(captured.sql, /reprogramada_desde_id IS NULL/);
  assert.match(captured.sql, /FOR UPDATE/);
});

test('repositorio resuelve solo la cita programada sin cumplimiento y permite bloquearla', async () => {
  let captured;
  await withRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{ id: 701, estado: 'programada' }] };
    },
  }, async (repository) => {
    assert.deepEqual(await repository.listarProgramadasVigentesPorEmbarazo(
      91,
      undefined,
      { bloquear: true }
    ), [{ id: 701, estado: 'programada' }]);
  });
  assert.deepEqual(captured.params, [91]);
  assert.match(captured.sql, /embarazo_id = \$1/);
  assert.match(captured.sql, /estado = 'programada'/);
  assert.match(captured.sql, /control_cumplimiento_id IS NULL/);
  assert.match(captured.sql, /ORDER BY created_at ASC, id ASC/);
  assert.match(captured.sql, /FOR UPDATE/);
});

test('repositorio protege cumplimiento, cancelacion y reprogramacion con transicion condicional', async () => {
  const calls = [];
  await withRepository({
    async query(sql, params) {
      calls.push({ sql, params });
      const state = sql.includes("estado = 'atendida'")
        ? 'atendida'
        : sql.includes("estado = 'cancelada'")
          ? 'cancelada'
          : 'reprogramada';
      return { rows: [{ id: 701, estado: state }] };
    },
  }, async (repository) => {
    await repository.marcarAtendida({
      citaId: 701, embarazoId: 91, controlCumplimientoId: 303, usuarioId: 83,
    });
    await repository.marcarReprogramada({ citaId: 701, embarazoId: 91, usuarioId: 83 });
    await repository.marcarCancelada({ citaId: 701, embarazoId: 91, usuarioId: 83 });
  });
  assert.deepEqual(calls.map(({ params }) => params), [
    [701, 91, 303, 83],
    [701, 91, 83],
    [701, 91, 83],
  ]);
  for (const { sql } of calls) {
    assert.match(sql, /WHERE id = \$1/);
    assert.match(sql, /embarazo_id = \$2/);
    assert.match(sql, /estado = 'programada'/);
    assert.match(sql, /control_cumplimiento_id IS NULL/);
    assert.doesNotMatch(sql, /\$\{|\+\s*citaId/);
  }
});

test('repositorio crea hija con el mismo origen y vinculo a la cita anterior', async () => {
  let captured;
  const anterior = { id: 701, embarazo_id: 91, control_origen_id: 302 };
  await withRepository({
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [{ id: 702, estado: 'programada' }] };
    },
  }, async (repository) => {
    await repository.crearHijaReprogramada({
      citaAnterior: anterior,
      fechaProgramada: '2030-09-17',
      usuarioId: 83,
    });
  });
  assert.deepEqual(captured.params, [91, 302, '2030-09-17', 701, 83]);
  assert.match(captured.sql, /reprogramada_desde_id/);
  assert.match(captured.sql, /VALUES \(\$1, \$2, \$3, 'programada', \$4, \$5, \$5\)/);
});
