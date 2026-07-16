export const SESSION_INVALID_CODES = new Set([
  "SESSION_REVOKED",
  "SESSION_INACTIVE",
  "SESSION_EXPIRED",
  "USER_INACTIVE",
  "AUTHENTICATION_REQUIRED",
]);

export const REAL_ACTIVITY_EVENTS = new Set([
  "keydown",
  "pointerdown",
  "touchstart",
  "wheel",
]);

export const AUTH_CHANNEL_NAME = "cap-prenatal-auth";
export const AUTH_LIFECYCLE_STATE_KEY = "cap_prenatal_auth_lifecycle";

const AUTH_LIFECYCLE_TYPES = new Set([
  "login",
  "logout",
  "session-continued",
  "session-expired",
]);

function finiteTimestamp(value, fallback = null) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : fallback;
}

export function isSuccessfulHttpResponse(response) {
  const status = Number(response?.status);
  return Number.isInteger(status) && status >= 200 && status < 300;
}

export function isConfirmedInvalidSessionError(error) {
  return error?.response?.status === 401
    && SESSION_INVALID_CODES.has(error?.response?.data?.code);
}

export function sessionNoticeForCode(code) {
  if (code === "SESSION_INACTIVE") return "La sesión se cerró por inactividad.";
  if (code === "SESSION_EXPIRED") return "La sesión alcanzó su duración máxima. Puedes iniciar sesión nuevamente.";
  if (code === "USER_INACTIVE") return "La cuenta ya no está activa. Contacta al administrador.";
  if (code === "SESSION_REVOKED") return "La sesión fue cerrada por un cambio de seguridad.";
  return "La sesión ya no es válida. Inicia sesión nuevamente.";
}

export function sessionPhase({
  lastConfirmedActivityAt,
  now,
  warningAfterSeconds,
  idleTimeoutSeconds,
  absoluteExpiresAt,
}) {
  const absoluteRemainingMs = new Date(absoluteExpiresAt).getTime() - now;
  const idleElapsedMs = now - lastConfirmedActivityAt;
  const idleRemainingMs = idleTimeoutSeconds * 1000 - idleElapsedMs;
  const remainingMs = Math.min(absoluteRemainingMs, idleRemainingMs);
  if (remainingMs <= 0) return { phase: "expired", remainingSeconds: 0 };
  if (idleElapsedMs >= warningAfterSeconds * 1000) {
    return { phase: "warning", remainingSeconds: Math.ceil(remainingMs / 1000) };
  }
  return { phase: "active", remainingSeconds: Math.ceil(remainingMs / 1000) };
}

export function createSingleFlight(task) {
  let inFlight = null;
  return (...args) => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(() => task(...args))
      .finally(() => { inFlight = null; });
    return inFlight;
  };
}

export const REFRESH_LOCK_NAME = "cap-prenatal-refresh";

function sharedRefreshError({ terminal = true, code = "AUTHENTICATION_REQUIRED" } = {}) {
  const error = new Error(terminal
    ? "La renovación compartida confirmó que la sesión no es válida"
    : "La renovación compartida falló temporalmente");
  error.code = terminal ? code : "REFRESH_TEMPORARY_FAILURE";
  if (terminal) {
    error.response = { status: 401, data: { code: error.code } };
  }
  return error;
}

export function createRefreshCoordinator({
  executeRefresh,
  lockManager = null,
  readState = () => null,
  writeState = () => {},
  createStateId = () => `${Date.now()}-${Math.random()}`,
} = {}) {
  if (typeof executeRefresh !== "function") {
    throw new TypeError("executeRefresh es obligatorio");
  }

  const safeReadState = () => {
    try {
      return readState();
    } catch {
      return null;
    }
  };
  const safeWriteState = (state) => {
    try {
      writeState(state);
    } catch {
      // El estado no contiene credenciales. Si el almacenamiento no esta
      // disponible, el cerrojo aun evita una segunda rotacion concurrente.
    }
  };

  return createSingleFlight(async () => {
    const observedState = safeReadState();
    try {
      const parsed = JSON.parse(observedState);
      if (parsed?.status === "failed") {
        throw sharedRefreshError({ code: parsed.code });
      }
    } catch (error) {
      if (isConfirmedInvalidSessionError(error)) throw error;
    }

    const executeAndRecord = async () => {
      const stateId = createStateId();
      try {
        const value = await executeRefresh();
        safeWriteState({ id: stateId, status: "success" });
        return value;
      } catch (error) {
        if (isConfirmedInvalidSessionError(error)) {
          safeWriteState({
            id: stateId,
            status: "failed",
            code: error.response.data.code,
          });
        } else {
          safeWriteState({ id: stateId, status: "transient-failed" });
        }
        throw error;
      }
    };

    if (!lockManager?.request) return executeAndRecord();

    const attempt = await lockManager.request(
      REFRESH_LOCK_NAME,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return { acquired: false };
        return { acquired: true, value: await executeAndRecord() };
      }
    );

    if (attempt.acquired) return attempt.value;

    // Otra pestana tenia el cerrojo: esperamos su salida y no rotamos otra vez.
    await lockManager.request(REFRESH_LOCK_NAME, () => undefined);
    const completedState = safeReadState();
    if (completedState !== observedState) {
      try {
        const parsed = JSON.parse(completedState);
        if (parsed?.status === "failed") {
          throw sharedRefreshError({ code: parsed.code });
        }
        if (parsed?.status === "transient-failed") {
          throw sharedRefreshError({ terminal: false });
        }
      } catch (error) {
        if (isConfirmedInvalidSessionError(error)
          || error?.code === "REFRESH_TEMPORARY_FAILURE") {
          throw error;
        }
      }
    }
    return undefined;
  });
}

