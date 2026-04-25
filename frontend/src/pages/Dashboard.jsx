import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ClipboardList, AlertTriangle } from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";

function StatCard({ label, value, color, Icon }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: color + "22",
          display: "grid",
          placeItems: "center",
          flexShrink: 0
        }}
      >
        <Icon size={22} style={{ color }} />
      </div>

      <div>
        <div
          style={{
            fontSize: "1.75rem",
            fontFamily: "Syne",
            fontWeight: 800,
            color: "var(--text)",
            lineHeight: 1
          }}
        >
          {value ?? "—"}
        </div>

        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 4 }}>
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
    api.get("/reportes/estadisticas")
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* HEADER */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800 }}>Dashboard</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 4, fontSize: "0.9rem" }}>
          Bienvenido/a, {usuario?.nombre_completo}
        </p>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Cargando estadísticas...</p>
      ) : (
        <>
          {/* STATS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1rem",
              marginBottom: "2rem"
            }}
          >
            <StatCard
              label="Total de pacientes"
              value={stats?.total_pacientes}
              color="var(--primary)"
              Icon={Users}
            />

            <StatCard
              label="Controles este mes"
              value={stats?.controles_este_mes}
              color="var(--accent)"
              Icon={ClipboardList}
            />

            <StatCard
              label="Pacientes con riesgo"
              value={stats?.pacientes_con_riesgo}
              color="var(--danger)"
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
                marginBottom: "1.25rem"
              }}
            >
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>
                Citas próximos 7 días
              </h2>

              <span className="badge badge-blue">
                {stats?.proximas_citas?.length ?? 0} pendientes
              </span>
            </div>

            {stats?.proximas_citas?.length > 0 ? (
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
                    <tr key={i} onClick={() => navigate(`/pacientes/${c.id}`)}>
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