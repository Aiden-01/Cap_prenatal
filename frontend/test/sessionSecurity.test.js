import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createSessionLifecycle } from "../src/utils/sessionLifecycle.js";
import {
  AUTH_LIFECYCLE_STATE_KEY,
  authLifecycleEndsUser,
  createRefreshCoordinator,
  createSingleFlight,
  handleAuthResponseError,
  isLocalOnlyAuthMessage,
  mayRetryAfterRefresh,
  readAuthLifecycleState,
  recordAuthLifecycleState,
  safeAuthChannelMessage,
  sessionPhase,
  shouldApplyAuthSnapshot,
  shouldClearForAuthMessage,
  shouldRecordAuthLifecycleState,
} from "../src/utils/sessionSecurity.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SECOND = 1000;
const WARNING_SECONDS = 13 * 60;
const IDLE_SECONDS = 15 * 60;
const ABSOLUTE_EXPIRES_AT = 8 * 60 * 60 * SECOND;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createFakeClock(initialNow = 0) {
  let current = initialNow;
  let nextId = 1;
  const intervals = new Map();
  const cleared = [];

  return {
    now: () => current,
    setNow(value) { current = value; },
    advanceBy(value) { current += value; },
    setIntervalFn(callback, delay) {
      const id = nextId;
      nextId += 1;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearIntervalFn(id) {
      cleared.push(id);
      intervals.delete(id);
    },
    runIntervals() {
      for (const [id, task] of [...intervals]) {
        if (intervals.has(id)) task.callback();
      }
    },
    callbacks: () => [...intervals.values()].map(({ callback }) => callback),
    pendingCount: () => intervals.size,
    cleared,
  };
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.added = [];
    this.removed = [];
  }

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    this.added.push({ listener, options, type });
  }

  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener);
    this.removed.push({ listener, options, type });
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener({ type, isTrusted: true, ...event });
    }
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

function createBroadcastBus() {
  const ports = new Set();
  const messages = [];

  function createPort() {
    const listeners = new Set();
    const port = {
      addCount: 0,
      removeCount: 0,
      closeCount: 0,
      closed: false,
      addEventListener(type, listener) {
        if (type !== "message") return;
        this.addCount += 1;
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type !== "message") return;
        this.removeCount += 1;
        listeners.delete(listener);
      },
      postMessage(message) {
        messages.push(message);
        for (const peer of ports) {
          if (peer === port || peer.closed) continue;
          peer.deliver(message);
        }
      },
      deliver(message) {
        for (const listener of [...listeners]) listener({ data: message });
      },
      close() {
        this.closeCount += 1;
        this.closed = true;
        ports.delete(this);
      },
      listenerCount: () => listeners.size,
    };
    ports.add(port);
    return port;
  }

  return { createPort, messages };
}

function invalidSessionError(code) {
  const error = new Error(code);
  error.response = { status: 401, data: { code } };
  return error;
}

function createLifecycleHarness({
  clock = createFakeClock(WARNING_SECONDS * SECOND),
  lastActivityAt = 0,
  absoluteExpiresAt = ABSOLUTE_EXPIRES_AT,
  requestActivity = async () => ({ status: 204 }),
  eventTarget = new FakeEventTarget(),
  channel = null,
  createAbortController,
  readLatestSessionState,
} = {}) {
  const requests = [];
  const states = [];
  const ended = [];
  const lifecycle = createSessionLifecycle({
    userId: 17,
    lastActivityAt: new Date(lastActivityAt).toISOString(),
    absoluteExpiresAt: new Date(absoluteExpiresAt).toISOString(),
    warningAfterSeconds: WARNING_SECONDS,
    idleTimeoutSeconds: IDLE_SECONDS,
    activityUpdateSeconds: 60,
    requestActivity: async (options) => {
      requests.push(options);
      return requestActivity(options);
    },
    onStateChange: (state) => states.push(state),
    onSessionEnd: (event) => ended.push(event),
    eventTarget,
    channel,
    readLatestSessionState,
    now: clock.now,
    setIntervalFn: clock.setIntervalFn,
    clearIntervalFn: clock.clearIntervalFn,
    createAbortController,
  });
  lifecycle.mount();
  return { channel, clock, ended, eventTarget, lifecycle, requests, states };
}

