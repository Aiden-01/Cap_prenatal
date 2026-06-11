import { useEffect, useState } from "react";
import { CheckCircle, ClipboardList, XCircle } from "lucide-react";
import api from "../api/axios";
import { getErrorMessage } from "../utils/errorMessage";

function getBarColor(porcentaje) {
  if (porcentaje < 40) return "bg-red-600";
  if (porcentaje < 80) return "bg-yellow-500";
  return "bg-green-500";
}

export default function SemaforoCompletitud({ pacienteId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pacienteId) return;
    let mounted = true;

    api.get(`/pacientes/${pacienteId}/completitud`)
      .then(({ data: response }) => {
        if (mounted) setData(response);
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err, "Error al cargar completitud del expediente"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pacienteId]);

  const porcentaje = Number(data?.porcentaje || 0);

  return (
    <div className="card" style={{ display: "grid", gap: "0.9rem", background: "var(--card)", borderColor: "var(--card-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
        <ClipboardList size={18} style={{ color: "var(--primary)" }} />
        <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>Completitud del expediente</h2>
      </div>

      {loading && <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Calculando completitud...</div>}
      {!loading && error && <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</div>}
      {!loading && !error && data && (
        <>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", color: "var(--text)" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Avance</span>
              <strong>{porcentaje}%</strong>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "var(--surface2)", border: "1px solid var(--card-border)", overflow: "hidden" }}>
              <div className={getBarColor(porcentaje)} style={{ width: `${porcentaje}%`, height: "100%", transition: "width 0.25s ease" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.6rem" }}>
            {data.items?.map((item) => {
              const Icon = item.completado ? CheckCircle : XCircle;
              return (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.45rem",
                    padding: "0.55rem 0.65rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: 8,
                    background: "var(--bg)",
                  }}
                >
                  <Icon size={16} style={{ color: item.completado ? "var(--accent)" : "var(--danger)", marginTop: 1, flexShrink: 0 }} />
                  <span style={{ color: "var(--text)", fontSize: "0.84rem" }}>
                    {item.label}
                    {item.detalle && <span style={{ color: "var(--text-muted)" }}> · {item.detalle}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
