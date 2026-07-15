import { useCallback, useEffect, useRef, useState } from "react";
import api, { AUTH_SESSION_INVALID_EVENT } from "../api/axios";
import { safeAuthChannelMessage, shouldClearForAuthMessage } from "../utils/sessionSecurity";

const AUTH_CHANGE_EVENT = "cap-auth-change";
const AUTH_CHANNEL_NAME = "cap-prenatal-auth";
const REFRESH_THROTTLE_MS = 1000;
let sharedMePromise = null;
let lastMeAt = 0;
let channel = null;
let pendingNotice = "";

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  return channel;
}

function readUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function clearLocalUsuario(notice = "") {
  localStorage.removeItem("usuario");
  pendingNotice = notice;
  lastMeAt = 0;
  notifyAuthChange();
}

function noticeForCode(code) {
  if (code === "SESSION_INACTIVE") return "La sesión se cerró por inactividad.";
  if (code === "SESSION_EXPIRED") return "La sesión alcanzó su duración máxima. Puedes iniciar sesión nuevamente.";
  if (code === "USER_INACTIVE") return "La cuenta ya no está activa. Contacta al administrador.";
  if (code === "SESSION_REVOKED") return "La sesión fue cerrada por un cambio de seguridad.";
  return "La sesión ya no es válida. Inicia sesión nuevamente.";
}

export function consumeAuthNotice() {
  const notice = pendingNotice;
  pendingNotice = "";
  return notice;
}

export function useAuth() {
  const [usuario, setUsuario] = useState(readUsuario);
  const isRefreshingRef = useRef(false);

  const refreshUsuario = useCallback(async ({ force = false } = {}) => {
    if (!readUsuario()) return null;
    const now = Date.now();
    if (!force && now - lastMeAt < REFRESH_THROTTLE_MS) return readUsuario();
    if (isRefreshingRef.current || sharedMePromise) return sharedMePromise;

    isRefreshingRef.current = true;
    sharedMePromise = api.get("/auth/me")
      .then(({ data }) => {
        lastMeAt = Date.now();
        if (!data) return null;
        localStorage.setItem("usuario", JSON.stringify(data));
        setUsuario(data);
        notifyAuthChange();
        return data;
      })
      .catch(() => null)
      .finally(() => {
        isRefreshingRef.current = false;
        sharedMePromise = null;
      });
    return sharedMePromise;
  }, []);

  useEffect(() => {
    const syncUsuario = () => setUsuario(readUsuario());
    const handleInvalidSession = (event) => {
      const notice = noticeForCode(event.detail?.code);
      clearLocalUsuario(notice);
      getChannel()?.postMessage(safeAuthChannelMessage("session-expired", usuario?.id));
    };
    const handleChannel = (event) => {
      const message = event.data;
      const current = readUsuario();
      if (!shouldClearForAuthMessage(message, current?.id)) return;
      const notice = message.type === "session-expired"
        ? "La sesión se cerró en otra pestaña."
        : message.type === "logout"
          ? "La sesión se cerró en otra pestaña."
          : "Se inició otra cuenta en una pestaña. Ingresa nuevamente aquí.";
      clearLocalUsuario(notice);
    };

    window.addEventListener(AUTH_CHANGE_EVENT, syncUsuario);
    window.addEventListener("storage", syncUsuario);
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);
    getChannel()?.addEventListener("message", handleChannel);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUsuario);
      window.removeEventListener("storage", syncUsuario);
      window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);
      getChannel()?.removeEventListener("message", handleChannel);
    };
  }, [usuario?.id]);

  useEffect(() => {
    if (!readUsuario()) return undefined;
    refreshUsuario({ force: true });
    const handleFocus = () => { if (readUsuario()) refreshUsuario(); };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshUsuario]);

  const login = (user) => {
    localStorage.removeItem("token");
    localStorage.setItem("usuario", JSON.stringify(user));
    pendingNotice = "";
    setUsuario(user);
    notifyAuthChange();
    getChannel()?.postMessage(safeAuthChannelMessage("login", user?.id));
  };

  const logout = ({ reason = "", broadcastType = "logout" } = {}) => {
    localStorage.removeItem("token");
    clearLocalUsuario(reason);
    setUsuario(null);
    getChannel()?.postMessage(safeAuthChannelMessage(broadcastType, usuario?.id));
  };

  return {
    usuario,
    login,
    logout,
    refreshUsuario,
    isAdmin: usuario?.rol === "admin" || usuario?.rol === "director",
  };
}
