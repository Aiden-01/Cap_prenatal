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

function sharedRefreshError() {
  const error = new Error("La renovacion compartida de la sesion fallo");
  error.code = "AUTHENTICATION_REQUIRED";
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
      if (JSON.parse(observedState)?.status === "failed") throw sharedRefreshError();
    } catch (error) {
      if (error?.code === "AUTHENTICATION_REQUIRED") throw error;
    }

    const executeAndRecord = async () => {
      const stateId = createStateId();
      try {
        const value = await executeRefresh();
        safeWriteState({ id: stateId, status: "success" });
        return value;
      } catch (error) {
        safeWriteState({ id: stateId, status: "failed" });
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
        if (JSON.parse(completedState)?.status === "failed") throw sharedRefreshError();
      } catch (error) {
        if (error?.code === "AUTHENTICATION_REQUIRED") throw error;
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

export function safeAuthChannelMessage(type, userId = null) {
  return { type, userId: userId === null ? null : String(userId) };
}

export function shouldClearForAuthMessage(message, currentUserId) {
  if (!message || !["logout", "session-expired", "login"].includes(message.type)) return false;
  if (message.type !== "login") return true;
  return String(currentUserId || "") !== String(message.userId || "");
}