function createLockManager() {
  let held = false;
  const waiters = [];
  const run = (callback, resolve, reject) => {
    held = true;
    Promise.resolve()
      .then(() => callback({ name: "cap-prenatal-refresh" }))
      .then(resolve, reject)
      .finally(() => {
        held = false;
        waiters.shift()?.();
      });
  };
  return {
    request(_name, optionsOrCallback, maybeCallback) {
      const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
      const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
      if (options.ifAvailable && held) return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => {
        const acquire = () => run(callback, resolve, reject);
        if (held) waiters.push(acquire); else acquire();
      });
    },
  };
}

test("politica temporal: advierte a los 13 minutos, expira a los 15 y conserva el limite absoluto", () => {
  const stateAt = (seconds) => sessionPhase({
    lastConfirmedActivityAt: 0,
    now: seconds * SECOND,
    warningAfterSeconds: WARNING_SECONDS,
    idleTimeoutSeconds: IDLE_SECONDS,
    absoluteExpiresAt: new Date(ABSOLUTE_EXPIRES_AT).toISOString(),
  });
  assert.equal(stateAt(12 * 60).phase, "active");
  assert.deepEqual(stateAt(13 * 60), { phase: "warning", remainingSeconds: 120 });
  assert.deepEqual(stateAt(15 * 60), { phase: "expired", remainingSeconds: 0 });
  assert.equal(sessionPhase({
    lastConfirmedActivityAt: 7_000,
    now: 10_000,
    warningAfterSeconds: WARNING_SECONDS,
    idleTimeoutSeconds: IDLE_SECONDS,
    absoluteExpiresAt: new Date(9_000).toISOString(),
  }).phase, "expired");
});

test("single-flight comparte una sola operacion concurrente", async () => {
  const pending = createDeferred();
  let calls = 0;
  const locked = createSingleFlight(() => {
    calls += 1;
    return pending.promise;
  });
  const first = locked();
  const second = locked();
  await flushMicrotasks();
  assert.equal(first, second);
  assert.equal(calls, 1);
  pending.resolve("ok");
  assert.equal(await first, "ok");
});

test("refresh concurrente rota una vez y un fallo transitorio permite un intento posterior", async () => {
  const lockManager = createLockManager();
  const firstAttempt = createDeferred();
  let sharedState = null;
  let calls = 0;
  const options = {
    executeRefresh: () => {
      calls += 1;
      return calls === 1 ? firstAttempt.promise : Promise.resolve("rotated-after-retry");
    },
    lockManager,
    readState: () => sharedState,
    writeState: (state) => { sharedState = JSON.stringify(state); },
    createStateId: () => `rotation-${calls}`,
  };
  const first = createRefreshCoordinator(options)();
  await flushMicrotasks();
  const second = createRefreshCoordinator(options)();
  await flushMicrotasks();
  assert.equal(calls, 1);
  firstAttempt.reject(new Error("network failure"));

  const results = await Promise.allSettled([first, second]);
  assert.deepEqual(results.map(({ status }) => status), ["rejected", "rejected"]);
  assert.equal(results[1].reason.code, "REFRESH_TEMPORARY_FAILURE");
  assert.equal(JSON.parse(sharedState).status, "transient-failed");

  assert.equal(await createRefreshCoordinator(options)(), "rotated-after-retry");
  assert.equal(calls, 2);
  assert.equal(JSON.parse(sharedState).status, "success");
});

test("1. pointerdown del modal no consume ni bloquea la continuacion explicita", async () => {
  const harness = createLifecycleHarness();
  assert.equal(harness.lifecycle.getSnapshot().visible, true);
  assert.equal(harness.eventTarget.listenerCount("pointerdown"), 0);
  const modalTarget = { closest: (selector) => selector === "[data-session-timeout-modal]" ? {} : null };
  harness.eventTarget.dispatch("pointerdown", { target: modalTarget });
  assert.equal(harness.lifecycle.handlePassiveActivity({
    type: "pointerdown",
    isTrusted: true,
    target: modalTarget,
  }), false);
  assert.equal(harness.requests.length, 0);

  assert.equal(await harness.lifecycle.continueSession(), true);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].explicit, true);
});

test("2. POST activity con 204 sin body se considera exitoso", async () => {
  const pending = createDeferred();
  const harness = createLifecycleHarness({ requestActivity: () => pending.promise });
  const continuation = harness.lifecycle.continueSession();
  await flushMicrotasks();
  assert.equal(harness.lifecycle.getSnapshot().continuing, true);
  pending.resolve({ status: 204, data: undefined });
  assert.equal(await continuation, true);
  assert.equal(harness.ended.length, 0);
});

