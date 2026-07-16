import { useCallback, useEffect, useRef, useState } from "react";
import api, { AUTH_SESSION_INVALID_EVENT } from "../api/axios";
import {
  AUTH_CHANNEL_NAME,
  AUTH_LIFECYCLE_STATE_KEY,
  authLifecycleEndsUser,
  authLifecycleStateMatchesMessage,
  isNewerSessionContinuation,
  isLocalOnlyAuthMessage,
  readAuthLifecycleState,
  recordAuthLifecycleState,
  safeAuthChannelMessage,
  sessionNoticeForCode,
  shouldApplyAuthSnapshot,
  shouldRecordAuthLifecycleState,
  shouldClearForAuthMessage,
} from "../utils/sessionSecurity";

const AUTH_CHANGE_EVENT = "cap-auth-change";
const TAB_SESSION_ENDED_KEY = "cap_prenatal_tab_session_ended";
const REFRESH_THROTTLE_MS = 1000;
let sharedMePromise = null;
let sharedMeAbortController = null;
let lastMeAt = 0;
let channel = null;
let pendingNotice = "";
let authGeneration = 0;
let lastRemoteLoginSignal = "";

function advanceAuthGeneration() {
  authGeneration += 1;
  sharedMeAbortController?.abort();
  sharedMeAbortController = null;
  sharedMePromise = null;
  lastMeAt = 0;
}

function invalidateForRemoteLogin(message) {
  const signal = `${message?.userId ?? ""}:${message?.activityAt ?? ""}:${message?.occurredAt ?? ""}`;
  if (!signal || signal === lastRemoteLoginSignal) return;
  lastRemoteLoginSignal = signal;
  advanceAuthGeneration();
}

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  return channel;
}

function readStoredUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

