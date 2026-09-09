import { useEffect, useRef, useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";
import AssignAppointmentDialog from "./AssignAppointmentDialog";
import "./missing-appointment-queue.css";

const REASON_LABELS = Object.freeze({
  cita_cancelada: "Cita anterior cancelada",
  ultimo_control_sin_cita: "Último control sin próxima cita",
  sin_cita_previa: "Sin cita estructurada vigente",
});

function formatDate(value) {
  const iso = String(value || "").slice(0, 10);
  return iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-GT") : "—";
}

export default function MissingAppointmentQueue({
  canManageAppointments,
  items,
  loading,
  error,
  onRefresh,
}) {
  const toast = useGlobalToast();
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const assign = async (fechaProgramada) => {
    setSaving(true);
    setSaveError("");
    try {
      await api.post(
        `/pacientes/${selected.paciente_id}/citas/asignar`,
        { fecha_programada: fechaProgramada },
        { params: { embarazo_id: selected.embarazo_id } }
      );
      if (mountedRef.current) setSelected(null);
      await onRefresh();
      try {
        toast("Cita asignada correctamente", "success");
      } catch {
        // Una notificación visual nunca invalida la cita ni bloquea el refetch confirmado.
      }
    } catch (requestError) {
      if (mountedRef.current) {
        setSaveError(getErrorMessage(requestError, "No se pudo asignar la cita."));
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <section className="card missing-appointment-card" aria-busy={loading}>
      <div className="missing-appointment-header">
        <div>
          <h2>Sin próxima cita</h2>
          <p>Embarazos activos con control prenatal previo y sin cita programada vigente.</p>
        </div>
        <span className={`badge badge-${items.length ? "red" : "green"}`}>
          {items.length} paciente{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="missing-appointment-feedback" role="status">Cargando pacientes...</div>
      ) : error ? (
        <div className="missing-appointment-feedback is-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      ) : !items.length ? (
        <div className="missing-appointment-feedback" role="status">
          Todos los embarazos elegibles tienen una próxima cita programada.
        </div>
      ) : (
        <div className="missing-appointment-table-wrap">
          <table className="tabla missing-appointment-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Comunidad</th>
                <th>Último control</th>
                <th>Motivo</th>
                {canManageAppointments ? <th>Acción</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.embarazo_id}>
                  <td data-label="Paciente"><strong>{item.paciente_nombre}</strong></td>
                  <td data-label="Comunidad">{item.comunidad || "—"}</td>
                  <td data-label="Último control">{formatDate(item.ultimo_control_fecha)}</td>
                  <td data-label="Motivo">
                    <span className="badge badge-yellow">
                      {REASON_LABELS[item.motivo] || "Sin cita vigente"}
                    </span>
                  </td>
                  {canManageAppointments ? (
                    <td data-label="Acción">
                      <button
                        type="button"
                        className="btn-primary missing-appointment-action"
                        onClick={() => {
                          setSaveError("");
                          setSelected(item);
                        }}
                      >
                        <CalendarPlus size={15} /> Asignar cita
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <AssignAppointmentDialog
          patient={selected}
          busy={saving}
          error={saveError}
          onClose={() => !saving && setSelected(null)}
          onConfirm={assign}
        />
      ) : null}
    </section>
  );
}