test("3. access expirado provoca un refresh y un unico reintento de activity", async () => {
  const initialError = invalidSessionError("ACCESS_TOKEN_EXPIRED");
  initialError.config = { method: "post", url: "/auth/activity" };
  let activityCalls = 1;
  let refreshCalls = 0;
  const response = await handleAuthResponseError(initialError, {
    refresh: async () => {
      refreshCalls += 1;
      return { status: 204 };
    },
    retry: async (config) => {
      activityCalls += 1;
      assert.equal(config._authRetry, true);
      return { status: 204 };
    },
  });
  assert.equal(response.status, 204);
  assert.equal(refreshCalls, 1);
  assert.equal(activityCalls, 2);
  assert.equal(mayRetryAfterRefresh(initialError, initialError.config), false);

  const retryError = invalidSessionError("ACCESS_TOKEN_EXPIRED");
  retryError.config = initialError.config;
  await assert.rejects(handleAuthResponseError(retryError, {
    refresh: async () => { refreshCalls += 1; },
    retry: async () => { activityCalls += 1; },
  }), retryError);
  assert.equal(refreshCalls, 1);
  assert.equal(activityCalls, 2);
});

test("un timeout temporal de refresh conserva el modal y no anuncia logout", async () => {
  const accessExpired = invalidSessionError("ACCESS_TOKEN_EXPIRED");
  accessExpired.config = { method: "post", url: "/auth/activity", skipAuthRedirect: true };
  let refreshCalls = 0;
  let invalidNotices = 0;
  const harness = createLifecycleHarness({
    requestActivity: () => handleAuthResponseError(accessExpired, {
      refresh: async () => {
        refreshCalls += 1;
        const timeout = new Error("timeout");
        timeout.code = "ECONNABORTED";
        throw timeout;
      },
      retry: async () => ({ status: 204 }),
      notifyInvalid: () => { invalidNotices += 1; },
    }),
  });

  assert.equal(await harness.lifecycle.continueSession(), false);
  assert.equal(refreshCalls, 1);
  assert.equal(invalidNotices, 0);
  assert.equal(harness.ended.length, 0);
  assert.equal(harness.lifecycle.getSnapshot().visible, true);
  assert.match(harness.lifecycle.getSnapshot().error, /No se pudo validar/);
});

test("4. el modal se cierra solamente despues de activity valida", async () => {
  const pending = createDeferred();
  const harness = createLifecycleHarness({ requestActivity: () => pending.promise });
  const continuation = harness.lifecycle.continueSession();
  await flushMicrotasks();
  assert.equal(harness.lifecycle.getSnapshot().visible, true);
  pending.resolve({ status: 200 });
  await continuation;
  assert.deepEqual(harness.lifecycle.getSnapshot(), {
    userId: 17,
    visible: false,
    remainingSeconds: 0,
    continuing: false,
    error: "",
  });
});

test("5. el temporizador anterior queda cancelado e invalidado por epoch", async () => {
  const pending = createDeferred();
  const harness = createLifecycleHarness({ requestActivity: () => pending.promise });
  const staleCallback = harness.clock.callbacks()[0];
  const previousEpoch = harness.lifecycle.getExpirationEpoch();
  const continuation = harness.lifecycle.continueSession();
  await flushMicrotasks();
  assert.ok(harness.lifecycle.getExpirationEpoch() > previousEpoch);
  assert.equal(harness.clock.cleared.length, 1);
  // Permanece un guard nuevo exclusivamente para el limite absoluto.
  assert.equal(harness.clock.pendingCount(), 1);
  harness.clock.setNow(IDLE_SECONDS * SECOND);
  staleCallback();
  assert.equal(harness.ended.length, 0);
  pending.resolve({ status: 204 });
  await continuation;
  staleCallback();
  assert.equal(harness.ended.length, 0);
});

test("6. superar el vencimiento original despues de confirmar no expulsa al usuario", async () => {
  const clock = createFakeClock(IDLE_SECONDS * SECOND - SECOND);
  const pending = createDeferred();
  const harness = createLifecycleHarness({ clock, requestActivity: () => pending.promise });
  const continuation = harness.lifecycle.continueSession();
  await flushMicrotasks();
  clock.setNow(IDLE_SECONDS * SECOND + SECOND);
  pending.resolve({ status: 204 });
  assert.equal(await continuation, true);
  clock.advanceBy(SECOND);
  clock.runIntervals();
  assert.equal(harness.ended.length, 0);
  assert.equal(harness.lifecycle.getSnapshot().visible, false);
});

