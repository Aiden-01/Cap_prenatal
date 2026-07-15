import { Outlet, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Eye, EyeOff, KeyRound, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import Toast from "./Toast";
import ChatbotWidget from "./ChatbotWidget";
import api from "../api/axios";
import { ToastContext } from "../context/ToastContext";
import { ChatbotScreenProvider } from "../context/ChatbotScreenContext";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useFieldErrors } from "../hooks/useFieldErrors";

const PASSWORD_FIELD_LABELS = {
  current_password: "Contraseña actual",
  new_password: "Nueva contraseña",
  confirm_password: "Confirmar nueva contraseña",
};

export default function Layout() {
  const { usuario, logout } = useAuth();
  const { toasts, toast }   = useToast();
  const navigate            = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 768);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const passwordFieldErrors = useFieldErrors(PASSWORD_FIELD_LABELS);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
    api.post("/auth/logout").catch(() => {
      // La sesión local ya quedó cerrada; el servidor puede fallar sin bloquear la UI.
    });
  };

  const resetPasswordForm = () => {
    setShowPasswords(false);
    passwordFieldErrors.clearFieldErrors();
    setPasswordForm({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  };

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setPasswordOpen(false);
    resetPasswordForm();
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      passwordFieldErrors.setErrorsFromResponse(
        { response: { data: { details: [{ campo: "confirm_password", mensaje: "La confirmación no coincide con la nueva contraseña." }] } } },
        "Confirmación inválida"
      );
      toast("La confirmación no coincide con la nueva contraseña", "error");
      return;
    }

    setPasswordLoading(true);
    passwordFieldErrors.clearFieldErrors();
    try {
      await api.post("/auth/cambiar-password", passwordForm, {
        skipAuthRedirect: true,
      });
      toast("Contraseña actualizada correctamente", "success");
      setPasswordOpen(false);
      resetPasswordForm();
    } catch (err) {
      toast(passwordFieldErrors.setErrorsFromResponse(err, "Error al cambiar contraseña").message, "error");
    } finally {
      setPasswordLoading(false);
    }
  };

  const sidebarWidth = isMobile ? 0 : collapsed ? 80 : 260;
  const passwordMismatch = Boolean(
    passwordForm.confirm_password
    && passwordForm.new_password
    && passwordForm.new_password !== passwordForm.confirm_password
  );

  return (
    <ToastContext.Provider value={toast}>
      <ChatbotScreenProvider>
        <div className="app-shell" style={{ minHeight: "100vh" }}>

        {/* Botón hamburguesa — solo móvil */}
        {isMobile && (
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              position: "fixed", top: 14, left: 14, zIndex: 200,
              background: "var(--primary)", color: "#fff",
              border: "none", padding: "0.5rem",
              borderRadius: 8, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <Menu size={22} />
          </button>
        )}

        <Sidebar
          usuario={usuario}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          isMobile={isMobile}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          onChangePassword={() => {
            setPasswordOpen(true);
            if (isMobile) setMenuOpen(false);
          }}
        />

        <main
          className="app-main"
          style={{
            marginLeft: sidebarWidth,
            padding: isMobile ? "3.5rem 1rem 1.5rem" : "2rem",
            transition: "margin 0.3s ease",
            minHeight: "100vh",
          }}
        >
          <Outlet />
        </main>

        <Toast toasts={toasts} />
        <ChatbotWidget key={String(usuario?.id || usuario?.username || "anonymous")} />

        {passwordOpen && (
          <div className="modal-backdrop">
            <div className="card modal-card password-modal">
              <div className="password-modal-header">
                <div className="password-modal-icon">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h2>Cambiar contraseña</h2>
                  <p>Actualiza la contraseña de tu usuario.</p>
                </div>
                <button
                  type="button"
                  className="password-modal-close"
                  onClick={closePasswordModal}
                  disabled={passwordLoading}
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="password-form">
                <div className="form-group">
                  <label className="input-label">Contraseña actual</label>
                  <input
                    className={passwordFieldErrors.inputClass("current_password")}
                    name="current_password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.current_password}
                    onChange={(e) => passwordFieldErrors.setFormValue(setPasswordForm, "current_password", e.target.value)}
                    required
                    autoFocus
                  />
                  {passwordFieldErrors.fieldError("current_password") && (
                    <span className="field-error-text">{passwordFieldErrors.fieldError("current_password")}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="input-label">Nueva contraseña</label>
                  <input
                    className={passwordFieldErrors.inputClass("new_password")}
                    name="new_password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.new_password}
                    onChange={(e) => passwordFieldErrors.setFormValue(setPasswordForm, "new_password", e.target.value)}
                    minLength={6}
                    required
                  />
                  {passwordFieldErrors.fieldError("new_password") && (
                    <span className="field-error-text">{passwordFieldErrors.fieldError("new_password")}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="input-label">Confirmar nueva contraseña</label>
                  <input
                    className={`input-field ${(passwordMismatch || passwordFieldErrors.fieldError("confirm_password")) ? "input-error" : ""}`}
                    name="confirm_password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.confirm_password}
                    onChange={(e) => passwordFieldErrors.setFormValue(setPasswordForm, "confirm_password", e.target.value)}
                    minLength={6}
                    required
                  />
                  {(passwordMismatch || passwordFieldErrors.fieldError("confirm_password")) && (
                    <span className="field-error-text">
                      {passwordFieldErrors.fieldError("confirm_password") || "La confirmación no coincide con la nueva contraseña."}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="password-visibility-toggle"
                  onClick={() => setShowPasswords((value) => !value)}
                >
                  {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showPasswords ? "Ocultar contraseñas" : "Mostrar contraseñas"}
                </button>

                <div className="action-row">
                  <button type="button" className="btn-secondary" onClick={closePasswordModal} disabled={passwordLoading}>
                    Cancelar
                  </button>
                  <button className="btn-primary" disabled={passwordLoading || passwordMismatch}>
                    <KeyRound size={15} />
                    {passwordLoading ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </div>
      </ChatbotScreenProvider>
    </ToastContext.Provider>
  );
}
