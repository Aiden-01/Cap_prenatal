import { useEffect, useState } from "react";
import { CheckCircle, ClipboardList, Info, ListChecks, X, XCircle } from "lucide-react";
import api from "../api/axios";
import { getErrorMessage } from "../utils/errorMessage";

function getBarColor(porcentaje) {
  if (porcentaje < 40) return "bg-red-600";
  if (porcentaje < 80) return "bg-yellow-500";
  return "bg-green-500";
}

function getControlesHint(item) {
  const totalControles = Number(item.total_controles || 0);
  const minimoControles = Number(item.minimo_controles || 4);
  const faltantes = Math.max(minimoControles - totalControles, 0);

  if (item.completado) return "";
  if (totalControles === 0) return `Sin controles registrados. Faltan ${faltantes} para el minimo recomendado`;
  return `Faltan ${faltantes} controles para completar el minimo recomendado`;
}

function getMissingLabel(item) {
  if (item.label !== "Controles prenatales") return item.label;

  const totalControles = Number(item.total_controles || 0);
  const minimoControles = Number(item.minimo_controles || 4);
  return `${item.label} (${totalControles}/${minimoControles})`;
}

function getResumen(items = [], porcentaje) {
  const faltantes = items.filter((item) => !item.completado);

  if (porcentaje === 100 || faltantes.length === 0) return "Expediente completo";
  if (faltantes.length === 1) return `Falta: ${getMissingLabel(faltantes[0])}`;
  return `Faltan ${faltantes.length} secciones`;
}

function ProgressBar({ porcentaje, height = 6, width = "100%" }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 999,
        background: "var(--surface2)",
        border: "1px solid var(--card-border)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div className={getBarColor(porcentaje)} style={{ width: `${porcentaje}%`, height: "100%", transition: "width 0.25s ease" }} />
    </div>
  );
}

function CompletitudItem({ item }) {
  const Icon = item.completado ? CheckCircle : XCircle;
  const esControles = item.label === "Controles prenatales";
  const controlesHint = esControles ? getControlesHint(item) : "";
  const mostrarDetalleInline = item.detalle && (!esControles || item.completado);

  return (
    <div
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
      <span style={{ display: "grid", gap: "0.15rem", color: "var(--text)", fontSize: "0.84rem" }}>
        <span>
          {item.label}
          {mostrarDetalleInline && <span style={{ color: "var(--text-muted)" }}> · {item.detalle}</span>}
        </span>
        {controlesHint && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", opacity: 0.72 }}>
            {controlesHint}
          </span>
        )}
      </span>
    </div>
  );
}

export default function SemaforoCompletitud({ pacienteId, initialData = null }) {
  const [remote, setRemote] = useState({ key: "", data: null, error: "" });
  const [expanded, setExpanded] = useState(false);
  const requestKey = String(pacienteId || "");
  const hasInitialData = initialData !== null && initialData !== undefined;
  const remoteMatches = remote.key === requestKey;
  const data = hasInitialData ? initialData : remoteMatches ? remote.data : null;
  const loading = !hasInitialData && Boolean(pacienteId) && !remoteMatches;
  const error = hasInitialData || !remoteMatches ? "" : remote.error;

  useEffect(() => {
    if (hasInitialData || !pacienteId) return;
    let mounted = true;
    const currentKey = String(pacienteId);

    api.get(`/pacientes/${pacienteId}/completitud`)
      .then(({ data: response }) => {
        if (mounted) setRemote({ key: currentKey, data: response, error: "" });
      })
      .catch((err) => {
        if (mounted) {
          setRemote({
            key: currentKey,
            data: null,
            error: getErrorMessage(err, "Error al cargar completitud del expediente"),
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [hasInitialData, pacienteId]);

  const porcentaje = Number(data?.porcentaje || 0);
  const resumen = loading
    ? "Calculando completitud..."
    : error || getResumen(data?.items, porcentaje);

  return (
    <>
      <button
        type="button"
        className="card completitud-trigger"
        onClick={() => setExpanded(true)}
        aria-label="Abrir detalle de completitud del expediente"
        aria-expanded={expanded}
        title="Abrir detalle de completitud del expediente"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.7rem",
          padding: "0.55rem 1rem",
          minWidth: 0,
          width: "100%",
          textAlign: "left",
        }}
      >
        <ClipboardList size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
        <span style={{ color: "var(--text)", fontSize: "0.92rem", fontWeight: 700, whiteSpace: "nowrap" }}>
          Completitud del expediente
        </span>
        <ProgressBar porcentaje={porcentaje} width={120} />
        <strong style={{ color: "var(--text)", fontSize: "0.9rem", flexShrink: 0 }}>{porcentaje}%</strong>
        <span
          style={{
            color: error ? "var(--danger)" : "var(--text-muted)",
            fontSize: "0.82rem",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {resumen}
        </span>
        <span className="completitud-detail-trigger" aria-hidden="true">
          <span className="completitud-info-icon">
            <Info size={15} strokeWidth={2.4} />
          </span>
          <span className="completitud-list-icon">
            <ListChecks size={14} strokeWidth={2.2} />
          </span>
        </span>
      </button>

      {expanded && (
        <div className="user-create-drawer-shell">
          <button
            type="button"
            className="user-create-drawer-backdrop"
            onClick={() => setExpanded(false)}
            aria-label="Cerrar completitud"
          />

          <div className="card user-create-drawer">
            <div className="record-panel-header user-create-drawer-header">
              <span className="user-create-title">
                <ClipboardList size={18} color="var(--primary)" />
                <span>Completitud del expediente</span>
              </span>
              <button
                type="button"
                className="password-modal-close"
                onClick={() => setExpanded(false)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.9rem" }}>
              {loading && <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Calculando completitud...</div>}
              {!loading && error && <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</div>}
              {!loading && !error && data && (
                <>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", color: "var(--text)" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Avance</span>
                      <strong>{porcentaje}%</strong>
                    </div>
                    <ProgressBar porcentaje={porcentaje} height={10} />
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.45rem" }}>
                      {resumen}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.6rem" }}>
                    {data.items?.map((item) => (
                      <CompletitudItem key={item.label} item={item} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
