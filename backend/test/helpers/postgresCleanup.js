const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
const { diagnosticCode } = require('../../src/utils/safeErrorLog');

const closeTimeoutMs = 5000;

function cleanupError(code, message) {
  return Object.assign(new Error(message), { code });
}

class PostgresTestPool extends Pool {
  #clients = new Set();
  #queries = new Set();
  #idleError;
  #closing;

  constructor(config) {
    super({ connectionTimeoutMillis: closeTimeoutMs, ...config });
    this.on('connect', client => this.#clients.add(client));
    this.on('remove', client => this.#clients.delete(client));
    this.on('error', error => { this.#idleError ??= error; });
  }

  query(...args) {
    const result = super.query(...args);
    if (result) {
      this.#queries.add(result);
      const finished = () => this.#queries.delete(result);
      result.then(finished, finished);
    }
    return result;
  }

  end() {
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close() {
    let timer;
    let onRemove;
    const drainTimeout = cleanupError('POSTGRES_CLOSE_TIMEOUT', 'Timed out draining synthetic PostgreSQL connections');
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(drainTimeout), closeTimeoutMs);
    });
    try {
      await Promise.race([deadline, (async () => {
        while (this.#queries.size > 0) await Promise.allSettled(this.#queries);
        await super.end();
        // pg-pool drops clients from its internal list before Client.end finishes.
        if (this.#clients.size > 0) await new Promise(resolve => {
          onRemove = () => { if (this.#clients.size === 0) resolve(); };
          this.on('remove', onRemove);
        });
      })()]);
      if (this.#idleError) throw this.#idleError;
    } catch (error) {
      if (error === drainTimeout) {
        // Solo los sockets de este pool sintético se abortan al vencer el plazo.
        for (const client of this.#clients) client.connection.stream.destroy();
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (onRemove) this.off('remove', onRemove);
    }
  }
}

async function runPostgresCleanup(t, steps) {
  const errors = [];
  for (const [step, run] of steps) {
    t.diagnostic(`postgres-cleanup:${step}`);
    try {
      await run();
      t.diagnostic(`postgres-cleanup:${step}:succeeded`);
    } catch (error) {
      t.diagnostic(`postgres-cleanup:${step}:failed:${diagnosticCode(error)}`);
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Synthetic PostgreSQL cleanup failed');
}

async function assertNoPostgresSessions(db, databases = null) {
  const { rows: [{ sessions }] } = await db.query({
    text: `SELECT count(*)::int AS sessions FROM pg_stat_activity
      WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()
        AND ($1::text[] IS NULL OR datname = ANY($1))`,
    values: [databases],
    query_timeout: closeTimeoutMs,
  });
  if (sessions !== 0) {
    throw cleanupError('POSTGRES_SESSIONS_REMAIN', 'Client sessions remain on synthetic PostgreSQL databases');
  }
}

async function verifyTemporaryPostgresDrained(config, dataDirectory) {
  const verifier = new PostgresTestPool({ ...config, database: 'postgres', query_timeout: closeTimeoutMs });
  try {
    const { rows: [{ data_directory }] } = await verifier.query('SHOW data_directory');
    assert.equal(path.resolve(data_directory), path.resolve(dataDirectory));
    await assertNoPostgresSessions(verifier);
  } finally {
    await verifier.end();
  }
}

async function removeTemporaryPostgres(t, { config, dataDirectory, root, prefix, stop }) {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith(prefix));
  assert.equal(path.dirname(path.resolve(dataDirectory)), path.resolve(root));
  let stopped = !stop;
  let drained = false;
  const steps = [];
  if (stop) {
    steps.push(
      ['verify-client-sessions', async () => {
        await verifyTemporaryPostgresDrained(config, dataDirectory);
        drained = true;
      }],
      ['stop-temporary-server', () => {
        if (!drained) t.diagnostic('postgres-cleanup:stop-after-drain-failure');
        stop();
        stopped = true;
      }]);
  }
  steps.push(['remove-temporary-files', () => {
    assert.equal(stopped, true, 'Synthetic server must stop before deleting its files');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }]);
  await runPostgresCleanup(t, steps);
}

module.exports = { PostgresTestPool, runPostgresCleanup, assertNoPostgresSessions, removeTemporaryPostgres };
