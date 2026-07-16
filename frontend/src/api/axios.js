import axios from "axios";
import {
  createRefreshCoordinator,
  handleAuthResponseError,
} from "../utils/sessionSecurity";

export const AUTH_SESSION_INVALID_EVENT = "cap-auth-session-invalid";
const apiHost = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: apiHost, withCredentials: true });

function readCookie(name) {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const csrfToken = readCookie("cap_prenatal_csrf");
    if (csrfToken) config.headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);
  }
  return config;
});

const REFRESH_STATE_KEY = "cap_prenatal_refresh_state";

const refreshAccess = createRefreshCoordinator({
  executeRefresh: () => api.post("/auth/refresh", {}, {
    skipAuthRefresh: true,
    skipAuthRedirect: true,
    timeout: 15_000,
  }),
  lockManager: navigator.locks,
  readState: () => localStorage.getItem(REFRESH_STATE_KEY),
  writeState: (state) => localStorage.setItem(REFRESH_STATE_KEY, JSON.stringify(state)),
  createStateId: () => crypto.randomUUID(),
});

function notifyInvalidSession(code) {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALID_EVENT, { detail: { code } }));
}

api.interceptors.response.use(
  (response) => {
    if (String(response.config?.url || "").includes("/auth/login")) {
      try {
        localStorage.removeItem(REFRESH_STATE_KEY);
      } catch {
        // La sesion nueva sigue siendo valida aunque el marcador no este disponible.
      }
    }
    return response;
  },
  (error) => handleAuthResponseError(error, {
    refresh: refreshAccess,
    retry: (config) => api.request(config),
    notifyInvalid: notifyInvalidSession,
  })
);

export { refreshAccess };
export default api;
