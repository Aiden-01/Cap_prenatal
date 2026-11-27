const { createHmac, randomInt, randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { ipKeyGenerator } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const authRepository = require('../repositories/authRepository');
const { enTransaccion, obtenerConUsuarioPorId } = require('../repositories/authSessionsRepository');
const { revokeAllInTransaction, stateOfSession } = require('./sessionService');
const { registrarEventoPrivado } = require('./auditService');
const { AppError } = require('../utils/appError');
const { describeAccountEmailFailure } = require('./accountEmailTransport');

const grantLifetime = 5 * 60 * 1000;

const emailChangeErrors = {
  ACCOUNT_EMAIL_CHANGE_LIMIT: [429, 'Demasiados intentos. Espera antes de volver a solicitar o confirmar un código.'],
  SESSION_REVOKED: [401, 'La sesión ya no está activa.'],
  ACCOUNT_EMAIL_PASSWORD_INVALID: [403, 'La contraseña actual no es correcta.'],
  ACCOUNT_EMAIL_UNCHANGED: [400, 'Ingresa una dirección distinta a la actual.'],
  EMAIL_DUPLICADO: [409, 'El correo electrónico ya está registrado.'],
  ACCOUNT_CODE_INVALID: [400, 'El código no es válido o ya venció.'],
};

function emailChangeError(code) {
  const [status, message] = emailChangeErrors[code];
  return new AppError(status, message, { code });
}


function sameMac(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.length === right.length
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createAccountEmailService({ secret, send, transact = enTransaccion, query = pool.query.bind(pool) }) {
  const mac = (...parts) => createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
  const resetCsrf = token => mac('csrf-recuperacion', token);
  let lastCleanup = 0;

  async function take(db, key, limit, seconds) {
    const result = await db.query(`INSERT INTO cuenta_limites_email AS l (clave_mac, cantidad, vence_at)
      VALUES ($1, 1, clock_timestamp() + $3::integer * INTERVAL '1 second')
      ON CONFLICT (clave_mac) DO UPDATE SET
        cantidad = CASE WHEN l.vence_at <= clock_timestamp() THEN 1 ELSE l.cantidad + 1 END,
        vence_at = CASE WHEN l.vence_at <= clock_timestamp() THEN EXCLUDED.vence_at ELSE l.vence_at END
      WHERE l.vence_at <= clock_timestamp() OR l.cantidad < $2 RETURNING cantidad`, [key, limit, seconds]);
    return result.rowCount === 1;
  }

  async function withinLimits(db, action, req, accountKey) {
    const key = mac('limite', action, 'ip', ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown'));
    if (!await take(db, key, action === 'envio' ? 25 : 80, 3600)) return false;
    const account = mac('limite', action, 'cuenta', accountKey);
    if (action === 'envio' && !await take(db, mac('reenvio', accountKey), 1, 60)) return false;
    return take(db, account, action === 'envio' ? 5 : 15, 3600);
  }

  async function lockAccount(db, email, userId) {
    const { rows } = await db.query(`SELECT id, email, activo, password_hash FROM usuarios
      WHERE ${userId === undefined ? 'lower(email) = $1' : 'id = $1'} FOR UPDATE`, [userId ?? email]);
    return rows[0];
  }

  async function audit(db, req, user, event, metadata = { operacion_registrada: true }) {
    await registrarEventoPrivado(req, {
      contexto: { categoria: 'usuarios', entidad: 'usuario', evento: event },
      accion: 'actualizar', entidadId: user.id, usuarioId: user.id, metadata,
    }, { db, obligatorio: true });
  }

  function deliver(message) {
    if (!message) return;
    // El proveedor no condiciona la respuesta pública. El código en claro existe
    // en memoria hasta el envío y nunca se persiste en una cola ni se registra.
    setImmediate(async () => {
      try { await send(message); }
      catch (error) {
        console.warn('[cuenta] No se pudo confirmar el correo transaccional:', describeAccountEmailFailure(error));
      }
    });
  }

  function cleanupLimits() {
    if (Date.now() - lastCleanup < 60_000) return;
    lastCleanup = Date.now();
    void query(`DELETE FROM cuenta_limites_email WHERE clave_mac IN (
      SELECT clave_mac FROM cuenta_limites_email WHERE vence_at <= clock_timestamp()
      ORDER BY vence_at LIMIT 1000 FOR UPDATE SKIP LOCKED)`).catch(() => {
      console.warn('[cuenta] No se pudieron limpiar límites caducados');
    });
  }

  async function issue({ req, email }) {
    const id = randomUUID();
    const code = String(randomInt(100_000_000)).padStart(8, '0');
    const message = await transact(async db => {
      if (!await withinLimits(db, 'envio', req, email)) return null;
      const user = await lockAccount(db, email);
      if (!user?.activo || !await take(db, mac('envios-usuario', user.id), 5, 3600)) return null;
      await db.query(`INSERT INTO cuenta_codigos_email (id, usuario_id, codigo_mac, vence_at)
        VALUES ($1, $2, $3, clock_timestamp() + INTERVAL '15 minutes')
        ON CONFLICT (usuario_id) DO UPDATE SET id=EXCLUDED.id,
          codigo_mac=EXCLUDED.codigo_mac, vence_at=EXCLUDED.vence_at, intentos=0`,
      [id, user.id, mac('codigo', id, code)]);
      await audit(db, req, user, 'recuperacion_solicitada');
      return { to: user.email, kind: 'recuperar', code, id: randomUUID() };
    });
    deliver(message);
    cleanupLimits();
    return id;
  }

  async function verify({ req, email, code, challengeId }) {
    return transact(async db => {
      if (!await withinLimits(db, 'intento', req, email)) return null;
      const user = await lockAccount(db, email);
      if (!user?.activo || !await take(db, mac('intentos-usuario', user.id), 15, 3600)) return null;
      const { rows: [challenge] } = await db.query(`UPDATE cuenta_codigos_email SET intentos=intentos+1
        WHERE usuario_id=$1 AND id=$2 AND intentos < 5 AND vence_at > clock_timestamp()
        RETURNING id, codigo_mac`, [user.id, challengeId]);
      if (!challenge) return null;
      if (!sameMac(challenge.codigo_mac, mac('codigo', challenge.id, code))) {
        await audit(db, req, user, 'recuperacion_codigo_rechazado');
        return null;
      }
      await db.query('DELETE FROM cuenta_codigos_email WHERE id=$1', [challenge.id]);
      const token = randomBytes(32).toString('base64url');
      await db.query(`INSERT INTO cuenta_autorizaciones_recuperacion (token_mac, usuario_id, vence_at)
        VALUES ($1,$2,clock_timestamp()+INTERVAL '5 minutes') ON CONFLICT (usuario_id) DO UPDATE
        SET token_mac=EXCLUDED.token_mac, vence_at=EXCLUDED.vence_at`, [mac('grant', token), user.id]);
      await audit(db, req, user, 'recuperacion_codigo_validado');
      return { token, csrf: resetCsrf(token) };
    });
  }

  async function reset({ token, csrf, password, req }) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '') || !/^[a-f0-9]{64}$/.test(csrf ?? '') || !sameMac(csrf, resetCsrf(token))) return false;
    const tokenMac = mac('grant', token);
    const message = await transact(async db => {
      const { rows: [grant] } = await db.query('SELECT usuario_id FROM cuenta_autorizaciones_recuperacion WHERE token_mac=$1 AND vence_at>clock_timestamp()', [tokenMac]);
      if (!grant) return null;
      const user = await lockAccount(db, undefined, grant.usuario_id);
      if (!user?.activo || !user.email) return null;
      const pending = await db.query('SELECT 1 FROM cuenta_autorizaciones_recuperacion WHERE token_mac=$1 AND vence_at>clock_timestamp()', [tokenMac]);
      if (!pending.rowCount) return null;
      if (await bcrypt.compare(password, user.password_hash)) {
        throw new AppError(400, 'Elige una contraseña diferente de la actual.', { code: 'PASSWORD_REUSED' });
      }
      const hash = await bcrypt.hash(password, 12);
      const consumed = await db.query('DELETE FROM cuenta_autorizaciones_recuperacion WHERE token_mac=$1 AND vence_at>clock_timestamp()', [tokenMac]);
      if (!consumed.rowCount) return null;
      await authRepository.actualizarPassword({ id: user.id, passwordHash: hash, updatedBy: user.id }, db);
      await revokeAllInTransaction({ usuarioId: user.id, reason: 'password_changed', req, db });
      await audit(db, req, user, 'restablecer_password', { password_cambiado: true });
      return { to: user.email, kind: 'aviso', id: randomUUID() };
    });
    deliver(message);
    return Boolean(message);
  }

  function emailChangeMac(user, sessionId, email, challengeId, code) {
    return mac('cambio-correo:v1', user.id, sessionId, email, user.email, user.password_hash, challengeId, code);
  }

  async function lockEmailChangeAccount(db, req) {
    const user = await lockAccount(db, undefined, req.usuario.id);
    if (!user?.activo) return null;
    const session = await obtenerConUsuarioPorId(req.authSession.id, db, { bloquear: true });
    return session?.usuario_id === user.id && !session.requiere_cambio_password && !stateOfSession(session)
      ? user : null;
  }

  async function emailChangeLimit(db, req, action, userLimit, ipLimit) {
    const ip = ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
    return await take(db, mac('cambio-correo', action, 'ip', ip), ipLimit, 3600)
      && await take(db, mac('cambio-correo', action, 'usuario', req.usuario.id), userLimit, 3600);
  }

  async function requestEmailChange({ req, email, password }) {
    cleanupLimits();
    const result = await transact(async db => {
      if (!await emailChangeLimit(db, req, 'solicitud', 10, 50)) return 'ACCOUNT_EMAIL_CHANGE_LIMIT';
      const user = await lockEmailChangeAccount(db, req);
      if (!user) return 'SESSION_REVOKED';
      if (!await bcrypt.compare(password, user.password_hash)) {
        await audit(db, req, user, 'cambio_correo_reautenticacion_rechazada');
        return 'ACCOUNT_EMAIL_PASSWORD_INVALID';
      }
      if (user.email === email) return 'ACCOUNT_EMAIL_UNCHANGED';
      const existing = await db.query('SELECT 1 FROM usuarios WHERE lower(email)=$1 AND id<>$2', [email, user.id]);
      if (existing.rowCount) return 'EMAIL_DUPLICADO';
      if (!await take(db, mac('cambio-correo', 'reenvio', user.id), 1, 60)
        || !await take(db, mac('cambio-correo', 'envio', user.id), 5, 3600)) return 'ACCOUNT_EMAIL_CHANGE_LIMIT';

      const id = randomUUID();
      const code = String(randomInt(100_000_000)).padStart(8, '0');
      const sessionId = req.authSession.id;
      await db.query(
        'INSERT INTO cuenta_cambios_correo (usuario_id, sesion_id, id, codigo_mac, vence_at)'
        + " VALUES ($1,$2,$3,$4,clock_timestamp()+INTERVAL '15 minutes')"
        + ' ON CONFLICT (usuario_id) DO UPDATE SET sesion_id=EXCLUDED.sesion_id, id=EXCLUDED.id,'
        + ' codigo_mac=EXCLUDED.codigo_mac, vence_at=EXCLUDED.vence_at, intentos=0',
        [user.id, sessionId, id, emailChangeMac(user, sessionId, email, id, code)]
      );
      await audit(db, req, user, 'cambio_correo_solicitado');
      return { id, message: { to: email, kind: 'confirmar-correo', code, id: randomUUID() } };
    });
    if (typeof result === 'string') throw emailChangeError(result);
    deliver(result.message);
    return result.id;
  }

  async function confirmEmailChange({ req, email, code, challengeId }) {
    const result = await transact(async db => {
      if (!await emailChangeLimit(db, req, 'confirmacion', 15, 80)) return 'ACCOUNT_EMAIL_CHANGE_LIMIT';
      const user = await lockEmailChangeAccount(db, req);
      if (!user) return 'SESSION_REVOKED';
      const sessionId = req.authSession.id;
      const { rows: [challenge] } = await db.query(
        'UPDATE cuenta_cambios_correo SET intentos=intentos+1'
        + ' WHERE usuario_id=$1 AND sesion_id=$2 AND id=$3 AND intentos<5 AND vence_at>clock_timestamp()'
        + ' RETURNING codigo_mac', [user.id, sessionId, challengeId]
      );
      if (!challenge || !sameMac(challenge.codigo_mac, emailChangeMac(user, sessionId, email, challengeId, code))) {
        if (challenge) await audit(db, req, user, 'cambio_correo_codigo_rechazado');
        return 'ACCOUNT_CODE_INVALID';
      }
      await db.query('DELETE FROM cuenta_cambios_correo WHERE usuario_id=$1', [user.id]);
      // El trigger de 034 invalida los desafíos y autorizaciones de recuperación aquí.
      await db.query('UPDATE usuarios SET email=$1, updated_at=clock_timestamp(), updated_by=id WHERE id=$2', [email, user.id]);
      await revokeAllInTransaction({ usuarioId: user.id, reason: 'email_changed', req, db });
      await audit(db, req, user, 'cambio_correo_confirmado');
      return { message: user.email ? { to: user.email, kind: 'aviso-correo', id: randomUUID() } : null };
    });
    if (typeof result === 'string') throw emailChangeError(result);
    deliver(result.message);
  }

  return { issue, verify, reset, requestEmailChange, confirmEmailChange };
}

module.exports = { createAccountEmailService, grantLifetime };
