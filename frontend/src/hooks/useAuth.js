import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";

const AUTH_CHANGE_EVENT = "cap-auth-change";
const REFRESH_THROTTLE_MS = 1000;

let sharedRefreshPromise = null;
let lastRefreshAt = 0;

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

export function useAuth() {
  const [usuario, setUsuario] = useState(readUsuario);
  const isRefreshingRef = useRef(false);

  const refreshUsuario = useCallback(async ({ force = false } = {}) => {
    if (!readUsuario()) return null;

    const now = Date.now();
    if (!force && now - lastRefreshAt < REFRESH_THROTTLE_MS) {
      return readUsuario();
    }

    if (isRefreshingRef.current) return sharedRefreshPromise;
    if (sharedRefreshPromise) return sharedRefreshPromise;

    isRefreshingRef.current = true;
    sharedRefreshPromise = api.get("/auth/me", { skipAuthRedirect: true })
      .then(({ data }) => {
        lastRefreshAt = Date.now();
        if (!data) return null;

        localStorage.setItem("usuario", JSON.stringify(data));
        setUsuario(data);
        notifyAuthChange();
        return data;
      })
      .catch(() => null)
      .finally(() => {
        isRefreshingRef.current = false;
        sharedRefreshPromise = null;
      });

    return sharedRefreshPromise;
  }, []);

  useEffect(() => {
    const syncUsuario = () => {
      const currentUsuario = readUsuario();
      setUsuario(currentUsuario);
      if (!currentUsuario) {
        lastRefreshAt = 0;
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT, syncUsuario);
    window.addEventListener("storage", syncUsuario);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUsuario);
      window.removeEventListener("storage", syncUsuario);
    };
  }, []);

  useEffect(() => {
    if (!readUsuario()) return undefined;

    refreshUsuario({ force: true });

    const handleFocus = () => {
      if (readUsuario()) {
        refreshUsuario();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshUsuario]);

  const login = (user) => {
    localStorage.removeItem("token");
    localStorage.setItem("usuario", JSON.stringify(user));
    setUsuario(user);
    notifyAuthChange();
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
    lastRefreshAt = 0;
    notifyAuthChange();
  };

  return {
    usuario,
    login,
    logout,
    refreshUsuario,
    isAdmin: usuario?.rol === "admin" || usuario?.rol === "director",
  };
}
