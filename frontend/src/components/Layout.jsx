import { Outlet, useNavigate } from "react-router-dom";
import { useState, useEffect, createContext, useContext } from "react";
import Sidebar from "./Sidebar";
import Toast from "./Toast";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";

// Contexto global para toasts
export const ToastContext = createContext(null);
export const useGlobalToast = () => useContext(ToastContext);

export default function Layout() {
  const { usuario, logout } = useAuth();
  const { toasts, toast } = useToast();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Detectar responsive
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <ToastContext.Provider value={toast}>
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

        {/* BOTÓN MENÚ (solo móvil) */}
        {isMobile && (
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              position: "fixed",
              top: 15,
              left: 15,
              zIndex: 200,
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              padding: "0.6rem 0.8rem",
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            ☰
          </button>
        )}

        {/* SIDEBAR */}
        <Sidebar
          usuario={usuario}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          isMobile={isMobile}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />

        {/* CONTENIDO */}
        <main
          style={{
            marginLeft: isMobile ? 0 : (collapsed ? 80 : 260),
            padding: isMobile ? "1rem" : "2rem",
            transition: "margin 0.3s ease",
          }}
        >
          <Outlet />
        </main>

        {/* TOASTS */}
        <Toast toasts={toasts} />
      </div>
    </ToastContext.Provider>
  );
}