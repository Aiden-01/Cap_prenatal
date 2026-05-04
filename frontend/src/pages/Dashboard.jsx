import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ClipboardList, AlertTriangle,
  Baby, CalendarClock, Phone
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

// ─── STAT CARD ───────────────────────────────────────────────
const COLOR_VARIANTS = {
  primary: { icon: "var(--primary)", bg: "var(--primary-lt)" },
  accent:  { icon: "var(--accent)",  bg: "var(--accent-lt)"  },
  danger:  { icon: "var(--danger)",  bg: "var(--danger-lt)"  },
  warn:    { icon: "var(--warn)",    bg: "var(--warn-lt)"    },
};

function StatCard({ label, value, variant = "primary", Icon, onClick, sublabel }) {
  const { icon, bg } = COLOR_VARIANTS[variant];
  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "1.25rem",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = "";
        }
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: bg, display: "grid", placeItems: "center", flexShrink: 0,
      }}>
        <Icon size={22} style={{ color: icon }} />
      </div>
      <div>
        <div style={{
          fontSize: "1.75rem", fontFamily: "Syne, sans-serif",
          fontWeight: 800, color: "var(--text)", lineHeight: 1,
        }}>
          {value ?? "—"}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 4 }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: "0.72rem", color: icon, fontWeight: 600, marginTop: 2 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BADGE DÍAS RESTANTES ────────────────────────────────────
