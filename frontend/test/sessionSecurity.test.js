import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createRefreshCoordinator,
  createSingleFlight,
  mayRetryAfterRefresh,
  safeAuthChannelMessage,
  sessionPhase,
  shouldClearForAuthMessage,
} from "../src/utils/sessionSecurity.js";

const ROOT = path.resolve(import.meta.dirname, "..");

function stateAt(seconds) {
  return sessionPhase({
    lastConfirmedActivityAt: 0,
    now: seconds * 1000,
    warningAfterSeconds: 13 * 60,
    idleTimeoutSeconds: 15 * 60,
    absoluteExpiresAt: new Date(8 * 60 * 60 * 1000).toISOString(),
  });
}

test("advierte a los 13 minutos y expira a los 15", () => {
  assert.equal(stateAt(12 * 60).phase, "active");
  assert.deepEqual(stateAt(13 * 60), { phase: "warning", remainingSeconds: 120 });
  assert.deepEqual(stateAt(15 * 60), { phase: "expired", remainingSeconds: 0 });
});

test("el limite absoluto prevalece sobre el temporizador de inactividad", () => {
  const state = sessionPhase({
    lastConfirmedActivityAt: 7_000,
    now: 10_000,
    warningAfterSeconds: 780,
    idleTimeoutSeconds: 900,
    absoluteExpiresAt: new Date(9_000).toISOString(),
  });
  assert.equal(state.phase, "expired");
});

test("el cerrojo comparte una sola renovacion concurrente", async () => {
  let calls = 0;
  let release;
  const locked = createSingleFlight(() => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  });
  const first = locked();
  const second = locked();
  await Promise.resolve();
  assert.equal(first, second);
  assert.equal(calls, 1);
  release("ok");
  assert.equal(await first, "ok");
});

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

test("dos pestanas concurrentes esperan y solo una rota el refresh", async () => {
  const lockManager = createLockManager();
  let sharedState = null;
  let calls = 0;
  let release;
  const executeRefresh = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const options = {
    executeRefresh,
    lockManager,
    readState: () => sharedState,
    writeState: (state) => { sharedState = JSON.stringify(state); },
    createStateId: () => "rotation-1",
  };
  const tabOne = createRefreshCoordinator(options);
  const tabTwo = createRefreshCoordinator(options);

  const first = tabOne();
  await Promise.resolve();
  const second = tabTwo();
  await Promise.resolve();
  assert.equal(calls, 1);
  release("rotated");

  assert.equal(await first, "rotated");
  assert.equal(await second, undefined);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(sharedState).status, "success");
});

test("un fallo de refresh compartido no inicia una segunda rotacion", async () => {
  const lockManager = createLockManager();
  let sharedState = null;
  let calls = 0;
  let rejectRefresh;
  const options = {
    executeRefresh: () => {
      calls += 1;
      return new Promise((_resolve, reject) => { rejectRefresh = reject; });
    },
    lockManager,
    readState: () => sharedState,
    writeState: (state) => { sharedState = JSON.stringify(state); },
    createStateId: () => "rotation-failed",
  };
  const first = createRefreshCoordinator(options)();
  await Promise.resolve();
  const second = createRefreshCoordinator(options)();
  await Promise.resolve();
  rejectRefresh(new Error("network failure"));

  const results = await Promise.allSettled([first, second]);
  assert.deepEqual(results.map(({ status }) => status), ["rejected", "rejected"]);
  assert.equal(calls, 1);
  assert.equal(results[1].reason.code, "AUTHENTICATION_REQUIRED");

  await assert.rejects(createRefreshCoordinator(options)(), (error) => error.code === "AUTHENTICATION_REQUIRED");
  assert.equal(calls, 1);
});

test("solo reintenta una vez cuando el backend confirma que expiro el access token", () => {
  const error = { response: { status: 401, data: { code: "ACCESS_TOKEN_EXPIRED" } } };
  assert.equal(mayRetryAfterRefresh(error, { url: "/pacientes" }), true);
  assert.equal(mayRetryAfterRefresh(error, { url: "/pacientes", _authRetry: true }), false);
  assert.equal(mayRetryAfterRefresh(error, { url: "/auth/refresh" }), false);
  assert.equal(mayRetryAfterRefresh({ response: { status: 401, data: { code: "SESSION_REVOKED" } } }, {}), false);
  assert.equal(mayRetryAfterRefresh({ response: { status: 401, data: {} } }, {}), false);
  assert.equal(mayRetryAfterRefresh({ response: { status: 401, data: { code: "AUTHENTICATION_REQUIRED" } } }, {}), false);
});

test("BroadcastChannel transmite solo tipo e identificador no sensible", () => {
  const message = safeAuthChannelMessage("logout", 17);
  assert.deepEqual(message, { type: "logout", userId: "17" });
  assert.doesNotMatch(JSON.stringify(message), /token|cookie|password|hash/i);
  assert.equal(shouldClearForAuthMessage(message, 17), true);
  assert.equal(shouldClearForAuthMessage({ type: "session-expired", userId: "17" }, 17), true);
  assert.equal(shouldClearForAuthMessage({ type: "login", userId: "17" }, 17), false);
  assert.equal(shouldClearForAuthMessage({ type: "login", userId: "18" }, 17), true);
});

test("revision estatica: no persiste credenciales y el modal es accesible", () => {
  const authSource = fs.readFileSync(path.join(ROOT, "src", "hooks", "useAuth.js"), "utf8");
  const modalSource = fs.readFileSync(path.join(ROOT, "src", "components", "SessionTimeoutModal.jsx"), "utf8");
  const managerSource = fs.readFileSync(path.join(ROOT, "src", "hooks", "useSessionManager.js"), "utf8");
  assert.doesNotMatch(authSource, /setItem\(["'](?:token|accessToken|refreshToken)/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /onKeyDown=/);
  assert.doesNotMatch(managerSource, /setInterval\([^,]*\/auth\/(?:activity|refresh)/s);
  assert.match(managerSource, /new AbortController\(\)/);
  assert.match(managerSource, /activityAbortRef\.current\?\.abort\(\)/);
  assert.match(managerSource, /removeEventListener\(eventName, handleActivity/);
  assert.match(managerSource, /clearInterval\(timer\)/);
  assert.doesNotMatch(modalSource, /Escape/);
  assert.doesNotMatch(modalSource, /modal-backdrop[^>]*onClick=/s);
});
