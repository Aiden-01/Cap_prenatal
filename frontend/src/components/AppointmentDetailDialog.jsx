import { useEffect, useId, useRef } from "react";
import { CalendarClock, CalendarX, ExternalLink, X } from "lucide-react";
import { AppointmentStatusIcon } from "./AppointmentStatus";
import { getAppointmentStatus } from "./appointmentStatusMeta";
import { formatDateDisplay } from "../utils/appointmentCalendar";

const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export default function AppointmentDetailDialog({
  appointment,
  canManage,
  onAction,
  onClose,
  onViewPatient,
  returnFocusTarget,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const skipRestoreRef = useRef(false);
  const status = getAppointmentStatus(appointment.status);
  const canModify = appointment.status === "programada" && appointment.editable && canManage;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!skipRestoreRef.current) {
        requestAnimationFrame(() => returnFocusTarget?.focus());
      }
    };
  }, [onClose, returnFocusTarget]);

  const transition = (callback) => {
    skipRestoreRef.current = true;
    callback();
  };

  return (
    <div className="appointment-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="appointment-dialog appointment-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="appointment-detail-heading">
          <div>
            <span className={`appointment-status-badge ${status.className}`}>
              <AppointmentStatusIcon status={appointment.status} />
              {status.label}
            </span>
            <h2 id={titleId}>{appointment.patient_name}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="appointment-detail-close"
            onClick={onClose}
            aria-label="Cerrar detalle de la cita"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <p id={descriptionId} className="appointment-detail-description">
          Detalle de la cita prenatal seleccionada.
        </p>

        <dl className="appointment-detail-list">
          <div>
            <dt>Comunidad</dt>
            <dd>{appointment.community || "Sin comunidad registrada"}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{formatDateDisplay(appointment.date)}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{status.label}</dd>
          </div>
          {appointment.status === "reprogramada" && appointment.rescheduled_to ? (
            <div>
              <dt>Reprogramada para</dt>
              <dd>{formatDateDisplay(appointment.rescheduled_to)}</dd>
            </div>
          ) : null}
        </dl>

        {appointment.status === "programada" && !appointment.editable ? (
          <p className="appointment-detail-note">
            El embarazo asociado es de solo lectura; esta cita no admite cambios.
          </p>
        ) : null}

        <div className="appointment-detail-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => transition(onViewPatient)}
          >
            <ExternalLink size={16} aria-hidden="true" /> Ver expediente
          </button>
          {canModify ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => transition(() => onAction("reprogramar"))}
              >
                <CalendarClock size={16} aria-hidden="true" /> Reprogramar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => transition(() => onAction("cancelar"))}
              >
                <CalendarX size={16} aria-hidden="true" /> Cancelar cita
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