test("7. el nuevo vencimiento parte de la continuacion y no extiende el limite absoluto", async () => {
  const clock = createFakeClock(WARNING_SECONDS * SECOND);
  const harness = createLifecycleHarness({ clock });
  await harness.lifecycle.continueSession();
  const confirmedAt = harness.lifecycle.getLastConfirmedActivityAt();

  clock.setNow(confirmedAt + WARNING_SECONDS * SECOND - 1);
  harness.lifecycle.checkNow();
  assert.equal(harness.lifecycle.getSnapshot().visible, false);
  clock.setNow(confirmedAt + WARNING_SECONDS * SECOND);
  harness.lifecycle.checkNow();
  assert.equal(harness.lifecycle.getSnapshot().visible, true);
  assert.equal(harness.lifecycle.getSnapshot().remainingSeconds, 120);
  clock.setNow(confirmedAt + IDLE_SECONDS * SECOND);
  harness.lifecycle.checkNow();
  assert.equal(harness.ended.at(-1).code, "SESSION_INACTIVE");

  const absoluteClock = createFakeClock(ABSOLUTE_EXPIRES_AT - SECOND);
  const absoluteHarness = createLifecycleHarness({
    clock: absoluteClock,
    lastActivityAt: absoluteClock.now() - WARNING_SECONDS * SECOND,
  });
  await absoluteHarness.lifecycle.continueSession();
  absoluteClock.setNow(ABSOLUTE_EXPIRES_AT);
  absoluteHarness.lifecycle.checkNow();
  assert.equal(absoluteHarness.ended.at(-1).code, "SESSION_EXPIRED");
});

test("8. doble clic comparte una sola operacion y mantiene el boton en procesamiento", async () => {
  const pending = createDeferred();
  const harness = createLifecycleHarness({ requestActivity: () => pending.promise });
  const first = harness.lifecycle.continueSession();
  const second = harness.lifecycle.continueSession();
  assert.equal(first, second);
  assert.equal(harness.lifecycle.getSnapshot().continuing, true);
  await flushMicrotasks();
  assert.equal(harness.requests.length, 1);
  pending.resolve({ status: 204 });
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test("9. un error temporal mantiene el modal abierto y permite reintentar", async () => {
  let calls = 0;
  const harness = createLifecycleHarness({
    requestActivity: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("network unavailable");
      return { status: 204 };
    },
  });
  assert.equal(await harness.lifecycle.continueSession(), false);
  const failedState = harness.lifecycle.getSnapshot();
  assert.equal(failedState.visible, true);
  assert.equal(failedState.continuing, false);
  assert.match(failedState.error, /No se pudo validar/);
  assert.equal(harness.ended.length, 0);
  assert.equal(await harness.lifecycle.continueSession(), true);
  assert.equal(calls, 2);
});

test("un error temporal posterior al deadline conserva el modal sin renovar localmente", async () => {
  const clock = createFakeClock(IDLE_SECONDS * SECOND - 10 * SECOND);
  const pending = createDeferred();
  const harness = createLifecycleHarness({
    clock,
    requestActivity: () => pending.promise,
  });
  const continuation = harness.lifecycle.continueSession();
  await flushMicrotasks();

  clock.setNow(IDLE_SECONDS * SECOND + 5 * SECOND);
  clock.runIntervals();
  assert.equal(harness.ended.length, 0);
  pending.reject(new TypeError("network timeout"));
  assert.equal(await continuation, false);

  assert.equal(harness.ended.length, 0);
  assert.equal(harness.lifecycle.getSnapshot().visible, true);
  assert.equal(harness.lifecycle.getSnapshot().continuing, false);
  assert.match(harness.lifecycle.getSnapshot().error, /No se pudo validar/);
  assert.equal(harness.lifecycle.getLastConfirmedActivityAt(), 0);
});

test("10. SESSION_INACTIVE y SESSION_EXPIRED si terminan la sesion", async () => {
  for (const code of ["SESSION_INACTIVE", "SESSION_EXPIRED"]) {
    const harness = createLifecycleHarness({
      requestActivity: async () => { throw invalidSessionError(code); },
    });
    assert.equal(await harness.lifecycle.continueSession(), false);
    assert.equal(harness.ended.length, 1);
    assert.equal(harness.ended[0].code, code);
  }
});

test("11. continuar en una pestana cancela la expiracion pendiente en otra", async () => {
  const clock = createFakeClock(WARNING_SECONDS * SECOND);
  const bus = createBroadcastBus();
  const tabOne = createLifecycleHarness({ clock, channel: bus.createPort() });
  const tabTwo = createLifecycleHarness({ clock, channel: bus.createPort() });
  assert.equal(tabOne.lifecycle.getSnapshot().visible, true);
  assert.equal(tabTwo.lifecycle.getSnapshot().visible, true);

  assert.equal(await tabOne.lifecycle.continueSession(), true);
  assert.equal(bus.messages.at(-1).type, "session-continued");
  assert.equal(tabTwo.lifecycle.getSnapshot().visible, false);
  assert.equal(tabTwo.lifecycle.getLastConfirmedActivityAt(), clock.now());

  clock.setNow(IDLE_SECONDS * SECOND + SECOND);
  clock.runIntervals();
  assert.equal(tabOne.ended.length, 0);
  assert.equal(tabTwo.ended.length, 0);
});

test("una continuacion persistida gana aunque storage llegue antes que BroadcastChannel", () => {
  const clock = createFakeClock(WARNING_SECONDS * SECOND);
  let latestState = null;
  const harness = createLifecycleHarness({
    clock,
    readLatestSessionState: () => latestState,
  });
  assert.equal(harness.lifecycle.getSnapshot().visible, true);

  latestState = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: clock.now(),
    activityAt: clock.now(),
  });
  clock.setNow(IDLE_SECONDS * SECOND + SECOND);
  clock.runIntervals();

  assert.equal(harness.ended.length, 0);
  assert.equal(harness.lifecycle.getSnapshot().visible, false);
  assert.equal(harness.lifecycle.getLastConfirmedActivityAt(), latestState.activityAt);
});

