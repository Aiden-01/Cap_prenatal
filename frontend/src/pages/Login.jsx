import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Check, Eye, EyeOff } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [form, setForm]       = useState({ username: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      login(data.usuario);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "Registro de pacientes",
    "Seguimiento prenatal",
    "Ficha de riesgo obstétrico",
    "Resultados de laboratorio",
    "Reportes y estadísticas",
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg)" }}>

      {/* ── Panel izquierdo (oculto en móvil) ── */}
      <div className="login-panel-left">
        {/* Círculos decorativos */}
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", top: -100, left: -100 }} />
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", bottom: -50, right: -50 }} />
        <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "rgba(29,111,164,0.15)", top: "40%", left: "10%" }} />

        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <Heart size={52} color="var(--primary)" fill="var(--primary)" />
          </div>
          <h1 style={{ fontFamily: "Syne", color: "#fff", fontSize: "2rem", fontWeight: 800, lineHeight: 1.2 }}>
            CAP El Chal
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "0.75rem", fontSize: "1rem", maxWidth: 280, lineHeight: 1.6 }}>
            Sistema de Gestión de Expedientes Clínicos de Atención Prenatal
          </p>
          <div style={{ marginTop: "2.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left" }}>
            {features.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "rgba(255,255,255,0.65)", fontSize: "0.88rem" }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "var(--primary)", display: "grid",
                  placeItems: "center", flexShrink: 0,
                }}>
                  <Check size={11} color="#fff" strokeWidth={3} />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="login-panel-right">

        {/* Logo visible solo en móvil */}
        <div className="login-mobile-logo">
          <Heart size={32} color="var(--primary)" fill="var(--primary)" />
          <div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>CAP El Chal</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Expedientes Prenatales</div>
          </div>
        </div>

        <div style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "Syne", fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
            Iniciar sesión
          </h2>
          <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", fontSize: "0.9rem" }}>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="form-group">
            <label className="input-label">Usuario</label>
            <input
              className="input-field"
              type="text"
              placeholder="nombre de usuario"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="input-label">Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                className="input-field"
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: "absolute", right: "0.75rem", top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", color: "var(--text-muted)",
                  display: "flex", alignItems: "center",
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: "var(--danger-lt)", border: "1px solid #f5c2c7",
              borderRadius: 8, padding: "0.75rem 1rem",
              color: "var(--danger)", fontSize: "0.875rem",
            }}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ marginTop: "0.5rem", justifyContent: "center", padding: "0.8rem" }}
          >
            {loading ? "Verificando..." : "Ingresar al sistema"}
          </button>
        </form>

        <p style={{ marginTop: "2rem", color: "var(--text-muted)", fontSize: "0.78rem", textAlign: "center", lineHeight: 1.6 }}>
          MINISTERIO DE SALUD PÚBLICA Y ASISTENCIA SOCIAL<br />
          Dirección Departamental de Redes Integradas de Servicios de Salud de Petén, Área Sur Oriente
        </p>
      </div>
    </div>
  );
}
