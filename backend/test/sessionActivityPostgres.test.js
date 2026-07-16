const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const express = require('express');

const pool = require('../src/db/pool');
const authSessionsRepository = require('../src/repositories/authSessionsRepository');
const authRoutes = require('../src/routes/auth');
const { csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const postgresTest = process.env.RUN_POSTGRES_INTEGRATION === '1' ? test : test.skip;

postgresTest('actividad aplica throttling en PostgreSQL real sin error 42883', async () => {
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const { rows: roleRows } = await client.query(
      `INSERT INTO roles (nombre, descripcion)
       VALUES ($1, $2)
       RETURNING id`,
      [`activity_${suffix}`, 'Rol sintetico para prueba aislada de actividad']
    );
    const { rows: userRows } = await client.query(
      `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [
        'Usuario sintetico de actividad',
        `activity_${suffix}`,
        'hash-sintetico-no-utilizable',
        roleRows[0].id,
      ]
    );
    const { rows: clockRows } = await client.query('SELECT CURRENT_TIMESTAMP AS now');
    const databaseNow = clockRows[0].now;
    const sessionId = crypto.randomUUID();
    const userId = userRows[0].id;
    const createdAt = new Date(databaseNow.getTime() - 10 * 60_000);
    const oldActivityAt = new Date(databaseNow.getTime() - 2 * 60_000);
    const absoluteExpiresAt = new Date(databaseNow.getTime() + 60 * 60_000);

    await client.query(
      `INSERT INTO auth_sessions (
         id, usuario_id, refresh_token_hash, created_at,
         last_activity_at, absolute_expires_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $4)`,
      [
        sessionId,
        userId,
        crypto.createHash('sha256').update(sessionId).digest('hex'),
        createdAt,
        oldActivityAt,
        absoluteExpiresAt,
      ]
    );

    const firstUpdate = await authSessionsRepository.actualizarActividad({
      id: sessionId,
      usuarioId: userId,
      now: databaseNow,
      minIntervalSeconds: 60,
    }, client);
    assert.equal(firstUpdate.last_activity_at.getTime(), databaseNow.getTime());

    const { rows: afterFirstUpdateRows } = await client.query(
      `SELECT last_activity_at, updated_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    const afterFirstUpdate = afterFirstUpdateRows[0];
    assert.equal(afterFirstUpdate.last_activity_at.getTime(), databaseNow.getTime());
    assert.equal(afterFirstUpdate.updated_at.getTime(), databaseNow.getTime());
    assert.equal(afterFirstUpdate.absolute_expires_at.getTime(), absoluteExpiresAt.getTime());

    const throttledUpdate = await authSessionsRepository.actualizarActividad({
      id: sessionId,
      usuarioId: userId,
      now: new Date(databaseNow.getTime() + 1_000),
      minIntervalSeconds: 60,
    }, client);
    assert.equal(throttledUpdate, null);

    const { rows: afterThrottleRows } = await client.query(
      `SELECT last_activity_at, updated_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    assert.equal(afterThrottleRows[0].last_activity_at.getTime(), databaseNow.getTime());
    assert.equal(afterThrottleRows[0].updated_at.getTime(), databaseNow.getTime());
    assert.equal(afterThrottleRows[0].absolute_expires_at.getTime(), absoluteExpiresAt.getTime());

    const eligibleAgainAt = new Date(databaseNow.getTime() - 61_000);
    await client.query(
      `UPDATE auth_sessions
       SET last_activity_at = $2, updated_at = $2
       WHERE id = $1`,
      [sessionId, eligibleAgainAt]
    );
    const secondUpdate = await authSessionsRepository.actualizarActividad({
      id: sessionId,
      usuarioId: userId,
      now: new Date(databaseNow.getTime() + 2_000),
      minIntervalSeconds: 60,
    }, client);
    assert.ok(secondUpdate);

    await client.query(
      `UPDATE auth_sessions
       SET revoked_at = $2, last_activity_at = $3, updated_at = $3
       WHERE id = $1`,
      [sessionId, databaseNow, oldActivityAt]
    );
    const revokedUpdate = await authSessionsRepository.actualizarActividad({
      id: sessionId,
      usuarioId: userId,
      now: new Date(databaseNow.getTime() + 3_000),
      minIntervalSeconds: 60,
    }, client);
    assert.equal(revokedUpdate, null);

    const expiredAbsoluteAt = new Date(databaseNow.getTime() - 60_000);
    await client.query(
      `UPDATE auth_sessions
       SET revoked_at = NULL, absolute_expires_at = $2,
           last_activity_at = $3, updated_at = $3
       WHERE id = $1`,
      [sessionId, expiredAbsoluteAt, oldActivityAt]
    );
    const expiredUpdate = await authSessionsRepository.actualizarActividad({
      id: sessionId,
      usuarioId: userId,
      now: new Date(databaseNow.getTime() + 4_000),
      minIntervalSeconds: 60,
    }, client);
    assert.equal(expiredUpdate, null);

    const { rows: terminalRows } = await client.query(
      `SELECT last_activity_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    assert.equal(terminalRows[0].last_activity_at.getTime(), oldActivityAt.getTime());
    assert.equal(terminalRows[0].absolute_expires_at.getTime(), expiredAbsoluteAt.getTime());
  } finally {
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } finally {
      if (client) client.release();
      await pool.end();
    }
  }
});

postgresTest('POST /api/auth/activity responde 204 y conserva el throttling en PostgreSQL real', async () => {
  let client;
  let server;
  let transactionStarted = false;
  const originalPoolQuery = pool.query;
  const originalTransaction = authSessionsRepository.enTransaccion;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const password = `Activity-${suffix}!`;
    const { rows: roleRows } = await client.query(
      `INSERT INTO roles (nombre, descripcion)
       VALUES ($1, $2)
       RETURNING id`,
      [`activity_${suffix}`, 'Rol sintetico para prueba HTTP aislada de actividad']
    );
    const { rows: userRows } = await client.query(
      `INSERT INTO usuarios (nombre_completo, username, password_hash, rol_id, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [
        'Usuario sintetico HTTP de actividad',
        `activity_${suffix}`,
        await bcrypt.hash(password, 4),
        roleRows[0].id,
      ]
    );
    const userId = userRows[0].id;
    const { rows: clockRows } = await client.query('SELECT CURRENT_TIMESTAMP AS now');
    const databaseNow = clockRows[0].now;

    pool.query = (...args) => client.query(...args);
    authSessionsRepository.enTransaccion = async (callback) => callback(client);

    const app = express();
    app.use(express.json());
    app.use('/api', csrfMiddleware);
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.on('error', reject);
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `activity_${suffix}`, password }),
    });
    assert.equal(loginResponse.status, 200);
    const cookiePairs = loginResponse.headers.getSetCookie()
      .map((cookie) => cookie.split(';', 1)[0]);
    const csrfCookie = cookiePairs.find((cookie) => cookie.startsWith('cap_prenatal_csrf='));
    assert.ok(csrfCookie);
    const csrfToken = csrfCookie.slice(csrfCookie.indexOf('=') + 1);
    const requestActivity = () => fetch(`${baseUrl}/api/auth/activity`, {
      method: 'POST',
      headers: {
        cookie: cookiePairs.join('; '),
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: '{}',
    });

    const { rows: sessionRows } = await client.query(
      `SELECT id, absolute_expires_at
       FROM auth_sessions
       WHERE usuario_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
    assert.equal(sessionRows.length, 1);
    const sessionId = sessionRows[0].id;
    const absoluteExpiresAt = sessionRows[0].absolute_expires_at;
    const oldActivityAt = new Date(databaseNow.getTime() - 2 * 60_000);
    await client.query(
      `UPDATE auth_sessions
       SET last_activity_at = $2, updated_at = $2
       WHERE id = $1`,
      [sessionId, oldActivityAt]
    );

    const firstActivityResponse = await requestActivity();
    assert.equal(firstActivityResponse.status, 204);
    const { rows: firstActivityRows } = await client.query(
      `SELECT last_activity_at, updated_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    const firstActivity = firstActivityRows[0];
    assert.ok(firstActivity.last_activity_at.getTime() > oldActivityAt.getTime());
    assert.equal(firstActivity.updated_at.getTime(), firstActivity.last_activity_at.getTime());
    assert.equal(firstActivity.absolute_expires_at.getTime(), absoluteExpiresAt.getTime());

    const throttledResponse = await requestActivity();
    assert.equal(throttledResponse.status, 204);
    const { rows: throttledRows } = await client.query(
      `SELECT last_activity_at, updated_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    assert.equal(
      throttledRows[0].last_activity_at.getTime(),
      firstActivity.last_activity_at.getTime()
    );
    assert.equal(throttledRows[0].updated_at.getTime(), firstActivity.updated_at.getTime());
    assert.equal(throttledRows[0].absolute_expires_at.getTime(), absoluteExpiresAt.getTime());

    const eligibleAgainAt = new Date(databaseNow.getTime() - 61_000);
    await client.query(
      `UPDATE auth_sessions
       SET last_activity_at = $2, updated_at = $2
       WHERE id = $1`,
      [sessionId, eligibleAgainAt]
    );
    const eligibleAgainResponse = await requestActivity();
    assert.equal(eligibleAgainResponse.status, 204);
    const { rows: eligibleAgainRows } = await client.query(
      `SELECT last_activity_at, updated_at, absolute_expires_at
       FROM auth_sessions
       WHERE id = $1`,
      [sessionId]
    );
    assert.ok(eligibleAgainRows[0].last_activity_at.getTime() > eligibleAgainAt.getTime());
    assert.equal(
      eligibleAgainRows[0].updated_at.getTime(),
      eligibleAgainRows[0].last_activity_at.getTime()
    );
    assert.equal(eligibleAgainRows[0].absolute_expires_at.getTime(), absoluteExpiresAt.getTime());
  } finally {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (
        error ? reject(error) : resolve()
      )));
    }
    pool.query = originalPoolQuery;
    authSessionsRepository.enTransaccion = originalTransaction;
    try {
      if (transactionStarted) await client.query('ROLLBACK');
    } finally {
      if (client) client.release();
      await pool.end();
    }
  }
});
