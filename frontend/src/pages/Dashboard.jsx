import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ClipboardList, AlertTriangle } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

// Mapa de colores: variable CSS → variable de fondo suave
const COLOR_VARIANTS = {
  primary: { icon: "var(--primary)", bg: "var(--primary-lt)" },
  accent:  { icon: "var(--accent)",  bg: "var(--accent-lt)"  },
  danger:  { icon: "var(--danger)",  bg: "var(--danger-lt)"  },
};

function StatCard({ label, value, variant = "primary", Icon }) {
  const { icon, bg } = COLOR_VARIANTS[variant];
  return (
    <div
      className="card"
      style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: bg,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={22} style={{ color: icon }} />
      </div>

      <div>
        <div
          style={{
            fontSize: "1.75rem",
            fontFamily: "Syne, sans-serif",
            fontWeight: 800,
            color: "var(--text)",       /* ← usa la variable del tema */
            lineHeight: 1,
          }}
        >
          {value ?? "—"}
        </div>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.82rem",
            marginTop: 4,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { usuario } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/reportes/estadisticas")
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* HEADER */}
      <div style={{ marginBottom: "2rem" }}>
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
          {/* STATS — responsive: 1 col móvil, 3 col desktop */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <StatCard
              label="Total de pacientes"
              value={stats?.total_pacientes}
              variant="primary"
              Icon={Users}
            />
            <StatCard
              label="Controles este mes"
              value={stats?.controles_este_mes}
              variant="accent"
              Icon={ClipboardList}
            />
            <StatCard
              label="Pacientes con riesgo"
              value={stats?.pacientes_con_riesgo}
              variant="danger"
              Icon={AlertTriangle}
            />
          </div>

          {/* TABLA */}
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
                Citas en los próximos 7 días
              </h2>
              <span className="badge badge-blue">
                {stats?.proximas_citas?.length ?? 0} pendientes
              </span>
            </div>

            {stats?.proximas_citas?.length > 0 ? (
              /* scroll horizontal en pantallas pequeñas */
              <div style={{ overflowX: "auto" }}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>No. Historia</th>
                      <th>Control</th>
                      <th>Fecha cita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.proximas_citas.map((c, i) => (
                      <tr
                        key={i}
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/pacientes/${c.id}`)}
                      >
                        <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                        <td style={{ color: "var(--text-muted)" }}>
                          {c.no_historia_clinica}
                        </td>
                        <td>
                          <span className="badge badge-blue">
                            Control {c.numero_control}
                          </span>
                        </td>
                        <td>
                          {new Date(c.cita_siguiente).toLocaleDateString("es-GT")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No hay citas programadas para los próximos 7 días.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}