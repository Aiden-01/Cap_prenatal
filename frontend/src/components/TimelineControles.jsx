import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Eye, AlertTriangle } from "lucide-react";
import api from "../api/axios";
import { getErrorMessage } from "../utils/errorMessage";

function fecha(value) {
  return value ? new Date(value).toLocaleDateString("es-GT") : "—";
}

function dato(label, value) {
  return (
    <div>
      <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: "0.86rem" }}>{value || "—"}</span>
    </div>
  );
}

function ControlNode({ control, index, pacienteId }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const observaciones = control.observaciones || control.impresion_clinica;

  return (
    <div style={{ position: "relative", paddingLeft: "1.75rem", marginBottom: "1.5rem" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -6,
          top: 18,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: control.tiene_hallazgo ? "var(--danger)" : "var(--primary)",
          border: "2px solid var(--card)",
          boxShadow: "0 0 0 2px var(--card-border)",
        }}
      />
      <div className="card" style={{ background: "var(--card)", borderColor: "var(--card-border)", display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <strong style={{ color: "var(--text)" }}>Control #{index + 1}</strong>
            <span style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>{fecha(control.fecha_control || control.fecha)}</span>
          </div>
          <span className="badge badge-blue">Semana {control.semana_gestacional || control.edad_gestacional_semanas || "—"}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem" }}>
          {dato("Peso", control.peso ? `${control.peso} kg` : control.peso_kg ? `${control.peso_kg} kg` : null)}
          {dato("PA", control.presion_arterial)}
          {dato("FCF", control.frecuencia_cardiaca_fetal || control.fcf)}
          {dato("Presentación", control.presentacion || control.presentacion_fetal)}
        </div>

        {control.tiene_hallazgo && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", padding: "0.55rem 0.7rem", borderRadius: 8, background: "var(--warn-lt)", color: "var(--warn)", fontWeight: 700, fontSize: "0.84rem" }}>
            <AlertTriangle size={15} /> Control con hallazgos
          </div>
        )}

        {observaciones && (
          <p style={{ margin: 0, color: "var(--text-muted)", fontStyle: "italic", fontSize: "0.88rem" }}>
            {observaciones}
          </p>
        )}

        {open && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", borderTop: "1px solid var(--card-border)", paddingTop: "0.85rem" }}>
            {dato("Situación", control.situacion || control.situacion_fetal)}
            {dato("Motivo", control.motivo_consulta)}
            {dato("Altura uterina", control.altura_uterina_cm ? `${control.altura_uterina_cm} cm` : null)}
            {dato("Temperatura", control.temperatura ? `${control.temperatura} °C` : null)}
            {dato("Tratamiento", control.tratamiento)}
            {dato("Próxima cita", fecha(control.cita_siguiente))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setOpen((value) => !value);
              navigate(`/pacientes/${pacienteId}/controles/${control.id}/editar`);
            }}
          >
            <Eye size={13} /> Ver detalle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimelineControles({ pacienteId }) {
  const [controles, setControles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!pacienteId) return;
    let mounted = true;

    api.get(`/pacientes/${pacienteId}/controles`)
      .then(({ data }) => {
        if (mounted) setControles(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err, "Error al cargar controles prenatales"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pacienteId]);

  if (loading) {
    return <div className="card" style={{ color: "var(--text-muted)" }}>Cargando controles...</div>;
  }

  if (error) {
    return <div className="card" style={{ color: "var(--danger)" }}>{error}</div>;
  }

  if (!controles.length) {
    return (
      <div className="card empty-state" style={{ display: "grid", justifyItems: "center", gap: "0.85rem" }}>
        <ClipboardList size={28} style={{ color: "var(--primary)" }} />
        <span>Sin controles registrados aún</span>
        <button className="btn-primary" onClick={() => navigate(`/pacientes/${pacienteId}/controles/nuevo`)}>
          Registrar primer control
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderLeft: "1px solid var(--card-border)", marginLeft: "0.45rem" }}>
      {controles.map((control, index) => (
        <ControlNode key={control.id} control={control} index={index} pacienteId={pacienteId} />
      ))}
    </div>
  );
}
