const { isDeepStrictEqual } = require('node:util');

const {
  ALLOWED_ACTIONS,
  CLASSIFICATIONS,
  STRUCTURAL_COLUMNS,
  buildStatistics,
  isStrictlySafeEvent,
  sanitizeAuditHistoryRows,
} = require('./auditHistorySanitizer');

const APPLY_CONFIRMATION = 'SANITIZE_AUDIT_HISTORY_V1';
const ADVISORY_LOCK_KEY = 420021;
const DEFAULT_TABLE = 'public.auditoria_eventos';

const SELECT_COLUMNS = Object.freeze([
  'id',
  'usuario_id',
  'accion',
  'modulo',
  'entidad_afectada',
  'id_entidad',
  'tabla',
  'registro_id',
  'paciente_id',
  'embarazo_id',
  'datos_anteriores',
  'datos_nuevos',
  'ip',
  'user_agent',
  'descripcion',
  'fecha_hora',
  'created_at',
]);

class AuditHistoryMigrationError extends Error {
  constructor({ code, stage, counts = {} }) {
    super(`${code} en ${stage}`);
    this.name = 'AuditHistoryMigrationError';
    this.code = code;
    this.stage = stage;
    this.counts = counts;
  }
}

function parseAuditHistoryArguments(argv = []) {
  const options = {
    mode: 'dry-run',
    backupConfirmed: false,
    confirmation: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      if (options.mode === 'apply') throw new TypeError('Modos incompatibles');
      options.mode = 'dry-run';
    } else if (argument === '--apply') {
      if (argv.includes('--dry-run')) throw new TypeError('Modos incompatibles');
      options.mode = 'apply';
    } else if (argument === '--backup-confirmed') {
      options.backupConfirmed = true;
    } else if (argument === '--confirmation') {
      index += 1;
      if (index >= argv.length) throw new TypeError('Falta el valor de --confirmation');
      options.confirmation = argv[index];
    } else if (argument.startsWith('--confirmation=')) {
      options.confirmation = argument.slice('--confirmation='.length);
    } else {
      throw new TypeError('Argumento no soportado');
    }
  }
  assertApplyConfirmation(options);
  return Object.freeze(options);
}

function assertApplyConfirmation({ mode, backupConfirmed, confirmation }) {
  if (!['dry-run', 'apply'].includes(mode)) throw new TypeError('Modo no soportado');
  if (mode !== 'apply') return;
  if (!backupConfirmed || confirmation !== APPLY_CONFIRMATION) {
    throw new AuditHistoryMigrationError({
      code: 'APPLY_CONFIRMATION_REQUIRED',
      stage: 'argument_validation',
      counts: {
        backup_confirmado: Number(Boolean(backupConfirmed)),
        confirmacion_exacta: Number(confirmation === APPLY_CONFIRMATION),
      },
    });
  }
}

function quoteQualifiedIdentifier(value) {
  if (typeof value !== 'string') throw new TypeError('Identificador SQL inválido');
  const parts = value.split('.');
  if (parts.length < 1 || parts.length > 2
    || parts.some((part) => !/^[a-z_][a-z0-9_]*$/i.test(part))) {
    throw new TypeError('Identificador SQL inválido');
  }
  return parts.map((part) => `"${part}"`).join('.');
}

