import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { formatClinicalDateSpanish } from "../utils/vaccineSchedule";

const FOCUSABLE_SELECTOR = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function VaccineClinicalDialog({ alert, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  const actionRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const returnFocusTarget = returnFocusRef?.current || previousFocus;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    actionRef.current?.focus();

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
      requestAnimationFrame(() => returnFocusTarget?.focus());
    };
  }, [onClose, returnFocusRef]);

  if (!alert) return null;
  const minimum = alert.minimumDate ? formatClinicalDateSpanish(alert.minimumDate) : "";
  const suggested = alert.suggestedDate ? formatClinicalDateSpanish(alert.suggestedDate) : "";

  return (
    <div className="vaccine-dialog-backdrop">
      <section
        ref={dialogRef}
        className="vaccine-clinical-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vaccine-clinical-dialog-title"
        aria-describedby="vaccine-clinical-dialog-description"
      >
        <div className="vaccine-clinical-dialog-icon" aria-hidden="true"><AlertTriangle size={26} /></div>
        <h2 id="vaccine-clinical-dialog-title">{alert.title}</h2>
        <p id="vaccine-clinical-dialog-description" className="vaccine-clinical-dialog-reason">{alert.reason}</p>

        <dl className="vaccine-clinical-dialog-facts">
          <div><dt>Vacuna</dt><dd>{alert.vaccine}</dd></div>
          <div><dt>Dosis seleccionada</dt><dd>{alert.dose}</dd></div>
        </dl>

        {minimum ? (
          <div className="vaccine-clinical-dialog-guidance">
            {alert.movedForWeekend ? (
              <>
                <p>{alert.affectedDose} de {alert.vaccine} puede administrarse a partir del <strong>{minimum}</strong>.</p>
                <p>Como la fecha mínima corresponde a fin de semana, se recomienda citar a la paciente para el <strong>{suggested}</strong>.</p>
              </>
            ) : (
              <>
                <p>La fecha mínima permitida para {alert.affectedDose} es el <strong>{minimum}</strong>.</p>
                <p>Se recomienda citar a la paciente para el <strong>{suggested}</strong>.</p>
              </>
            )}
          </div>
        ) : null}

        <div className="vaccine-clinical-dialog-actions">
          <button ref={actionRef} type="button" className="btn-primary" onClick={onClose}>Entendido</button>
        </div>
      </section>
    </div>
  );
}
