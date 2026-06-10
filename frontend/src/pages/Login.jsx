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
    <div className="login-page">

      {/* ── Panel izquierdo (oculto en móvil) ── */}
      <div className="login-panel-left">
        <div className="login-brand">
          <div className="login-brand-mark">
            <Heart size={26} fill="currentColor" />
          </div>
          <h1>CAP El Chal</h1>
          <p>
            Sistema de Gestión de Expedientes Clínicos de Atención Prenatal
          </p>
          <div className="login-feature-list">
            {features.map((item) => (
              <div key={item} className="login-feature">
                <span>
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
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>CAP El Chal</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Expedientes Prenatales</div>
          </div>
        </div>

        <div className="login-form-title">
          <h2>Iniciar sesión</h2>
          <p>
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
            <div className="password-field">
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
                className="password-toggle"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
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

        <p className="login-footnote">
          MINISTERIO DE SALUD PÚBLICA Y ASISTENCIA SOCIAL<br />
          Dirección Departamental de Redes Integradas de Servicios de Salud de Petén, Área Sur Oriente
        </p>
      </div>
    </div>
  );
}
