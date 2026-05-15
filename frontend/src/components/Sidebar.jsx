import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, UserPlus, BarChart3,
  Settings, X, LogOut, Menu, Moon, Sun
} from "lucide-react";

const NAV = [
  { label: "Inicio", path: "/dashboard", icon: LayoutDashboard, delay: 0 },
  { label: "Pacientes",  path: "/pacientes", icon: Users,           delay: 50 },
  { label: "Nueva",      path: "/nuevo",     icon: UserPlus,        delay: 100 },
  { label: "Reportes",   path: "/reportes",  icon: BarChart3,       delay: 150 },
];

const NAV_ADMIN = [
  { label: "Usuarios", path: "/usuarios", icon: Settings, delay: 200 },
];

// Color fijo del sidebar — no depende del tema, siempre oscuro
const SIDEBAR_BG = "#122033";
const SIDEBAR_BG_ITEM_HOVER = "rgba(255,255,255,0.055)";

export default function Sidebar({
  usuario, menuOpen, setMenuOpen, isMobile,
  onLogout, collapsed, setCollapsed
}) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [dark, setDark]       = useState(localStorage.getItem("theme") === "dark");
  const visible = !isMobile || menuOpen;

  // 🌙 DARK MODE
  useEffect(() => {
    const html = document.documentElement;
    if (dark) {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  const handleNav = (path) => {
    navigate(path);
    if (isMobile) setMenuOpen(false);
  };

  const items = usuario?.rol === "admin"
    ? [...NAV, ...NAV_ADMIN]
    : NAV;

  return (
    <>
      {/* OVERLAY */}
      {isMobile && menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
            zIndex: 90,
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={{
          position: "fixed",
          top: 0, left: 0,
          height: "100%",
          width: collapsed ? 80 : 260,
          // ✅ Color fijo — nunca depende de --text ni de variables del tema
          background: SIDEBAR_BG,
          color: "#fff",
          zIndex: 100,
          transform: isMobile
            ? (menuOpen ? "translateX(0)" : "translateX(-100%)")
            : "translateX(0)",
          transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* HEADER */}
        <div style={{ padding: "1rem 1rem 0.5rem" }}>
          <button
            onClick={() => {
              if (isMobile) setMenuOpen(!menuOpen);
              else setCollapsed(!collapsed);
            }}
            style={{
              background: "transparent", border: "none",
              color: "#fff", cursor: "pointer",
              padding: "0.4rem", borderRadius: 6,
              display: "flex",
            }}
          >
            {isMobile ? <X size={20} /> : <Menu size={20} />}
          </button>

          {!collapsed && (
            <div style={{ marginTop: "0.75rem" }}>
              <h2 style={{
                fontSize: "1rem", fontWeight: 700,
                color: "#fff", margin: 0,
              }}>
                CAP El Chal
              </h2>
              <p style={{ fontSize: "0.75rem", opacity: 0.5, margin: "2px 0 0" }}>
                Expedientes Prenatales
              </p>
            </div>
          )}
        </div>

        {/* NAV */}
        <nav style={{ flex: 1, padding: "0.75rem 0.5rem", overflowY: "auto" }}>
          {items.map(({ label, path, icon: Icon, delay }) => {
            const isActive = location.pathname.startsWith(path);
            return (
              <div key={path} style={{ position: "relative" }}>
                <button
                  onClick={() => handleNav(path)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: collapsed ? "center" : "flex-start",
                    gap: "0.75rem",
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: 8,
                    marginBottom: 4,
                    border: "none",
                    cursor: "pointer",
                    background: isActive
                      ? "var(--primary)"
                      : SIDEBAR_BG_ITEM_HOVER,
                    color: isActive ? "#fff" : "rgba(255,255,255,0.72)",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: "0.9rem",
                    // 🎬 animación
                    opacity: visible ? 1 : 0,
                    transform: visible ? "translateX(0)" : "translateX(-10px)",
                    transition: `opacity 0.3s ease ${delay}ms,
                                 transform 0.3s ease ${delay}ms,
                                 background 0.15s ease,
                                 color 0.15s ease`,
                  }}
                  className="sidebar-item"
                >
                  <Icon size={20} />
                  {!collapsed && <span>{label}</span>}
                </button>

                {/* TOOLTIP cuando collapsed */}
                {collapsed && (
                  <span className="tooltip">{label}</span>
                )}
              </div>
            );
          })}
        </nav>

        {/* FOOTER */}
        <div style={{
          padding: "0.75rem 0.5rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}>
          {/* DARK MODE toggle */}
          <button
            onClick={() => setDark(!dark)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: "0.6rem",
              width: "100%",
              padding: "0.6rem 0.75rem",
              marginBottom: "0.4rem",
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.72)",
              cursor: "pointer",
              borderRadius: 8,
              fontSize: "0.9rem",
            }}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {!collapsed && (dark ? "Modo claro" : "Modo oscuro")}
          </button>

          {/* LOGOUT */}
          <button
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: "0.6rem",
              width: "100%",
              padding: "0.6rem 0.75rem",
              color: "#f87171",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              borderRadius: 8,
              fontSize: "0.9rem",
            }}
          >
            <LogOut size={18} />
            {!collapsed && "Cerrar sesión"}
          </button>
        </div>
      </aside>
    </>
  );
}
