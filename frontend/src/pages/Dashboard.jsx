import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ClipboardList, AlertTriangle,
  Baby, Phone
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

const COLOR_VARIANTS = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  muted: "var(--text-muted)",
};

const MS_DAY = 86400000;

function StatCard({ label, value, variant = "primary", Icon, onClick, sublabel }) {
  const isEmpty = Number(value ?? 0) === 0;
  const icon = COLOR_VARIANTS[isEmpty ? "muted" : variant];

  return (
    <div
      className="card"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1.25rem",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s, box-shadow 0.15s",
        minWidth: 0,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = "var(--shadow-md)";
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
        width: 52,
        height: 52,
        borderRadius: 10,
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}>
        <Icon size={22} style={{ color: icon }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: "1.75rem",
          fontFamily: "Syne, sans-serif",
          fontWeight: 800,
          color: "var(--text)",
          lineHeight: 1,
        }}>
          {value ?? "—"}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
    </div>
  );
}

function PatientName({ children }) {
  return (
    <span
      title={children || ""}
      style={{
        display: "block",
        maxWidth: 220,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 500,
      }}>
      {children}
    </span>
  );
}

function BadgeDias({ dias }) {
  const urgente = dias <= 7;
  const proximo = dias <= 14;
  const bg = urgente ? "var(--danger-lt)" : proximo ? "var(--warn-lt)" : "var(--primary-lt)";
  const color = urgente ? "var(--danger)" : proximo ? "var(--warn)" : "var(--primary)";
  const texto = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `${dias} días`;

  return (
    <span style={{
      padding: "0.2rem 0.6rem",
      borderRadius: 20,
      background: bg,
      color,
      fontSize: "0.75rem",
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {texto}
    </span>
  );
}

function getFppInfo(fppValue) {
  if (!fppValue) {
    return { label: "—", color: "var(--text-muted)", title: "Fecha probable de parto: sin dato" };
  }

  const fpp = new Date(fppValue);
  const daysRemaining = Math.ceil((fpp.getTime() - Date.now()) / MS_DAY);
  const weeksRemaining = Math.max(0, Math.ceil(daysRemaining / 7));

  return {
    label: fpp.toLocaleDateString("es-GT"),
    color: weeksRemaining < 4
      ? "var(--danger)"
      : weeksRemaining < 8
        ? "var(--warn)"
        : "var(--text)",
    title: `${weeksRemaining} semanas para la fecha probable de parto`,
  };
}

function FppText({ value }) {
  const fpp = getFppInfo(value);
  return (
    <span title={fpp.title} style={{ color: fpp.color, fontWeight: 600, fontSize: "0.85rem" }}>
      {fpp.label}
    </span>
  );
}

function SeccionTabla({ titulo, badge, badgeVariant = "blue", vacia, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        padding: "1rem 1.25rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
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

export default function Dashboard() {
  const [stats,          setStats]          = useState(null);
  const [proximasParir,  setProximasParir]  = useState([]);
  const [sinControl,     setSinControl]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [tabActiva,      setTabActiva]      = useState("citas");

  const { usuario } = useAuth();
  const navigate = useNavigate();
  const mesActual = new Date().toLocaleDateString("es-GT", { month: "long" });

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
      <div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--text)" }}>
          Inicio
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: 4, fontSize: "0.9rem" }}>
          Bienvenido/a, {usuario?.nombre_completo}
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando estadísticas...</p>
      ) : (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}>
            <StatCard
              label="Total de pacientes"
              value={stats?.total_pacientes}
              variant="primary"
              Icon={Users}
              sublabel="embarazos activos registrados"
              onClick={() => navigate("/pacientes")}
            />
            <StatCard
              label="Controles este mes"
              value={stats?.controles_este_mes}
              variant="accent"
              Icon={ClipboardList}
              sublabel={`controles registrados en ${mesActual}`}
            />
            <StatCard
              label="Pacientes con riesgo"
              value={stats?.pacientes_con_riesgo}
              variant="danger"
              Icon={AlertTriangle}
              sublabel="requieren seguimiento prioritario"
              onClick={() => { setTabActiva("sincontrol"); }}
            />
            <StatCard
              label="Próximas al Parto"
              value={stats?.proximas_a_parir_count ?? proximasParir.length}
              variant="warn"
              Icon={Baby}
              sublabel="en los próximos 30 días"
              onClick={() => setTabActiva("parto")}
            />
          </div>

          <div>
            <div className="content-tabs">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTabActiva(t.id)} className={`content-tab ${tabActiva === t.id ? "is-active" : ""}`}>
                  {t.label}
                  {t.alert && (
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "var(--danger)",
                      flexShrink: 0,
                    }} />
                  )}
                </button>
              ))}
            </div>

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
                        <td><PatientName>{c.nombre}</PatientName></td>
                        <td><span className="badge badge-blue">{c.no_expediente}</span></td>
                        <td><span className="badge badge-blue">Control {c.numero_control}</span></td>
                        <td>{fmtFecha(c.cita_siguiente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SeccionTabla>
            )}

            {tabActiva === "parto" && (
              <SeccionTabla
                titulo="Próximas al Parto - 30 días"
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
                        <td><PatientName>{p.nombre}</PatientName></td>
                        <td><span className="badge badge-blue">{p.no_expediente}</span></td>
                        <td><FppText value={p.fpp} /></td>
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
                            ? <span className="badge badge-red">Riesgo</span>
                            : <span className="badge badge-green">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SeccionTabla>
            )}

            {tabActiva === "sincontrol" && (
              <SeccionTabla
                titulo="Sin control en las últimas 4 semanas"
                badge={`${sinControl.length} paciente${sinControl.length !== 1 ? "s" : ""}`}
                badgeVariant={sinControl.length > 0 ? "red" : "green"}
                vacia={
                  loadingAlertas ? "Cargando..."
                  : !sinControl.length ? "Todas las pacientes tienen controles recientes."
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
                        <td><PatientName>{p.nombre}</PatientName></td>
                        <td><span className="badge badge-blue">{p.no_expediente}</span></td>
                        <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          {p.ultimo_control_fecha
                            ? `${fmtFecha(p.ultimo_control_fecha)} (C${p.ultimo_control_numero})`
                            : <span style={{ color: "var(--danger)", fontWeight: 600 }}>Ninguno</span>}
                        </td>
                        <td>
                          <span style={{
                            padding: "0.2rem 0.6rem",
                            borderRadius: 20,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: !p.dias_sin_control || p.dias_sin_control > 56
                              ? "var(--danger-lt)" : "var(--warn-lt)",
                            color: !p.dias_sin_control || p.dias_sin_control > 56
                              ? "var(--danger)" : "var(--warn)",
                          }}>
                            {p.dias_sin_control ? `${p.dias_sin_control} días` : "Sin controles"}
                          </span>
                        </td>
                        <td><FppText value={p.fpp} /></td>
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
                            ? <span className="badge badge-red">Riesgo</span>
                            : <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>}
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
