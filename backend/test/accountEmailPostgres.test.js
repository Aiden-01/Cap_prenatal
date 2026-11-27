const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHmac, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const express = require('express');
const { PostgresTestPool: Pool, runPostgresCleanup, removeTemporaryPostgres } = require('./helpers/postgresCleanup');
const { setImmediate: nextCheckPhase } = require('node:timers/promises');
const { migrate } = require('../src/db/migrate');
const appPool = require('../src/db/pool');
const { createAccountEmailService } = require('../src/services/accountEmailService');
const { createOwnEmailRouter } = require('../src/routes/ownEmail');
const { createPasswordRecoveryRouter } = require('../src/routes/accountEmail');
const { authMiddleware, csrfMiddleware } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');

const origin = 'http://127.0.0.1:5175';
const validPassword = 'Exercise-Secure-B7!';
const initialPassword = 'Exercise-Secure-A8!';
const migration = '034_recuperacion_password.sql';
const emailChangeMigration = '035_cambio_correo_titular.sql';

test('034 incrementa el esquema y protege el restablecimiento real HTTP en PostgreSQL aislado', {
  skip: process.env.RUN_CPREN129_TEMP_POSTGRES !== '1', timeout: 240_000,
}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-cpren129-'));
  const dataDir = path.join(dir, 'data');
  const bin = process.env.CPREN129_POSTGRES_BIN;
  const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
  const run = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
    { env: pgEnv, windowsHide: true, timeout: 45_000, stdio: 'ignore' });
  const netProbe = net.createServer();
  await new Promise(resolve => netProbe.listen(0, '127.0.0.1', resolve));
  const port = netProbe.address().port;
  await new Promise(resolve => netProbe.close(resolve));
  const config = { host: '127.0.0.1', port, user: 'cpren129_test', database: 'postgres', ssl: false };
  const dotenv = require('dotenv');
  const originalDotenv = dotenv.config;
  const originalPool = { query: appPool.query, connect: appPool.connect };
  dotenv.config = () => ({ parsed: {} });
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  process.env.COOKIE_SAMESITE = 'lax';
  let started = false;
  let server;
  let db;
  const messages = [];
  t.after(async () => {
    await runPostgresCleanup(t, [
      ...(server ? [['close-http-server', async () => {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
      }]] : []),
      // deliver() queues its simulated send in the check phase. All HTTP handlers
      // have completed above, so this barrier runs after their queued callbacks.
      ['drain-simulated-delivery', () => nextCheckPhase()],
      ['close-pool', async () => {
        if (db) await db.end();
        await runPostgresCleanup(t, [['restore-shared-pool', () => {
          Object.assign(appPool, originalPool);
          dotenv.config = originalDotenv;
        }]]);
      }],
      ['clean-temporary-directory', () => removeTemporaryPostgres(t, {
        config, dataDirectory: dataDir, root: dir, prefix: 'cap-cpren129-',
        stop: started ? () => run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']) : null,
      })],
    ]);
    t.diagnostic('postgres-cleanup:complete');
  });
    run('initdb', ['-D', dataDir, '-U', config.user, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    const socket = process.platform === 'win32' ? '' : ' -k "' + dir + '"';
    run('pg_ctl', ['-D', dataDir, '-l', path.join(dir, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port + socket, '-w', 'start']);
    started = true;
    db = new Pool(config);
    assert.equal(path.resolve((await db.query('SHOW data_directory')).rows[0].data_directory), path.resolve(dataDir));
    const options = { logger: { log() {}, error() {} }, setExitCode() {} };
    const before = await migrate({ ...options, db: new Pool(config),
      readSchema: (file, enc) => fs.readFileSync(file, enc).split('-- CPREN-129:')[0],
      readDirectory: folder => fs.readdirSync(folder).filter(file => ![migration, emailChangeMigration].includes(file)),
      verifyCompatibility() {},
    });
    assert.equal(before.ok, true, before.error?.message);
    const readMigration = () => db.query('SELECT checksum, applied_at FROM schema_migrations WHERE filename=$1', [migration]);
    assert.equal((await readMigration()).rowCount, 0);
    const initialHash = await bcrypt.hash(initialPassword, 4);
    await db.query("INSERT INTO roles(nombre) VALUES ('director'),('admin'),('personal_salud') ON CONFLICT (nombre) DO NOTHING");
    const { rows: accounts } = await db.query("INSERT INTO usuarios (nombre_completo,username,email,password_hash,rol_id,activo) "
      + "SELECT login, login, correo, $1, (SELECT id FROM roles WHERE nombre='director'), activa FROM "
      + "(VALUES ('activa','activa@example.invalid',true),"
      + "('inactiva','inactiva@example.invalid',false),('legada',NULL,true),('cambio','cambio@example.invalid',true),"
      + "('limites','limites@example.invalid',true),('admin','admin@example.invalid',true),"
      + "('propia','propia@example.invalid',true),('carrera1',NULL,true),('carrera2',NULL,true)) AS x(login,correo,activa) RETURNING id,username", [initialHash]);
    const ids = Object.fromEntries(accounts.map(row => [row.username, row.id]));
    const result = await migrate({ ...options, db: new Pool(config) });
    assert.equal(result.ok, true, result.error?.message);
    const registered = (await readMigration()).rows;
    assert.equal(registered.length, 1);
    const repeated = await migrate({ ...options, db: new Pool(config) });
    assert.equal(repeated.ok, true, repeated.error?.message);
    assert.deepEqual((await readMigration()).rows, registered);
    await db.query("UPDATE usuarios SET rol_id=(SELECT id FROM roles WHERE nombre='admin') WHERE username='admin'");
    await db.query("UPDATE usuarios SET rol_id=(SELECT id FROM roles WHERE nombre='personal_salud') WHERE username='activa'");
    appPool.query = db.query.bind(db);
    appPool.connect = db.connect.bind(db);

    const expressApp = express();
    expressApp.set('trust proxy', 'loopback');
    expressApp.use(express.json());
    const secret = randomBytes(32).toString('hex');
    const accountEmail = createAccountEmailService({ secret, send: async message => { messages.push(message); }, query: appPool.query });
    const recoveryRouter = createPasswordRecoveryRouter({ nodeEnv: 'production', frontendOrigins: [origin], accountEmail: { enabled: true } }, accountEmail);
    expressApp.use('/api/auth/recuperacion', recoveryRouter);
    expressApp.use('/api', csrfMiddleware);
    expressApp.use('/api/auth/correo', createOwnEmailRouter(accountEmail));
    expressApp.use('/api/auth', require('../src/routes/auth'));
    expressApp.use('/api/usuarios', require('../src/routes/usuarios'));
    expressApp.get('/api/pacientes', authMiddleware, (_req, res) => res.json({ ok: true }));
    expressApp.use(errorHandler);
    server = await new Promise(resolve => {
      const listener = expressApp.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/api';
    const endpoint = '/auth/recuperacion';
    async function call(route, jar, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
      const response = await fetch(url + route, {
        method,
        headers: {
          Cookie: [...jar].map(([name, val]) => name + '=' + val).join('; '),
          'Content-Type': 'application/json', Origin: origin, 'X-CAP-Recovery': '1',
          ...(jar.has('cap_prenatal_csrf') ? { 'X-CSRF-Token': jar.get('cap_prenatal_csrf') } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const cookies = response.headers.getSetCookie();
      for (const line of cookies) {
        const cookie = line.split(';')[0];
        const split = cookie.indexOf('=');
        if (cookie.slice(split + 1)) jar.set(cookie.slice(0, split), cookie.slice(split + 1));
        else jar.delete(cookie.slice(0, split));
      }
      return { status: response.status, body: await response.json().catch(() => null), cookies };
    }
    const active = new Map();
    const otherSession = new Map();
    const recover = new Map();
    const target = 'activa@example.invalid';
    const issue = (jar, email = target) => call(endpoint + '/solicitar', jar, { email });
    const verify = (jar, code, email = target) => call(endpoint + '/validar', jar, { email, code });
    const reset = (jar, csrf) => call(endpoint + '/restablecer', jar, { new_password: validPassword, confirm_password: validPassword }, { 'X-Recovery-CSRF': csrf });
    const expireCooldown = () => db.query("UPDATE cuenta_limites_email SET vence_at=clock_timestamp() WHERE vence_at < clock_timestamp()+INTERVAL '61 seconds'");
    const fakeCode = current => current === '00000000' ? '11111111' : '00000000';

    await t.test('cuentas legadas conservan acceso y el correo registrado recupera sin verificación previa', async () => {
      assert.equal((await call('/auth/login', new Map(), { username: 'legada', password: initialPassword })).status, 200);
      for (const jar of [active, otherSession]) {
        assert.equal((await call('/auth/login', jar, { username: 'activa', password: initialPassword })).status, 200);
      }
      assert.equal((await call('/auth/verificacion-email/solicitar', active, {})).status, 404);
    });

    await t.test('admin y director no pueden cambiar contraseña o correo ajenos mediante la API', async () => {
      const snapshot = async () => (await db.query('SELECT password_hash, requiere_cambio_password,email FROM usuarios WHERE id=$1', [ids.activa])).rows[0];
      const before = await snapshot();
      for (const username of ['admin', 'cambio']) {
        const actor = new Map();
        assert.equal((await call('/auth/login', actor, { username, password: initialPassword })).status, 200);
        for (const body of [
          { password: validPassword }, { password: null }, { password_hash: 'externo' },
          { nombre_completo: 'Cambio compuesto', password: validPassword },
          { email: 'intruso@example.invalid' }, { email_verificado_at: '2026-01-01' },
        ]) assert.equal((await call('/usuarios/' + ids.activa, actor, body, {}, 'PUT')).status, 400);
        assert.equal((await call('/usuarios/' + ids.activa, actor, { password: validPassword }, {}, 'PATCH')).status, 404);
        assert.equal((await call('/auth/cambiar-password', actor, { usuario_id: ids.activa, current_password: initialPassword,
          new_password: validPassword, confirm_password: validPassword })).status, 400);
        assert.equal((await call('/auth/verificacion-email/cambio/solicitar', actor, { usuario_id: ids.activa,
          email: 'intruso@example.invalid', current_password: initialPassword })).status, 404);
      }
      assert.deepEqual(await snapshot(), before);
      assert.equal((await call('/auth/me', active)).status, 200);
    });

    await t.test('solicitud uniforme, privacidad de códigos y controles de origen', async () => {
      const baseCount = messages.length;
      const good = await issue(recover, '  ACTIVA@EXAMPLE.INVALID  ');
      for (const email of ['inactiva@example.invalid', 'desconocida@example.invalid']) {
        const reply = await issue(new Map(), email);
        assert.equal(reply.status, good.status);
        assert.deepEqual(reply.body, good.body);
        assert.match(reply.cookies[0], /HttpOnly; Secure; SameSite=Strict/);
      }
      assert.equal(messages.length, baseCount + 1);
      const code = messages.at(-1).code;
      const { rows: [stored] } = await db.query("SELECT codigo_mac FROM cuenta_codigos_email WHERE usuario_id=$1", [ids.activa]);
      assert.match(stored.codigo_mac, /^[a-f0-9]{64}$/);
      assert.notEqual(stored.codigo_mac, code);
      assert.equal((await call(endpoint + '/solicitar', new Map(), { email: target }, { Origin: 'https://externo.invalid' })).status, 403);
    });

    await t.test('cinco intentos, vencimiento, cooldown y reemplazo de desafíos', async () => {
      const current = messages.at(-1).code;
      const count = messages.length;
      assert.equal((await issue(new Map())).status, 202);
      assert.equal(messages.length, count);
      for (let index = 0; index < 5; index++) assert.equal((await verify(recover, fakeCode(current))).status, 400);
      assert.equal((await verify(recover, current)).status, 400);
      await expireCooldown();
      assert.equal((await issue(recover)).status, 202);
      const expired = messages.at(-1).code;
      await db.query("UPDATE cuenta_codigos_email SET vence_at=clock_timestamp() WHERE usuario_id=$1", [ids.activa]);
      assert.equal((await verify(recover, expired)).status, 400);
      const previous = new Map(recover);
      await expireCooldown();
      assert.equal((await issue(recover)).status, 202);
      const replacement = messages.at(-1).code;
      assert.equal((await verify(previous, replacement)).status, 400);
      assert.match(replacement, /^\d{8}$/);
    });

    await t.test('consumo simultáneo, CSRF, aislamiento clínico y revocación de sesiones', async () => {
      const code = messages.at(-1).code;
      const copy = new Map(recover);
      const candidates = await Promise.all([verify(recover, code), verify(copy, code)]);
      assert.deepEqual(candidates.map(reply => reply.status).sort(), [200, 400]);
      const index = candidates.findIndex(reply => reply.status === 200);
      const grant = index === 0 ? recover : copy;
      const verified = candidates[index];
      assert.deepEqual(Object.keys(verified.body), ['csrf']);
      assert.match(verified.cookies.find(value => value.startsWith('cap_email_restablecer=')), /Max-Age=300; Path=\/api\/auth\/recuperacion\/restablecer; Expires=.*HttpOnly; Secure; SameSite=Strict/);
      for (const route of ['/auth/me', '/pacientes']) assert.equal((await call(route, grant)).status, 401);
      assert.equal((await reset(new Map(grant), 'x'.repeat(64))).status, 403);
      const outcomes = await Promise.all([reset(new Map(grant), verified.body.csrf), reset(new Map(grant), verified.body.csrf)]);
      assert.deepEqual(outcomes.map(reply => reply.status).sort(), [200, 403]);
      await delay(20);
      assert.equal(messages.at(-1).kind, 'aviso');
      for (const jar of [active, otherSession]) assert.equal((await call('/auth/me', jar)).status, 401);
      assert.equal((await call('/auth/login', new Map(), { username: 'activa', password: initialPassword })).status, 401);
      assert.equal((await call('/auth/login', new Map(), { username: 'activa', password: validPassword })).status, 200);
      assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM cuenta_autorizaciones_recuperacion WHERE usuario_id=$1', [ids.activa])).rows[0].n, 0);
    });

    await t.test('autorización vencida y revocada al cambiar la cuenta', async () => {
      const email = 'cambio@example.invalid';
      for (const change of [
        "UPDATE cuenta_autorizaciones_recuperacion SET vence_at=clock_timestamp() WHERE usuario_id=$1",
        "UPDATE usuarios SET password_hash=password_hash || 'x' WHERE id=$1",
        'UPDATE usuarios SET activo=false WHERE id=$1',
        "UPDATE usuarios SET activo=true,email='nuevo@example.invalid' WHERE id=$1",
      ]) {
        await db.query('UPDATE usuarios SET activo=true WHERE id=$1', [ids.cambio]);
        await expireCooldown();
        const jar = new Map();
        await issue(jar, email);
        const response = await verify(jar, messages.at(-1).code, email);
        assert.equal(response.status, 200);
        await db.query(change, [ids.cambio]);
        assert.equal((await reset(jar, response.body.csrf)).status, 403);
      }
      const { rows } = await db.query("SELECT descripcion, datos_nuevos FROM auditoria_eventos WHERE descripcion IN ('recuperacion_codigo_validado','restablecer_password')");
      assert.ok(rows.some(row => row.descripcion === 'restablecer_password'));
      const audit = JSON.stringify(rows);
      for (const message of messages) {
        assert.ok(!audit.includes(message.to));
        if (message.code) assert.ok(!audit.includes(message.code));
      }
      assert.ok(!audit.includes(validPassword));
    });

    await t.test('acumula el límite por IP y por cuenta aunque cambie la dirección de origen', async () => {
      const targetEmail = 'limites@example.invalid';
      const sendFrom = (email, ip) => call(endpoint + '/solicitar', new Map(), { email }, { 'X-Forwarded-For': ip });
      const before = messages.length;
      const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => sendFrom(`ficticio-${i}@example.invalid`, '192.0.2.1')));
      assert.ok(burst.every(reply => reply.status === 202));
      await sendFrom(targetEmail, '192.0.2.1');
      assert.equal(messages.length, before);
      for (let i = 2; i <= 7; i++) {
        await expireCooldown();
        assert.equal((await sendFrom(targetEmail, `192.0.2.${i}`)).status, 202);
      }
      assert.equal(messages.length, before + 5);
    });

    const own = '/auth/correo';
    let fixtureIp = 80;
    const loginAs = async username => {
      const jar = new Map();
      const login = await call('/auth/login', jar, { username, password: initialPassword }, { 'X-Forwarded-For': '192.0.2.' + fixtureIp++ });
      assert.equal(login.status, 200);
      return jar;
    };
    const requestOwn = (jar, email, password = initialPassword, headers = {}) =>
      call(own + '/solicitar', jar, { email, current_password: password }, headers);
    const confirmOwn = (jar, email, id, code) =>
      call(own + '/confirmar', jar, { email, challenge_id: id, code });
    async function mailedCode(to, kind = 'confirmar-correo') {
      for (let step = 0; step < 30; step += 1) {
        const message = messages.findLast(item => item.kind === kind && item.to === to);
        if (message) return message.code;
        await delay(20);
      }
      assert.fail('El transporte simulado no recibió el correo esperado');
    }

    await t.test('035 agrega correo al legado, reautentica y comprueba sesión, destino, código y CSRF', async () => {
      const owner = await loginAs('legada');
      const second = await loginAs('legada');
      const destination = 'legada.nueva@example.invalid';
      assert.equal((await call(own, new Map())).status, 401);
      assert.deepEqual((await call(own, owner)).body, { email: null, available: true });
      assert.equal((await requestOwn(owner, destination, initialPassword, { 'X-CSRF-Token': 'incorrecto' })).status, 403);
      assert.equal((await requestOwn(owner, destination, 'incorrecta')).body.code, 'ACCOUNT_EMAIL_PASSWORD_INVALID');
      assert.equal((await requestOwn(owner, ' ADMIN@EXAMPLE.INVALID ')).body.code, 'EMAIL_DUPLICADO');
      assert.equal((await call(own + '/solicitar', owner, { email: destination, current_password: initialPassword, usuario_id: ids.activa })).status, 400);

      const requested = await requestOwn(owner, ' LEGADA.NUEVA@EXAMPLE.INVALID ');
      assert.equal(requested.status, 202);
      const id = requested.body.challenge_id;
      const code = await mailedCode(destination);
      const { rows: [pending] } = await db.query('SELECT * FROM cuenta_cambios_correo WHERE usuario_id=$1', [ids.legada]);
      assert.match(pending.codigo_mac, /^[a-f0-9]{64}$/);
      assert.ok(!JSON.stringify(pending).includes(destination));
      assert.equal((await call(own, owner)).body.email, null);
      assert.equal((await requestOwn(owner, destination)).status, 429);
      assert.equal((await confirmOwn(second, destination, id, code)).status, 400);
      assert.equal((await confirmOwn(owner, 'otro@example.invalid', id, code)).status, 400);
      assert.equal((await confirmOwn(owner, destination, id, fakeCode(code))).status, 400);
      assert.equal((await confirmOwn(owner, destination, id, code)).status, 200);
      assert.equal((await call('/auth/me', second)).status, 401);
      const resumed = await loginAs('legada');
      assert.equal((await call(own, resumed)).body.email, destination);
      assert.equal((await confirmOwn(resumed, destination, id, code)).status, 400);
      assert.ok(!messages.some(message => message.kind === 'aviso-correo'));
    });

    await t.test('035 vence el desafío y el cambio revoca las autorizaciones previas; la recuperación usa el nuevo correo', async () => {
      const owner = await loginAs('propia');
      const old = 'propia@example.invalid';
      const next = 'propia.nueva@example.invalid';
      const expired = 'propia.vencida@example.invalid';
      const jar = new Map();
      assert.equal((await issue(jar, old)).status, 202);
      const oldCode = await mailedCode(old, 'recuperar');
      const grant = await verify(jar, oldCode, old);
      assert.equal(grant.status, 200);
      await expireCooldown();
      const pendingRecovery = new Map();
      assert.equal((await issue(pendingRecovery, old)).status, 202);

      const stale = await requestOwn(owner, expired);
      assert.equal(stale.status, 202);
      const staleCode = await mailedCode(expired);
      await db.query('UPDATE cuenta_cambios_correo SET vence_at=clock_timestamp() WHERE usuario_id=$1', [ids.propia]);
      assert.equal((await confirmOwn(owner, expired, stale.body.challenge_id, staleCode)).status, 400);
      assert.equal((await call(own, owner)).body.email, old);

      await expireCooldown();
      const requested = await requestOwn(owner, next);
      assert.equal(requested.status, 202);
      const code = await mailedCode(next);
      assert.equal((await confirmOwn(owner, next, requested.body.challenge_id, code)).status, 200);
      assert.deepEqual((await db.query('SELECT (SELECT count(*)::int FROM cuenta_codigos_email WHERE usuario_id=$1) AS challenges,'
        + ' (SELECT count(*)::int FROM cuenta_autorizaciones_recuperacion WHERE usuario_id=$1) AS grants', [ids.propia])).rows[0],
      { challenges: 0, grants: 0 });
      assert.equal((await reset(jar, grant.body.csrf)).status, 403);
      await mailedCode(old, 'aviso-correo');
      const notice = messages.find(message => message.kind === 'aviso-correo');
      assert.deepEqual(Object.keys(notice).sort(), ['id', 'kind', 'to']);
      assert.equal(notice.to, old);

      await expireCooldown();
      const recovered = new Map();
      assert.equal((await issue(recovered, next)).status, 202);
      const recovery = await verify(recovered, await mailedCode(next, 'recuperar'), next);
      assert.equal(recovery.status, 200);
      assert.equal((await reset(recovered, recovery.body.csrf)).status, 200);
      const { rows } = await db.query("SELECT descripcion, datos_nuevos FROM auditoria_eventos WHERE descripcion LIKE 'cambio_correo_%'");
      assert.ok(rows.some(row => row.descripcion === 'cambio_correo_confirmado'));
      for (const value of [old, next, code, initialPassword]) assert.ok(!JSON.stringify(rows).includes(value));
    });

    await t.test('PostgreSQL deja un único ganador cuando dos titulares confirman el mismo correo', async () => {
      const first = await loginAs('carrera1');
      const second = await loginAs('carrera2');
      const shared = 'compartido@example.invalid';
      const responses = await Promise.all([requestOwn(first, shared), requestOwn(second, shared)]);
      assert.ok(responses.every(result => result.status === 202));
      await mailedCode(shared);
      for (let step = 0; step < 30 && messages.filter(item => item.to === shared).length < 2; step += 1) await delay(20);
      const sent = messages.filter(item => item.to === shared);
      assert.equal(sent.length, 2);
      // El transporte es asíncrono. Asociamos cada código con el MAC de su desafío.
      for (const [index, name] of ['carrera1', 'carrera2'].entries()) {
        const { rows: [row] } = await db.query('SELECT c.*, u.password_hash, u.email FROM cuenta_cambios_correo c JOIN usuarios u ON u.id=c.usuario_id WHERE u.id=$1', [ids[name]]);
        const message = sent.find(item => createHmac('sha256', secret).update(JSON.stringify([
          'cambio-correo:v1', row.usuario_id, row.sesion_id, shared, row.email, row.password_hash, row.id, item.code,
        ])).digest('hex') === row.codigo_mac);
        assert.ok(message);
        responses[index].code = message.code;
      }
      const confirmation = await Promise.all(responses.map((result, index) =>
        confirmOwn([first, second][index], shared, result.body.challenge_id, result.code)));
      assert.deepEqual(confirmation.map(result => result.status).sort(), [200, 409]);
      assert.equal((await db.query('SELECT 1 FROM usuarios WHERE email=$1', [shared])).rowCount, 1);
    });
});