export function mayRetryAfterRefresh(error, config = {}) {
  return error?.response?.status === 401
    && error?.response?.data?.code === "ACCESS_TOKEN_EXPIRED"
    && !config._authRetry
    && !config.skipAuthRefresh
    && !String(config.url || "").includes("/auth/refresh");
}

export function safeAuthChannelMessage(type, userId = null, metadata = {}) {
  const message = {
    type,
    userId: userId === null || userId === undefined ? null : String(userId),
    occurredAt: finiteTimestamp(metadata.occurredAt, Date.now()),
  };
  const activityAt = finiteTimestamp(metadata.activityAt);
  const basedOnActivityAt = finiteTimestamp(metadata.basedOnActivityAt);
  if (["login", "session-continued"].includes(type) && activityAt !== null) {
    message.activityAt = activityAt;
  }
  if (type === "session-expired" && basedOnActivityAt !== null) {
    message.basedOnActivityAt = basedOnActivityAt;
  }
  return message;
}

function resolveStorage(storage) {
  if (storage) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function readAuthLifecycleState(storage = null) {
  try {
    const serialized = resolveStorage(storage)?.getItem(AUTH_LIFECYCLE_STATE_KEY);
    const state = serialized ? JSON.parse(serialized) : null;
    return AUTH_LIFECYCLE_TYPES.has(state?.type) ? state : null;
  } catch {
    return null;
  }
}

export function recordAuthLifecycleState(message, storage = null, { force = false } = {}) {
  if (!AUTH_LIFECYCLE_TYPES.has(message?.type)) return null;
  const target = resolveStorage(storage);
  if (!target) return null;

  const incoming = safeAuthChannelMessage(message.type, message.userId, message);
  if (incoming.type === "session-continued" && !Number.isFinite(incoming.activityAt)) {
    return null;
  }

  const current = readAuthLifecycleState(target);
  if (!force && !shouldRecordAuthLifecycleState(current, incoming)) return current;

  try {
    target.setItem(AUTH_LIFECYCLE_STATE_KEY, JSON.stringify(incoming));
    return incoming;
  } catch {
    return null;
  }
}

export function shouldRecordAuthLifecycleState(current, message) {
  if (!AUTH_LIFECYCLE_TYPES.has(message?.type)) return false;
  const incoming = safeAuthChannelMessage(message.type, message.userId, message);
  if (incoming.type === "session-continued" && !Number.isFinite(incoming.activityAt)) {
    return false;
  }
  if (!current) return true;
  if (current.userId === null && incoming.type !== "login") return false;
  if (String(current.userId || "") !== String(incoming.userId || "")) return true;

  if (incoming.type === "login") {
    const currentBaseline = current.type === "session-continued"
      ? finiteTimestamp(current.activityAt, finiteTimestamp(current.occurredAt, 0))
      : current.type === "session-expired" && Number.isFinite(current.basedOnActivityAt)
        ? current.basedOnActivityAt
        : finiteTimestamp(current.activityAt, finiteTimestamp(current.occurredAt, 0));
    const incomingBaseline = finiteTimestamp(
      incoming.activityAt,
      finiteTimestamp(incoming.occurredAt, 0)
    );
    return incomingBaseline > currentBaseline
      || (incomingBaseline === currentBaseline
        && finiteTimestamp(incoming.occurredAt, 0) > finiteTimestamp(current.occurredAt, 0));
  }

  if (current.type === "login") {
    const loginBaseline = finiteTimestamp(
      current.activityAt,
      finiteTimestamp(current.occurredAt, 0)
    );
    if (incoming.type === "session-continued") {
      return incoming.activityAt > loginBaseline;
    }
    if (incoming.type === "session-expired"
      && Number.isFinite(incoming.basedOnActivityAt)) {
      return incoming.basedOnActivityAt >= loginBaseline;
    }
    return finiteTimestamp(incoming.occurredAt, 0) >= loginBaseline;
  }

  if (current.type === "logout"
    || (current.type === "session-expired"
      && !Number.isFinite(current.basedOnActivityAt))) {
    return false;
  }

  if (incoming.type === "logout"
    || (incoming.type === "session-expired"
      && !Number.isFinite(incoming.basedOnActivityAt))) {
    return true;
  }

  const currentActivity = current.type === "session-continued"
    ? finiteTimestamp(current.activityAt, 0)
    : finiteTimestamp(current.basedOnActivityAt, 0);
  const incomingActivity = incoming.type === "session-continued"
    ? incoming.activityAt
    : finiteTimestamp(incoming.basedOnActivityAt, 0);
  return incoming.type === "session-continued"
    ? incomingActivity > currentActivity
    : incomingActivity >= currentActivity;
}

export function authLifecycleStateMatchesMessage(state, message) {
  if (!state || !AUTH_LIFECYCLE_TYPES.has(message?.type)) return false;
  const expected = safeAuthChannelMessage(message.type, message.userId, message);
  return state.type === expected.type
    && state.userId === expected.userId
    && finiteTimestamp(state.occurredAt) === finiteTimestamp(expected.occurredAt)
    && finiteTimestamp(state.activityAt) === finiteTimestamp(expected.activityAt)
    && finiteTimestamp(state.basedOnActivityAt) === finiteTimestamp(expected.basedOnActivityAt);
}

export function authLifecycleEndsUser(state, userId) {
  if (!state || !["logout", "session-expired"].includes(state.type)) return false;
  return state.userId === null || String(state.userId) === String(userId ?? "");
}

export function isLocalOnlyAuthMessage(message) {
  return message?.type === "login"
    || (message?.type === "session-expired"
      && Number.isFinite(message.basedOnActivityAt));
}

export function shouldApplyAuthSnapshot({
  startedGeneration,
  currentGeneration,
  startedUserId,
  currentUserId,
  tabSessionEnded = false,
}) {
  return !tabSessionEnded
    && startedGeneration === currentGeneration
    && String(startedUserId ?? "") === String(currentUserId ?? "")
    && String(currentUserId ?? "") !== "";
}

export async function handleAuthResponseError(error, {
  refresh,
  retry,
  notifyInvalid = () => {},
} = {}) {
  const config = error.config || {};
  if (mayRetryAfterRefresh(error, config)) {
    config._authRetry = true;
    try {
      await refresh();
      return retry(config);
    } catch (refreshError) {
      if (!config.skipAuthRedirect && isConfirmedInvalidSessionError(refreshError)) {
        notifyInvalid(refreshError.response.data.code);
      }
      throw refreshError;
    }
  }

  if (!config.skipAuthRedirect && isConfirmedInvalidSessionError(error)) {
    notifyInvalid(error.response.data.code);
  }
  throw error;
}

export function isNewerSessionContinuation(message, currentUserId, lastConfirmedActivityAt = 0) {
  if (message?.type !== "session-continued") return false;
  if (String(message.userId || "") !== String(currentUserId || "")) return false;
  const activityAt = finiteTimestamp(message.activityAt);
  return activityAt !== null && activityAt > finiteTimestamp(lastConfirmedActivityAt, 0);
}

export function shouldClearForAuthMessage(
  message,
  currentUserId,
  { lastConfirmedActivityAt = 0 } = {}
) {
  if (!message || !["logout", "session-expired", "login"].includes(message.type)) return false;
  if (message.type === "login") {
    return String(currentUserId || "") !== String(message.userId || "");
  }
  if (message.userId !== null && message.userId !== undefined
    && String(currentUserId || "") !== String(message.userId)) {
    return false;
  }
  if (message.type === "session-expired") {
    const basedOnActivityAt = finiteTimestamp(message.basedOnActivityAt);
    if (basedOnActivityAt !== null
      && basedOnActivityAt < finiteTimestamp(lastConfirmedActivityAt, 0)) {
      return false;
    }
  }
  return true;
}
