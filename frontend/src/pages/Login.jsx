import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Eye,
  EyeOff,
  HeartHandshake,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  TestTube2,
  UserRound,
  Users,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../utils/errorMessage";
import { useFieldErrors } from "../hooks/useFieldErrors";

const FIELD_LABELS = {
  username: "Usuario",
  password: "Contraseña",
};

export default function Login() {
  const [form, setForm]       = useState({ username: "", password: "" });
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    fieldErrors.clearFieldErrors();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      login(data.usuario);
      navigate("/dashboard");
    } catch (err) {
      const parsed = fieldErrors.setErrorsFromResponse(err, "Error al iniciar sesión");
      if (!Object.keys(parsed.errors).length) {
        fieldErrors.setErrorsFromResponse(
          { response: { data: { details: [
            { campo: "username", mensaje: "Revisa tu usuario" },
            { campo: "password", mensaje: "Revisa tu contraseña" },
          ] } } },
          "Error al iniciar sesión"
        );
      }
      setError(getErrorMessage(err, "Error al iniciar sesión"));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      title: "Registro de pacientes",
      text: "Gestiona la información clínica de forma segura y centralizada.",
      icon: Users,
    },
    {
      title: "Seguimiento prenatal",
      text: "Controla citas, controles y evolución del embarazo.",
      icon: CalendarDays,
    },
    {
      title: "Ficha de riesgo obstétrico",
      text: "Identifica y da seguimiento a factores de riesgo materno.",
      icon: ShieldCheck,
    },
    {
      title: "Resultados de laboratorio",
      text: "Consulta e integra resultados de laboratorio clínico.",
      icon: TestTube2,
    },
    {
      title: "Reportes y estadísticas",
      text: "Genera indicadores para la toma de decisiones.",
      icon: BarChart3,
    },
  ];

  return (
    <div className="login-page">

      {/* ── Panel izquierdo (oculto en móvil) ── */}
      <div className="login-panel-left">
        <div className="login-stars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="login-brand">
          <div className="login-brand-row">
            <div className="login-brand-mark">
              <HeartHandshake size={38} />
            </div>
            <div>
              <h1>CAP El Chal</h1>
              <p>
                Sistema de Gestión de Expedientes Clínicos de Atención Prenatal
              </p>
            </div>
          </div>
          <div className="login-brand-rule" />

          <div className="login-dashboard-mock" aria-hidden="true">
            <div className="login-mock-rail">
              <span className="is-active" />
              <span />
              <span />
              <span />
            </div>
            <div className="login-mock-body">
              <div className="login-mock-top">
                <i />
                <i />
                <i />
              </div>
              <div className="login-mock-stats">
                <div>
                  <small>Embarazadas activas</small>
                  <strong>128</strong>
                  <span />
                </div>
                <div>
                  <small>Controles este mes</small>
                  <strong>86</strong>
                  <span />
                </div>
              </div>
              <div className="login-mock-grid">
                <div className="login-mock-list">
                  <small>Próximas citas</small>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="login-mock-risk">
                  <small>Riesgo obstétrico</small>
                  <b>128</b>
                  <span>Bajo · Moderado · Alto</span>
                </div>
              </div>
            </div>
          </div>

          <div className="login-feature-list">
            {features.map(({ title, text, icon: Icon }) => (
              <div key={title} className="login-feature">
                <span>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="login-security-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Datos seguros. Mejor atención.</strong>
              <small>Comprometidos con la salud materna.</small>
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="login-panel-right">
        <div className="login-card">

        {/* Logo visible solo en móvil */}
        <div className="login-mobile-logo">
          <ClipboardList size={32} color="var(--primary)" />
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>CAP El Chal</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Expedientes Prenatales</div>
          </div>
        </div>

        <div className="login-form-title">
          <div className="login-lock-badge">
            <LockKeyhole size={26} />
          </div>
          <h2>Iniciar sesión</h2>
          <p>
            Ingresa tus credenciales para continuar
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="form-group">
            <label className="input-label">Usuario</label>
            <div className="login-icon-input">
              <UserRound size={17} />
              <input
                className={fieldErrors.inputClass("username")}
                name="username"
                type="text"
                placeholder="Ingresa tu usuario"
                value={form.username}
                onChange={(e) => fieldErrors.setFormValue(setForm, "username", e.target.value)}
                required
                autoFocus
              />
            </div>
            {fieldErrors.fieldError("username") && <div className="field-error-text">{fieldErrors.fieldError("username")}</div>}
          </div>

          <div className="form-group">
            <label className="input-label">Contraseña</label>
            <div className="password-field login-icon-input">
              <LockKeyhole size={17} />
              <input
                className={fieldErrors.inputClass("password")}
                name="password"
                type={showPass ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                value={form.password}
                onChange={(e) => fieldErrors.setFormValue(setForm, "password", e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="password-toggle"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.fieldError("password") && <div className="field-error-text">{fieldErrors.fieldError("password")}</div>}
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
            {loading ? "Verificando..." : <><LogIn size={17} /> Ingresar al sistema</>}
          </button>

          <div className="login-restricted">
            <ShieldCheck size={15} />
            <span>Acceso restringido · Solo personal autorizado</span>
          </div>
        </form>
        </div>

        <div className="login-institutional-separator" />

        <p className="login-footnote">
          <span>MINISTERIO DE SALUD PÚBLICA Y ASISTENCIA SOCIAL</span>
          <small>Dirección Departamental de Salud de Petén · Área Sur Oriente</small>
        </p>
      </div>
    </div>
  );
}
