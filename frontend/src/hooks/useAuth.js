import { useState } from "react";

export function useAuth() {
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(localStorage.getItem("usuario")); }
    catch { return null; }
  });

  const login = (user) => {
    localStorage.removeItem("token");
    localStorage.setItem("usuario", JSON.stringify(user));
    setUsuario(user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
  };

  return { usuario, login, logout, isAdmin: usuario?.rol === "admin" };
}