test("12. una expiracion antigua no prevalece sobre una continuacion mas reciente", () => {
  const continuation = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: 2_000,
    activityAt: 2_000,
  });
  const oldExpiration = safeAuthChannelMessage("session-expired", 17, {
    occurredAt: 3_000,
    basedOnActivityAt: 1_000,
  });
  assert.equal(shouldClearForAuthMessage(oldExpiration, 17, {
    lastConfirmedActivityAt: continuation.activityAt,
  }), false);
  assert.equal(shouldClearForAuthMessage(safeAuthChannelMessage("logout", 17, {
    occurredAt: 1_000,
  }), 17, {
    lastConfirmedActivityAt: continuation.activityAt,
  }), true);
});

test("el marcador causal conserva continuaciones nuevas y bloquea sesiones realmente terminadas", () => {
  const storage = createMemoryStorage();
  const continuation = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: 2_000,
    activityAt: 2_000,
  });
  recordAuthLifecycleState(continuation, storage);

  const staleExpiration = safeAuthChannelMessage("session-expired", 17, {
    occurredAt: 3_000,
    basedOnActivityAt: 1_000,
  });
  recordAuthLifecycleState(staleExpiration, storage);
  assert.deepEqual(readAuthLifecycleState(storage), continuation);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), false);

  const applicableExpiration = safeAuthChannelMessage("session-expired", 17, {
    occurredAt: 4_000,
    basedOnActivityAt: 2_000,
  });
  recordAuthLifecycleState(applicableExpiration, storage);
  assert.deepEqual(readAuthLifecycleState(storage), applicableExpiration);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), true);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 18), false);

  const login = safeAuthChannelMessage("login", 17, { occurredAt: 5_000 });
  recordAuthLifecycleState(login, storage);
  assert.deepEqual(readAuthLifecycleState(storage), login);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), false);
  assert.ok(storage.values.has(AUTH_LIFECYCLE_STATE_KEY));

  const lateOldExpiration = safeAuthChannelMessage("session-expired", 17, {
    occurredAt: 6_000,
    basedOnActivityAt: 1_000,
  });
  assert.equal(shouldRecordAuthLifecycleState(login, lateOldExpiration), false);
  assert.equal(shouldRecordAuthLifecycleState(login, safeAuthChannelMessage(
    "session-expired",
    17,
    { occurredAt: 6_000, basedOnActivityAt: 5_000 }
  )), true);
  recordAuthLifecycleState(lateOldExpiration, storage);
  assert.deepEqual(readAuthLifecycleState(storage), login);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), false);

  // Una pestaÃ±a nueva puede tener metadata de usuario atrasada. La decisiÃ³n
  // causal del marcador se evalÃºa antes que ese ref y evita el cierre local.
  const newerContinuation = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: 7_000,
    activityAt: 7_000,
  });
  recordAuthLifecycleState(newerContinuation, storage);
  assert.deepEqual(readAuthLifecycleState(storage), newerContinuation);
  const delayedOldLogin = safeAuthChannelMessage("login", 17, {
    occurredAt: 8_000,
    activityAt: 5_000,
  });
  const genuinelyNewLogin = safeAuthChannelMessage("login", 17, {
    occurredAt: 9_000,
    activityAt: 9_000,
  });
  assert.equal(shouldRecordAuthLifecycleState(newerContinuation, delayedOldLogin), false);
  assert.equal(shouldRecordAuthLifecycleState(newerContinuation, genuinelyNewLogin), true);
  assert.equal(shouldClearForAuthMessage(staleExpiration, 17, {
    lastConfirmedActivityAt: 0,
  }), true);
  assert.equal(
    shouldRecordAuthLifecycleState(readAuthLifecycleState(storage), staleExpiration)
      && shouldClearForAuthMessage(staleExpiration, 17, { lastConfirmedActivityAt: 0 }),
    false
  );

  assert.equal(isLocalOnlyAuthMessage(staleExpiration), true);
  assert.equal(isLocalOnlyAuthMessage(login), true);
  assert.equal(isLocalOnlyAuthMessage(safeAuthChannelMessage("logout", 17)), false);
  assert.equal(isLocalOnlyAuthMessage(safeAuthChannelMessage("session-expired", 17)), false);
});

