import axios from "axios";

const apiHost = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:3001/api`;

const api = axios.create({
  baseURL: apiHost,
  withCredentials: true,
});

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
    if (csrfToken) {
      config.headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);
    }
  }
  return config;
});

// Si el token expira, redirigir al login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("usuario");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