function BadgeDias({ dias }) {
  const urgente = dias <= 7;
  const proximo = dias <= 14;
  const bg    = urgente ? "var(--danger-lt)"  : proximo ? "var(--warn-lt)"  : "var(--primary-lt)";
  const color = urgente ? "var(--danger)"     : proximo ? "var(--warn)"     : "var(--primary)";
  const texto = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `${dias} días`;
  return (
    <span style={{
      padding: "0.2rem 0.6rem", borderRadius: 20,
      background: bg, color, fontSize: "0.75rem", fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {texto}
    </span>
  );
}

// ─── WRAPPER DE SECCIÓN ──────────────────────────────────────
function SeccionTabla({ titulo, badge, badgeVariant = "blue", vacia, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "1rem 1.25rem",
        display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: "0.5rem",
        borderBottom: "1px solid var(--border)",
      }}>
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
          {titulo}
        </h2>
        <span className={`badge badge-${badgeVariant}`}>{badge}</span>
      </div>
      {vacia ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
          {vacia}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>{children}</div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function Dashboard() {
  const [stats,          setStats]          = useState(null);
  const [proximasParir,  setProximasParir]  = useState([]);
  const [sinControl,     setSinControl]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [tabActiva,      setTabActiva]      = useState("citas");

  const { usuario } = useAuth();
  const navigate    = useNavigate();

  useEffect(() => {
    api.get("/reportes/estadisticas")
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([
      api.get("/reportes/proximas-a-parir"),
      api.get("/reportes/sin-control-reciente"),
    ])
      .then(([r1, r2]) => {
        setProximasParir(r1.data);
        setSinControl(r2.data);
      })
      .catch(console.error)
      .finally(() => setLoadingAlertas(false));
  }, []);

  const fmtFecha = (d) => d ? new Date(d).toLocaleDateString("es-GT") : "—";

  const TABS = [
    {
      id: "citas",
      label: `Citas próximas (${stats?.proximas_citas?.length ?? 0})`,
      alert: false,
    },
    {
      id: "parto",
      label: `Próximas al Parto (${proximasParir.length})`,
      alert: proximasParir.some((p) => p.dias_restantes <= 7),
    },
    {
      id: "sincontrol",
      label: `Sin control (${sinControl.length})`,
      alert: sinControl.length > 0,
    },
  ];

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>

      {/* HEADER */}
      <div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
          Dashboard
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: 4, fontSize: "0.9rem" }}>
          Bienvenido/a, {usuario?.nombre_completo}
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando estadísticas...</p>
      ) : (
        <>
          {/* STAT CARDS */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
          }}>
            <StatCard
              label="Total de pacientes"
              value={stats?.total_pacientes}
              variant="primary" Icon={Users}
              onClick={() => navigate("/pacientes")}
            />
            <StatCard
              label="Controles este mes"
              value={stats?.controles_este_mes}
              variant="accent" Icon={ClipboardList}
            />
            <StatCard
              label="Pacientes con riesgo"
              value={stats?.pacientes_con_riesgo}
              variant="danger" Icon={AlertTriangle}
              onClick={() => { setTabActiva("sincontrol"); }}
            />
            <StatCard
              label="Próximas al Parto"
              value={stats?.proximas_a_parir_count ?? proximasParir.length}
              variant="warn" Icon={Baby}
              sublabel="en los próximos 30 días"
              onClick={() => setTabActiva("parto")}
            />
            <StatCard
              label="Sin control reciente"
              value={stats?.sin_control_count ?? sinControl.length}
              variant="danger" Icon={CalendarClock}
              sublabel="más de 4 semanas"
              onClick={() => setTabActiva("sincontrol")}
            />
          </div>

          {/* TABS */}
          <div>
            <div style={{
              display: "flex", gap: "0.25rem",
              borderBottom: "2px solid var(--border)",
              overflowX: "auto",
            }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTabActiva(t.id)} style={{
                  padding: "0.6rem 1.1rem", border: "none", background: "transparent",
                  borderBottom: tabActiva === t.id ? "2px solid var(--primary)" : "2px solid transparent",
                  marginBottom: -2,
                  color: tabActiva === t.id ? "var(--primary)" : "var(--text-muted)",
                  fontFamily: "DM Sans", fontSize: "0.85rem",
                  fontWeight: tabActiva === t.id ? 700 : 400,
                  cursor: "pointer", display: "flex", alignItems: "center",
                  gap: "0.4rem", whiteSpace: "nowrap",
                }}>
                  {t.label}
                  {t.alert && (
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: "var(--danger)", flexShrink: 0,
                    }} />
                  )}
                </button>
              ))}
            </div>

            {/* TAB: CITAS 7 DÍAS */}
            {tabActiva === "citas" && (
              <SeccionTabla
                titulo="Citas en los próximos 7 días"
                badge={`${stats?.proximas_citas?.length ?? 0} pendientes`}
                badgeVariant="blue"
                vacia={!stats?.proximas_citas?.length
                  ? "No hay citas programadas para los próximos 7 días."
                  : null}
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>No. Expediente</th>
                      <th>Control</th>
                      <th>Fecha cita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.proximas_citas?.map((c, i) => (
                      <tr key={i} style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/pacientes/${c.id}`)}>
                        <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                        <td><span className="badge badge-blue">{c.no_expediente}</span></td>
                        <td><span className="badge badge-blue">Control {c.numero_control}</span></td>
                        <td>{fmtFecha(c.cita_siguiente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SeccionTabla>
            )}

            {/* TAB: PRÓXIMAS AL PARTO */}
            {tabActiva === "parto" && (
              <SeccionTabla
                titulo="Próximas al Parto — 30 días"
                badge={`${proximasParir.length} paciente${proximasParir.length !== 1 ? "s" : ""}`}
                badgeVariant={proximasParir.some((p) => p.dias_restantes <= 7) ? "red" : "yellow"}
                vacia={
                  loadingAlertas ? "Cargando..."
                  : !proximasParir.length ? "No hay pacientes con FPP en los próximos 30 días."
                  : null
                }
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>No. Expediente</th>
                      <th>FPP</th>
                      <th>Tiempo restante</th>
                      <th>Último control</th>
                      <th>Comunidad</th>
                      <th>Teléfono</th>
                      <th>Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proximasParir.map((p) => (
                      <tr key={p.id} style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/pacientes/${p.id}`)}>
                        <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                        <td><span className="badge badge-blue">{p.no_expediente}</span></td>
                        <td style={{ fontWeight: 600, color: "var(--accent)" }}>
                          {fmtFecha(p.fpp)}
                        </td>
                        <td><BadgeDias dias={p.dias_restantes} /></td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {p.ultimo_control
                            ? `Control ${p.ultimo_control}`
                            : <span style={{ color: "var(--danger)", fontWeight: 600 }}>Sin controles</span>}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {p.comunidad || "—"}
                        </td>
                        <td>
                          {p.telefono
                            ? <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem" }}>
                                <Phone size={12} style={{ color: "var(--accent)" }} />{p.telefono}
                              </span>
                            : <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>—</span>}
                        </td>
                        <td>
                          {p.tiene_riesgo
                            ? <span className="badge badge-red">⚠ Riesgo</span>
                            : <span className="badge badge-green">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SeccionTabla>
            )}

            {/* TAB: SIN CONTROL RECIENTE */}
            {tabActiva === "sincontrol" && (
              <SeccionTabla
                titulo="Sin control en las últimas 4 semanas"
                badge={`${sinControl.length} paciente${sinControl.length !== 1 ? "s" : ""}`}
                badgeVariant={sinControl.length > 0 ? "red" : "green"}
                vacia={
                  loadingAlertas ? "Cargando..."
                  : !sinControl.length ? "Todas las pacientes tienen controles recientes. ✓"
                  : null
                }
              >
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>No. Expediente</th>
                      <th>Último control</th>
                      <th>Días sin control</th>
                      <th>FPP</th>
                      <th>Comunidad</th>
                      <th>Teléfono</th>
                      <th>Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinControl.map((p) => (
                      <tr key={p.id} style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/pacientes/${p.id}`)}>
                        <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                        <td><span className="badge badge-blue">{p.no_expediente}</span></td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {p.ultimo_control_fecha
                            ? `${fmtFecha(p.ultimo_control_fecha)} (C${p.ultimo_control_numero})`
                            : <span style={{ color: "var(--danger)", fontWeight: 600 }}>Ninguno</span>}
                        </td>
                        <td>
                          <span style={{
                            padding: "0.2rem 0.6rem", borderRadius: 20,
                            fontSize: "0.75rem", fontWeight: 700,
                            background: !p.dias_sin_control || p.dias_sin_control > 56
                              ? "var(--danger-lt)" : "var(--warn-lt)",
                            color: !p.dias_sin_control || p.dias_sin_control > 56
                              ? "var(--danger)" : "var(--warn)",
                          }}>
                            {p.dias_sin_control ? `${p.dias_sin_control} días` : "Sin controles"}
                          </span>
                        </td>
                        <td style={{ color: "var(--accent)", fontWeight: 600, fontSize: "0.85rem" }}>
                          {fmtFecha(p.fpp)}
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {p.comunidad || "—"}
                        </td>
                        <td>
                          {p.telefono
                            ? <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem" }}>
                                <Phone size={12} style={{ color: "var(--accent)" }} />{p.telefono}
                              </span>
                            : <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>—</span>}
                        </td>
                        <td>
                          {p.tiene_riesgo
                            ? <span className="badge badge-red">⚠ Riesgo</span>
                            : <span className="badge badge-green">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SeccionTabla>
            )}
          </div>
        </>
      )}
    </div>
  );
}