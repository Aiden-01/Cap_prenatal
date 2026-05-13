import axios from "axios";

const apiHost = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:3001/api`;

const api = axios.create({
  baseURL: apiHost,
  withCredentials: true,
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
