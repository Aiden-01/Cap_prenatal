import { useEffect, useState } from "react";

const AUTH_CHANGE_EVENT = "cap-auth-change";

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

  useEffect(() => {
    const syncUsuario = () => setUsuario(readUsuario());

    window.addEventListener(AUTH_CHANGE_EVENT, syncUsuario);
    window.addEventListener("storage", syncUsuario);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUsuario);
      window.removeEventListener("storage", syncUsuario);
    };
  }, []);

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
    notifyAuthChange();
  };

  return { usuario, login, logout, isAdmin: usuario?.rol === "admin" };
}