function readUsuario() {
  try {
    if (sessionStorage.getItem(TAB_SESSION_ENDED_KEY) === "true") return null;
    const stored = readStoredUsuario();
    if (authLifecycleEndsUser(readAuthLifecycleState(), stored?.id)) return null;
    return stored;
  } catch {
    return null;
  }
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function clearLocalUsuario(notice = "", { localOnly = false } = {}) {
  advanceAuthGeneration();
  if (localOnly) {
    sessionStorage.setItem(TAB_SESSION_ENDED_KEY, "true");
  } else {
    localStorage.removeItem("usuario");
    sessionStorage.removeItem(TAB_SESSION_ENDED_KEY);
  }
  pendingNotice = notice;
  lastMeAt = 0;
  notifyAuthChange();
}

function activityTimestamp(lastActivityAt) {
  const value = new Date(lastActivityAt || "").getTime();
  return Number.isFinite(value) ? value : 0;
}

function confirmedActivityTimestamp(user) {
  const storedActivity = activityTimestamp(user?.lastActivityAt);
  const lifecycle = readAuthLifecycleState();
  if (String(lifecycle?.userId || "") !== String(user?.id || "")) {
    return storedActivity;
  }
  if (!["login", "session-continued"].includes(lifecycle?.type)) {
    return storedActivity;
  }
  return Math.max(storedActivity, Number(lifecycle.activityAt) || 0);
}

export function consumeAuthNotice() {
  const notice = pendingNotice;
  pendingNotice = "";
  return notice;
}

export function useAuth() {
  const [usuario, setUsuario] = useState(readUsuario);
  const activityIdentityRef = useRef(readUsuario()?.id ?? null);
  const lastConfirmedActivityRef = useRef(confirmedActivityTimestamp(readUsuario()));
  const usuarioId = usuario?.id;
  const usuarioLastActivityAt = usuario?.lastActivityAt;

  useEffect(() => {
    if (String(activityIdentityRef.current ?? "") !== String(usuarioId ?? "")) {
      activityIdentityRef.current = usuarioId ?? null;
      lastConfirmedActivityRef.current = confirmedActivityTimestamp(usuario);
    } else {
      lastConfirmedActivityRef.current = Math.max(
        lastConfirmedActivityRef.current,
        activityTimestamp(usuarioLastActivityAt)
      );
    }
  }, [usuario, usuarioId, usuarioLastActivityAt]);

  const refreshUsuario = useCallback(async ({ force = false } = {}) => {
    const startedUser = readUsuario();
    if (!startedUser?.id) return null;
    const now = Date.now();
    if (!force && now - lastMeAt < REFRESH_THROTTLE_MS) return readUsuario();
    if (sharedMePromise) return sharedMePromise;

    const startedGeneration = authGeneration;
    const controller = new AbortController();
    sharedMeAbortController = controller;
    const request = api.get("/auth/me", { signal: controller.signal })
      .then(({ data }) => {
        if (!data) return null;
        const currentUser = readUsuario();
        if (!shouldApplyAuthSnapshot({
          startedGeneration,
          currentGeneration: authGeneration,
          startedUserId: startedUser.id,
          currentUserId: currentUser?.id,
          tabSessionEnded: sessionStorage.getItem(TAB_SESSION_ENDED_KEY) === "true",
        })) return null;
        lastMeAt = Date.now();
        localStorage.setItem("usuario", JSON.stringify(data));
        setUsuario(data);
        notifyAuthChange();
        return data;
      })
      .catch(() => null)
      .finally(() => {
        if (sharedMePromise === request) sharedMePromise = null;
        if (sharedMeAbortController === controller) sharedMeAbortController = null;
      });
    sharedMePromise = request;
    return request;
  }, []);

  useEffect(() => {
    const syncUsuario = () => {
      const nextUser = readUsuario();
      if (String(nextUser?.id || "") !== String(usuario?.id || "")) {
        advanceAuthGeneration();
      }
      setUsuario(nextUser);
    };
    const handleInvalidSession = (event) => {
      const notice = sessionNoticeForCode(event.detail?.code);
      const message = safeAuthChannelMessage("session-expired", usuario?.id);
      recordAuthLifecycleState(message, null, { force: true });
      clearLocalUsuario(notice);
      getChannel()?.postMessage(message);
    };

    const handleAuthMessage = (message, { alreadyStored = false } = {}) => {
      const tabSessionEnded = sessionStorage.getItem(TAB_SESSION_ENDED_KEY) === "true";
      const current = tabSessionEnded ? null : (usuario || readStoredUsuario());
      const storedLifecycle = readAuthLifecycleState();

      const causalExpirationIsStale = message?.type === "session-expired"
        && Number.isFinite(message.basedOnActivityAt)
        && current?.id !== null
        && current?.id !== undefined
        && String(message.userId || "") === String(current?.id || "")
        && message.basedOnActivityAt < lastConfirmedActivityRef.current;
      if (causalExpirationIsStale) {
        if (alreadyStored && authLifecycleStateMatchesMessage(storedLifecycle, message)) {
          recordAuthLifecycleState(safeAuthChannelMessage(
            "session-continued",
            current.id,
            { activityAt: lastConfirmedActivityRef.current }
          ));
        }
        return;
      }

      if (alreadyStored) {
        if (!authLifecycleStateMatchesMessage(storedLifecycle, message)) return;
      } else {
        const shouldRecord = shouldRecordAuthLifecycleState(storedLifecycle, message);
        if (!shouldRecord && !authLifecycleStateMatchesMessage(storedLifecycle, message)) return;
        if (shouldRecord) recordAuthLifecycleState(message);
      }

      if (message?.type === "login") invalidateForRemoteLogin(message);

      if (isNewerSessionContinuation(
        message,
        current?.id,
        lastConfirmedActivityRef.current
      )) {
        lastConfirmedActivityRef.current = message.activityAt;
        if (!usuario && current) setUsuario(current);
        return;
      }
      if (!shouldClearForAuthMessage(message, current?.id, {
        lastConfirmedActivityAt: lastConfirmedActivityRef.current,
      })) return;
      const notice = message.type === "session-expired"
        ? "La sesión se cerró en otra pestaña."
        : message.type === "logout"
          ? "La sesión se cerró en otra pestaña."
          : "Se inició otra cuenta en una pestaña. Ingresa nuevamente aquí.";
      clearLocalUsuario(notice, {
        localOnly: isLocalOnlyAuthMessage(message),
      });
    };
    const handleChannel = (event) => handleAuthMessage(event.data);
    const handleStorage = (event) => {
      if (event.key !== AUTH_LIFECYCLE_STATE_KEY) {
        syncUsuario();
        return;
      }
      try {
        const message = event.newValue ? JSON.parse(event.newValue) : null;
        if (message) handleAuthMessage(message, { alreadyStored: true });
      } catch {
        // Un valor de storage malformado no cambia el estado autenticado.
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT, syncUsuario);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);
    getChannel()?.addEventListener("message", handleChannel);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUsuario);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);
      getChannel()?.removeEventListener("message", handleChannel);
    };
  }, [usuario]);

  useEffect(() => {
    if (!readUsuario()) return undefined;
    refreshUsuario({ force: true });
    const handleFocus = () => { if (readUsuario()) refreshUsuario(); };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshUsuario, usuarioId]);

  const login = (user) => {
    advanceAuthGeneration();
    localStorage.removeItem("token");
    sessionStorage.removeItem(TAB_SESSION_ENDED_KEY);
    const message = safeAuthChannelMessage("login", user?.id, {
      activityAt: activityTimestamp(user?.lastActivityAt) || Date.now(),
    });
    recordAuthLifecycleState(message, null, { force: true });
    localStorage.setItem("usuario", JSON.stringify(user));
    activityIdentityRef.current = user?.id ?? null;
    lastConfirmedActivityRef.current = confirmedActivityTimestamp(user);
    pendingNotice = "";
    setUsuario(user);
    notifyAuthChange();
    getChannel()?.postMessage(message);
  };

  const logout = ({
    reason = "",
    broadcastType = "logout",
    broadcastMetadata = {},
    localOnly = false,
  } = {}) => {
    localStorage.removeItem("token");
    const message = safeAuthChannelMessage(
      broadcastType,
      usuario?.id,
      broadcastMetadata
    );
    const forceTerminalState = broadcastType === "logout"
      || (broadcastType === "session-expired"
        && !Number.isFinite(message.basedOnActivityAt));
    recordAuthLifecycleState(message, null, { force: forceTerminalState });
    clearLocalUsuario(reason, { localOnly });
    setUsuario(null);
    getChannel()?.postMessage(message);
  };

  return {
    usuario,
    login,
    logout,
    refreshUsuario,
    isAdmin: usuario?.rol === "admin" || usuario?.rol === "director",
  };
}