test("storage repara una expiracion vieja usando la actividad confirmada de la pestana", () => {
  const storage = createMemoryStorage();
  recordAuthLifecycleState(safeAuthChannelMessage("login", 17, {
    occurredAt: 500,
    activityAt: 500,
  }), storage);
  const staleExpiration = safeAuthChannelMessage("session-expired", 17, {
    occurredAt: 8_000,
    basedOnActivityAt: 1_000,
  });
  recordAuthLifecycleState(staleExpiration, storage);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), true);
  assert.equal(shouldClearForAuthMessage(staleExpiration, 17, {
    lastConfirmedActivityAt: 7_000,
  }), false);

  const repair = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: 8_001,
    activityAt: 7_000,
  });
  recordAuthLifecycleState(repair, storage);
  assert.deepEqual(readAuthLifecycleState(storage), repair);
  assert.equal(authLifecycleEndsUser(readAuthLifecycleState(storage), 17), false);
});

test("login confirmado fuerza un nuevo baseline y respuestas /me viejas no se aplican", () => {
  const storage = createMemoryStorage();
  const logout = safeAuthChannelMessage("logout", 17, { occurredAt: 10_000 });
  const skewedNewLogin = safeAuthChannelMessage("login", 17, {
    occurredAt: 11_000,
    activityAt: 9_000,
  });
  recordAuthLifecycleState(logout, storage);
  recordAuthLifecycleState(skewedNewLogin, storage);
  assert.deepEqual(readAuthLifecycleState(storage), logout);
  recordAuthLifecycleState(skewedNewLogin, storage, { force: true });
  assert.deepEqual(readAuthLifecycleState(storage), skewedNewLogin);

  assert.equal(shouldApplyAuthSnapshot({
    startedGeneration: 4,
    currentGeneration: 4,
    startedUserId: 17,
    currentUserId: 17,
  }), true);
  assert.equal(shouldApplyAuthSnapshot({
    startedGeneration: 4,
    currentGeneration: 5,
    startedUserId: 17,
    currentUserId: 17,
  }), false);
  assert.equal(shouldApplyAuthSnapshot({
    startedGeneration: 4,
    currentGeneration: 4,
    startedUserId: 17,
    currentUserId: 18,
  }), false);
  assert.equal(shouldApplyAuthSnapshot({
    startedGeneration: 4,
    currentGeneration: 4,
    startedUserId: 17,
    currentUserId: 17,
    tabSessionEnded: true,
  }), false);
});