function rowMap(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function structuralColumnsEqual(left, right) {
  return STRUCTURAL_COLUMNS.every((column) => isDeepStrictEqual(left[column], right[column]));
}

function validatePersistedRows(originalRows, persistedRows, plan) {
  const persistedById = rowMap(persistedRows);
  const assertions = {
    cantidad_total_sin_cambios: originalRows.length === persistedRows.length,
    ids_sin_cambios: originalRows.every((row) => persistedById.has(String(row.id))),
    eventos_a_intactos: true,
    eventos_saneados_persistidos: true,
    columnas_estructurales_preservadas: true,
    acciones_permitidas: persistedRows.every((row) => ALLOWED_ACTIONS.has(row.accion)),
    todos_los_payloads_seguros: persistedRows.every(isStrictlySafeEvent),
  };

  for (const item of plan) {
    const persisted = persistedById.get(String(item.row.id));
    if (!persisted) continue;
    if (item.classification === CLASSIFICATIONS.SAFE) {
      assertions.eventos_a_intactos &&= isDeepStrictEqual(item.row, persisted);
      continue;
    }
    assertions.columnas_estructurales_preservadas &&= structuralColumnsEqual(item.row, persisted);
    assertions.eventos_saneados_persistidos &&= item.nextRow
      && isDeepStrictEqual(persisted.registro_id, item.nextRow.registro_id)
      && isDeepStrictEqual(persisted.id_entidad, item.nextRow.id_entidad)
      && isDeepStrictEqual(persisted.datos_anteriores, null)
      && isDeepStrictEqual(persisted.datos_nuevos, item.nextRow.datos_nuevos)
      && isDeepStrictEqual(persisted.ip, null)
      && isDeepStrictEqual(persisted.user_agent, null)
      && isDeepStrictEqual(persisted.descripcion, item.nextRow.descripcion);
  }

  const failed = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return Object.freeze({ ok: failed.length === 0, failed, assertions });
}

async function selectRows(client, quotedTable, { lock = false } = {}) {
  const result = await client.query(
    `SELECT ${SELECT_COLUMNS.join(', ')} FROM ${quotedTable} ORDER BY id${lock ? ' FOR UPDATE' : ''}`
  );
  return result.rows;
}

async function updatePlannedRow(client, quotedTable, item) {
  const result = await client.query(
    `UPDATE ${quotedTable}
       SET registro_id = $1,
           id_entidad = $2,
           datos_anteriores = $3,
           datos_nuevos = $4,
           ip = $5,
           user_agent = $6,
           descripcion = $7
     WHERE id = $8`,
    [
      item.nextRow.registro_id,
      item.nextRow.id_entidad,
      null,
      item.nextRow.datos_nuevos,
      null,
      null,
      item.nextRow.descripcion,
      item.row.id,
    ]
  );
  if (result.rowCount !== 1) {
    throw new AuditHistoryMigrationError({
      code: 'UNEXPECTED_UPDATE_COUNT',
      stage: 'row_update',
      counts: { esperado: 1, obtenido: result.rowCount },
    });
  }
}

async function runAuditHistoryMigration({
  client,
  mode = 'dry-run',
  backupConfirmed = false,
  confirmation = null,
  tableName = DEFAULT_TABLE,
  testHooks = {},
} = {}) {
  if (!client || typeof client.query !== 'function') throw new TypeError('Cliente PostgreSQL requerido');
  assertApplyConfirmation({ mode, backupConfirmed, confirmation });
  const quotedTable = quoteQualifiedIdentifier(tableName);
  const startedAt = Date.now();
  let stage = 'begin';
  let statistics = null;
  let transactionOpen = false;

  try {
    if (mode === 'dry-run') {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    } else {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
    }
    transactionOpen = true;

    if (mode === 'apply') {
      stage = 'advisory_lock';
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);
    }

    stage = 'read';
    const rows = await selectRows(client, quotedTable, { lock: mode === 'apply' });
    stage = 'in_memory_validation';
    const result = sanitizeAuditHistoryRows(rows);
    statistics = buildStatistics(result.plan);
    statistics.aserciones = result.validation.ok ? 'ok' : 'fallidas';

    if (mode === 'dry-run') {
      stage = 'rollback';
      await client.query('ROLLBACK');
      transactionOpen = false;
      statistics.duracion_ms = Date.now() - startedAt;
      return Object.freeze({ mode, statistics, validation: result.validation });
    }

    stage = 'update';
    const updates = result.plan.filter((item) => item.nextRow);
    for (const item of updates) await updatePlannedRow(client, quotedTable, item);
    statistics.filas_modificadas = updates.length;

    if (typeof testHooks.beforePersistedValidation === 'function') {
      stage = 'test_hook';
      await testHooks.beforePersistedValidation(client);
    }

    stage = 'persisted_validation';
    const persistedRows = await selectRows(client, quotedTable, { lock: false });
    const persistedValidation = validatePersistedRows(rows, persistedRows, result.plan);
    statistics.aserciones = persistedValidation.ok ? 'ok' : 'fallidas';
    if (!persistedValidation.ok) {
      throw new AuditHistoryMigrationError({
        code: 'PERSISTED_VALIDATION_FAILED',
        stage,
        counts: Object.fromEntries(
          Object.entries(persistedValidation.assertions).map(([key, value]) => [key, Number(value)])
        ),
      });
    }

    stage = 'commit';
    await client.query('COMMIT');
    transactionOpen = false;
    statistics.duracion_ms = Date.now() - startedAt;
    return Object.freeze({ mode, statistics, validation: persistedValidation });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // El error seguro de la etapa original tiene prioridad.
      }
    }
    if (error instanceof AuditHistoryMigrationError) throw error;
    throw new AuditHistoryMigrationError({
      code: error?.code === 'AUDIT_HISTORY_VALIDATION_FAILED'
        ? error.code
        : 'AUDIT_HISTORY_MIGRATION_FAILED',
      stage: error?.stage || stage,
      counts: error?.counts || {
        total_filas: statistics?.total_filas || 0,
        filas_propuestas: statistics?.filas_que_serian_modificadas || 0,
      },
    });
  }
}

module.exports = {
  ADVISORY_LOCK_KEY,
  APPLY_CONFIRMATION,
  AuditHistoryMigrationError,
  DEFAULT_TABLE,
  parseAuditHistoryArguments,
  quoteQualifiedIdentifier,
  runAuditHistoryMigration,
  validatePersistedRows,
};
