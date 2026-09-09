import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { todayInGuatemala } from "../utils/appointmentCalendar";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function AssignAppointmentDialog({ patient, busy, error, onClose, onConfirm }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const dateRef = useRef(null);
  const triggerRef = useRef(document.activeElement);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const [date, setDate] = useState("");

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    const returnFocusTarget = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dateRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
      if (!focusable.length) return;
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
      requestAnimationFrame(() => returnFocusTarget?.focus());
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!date || busy) return;
    onConfirm(date);
  };

  return (
    <div className="appointment-dialog-backdrop">
      <section
        ref={dialogRef}
        className="appointment-dialog missing-appointment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <div className="appointment-dialog-icon is-reschedule" aria-hidden="true">
          <CalendarPlus size={24} />
        </div>
        <h2 id={titleId}>Asignar cita</h2>
        <p id={descriptionId}>
          Programe la siguiente cita prenatal para {patient.paciente_nombre}.
        </p>
        <form onSubmit={submit}>
          <label className="missing-appointment-date-field">
            <span className="input-label">Fecha programada</span>
            <input
              ref={dateRef}
              className="input-field"
              type="date"
              min={todayInGuatemala()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${descriptionId}-error` : undefined}
            />
          </label>
          {error ? (
            <p id={`${descriptionId}-error`} className="appointment-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="appointment-dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Volver
            </button>
            <button type="submit" className="btn-primary" disabled={!date || busy}>
              {busy ? "Guardando..." : "Asignar cita"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