test("13. desmontar elimina listeners, timers, canal y peticiones pendientes", async () => {
  const clock = createFakeClock(61 * SECOND);
  const eventTarget = new FakeEventTarget();
  const bus = createBroadcastBus();
  const channel = bus.createPort();
  const pending = createDeferred();
  const controllers = [];
  const harness = createLifecycleHarness({
    clock,
    eventTarget,
    channel,
    requestActivity: () => pending.promise,
    createAbortController: () => {
      const controller = new AbortController();
      controllers.push(controller);
      return controller;
    },
  });
  assert.equal(clock.pendingCount(), 1);
  assert.equal(channel.listenerCount(), 1);
  for (const type of ["keydown", "pointerdown", "touchstart", "wheel"]) {
    assert.equal(eventTarget.listenerCount(type), 1);
  }
  eventTarget.dispatch("pointerdown");
  await flushMicrotasks();
  assert.equal(harness.requests.length, 1);

  harness.lifecycle.dispose();
  assert.equal(clock.pendingCount(), 0);
  assert.equal(channel.listenerCount(), 0);
  assert.equal(channel.removeCount, 1);
  assert.equal(channel.closeCount, 1);
  assert.equal(controllers[0].signal.aborted, true);
  for (const type of ["keydown", "pointerdown", "touchstart", "wheel"]) {
    assert.equal(eventTarget.listenerCount(type), 0);
  }
  eventTarget.dispatch("pointerdown");
  assert.equal(harness.requests.length, 1);
  pending.resolve({ status: 204 });
});

test("14. storage y BroadcastChannel no reciben tokens ni credenciales", async () => {
  const storage = new Map();
  const coordinator = createRefreshCoordinator({
    executeRefresh: async () => ({ status: 204 }),
    readState: () => storage.get("cap_prenatal_refresh_state") || null,
    writeState: (state) => storage.set("cap_prenatal_refresh_state", JSON.stringify(state)),
    createStateId: () => "safe-state-id",
  });
  await coordinator();
  const channelMessage = safeAuthChannelMessage("session-continued", 17, {
    occurredAt: 2_000,
    activityAt: 2_000,
    accessToken: "forbidden-access",
    refreshToken: "forbidden-refresh",
    usuario: { id: 17 },
    permisos: ["admin"],
  });
  const serialized = JSON.stringify({ storage: [...storage], channelMessage });
  assert.deepEqual(channelMessage, {
    type: "session-continued",
    userId: "17",
    occurredAt: 2_000,
    activityAt: 2_000,
  });
  assert.doesNotMatch(serialized, /forbidden-access|forbidden-refresh|accessToken|refreshToken|cookie|password/i);

  const sources = [
    "src/hooks/useAuth.js",
    "src/api/axios.js",
    "src/utils/sessionLifecycle.js",
    "src/utils/sessionSecurity.js",
  ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /(?:localStorage|sessionStorage)\.setItem\(["'](?:token|accessToken|refreshToken)/);
});

test("contratos de integracion: modal accesible y hook delegado al ciclo probado", () => {
  const modalSource = fs.readFileSync(path.join(ROOT, "src", "components", "SessionTimeoutModal.jsx"), "utf8");
  const managerSource = fs.readFileSync(path.join(ROOT, "src", "hooks", "useSessionManager.js"), "utf8");
  const axiosSource = fs.readFileSync(path.join(ROOT, "src", "api", "axios.js"), "utf8");
  const authSource = fs.readFileSync(path.join(ROOT, "src", "hooks", "useAuth.js"), "utf8");
  assert.match(modalSource, /data-session-timeout-modal/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /role="alert"/);
  assert.match(modalSource, /disabled=\{continuing\}/);
  assert.match(modalSource, /aria-busy=\{continuing\}/);
  assert.doesNotMatch(modalSource, /Escape/);
  assert.doesNotMatch(modalSource, /modal-backdrop[^>]*onClick=/s);
  assert.match(managerSource, /createSessionLifecycle/);
  assert.match(managerSource, /lifecycle\.dispose\(\)/);
  assert.match(axiosSource, /\/auth\/refresh[\s\S]*timeout: 15_000/);
  assert.match(authSource, /api\.get\("\/auth\/me", \{ signal: controller\.signal \}\)/);
  assert.match(authSource, /shouldApplyAuthSnapshot/);
  assert.match(authSource, /event\.key !== AUTH_LIFECYCLE_STATE_KEY/);
  assert.match(authSource, /message\?\.type === "login"[\s\S]*invalidateForRemoteLogin\(message\)/);
});
