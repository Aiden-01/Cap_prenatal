import { useEffect, useRef } from "react";
import { Clock3, LogOut, ShieldCheck } from "lucide-react";

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function SessionTimeoutModal({ remainingSeconds, continuing, error, onContinue, onLogout }) {
  const continueRef = useRef(null);
  const logoutRef = useRef(null);

  useEffect(() => { continueRef.current?.focus(); }, []);

  const handleKeyDown = (event) => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === continueRef.current) {
      event.preventDefault();
      logoutRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === logoutRef.current) {
      event.preventDefault();
      continueRef.current?.focus();
    }
  };

  return (
    <div className="modal-backdrop" data-session-timeout-modal>
      <div
        className="card modal-card session-timeout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        onKeyDown={handleKeyDown}
      >
        <div className="session-timeout-icon" aria-hidden="true"><Clock3 size={30} /></div>
        <h2 id="session-timeout-title">Tu sesión está por cerrarse</h2>
        <p id="session-timeout-description">
          No se detectó actividad reciente. Los datos que aún no hayas guardado podrían perderse.
        </p>
        <div className="session-timeout-countdown" aria-live="polite" aria-label={`${remainingSeconds} segundos restantes`}>
          {formatCountdown(remainingSeconds)}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="action-row">
          <button ref={logoutRef} type="button" className="btn-secondary" onClick={onLogout} disabled={continuing}>
            <LogOut size={16} /> Cerrar sesión
          </button>
          <button
            ref={continueRef}
            type="button"
            className="btn-primary"
            onClick={onContinue}
            disabled={continuing}
            aria-busy={continuing}
          >
            <ShieldCheck size={16} /> {continuing ? "Validando…" : "Continuar sesión"}
          </button>
        </div>
      </div>
    </div>
  );
}
