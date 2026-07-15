const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ConfigError, PRODUCTION_SEED_CONFIRMATION } = require('../src/config/env');
const { seed } = require('../src/db/seed');

function seedEnv(overrides = {}) {
  return {
    NODE_ENV: 'development',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'cap_prenatal',
    DB_USER: 'cap_app',
    DB_PASSWORD: 'local-db-test-value',
    DB_SSL: 'false',
    SEED_DIRECTOR_NAME: 'Direccion Inicial de Prueba',
    SEED_DIRECTOR_USERNAME: 'director.bootstrap',
    SEED_DIRECTOR_PASSWORD: 'A9!mQ2#vR7$zK4@pL8',
    ...overrides,
  };
}

function createDb({ existing = false, existingRole = 'director' } = {}) {
  const calls = { connect: 0, end: 0, release: 0, query: [] };
  const client = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.query.push({ text, params });
      if (text.includes('FROM usuarios u') && text.includes('WHERE u.username = $1')) {
        return { rowCount: existing ? 1 : 0, rows: existing ? [{ id: 1, rol: existingRole }] : [] };
      }
      if (text.includes('INSERT INTO usuarios ')) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() {
      calls.release += 1;
    },
  };
  return {
    calls,
    db: {
      async connect() {
        calls.connect += 1;
        return client;
      },
      async end() {
        calls.end += 1;
      },
    },
  };
}

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

test('seed sin variables requeridas falla antes de conectar o crear usuarios', async () => {
  const { db, calls } = createDb();
  const env = seedEnv();
  delete env.SEED_DIRECTOR_PASSWORD;

  await assert.rejects(
    seed({ db, env }),
    (error) => error instanceof ConfigError && error.variable === 'SEED_DIRECTOR_PASSWORD'
  );
  assert.equal(calls.connect, 0);
  assert.equal(calls.query.length, 0);
});

test('seed crea como maximo la cuenta director configurada sin imprimir su contrasena', async () => {
  const { db, calls } = createDb();
  const { logger, entries } = createLogger();
  const env = seedEnv();
  const hashCalls = [];

  const result = await seed({
    db,
    env,
    logger,
    hashPassword: async (password) => {
      hashCalls.push(password);
      return 'test-only-password-hash';
    },
  });

  assert.deepEqual(result, { ok: true, accountCreated: true });
  assert.deepEqual(hashCalls, [env.SEED_DIRECTOR_PASSWORD]);
  assert.equal(calls.query.filter(({ text }) => text.includes('INSERT INTO usuarios ')).length, 1);
  assert.equal(JSON.stringify(entries).includes(env.SEED_DIRECTOR_PASSWORD), false);
  assert.equal(JSON.stringify(entries).includes('test-only-password-hash'), false);
});

test('seed idempotente no genera hash ni cambia una cuenta existente', async () => {
  const { db, calls } = createDb({ existing: true });
  let hashCalls = 0;

  const result = await seed({
    db,
    env: seedEnv(),
    logger: createLogger().logger,
    hashPassword: async () => {
      hashCalls += 1;
      return 'unused-test-hash';
    },
  });

  assert.deepEqual(result, { ok: true, accountCreated: false });
  assert.equal(hashCalls, 0);
  assert.equal(calls.query.some(({ text }) => text.includes('INSERT INTO usuarios ')), false);
  assert.equal(calls.query.some(({ text }) => /UPDATE\s+usuarios/i.test(text)), false);
});

test('seed no convierte silenciosamente una cuenta existente de otro rol', async () => {
  const { db, calls } = createDb({ existing: true, existingRole: 'personal_salud' });
  await assert.rejects(
    seed({ db, env: seedEnv(), logger: createLogger().logger }),
    /rol diferente/
  );
  assert.equal(calls.query.some(({ text }) => text.includes('INSERT INTO usuarios ')), false);
  assert.equal(calls.query.some(({ text }) => /UPDATE\s+usuarios/i.test(text)), false);
  assert.ok(calls.query.some(({ text }) => text === 'ROLLBACK'));
});

test('produccion bloquea seed sin confirmacion explicita', async () => {
  const { db, calls } = createDb();
  await assert.rejects(
    seed({
      db,
      env: seedEnv({
        NODE_ENV: 'production',
        DB_PASSWORD: '8vR2!mK7#pT9$zW3',
      }),
    }),
    (error) => error instanceof ConfigError && error.variable === 'SEED_CONFIRM_PRODUCTION'
  );
  assert.equal(calls.connect, 0);
});

test('produccion acepta solo la confirmacion deliberada', async () => {
  const { db } = createDb();
  const result = await seed({
    db,
    env: seedEnv({
      NODE_ENV: 'production',
      DB_PASSWORD: '8vR2!mK7#pT9$zW3',
      SEED_CONFIRM_PRODUCTION: PRODUCTION_SEED_CONFIRMATION,
    }),
    logger: createLogger().logger,
    hashPassword: async () => 'test-only-password-hash',
  });
  assert.equal(result.ok, true);
});

test('seed no contiene passwords literales ni fallbacks de cuenta', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/db/seed.js'), 'utf8');
  assert.doesNotMatch(source, /bcrypt\.hash\(\s*['"]/);
  assert.doesNotMatch(source, /(?:Admin|Director|Personal)\d{4}\*/i);
  assert.doesNotMatch(source, /password\s*\|\|/i);
});
