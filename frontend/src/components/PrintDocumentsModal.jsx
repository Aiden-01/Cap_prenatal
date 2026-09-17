import { useEffect, useRef, useState } from "react";
import { Check, FileStack, Printer, X } from "lucide-react";

const DOCUMENTS = [
  { id: "expediente", label: "Expediente" },
  { id: "plan", label: "Plan de parto" },
  { id: "riesgo", label: "Ficha de riesgo" },
];

export default function PrintDocumentsModal({ availability, busy, onClose, onGenerate }) {
  const [mode, setMode] = useState("individual");
  const [selected, setSelected] = useState(["expediente"]);
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector("input:not(:disabled), button:not(:disabled)")?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) onCloseRef.current();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
      previousFocus?.focus?.();
    };
  }, []);

  const toggleDocument = (id) => {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };
  const combinedAvailable = DOCUMENTS.every(({ id }) => availability[id]);
  const canGenerate = !busy && (mode === "combined" ? combinedAvailable : selected.length > 0);

  return (
    <div className="print-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section
        ref={dialogRef}
        className="print-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-modal-title"
        aria-describedby="print-modal-subtitle"
      >
        <header className="print-modal-header">
          <span className="print-modal-icon" aria-hidden="true"><Printer size={22} /></span>
          <div>
            <h2 id="print-modal-title">IMPRIMIR DOCUMENTOS</h2>
            <p id="print-modal-subtitle">Selecciona cómo deseas generar el PDF.</p>
          </div>
          <button type="button" className="print-modal-close" onClick={onClose} disabled={busy} aria-label="Cerrar selector de impresión">
            <X size={20} />
          </button>
        </header>

        <div className="print-modal-body">
          <fieldset className="print-fieldset">
            <legend>MODO DE IMPRESIÓN</legend>
            <div className="print-mode-grid">
              <label className={`print-mode-card ${mode === "individual" ? "is-selected" : ""}`}>
                <input type="radio" name="print-mode" value="individual" checked={mode === "individual"} onChange={() => setMode("individual")} disabled={busy} />
                <span><strong>Documentos individuales</strong><small>Selecciona los documentos que deseas generar.</small></span>
                {mode === "individual" && <Check size={18} aria-hidden="true" />}
              </label>
              <label className={`print-mode-card ${mode === "combined" ? "is-selected" : ""} ${!combinedAvailable ? "is-disabled" : ""}`}>
                <input type="radio" name="print-mode" value="combined" checked={mode === "combined"} onChange={() => setMode("combined")} disabled={busy || !combinedAvailable} />
                <span><strong>Todo en un solo PDF</strong><small>Genera un único PDF con todos los documentos.</small></span>
                {mode === "combined" && <Check size={18} aria-hidden="true" />}
              </label>
            </div>
          </fieldset>

          <fieldset className="print-fieldset">
            <legend>DOCUMENTOS DISPONIBLES</legend>
            <div className="print-document-list">
              {DOCUMENTS.map((document) => {
                const available = availability[document.id];
                const disabled = busy || mode === "combined" || !available;
                return (
                  <label key={document.id} className={`print-document-option ${disabled ? "is-disabled" : ""}`}>
                    <input type="checkbox" checked={mode === "combined" || selected.includes(document.id)} onChange={() => toggleDocument(document.id)} disabled={disabled} />
                    <span><strong>{document.label}</strong><small>{available ? "Disponible" : "Pendiente de completar · No disponible"}</small></span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {mode === "combined" && (
            <section className="print-combined-summary" aria-labelledby="combined-order-title">
              <div className="print-combined-title"><FileStack size={18} aria-hidden="true" /><h3 id="combined-order-title">ORDEN DEL DOCUMENTO COMBINADO</h3></div>
              <ol>{DOCUMENTS.map(({ id, label }) => <li key={id}>{label}{!availability[id] && <span>No disponible</span>}</li>)}</ol>
              <p>En este modo se genera un único PDF con todos los documentos en el orden indicado.</p>
              <div className="print-result"><span>Resultado:</span><strong>1 PDF combinado</strong></div>
              {!combinedAvailable && <p className="print-validation" role="alert">Completa los documentos marcados como no disponibles antes de generar el PDF combinado.</p>}
            </section>
          )}
          {mode === "individual" && selected.length === 0 && <p className="print-validation" role="status">Selecciona al menos un documento.</p>}
        </div>

        <footer className="print-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => onGenerate(mode, selected)} disabled={!canGenerate}>
            <Printer size={16} /> {busy ? "Generando PDF..." : "Generar PDF"}
          </button>
        </footer>
      </section>
    </div>
  );
}
