import { useEffect, useRef, useState } from "react";
import { Check, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";

const FORMATS = [
  { id: "excel", label: "Excel", Icon: FileSpreadsheet },
  { id: "pdf", label: "PDF", Icon: FileText },
];

export default function ReportExportModal({ config, busy = false, onClose, onExport }) {
  const [format, setFormat] = useState("");
  const [selectedColumns, setSelectedColumns] = useState(() => config.columns.map(({ id }) => id));
  const dialogRef = useRef(null);
  const busyRef = useRef(busy);
  const closeRef = useRef(onClose);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector("input:not(:disabled), button:not(:disabled)")?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  const toggleColumn = (id) => setSelectedColumns((current) => current.includes(id)
    ? current.filter((columnId) => columnId !== id)
    : [...current, id]);
  const canExport = Boolean(format) && selectedColumns.length > 0 && !busy;

  return (
    <div className="report-export-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} className="report-export-modal" role="dialog" aria-modal="true"
        aria-labelledby="report-export-title" aria-describedby="report-export-description">
        <header className="report-export-header">
          <div>
            <span className="reportes-kicker">Exportación de reportes</span>
            <h2 id="report-export-title">EXPORTAR {config.title.toUpperCase()}</h2>
            <p id="report-export-description">Se aplicarán los filtros activos a todos los registros coincidentes.</p>
          </div>
          <button type="button" className="report-export-close" onClick={onClose} disabled={busy}
            aria-label="Cerrar exportación"><X size={20} /></button>
        </header>

        <div className="report-export-body">
          <fieldset className="report-export-fieldset" disabled={busy}>
            <legend>FORMATO</legend>
            <div className="report-export-formats">
              {FORMATS.map(({ id, label, Icon }) => (
                <label key={id} className={`report-export-format ${format === id ? "is-selected" : ""}`}>
                  <input type="radio" name="report-export-format" value={id}
                    checked={format === id} onChange={() => setFormat(id)} disabled={busy} />
                  <Icon size={24} aria-hidden="true" />
                  <span>{label}</span>
                  {format === id && <Check size={18} aria-hidden="true" />}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="report-export-filter-note">Se aplicarán los filtros activos.</div>

          <fieldset className="report-export-fieldset" disabled={busy}>
            <div className="report-export-columns-heading">
              <legend>COLUMNAS</legend>
              <div>
                <button type="button" disabled={busy} onClick={() => setSelectedColumns(config.columns.map(({ id }) => id))}>Seleccionar todas</button>
                <button type="button" disabled={busy} onClick={() => setSelectedColumns([])}>Deseleccionar todas</button>
              </div>
            </div>
            <div className="report-export-columns">
              {config.columns.map(({ id, label }) => (
                <label key={id}>
                  <input type="checkbox" checked={selectedColumns.includes(id)} onChange={() => toggleColumn(id)} disabled={busy} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {selectedColumns.length === 0 && <p className="report-export-validation" role="status">Selecciona al menos una columna.</p>}
          </fieldset>
        </div>

        <footer className="report-export-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!canExport}
            onClick={() => onExport(format, selectedColumns)}>
            {busy && <Loader2 className="spin" size={16} />}
            {busy ? "EXPORTANDO..." : `EXPORTAR${format ? ` ${format.toUpperCase()}` : ""}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
