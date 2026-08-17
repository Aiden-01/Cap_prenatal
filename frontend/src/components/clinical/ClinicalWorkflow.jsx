import {
  AlertTriangle,
  ChevronLeft,
  CircleAlert,
  Info,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";
import "./clinical-workflow.css";

const MODE_LABELS = {
  new: "Nuevo",
  edit: "Editar",
  readonly: "Solo lectura",
};

const NOTICE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
  restriction: ShieldAlert,
  readonly: LockKeyhole,
};

export function ClinicalWorkflowShell({
  backLabel = "Volver al expediente",
  onBack,
  eyebrow,
  title,
  description,
  patientName,
  recordNumber,
  mode = "new",
  icon: Icon,
  children,
  className = "",
}) {
  return (
    <div className={`clinical-workflow ${className}`.trim()}>
      <header className="clinical-workflow-header">
        <button type="button" className="btn-secondary clinical-workflow-back" onClick={onBack}>
          <ChevronLeft size={16} aria-hidden="true" />
          <span>{backLabel}</span>
        </button>

        {Icon && (
          <div className="clinical-workflow-icon" aria-hidden="true">
            <Icon size={22} />
          </div>
        )}

        <div className="clinical-workflow-heading">
          {eyebrow && <span className="clinical-workflow-eyebrow">{eyebrow}</span>}
          <div className="clinical-workflow-title-row">
            <h1>{title}</h1>
            <span className={`clinical-workflow-mode is-${mode}`}>
              {mode === "readonly" && <LockKeyhole size={13} aria-hidden="true" />}
              {MODE_LABELS[mode] || mode}
            </span>
          </div>
          {description && <p>{description}</p>}
        </div>

        <dl className="clinical-workflow-patient" aria-label="Contexto del expediente">
          <div>
            <dt>Paciente</dt>
            <dd>{patientName || "Paciente seleccionada"}</dd>
          </div>
          {recordNumber && (
            <div>
              <dt>Expediente</dt>
              <dd>{recordNumber}</dd>
            </div>
          )}
        </dl>
      </header>

      {children}
    </div>
  );
}

export function ClinicalSection({
  title,
  description,
  icon: Icon,
  tone = "default",
  aside,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section className={`clinical-section is-${tone} ${className}`.trim()}>
      <header className="clinical-section-header">
        {Icon && (
          <span className="clinical-section-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
        <div className="clinical-section-heading">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {aside && <div className="clinical-section-aside">{aside}</div>}
      </header>
      <div className={`clinical-section-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

export function ClinicalNotice({ variant = "info", title, children, className = "" }) {
  const NoticeIcon = NOTICE_ICONS[variant] || Info;
  const liveRole = variant === "error" || variant === "restriction" ? "alert" : "status";

  return (
    <div className={`clinical-notice is-${variant} ${className}`.trim()} role={liveRole}>
      <span className="clinical-notice-icon" aria-hidden="true">
        <NoticeIcon size={18} />
      </span>
      <div>
        {title && <strong>{title}</strong>}
        <div className="clinical-notice-copy">{children}</div>
      </div>
    </div>
  );
}

export function ClinicalActionBar({ status, detail, readOnly = false, children }) {
  return (
    <div
      className={`clinical-action-bar ${readOnly ? "is-readonly" : ""}`}
      role="region"
      aria-label="Acciones del formulario"
    >
      <div className="clinical-action-status" aria-live="polite">
        <span>{status}</span>
        {detail && <strong>{detail}</strong>}
      </div>
      <div className="clinical-action-buttons">{children}</div>
    </div>
  );
}

export function ClinicalLoadingSkeleton({ label = "Cargando formulario clínico" }) {
  return (
    <div className="clinical-loading" aria-busy="true" aria-live="polite">
      <span className="clinical-sr-only">{label}</span>
      <div className="clinical-loading-header">
        <span className="clinical-skeleton-block is-button" />
        <span className="clinical-skeleton-block is-icon" />
        <div>
          <span className="clinical-skeleton-block is-kicker" />
          <span className="clinical-skeleton-block is-title" />
          <span className="clinical-skeleton-block is-copy" />
        </div>
        <div className="clinical-loading-patient">
          <span className="clinical-skeleton-block is-copy" />
          <span className="clinical-skeleton-block is-copy-short" />
        </div>
      </div>
      <div className="clinical-loading-summary">
        {[0, 1, 2, 3].map((item) => (
          <div key={item}>
            <span className="clinical-skeleton-block is-kicker" />
            <span className="clinical-skeleton-block is-value" />
          </div>
        ))}
      </div>
      <div className="clinical-loading-panel">
        <span className="clinical-skeleton-block is-section-title" />
        <div className="clinical-loading-fields">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <span key={item} className="clinical-skeleton-block is-field" />
          ))}
        </div>
      </div>
    </div>
  );
}
