const assert = require('node:assert/strict');
const test = require('node:test');

const { migrate } = require('../src/db/migrate');

function createLogger() {
  const entries = { log: [], error: [] };
  return {
    entries,
    logger: {
      log: (...args) => entries.log.push(args),
      error: (...args) => entries.error.push(args),
    },
  };
}

function createDb({ queryError = null, closeError = null } = {}) {
  const calls = { query: [], end: 0 };
  return {
    calls,
    db: {
      query: async (sql) => {
        calls.query.push(sql);
        if (queryError) throw queryError;
      },
      end: async () => {
        calls.end += 1;
        if (closeError) throw closeError;
      },
    },
  };
}

function createExitCodeRecorder() {
  const codes = [];
  return {
    codes,
    setExitCode: (code) => codes.push(code),
  };
}

test('migracion exitosa ejecuta SQL, cierra el pool y no marca error', async () => {
  const { db, calls } = createDb();
  const { logger, entries } = createLogger();
  const { setExitCode, codes } = createExitCodeRecorder();
  const readCalls = [];

  const result = await migrate({
    db,
    readSchema: (schemaPath, encoding) => {
      readCalls.push({ schemaPath, encoding });
      return 'SELECT 1;';
    },
    schemaPath: 'schema-test.sql',
    logger,
    setExitCode,
  });

  assert.deepEqual(readCalls, [{ schemaPath: 'schema-test.sql', encoding: 'utf8' }]);
  assert.deepEqual(calls.query, ['SELECT 1;']);
  assert.equal(calls.end, 1);
  assert.deepEqual(codes, []);
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(entries.log.length, 1);
  assert.equal(entries.error.length, 0);
});

test('error SQL registra el fallo, cierra el pool y marca codigo 1', async () => {
  const queryError = new Error('SQL invalido');
  const { db, calls } = createDb({ queryError });
  const { logger, entries } = createLogger();
  const { setExitCode, codes } = createExitCodeRecorder();

  const result = await migrate({
    db,
    readSchema: () => 'SQL INVALIDO;',
    logger,
    setExitCode,
  });

  assert.deepEqual(calls.query, ['SQL INVALIDO;']);
  assert.equal(calls.end, 1);
  assert.deepEqual(codes, [1]);
  assert.equal(result.ok, false);
  assert.equal(result.error, queryError);
  assert.equal(entries.error.length, 1);
  assert.match(entries.error[0].join(' '), /SQL invalido/);
});

test('error leyendo schema no ejecuta SQL, cierra el pool y marca codigo 1', async () => {
  const readError = new Error('No se pudo leer schema.sql');
  const { db, calls } = createDb();
  const { logger, entries } = createLogger();
  const { setExitCode, codes } = createExitCodeRecorder();

  const result = await migrate({
    db,
    readSchema: () => {
      throw readError;
    },
    logger,
    setExitCode,
  });

  assert.deepEqual(calls.query, []);
  assert.equal(calls.end, 1);
  assert.deepEqual(codes, [1]);
  assert.equal(result.ok, false);
  assert.equal(result.error, readError);
  assert.equal(entries.error.length, 1);
  assert.match(entries.error[0].join(' '), /No se pudo leer schema\.sql/);
});

test('error cerrando el pool despues de exito tambien marca fallo', async () => {
  const closeError = new Error('Fallo cerrando pool');
  const { db, calls } = createDb({ closeError });
  const { logger, entries } = createLogger();
  const { setExitCode, codes } = createExitCodeRecorder();

  const result = await migrate({
    db,
    readSchema: () => 'SELECT 1;',
    logger,
    setExitCode,
  });

  assert.equal(calls.query.length, 1);
  assert.equal(calls.end, 1);
  assert.deepEqual(codes, [1]);
  assert.equal(result.ok, false);
  assert.equal(result.error, closeError);
  assert.match(entries.error[0].join(' '), /Fallo cerrando pool/);
});

test('error de cierre no oculta el error SQL original', async () => {
  const queryError = new Error('Fallo SQL original');
  const closeError = new Error('Fallo secundario de cierre');
  const { db, calls } = createDb({ queryError, closeError });
  const { logger, entries } = createLogger();
  const { setExitCode, codes } = createExitCodeRecorder();

  const result = await migrate({
    db,
    readSchema: () => 'SQL INVALIDO;',
    logger,
    setExitCode,
  });

  assert.equal(calls.end, 1);
  assert.deepEqual(codes, [1, 1]);
  assert.equal(result.error, queryError);
  assert.equal(entries.error.length, 2);
  assert.match(entries.error[0].join(' '), /Fallo SQL original/);
  assert.match(entries.error[1].join(' '), /Fallo secundario de cierre/);
});
