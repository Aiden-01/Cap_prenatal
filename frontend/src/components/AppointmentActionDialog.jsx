import { useEffect, useId, useRef, useState } from "react";
import { CalendarClock, CalendarX } from "lucide-react";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function formatDate(value) {
  const iso = dateOnly(value);
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-GT");
}

function todayGuatemala() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function AppointmentActionDialog({
  mode,
  appointment,
  busy,
  error,
  onClose,
  onConfirm,
  returnFocusTarget,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const dateRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  const restoreFocusFrameRef = useRef(null);
  const [newDate, setNewDate] = useState("");
  const currentDate = dateOnly(appointment?.cita_siguiente);
  const isReschedule = mode === "reprogramar";
  const localError = isReschedule && newDate === currentDate
    ? "La nueva fecha debe ser diferente."
    : "";

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    if (restoreFocusFrameRef.current !== null) {
      cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = null;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (isReschedule ? dateRef : primaryRef).current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
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
      restoreFocusFrameRef.current = requestAnimationFrame(() => returnFocusTarget?.focus());
    };
  }, [isReschedule, returnFocusTarget]);

  const submit = (event) => {
    event.preventDefault();
    if (busy || (isReschedule && (!newDate || localError))) return;
    onConfirm(isReschedule ? newDate : null);
  };

  return (
    <div className="appointment-dialog-backdrop">
      <section
        ref={dialogRef}
        className="appointment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <div className={`appointment-dialog-icon ${isReschedule ? "is-reschedule" : "is-cancel"}`} aria-hidden="true">
          {isReschedule ? <CalendarClock size={24} /> : <CalendarX size={24} />}
        </div>
        <h2 id={titleId}>{isReschedule ? "Reprogramar cita" : "Cancelar cita"}</h2>
        <p id={descriptionId}>
          {isReschedule
            ? "El control prenatal original conservará la fecha indicada durante la atención."
            : `¿Desea cancelar la cita programada para el ${formatDate(currentDate)}? El registro permanecerá en el historial.`}
        </p>

        <form onSubmit={submit}>
          {isReschedule ? (
            <div className="appointment-dialog-fields">
              <div>
                <span className="input-label">Fecha actual</span>
                <strong>{formatDate(currentDate)}</strong>
              </div>
              <label>
                <span className="input-label">Nueva fecha</span>
                <input
                  ref={dateRef}
                  className={`input-field ${localError ? "input-error" : ""}`}
                  type="date"
                  min={todayGuatemala()}
                  value={newDate}
                  onChange={(event) => setNewDate(event.target.value)}
                  disabled={busy}
                  required
                  aria-invalid={Boolean(localError || error)}
                  aria-describedby={(localError || error) ? `${descriptionId}-error` : undefined}
                />
              </label>
            </div>
          ) : null}

          {(localError || error) ? (
            <p id={`${descriptionId}-error`} className="appointment-dialog-error" role="alert">
              {localError || error}
            </p>
          ) : null}

          <div className="appointment-dialog-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Volver
            </button>
            <button
              ref={primaryRef}
              type="submit"
              className={isReschedule ? "btn-primary" : "btn-danger"}
              disabled={busy || (isReschedule && (!newDate || Boolean(localError)))}
            >
              {busy
                ? "Guardando..."
                : isReschedule ? "Confirmar nueva fecha" : "Cancelar cita"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
