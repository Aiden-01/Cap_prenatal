import {
  REAL_ACTIVITY_EVENTS,
  isConfirmedInvalidSessionError,
  isNewerSessionContinuation,
  isSuccessfulHttpResponse,
  safeAuthChannelMessage,
  sessionPhase,
} from "./sessionSecurity.js";

const TEMPORARY_ACTIVITY_ERROR = "No se pudo validar la sesión. Revisa tu conexión e inténtalo nuevamente.";

function timestamp(value, fallback) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isSessionModalTarget(target) {
  return Boolean(target?.closest?.("[data-session-timeout-modal]"));
}

export function createSessionLifecycle({
  userId,
  lastActivityAt,
  absoluteExpiresAt,
  warningAfterSeconds,
  idleTimeoutSeconds,
  activityUpdateSeconds,
  requestActivity,
  onStateChange = () => {},
  onSessionEnd = () => {},
  onSessionContinued = () => {},
  readLatestSessionState = () => null,
  eventTarget = null,
  channel = null,
  now = () => Date.now(),
  setIntervalFn = (callback, delay) => setInterval(callback, delay),
  clearIntervalFn = (timer) => clearInterval(timer),
  createAbortController = () => new AbortController(),
} = {}) {
  if (typeof requestActivity !== "function") {
    throw new TypeError("requestActivity es obligatorio");
  }

  let state = {
    userId,
    visible: false,
    remainingSeconds: 0,
    continuing: false,
    error: "",
  };
  let lastConfirmedActivityAt = timestamp(lastActivityAt, now());
  let lastSentAt = 0;
  let expirationEpoch = 0;
  let continuationAttempt = 0;
  let expirationSuspended = false;
  let intervalTimer = null;
  let passivePromise = null;
  let passiveAbortController = null;
  let continuationPromise = null;
  let continuationAbortController = null;
  let mounted = false;
  let disposed = false;
  let ended = false;
  let passiveListenersAttached = false;

  const passiveListenerOptions = { capture: true, passive: true };

  function syncPassiveListeners() {
    if (!eventTarget?.addEventListener || !eventTarget?.removeEventListener) return;
    const shouldAttach = mounted
      && !disposed
      && !ended
      && !expirationSuspended
      && !state.visible
      && !state.continuing;
    if (shouldAttach && !passiveListenersAttached) {
      for (const eventName of REAL_ACTIVITY_EVENTS) {
        eventTarget.addEventListener(eventName, handlePassiveActivity, passiveListenerOptions);
      }
      passiveListenersAttached = true;
    } else if (!shouldAttach && passiveListenersAttached) {
      for (const eventName of REAL_ACTIVITY_EVENTS) {
        eventTarget.removeEventListener(eventName, handlePassiveActivity, { capture: true });
      }
      passiveListenersAttached = false;
    }
  }

  function emit(patch) {
    if (disposed) return;
    state = { ...state, ...patch };
    syncPassiveListeners();
    onStateChange({ ...state });
  }

  function clearClock() {
    if (intervalTimer !== null) {
      clearIntervalFn(intervalTimer);
      intervalTimer = null;
    }
  }

  function suspendExpiration() {
    expirationSuspended = true;
    expirationEpoch += 1;
    const epoch = expirationEpoch;
    clearClock();
    syncPassiveListeners();
    // La espera de red invalida el vencimiento por inactividad anterior, pero
    // nunca pausa el límite absoluto de ocho horas.
    if (!disposed && !ended) {
      intervalTimer = setIntervalFn(() => {
        if (disposed || ended || epoch !== expirationEpoch) return;
        if (timestamp(absoluteExpiresAt, Number.POSITIVE_INFINITY) <= now()) {
          finishSession("SESSION_EXPIRED", { source: "absolute-expiration" });
        }
      }, 1000);
    }
  }

  function expirationCode() {
    return timestamp(absoluteExpiresAt, Number.POSITIVE_INFINITY) <= now()
      ? "SESSION_EXPIRED"
      : "SESSION_INACTIVE";
  }

  function finishSession(code, { basedOnActivityAt = null, source = "server" } = {}) {
    if (disposed || ended) return;
    ended = true;
    suspendExpiration();
    emit({ continuing: false });
    onSessionEnd({
      code,
      source,
      localOnly: ["local-expiration", "absolute-expiration"].includes(source),
      broadcastMetadata: basedOnActivityAt === null ? {} : { basedOnActivityAt },
    });
  }

  function check(epoch = expirationEpoch) {
    if (disposed || ended || expirationSuspended || epoch !== expirationEpoch) return;
    let latestSessionState = null;
    try {
      latestSessionState = readLatestSessionState();
    } catch {
      // BroadcastChannel sigue siendo la ruta principal si storage no existe.
    }
    if (isNewerSessionContinuation(latestSessionState, userId, lastConfirmedActivityAt)) {
      confirmActivity(latestSessionState.activityAt, {
        shouldBroadcast: false,
        cancelPendingContinuation: true,
      });
      return;
    }
    const phase = sessionPhase({
      lastConfirmedActivityAt,
      now: now(),
      warningAfterSeconds,
      idleTimeoutSeconds,
      absoluteExpiresAt,
    });
    if (phase.phase === "expired") {
      finishSession(expirationCode(), {
        basedOnActivityAt: lastConfirmedActivityAt,
        source: "local-expiration",
      });
      return;
    }
    if (phase.phase === "warning") {
      emit({ visible: true, remainingSeconds: phase.remainingSeconds });
    } else if (state.visible || state.remainingSeconds !== 0 || state.error) {
      emit({ visible: false, remainingSeconds: 0, error: "" });
    }
  }

  function startClock() {
    if (disposed || ended) return;
    expirationSuspended = false;
    expirationEpoch += 1;
    const epoch = expirationEpoch;
    clearClock();
    check(epoch);
    if (disposed || ended || expirationSuspended || epoch !== expirationEpoch) return;
    intervalTimer = setIntervalFn(() => check(epoch), 1000);
    syncPassiveListeners();
  }

  function broadcastContinuation(activityAt) {
    const message = safeAuthChannelMessage("session-continued", userId, {
      occurredAt: now(),
      activityAt,
    });
    onSessionContinued(message);
    channel?.postMessage?.(message);
  }

  function confirmActivity(activityAt, {
    shouldBroadcast = true,
    cancelPendingContinuation = false,
  } = {}) {
    if (disposed || ended) return false;
    if (timestamp(absoluteExpiresAt, Number.POSITIVE_INFINITY) <= now()) {
      finishSession("SESSION_EXPIRED", { source: "absolute-expiration" });
      return false;
    }
    const currentTime = now();
    const reportedAt = Number(activityAt);
    const confirmedAt = Math.max(
      lastConfirmedActivityAt,
      Number.isFinite(reportedAt) ? Math.min(reportedAt, currentTime) : currentTime
    );
    lastConfirmedActivityAt = confirmedAt;
    lastSentAt = confirmedAt;
    if (cancelPendingContinuation) {
      continuationAttempt += 1;
      continuationAbortController?.abort();
      continuationAbortController = null;
    }
    emit({ visible: false, remainingSeconds: 0, continuing: false, error: "" });
    startClock();
    if (ended) return false;
    if (shouldBroadcast) broadcastContinuation(confirmedAt);
    return !ended;
  }

  function abortPassiveActivity() {
    passiveAbortController?.abort();
    passiveAbortController = null;
    passivePromise = null;
  }

  function handlePassiveActivity(event) {
    if (disposed || ended || expirationSuspended || state.visible || state.continuing) return false;
    if (!event?.isTrusted || !REAL_ACTIVITY_EVENTS.has(event.type)) return false;
    if (isSessionModalTarget(event.target)) return false;
    const sentAt = now();
    if (sentAt - lastSentAt < activityUpdateSeconds * 1000) return false;
    if (passivePromise) return passivePromise;

    lastSentAt = sentAt;
    const controller = createAbortController();
    passiveAbortController = controller;
    const task = Promise.resolve()
      .then(() => requestActivity({ signal: controller.signal, explicit: false }))
      .then((response) => {
        if (!isSuccessfulHttpResponse(response)) throw new Error("ACTIVITY_RESPONSE_NOT_SUCCESSFUL");
        return confirmActivity(now());
      })
      .catch((error) => {
        if (isConfirmedInvalidSessionError(error)) {
          finishSession(error.response.data.code);
        } else if (!controller.signal?.aborted) {
          lastSentAt = 0;
        }
        return false;
      })
      .finally(() => {
        if (passivePromise === task) passivePromise = null;
        if (passiveAbortController === controller) passiveAbortController = null;
      });
    passivePromise = task;
    return task;
  }

  function continueSession() {
    if (disposed || ended) return Promise.resolve(false);
    if (continuationPromise) return continuationPromise;

    suspendExpiration();
    abortPassiveActivity();
    emit({ visible: true, continuing: true, error: "" });
    const attempt = ++continuationAttempt;
    const controller = createAbortController();
    continuationAbortController = controller;

    const task = Promise.resolve()
      .then(() => requestActivity({ signal: controller.signal, explicit: true }))
      .then((response) => {
        if (disposed || attempt !== continuationAttempt) return false;
        if (!isSuccessfulHttpResponse(response)) throw new Error("ACTIVITY_RESPONSE_NOT_SUCCESSFUL");
        return confirmActivity(now());
      })
      .catch((error) => {
        if (disposed || attempt !== continuationAttempt) return false;
        if (isConfirmedInvalidSessionError(error)) {
          finishSession(error.response.data.code);
          return false;
        }
        emit({
          visible: true,
          continuing: false,
          error: TEMPORARY_ACTIVITY_ERROR,
        });
        // El fallo no confirma actividad. El modal sigue bloqueando la UI para
        // reintentar o cerrar; solo el guard del límite absoluto permanece.
        // En el reintento, backend decide si la inactividad ya es terminal.
        return false;
      })
      .finally(() => {
        if (continuationPromise === task) continuationPromise = null;
        if (continuationAbortController === controller) continuationAbortController = null;
      });
    continuationPromise = task;
    return task;
  }

  function receiveChannelMessage(eventOrMessage) {
    const message = eventOrMessage?.data ?? eventOrMessage;
    if (!isNewerSessionContinuation(message, userId, lastConfirmedActivityAt)) return false;
    return confirmActivity(message.activityAt, {
      shouldBroadcast: false,
      cancelPendingContinuation: true,
    });
  }

  function syncServerActivityAt(value) {
    const serverActivityAt = timestamp(value, null);
    if (serverActivityAt === null || serverActivityAt <= lastConfirmedActivityAt) return false;
    return confirmActivity(serverActivityAt, {
      shouldBroadcast: false,
      cancelPendingContinuation: true,
    });
  }

  function mount() {
    if (mounted || disposed) return;
    mounted = true;
    channel?.addEventListener?.("message", receiveChannelMessage);
    syncPassiveListeners();
    emit({});
    startClock();
  }

  function dispose() {
    if (disposed) return;
    mounted = false;
    expirationEpoch += 1;
    continuationAttempt += 1;
    clearClock();
    abortPassiveActivity();
    continuationAbortController?.abort();
    continuationAbortController = null;
    syncPassiveListeners();
    channel?.removeEventListener?.("message", receiveChannelMessage);
    channel?.close?.();
    disposed = true;
  }

  return {
    checkNow: () => check(expirationEpoch),
    continueSession,
    dispose,
    getExpirationEpoch: () => expirationEpoch,
    getLastConfirmedActivityAt: () => lastConfirmedActivityAt,
    getSnapshot: () => ({ ...state }),
    handlePassiveActivity,
    mount,
    receiveChannelMessage,
    syncServerActivityAt,
  };
}
