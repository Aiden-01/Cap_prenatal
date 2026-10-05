import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import "./patient-version-conflict.css";

export default function PatientVersionConflict({ onReload, loading, error }) {
  const [confirming, setConfirming] = useState(false);
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, []);

  return (
    <section className="patient-version-conflict" aria-labelledby="patient-conflict-title" aria-busy={loading}>
      <div className="patient-version-conflict-heading">
        <AlertTriangle size={24} aria-hidden="true" />
        <h2 id="patient-conflict-title" ref={heading} tabIndex={-1}>El expediente cambió mientras lo editaba</h2>
      </div>
      <p role="alert">Otro usuario actualizó esta paciente. No se guardó ningún cambio de este formulario.</p>
      <p>Lo que estaba escribiendo sigue aquí. Puede revisar y copiar sus cambios antes de cargar la versión más reciente. Para guardar, primero debe cargar los datos actuales y volver a ingresar sus cambios.</p>
      {confirming ? (
        <div className="patient-version-conflict-confirm">
          <p><strong>Al continuar se reemplazará este formulario con los datos actuales del expediente.</strong> Los cambios que no haya guardado se descartarán. No se combinarán automáticamente.</p>
          <div className="patient-version-conflict-actions">
            <button type="button" className="btn-secondary" disabled={loading} onClick={() => setConfirming(false)}>Conservar mi formulario</button>
            <button type="button" className="btn-primary" disabled={loading} onClick={onReload}>
              <RefreshCw size={16} aria-hidden="true" /> {loading ? "Cargando..." : "Confirmar y cargar datos actuales"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
          <RefreshCw size={16} aria-hidden="true" /> Cargar versión más reciente
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
