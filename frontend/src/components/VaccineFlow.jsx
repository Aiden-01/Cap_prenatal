import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ShieldCheck,
  Syringe,
} from "lucide-react";
import {
  VACCINE_CATALOG,
  VACCINE_MOMENT_OPTIONS,
  VACCINE_TYPES,
  clinicalDateFromRecord,
  formatClinicalDateSpanish,
  vaccineDoseLabel,
  vaccineLabel,
  vaccineMomentLabel,
} from "../utils/vaccineSchedule";

function handleRadioNavigation(event) {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = [...(group?.querySelectorAll('[role="radio"]:not(:disabled)') || [])];
  const currentIndex = radios.indexOf(event.currentTarget);
  if (currentIndex < 0 || !radios.length) return;

  event.preventDefault();
  let nextIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = radios.length - 1;
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % radios.length;
  else nextIndex = (currentIndex - 1 + radios.length) % radios.length;

  radios[nextIndex].focus();
  radios[nextIndex].click();
}

export function VaccineSelector({ selected, onSelect, disabled, invalid = false, describedBy }) {
  return (
    <div className="vaccine-choice-grid" role="radiogroup" aria-label="Tipo de vacuna" aria-invalid={invalid} aria-describedby={describedBy}>
      {VACCINE_CATALOG.map((vaccine, index) => {
        const active = selected === vaccine.value;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!selected && index === 0) ? 0 : -1}
            className={`vaccine-choice ${active ? "is-selected" : ""}`}
            key={vaccine.value}
            disabled={disabled}
            onClick={() => onSelect(vaccine.value)}
            onKeyDown={handleRadioNavigation}
          >
            <span className="vaccine-choice-icon"><Syringe size={20} /></span>
            <span>
              <strong>{vaccine.label}</strong>
              <small>{vaccine.description}</small>
            </span>
            {active ? <CheckCircle2 className="vaccine-choice-check" size={19} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function DoseSelector({ definition, selected, suggestedDose, unavailablePositions, onSelect, disabled, invalid = false, describedBy }) {
  if (!definition) return null;
  const firstAvailablePosition = definition.sequence.findIndex((_, index) => !unavailablePositions.has(index + 1)) + 1;
  return (
    <div>
      <p className="vaccine-selector-instruction">Selecciona la dosis según el carné o antecedente disponible de la paciente.</p>
      {suggestedDose ? <p className="vaccine-suggestion">Sugerida según el historial: <strong>{vaccineDoseLabel(definition.value, suggestedDose)}</strong></p> : null}
      <div className="vaccine-dose-grid" role="radiogroup" aria-label="Posición de dosis" aria-invalid={invalid} aria-describedby={describedBy}>
        {definition.sequence.map((label, index) => {
          const position = index + 1;
          const active = Number(selected) === position;
          const unavailable = unavailablePositions.has(position) && !active;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!selected && position === firstAvailablePosition) ? 0 : -1}
              className={`vaccine-dose-choice ${active ? "is-selected" : ""}`}
              disabled={disabled || unavailable}
              key={label}
              onClick={() => onSelect(position)}
              onKeyDown={handleRadioNavigation}
            >
              <span>{position}</span>
              <strong>{label}</strong>
              {unavailable ? <small>Ya registrada</small> : suggestedDose === position ? <small>Sugerida</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MomentSelector({ selected, onSelect, disabled, invalid = false, describedBy }) {
  return (
    <div>
      <p className="vaccine-selector-instruction">Selecciona el momento oficial que consta en el antecedente.</p>
      <div className="vaccine-moment-grid" role="radiogroup" aria-label="Momento de aplicación" aria-invalid={invalid} aria-describedby={describedBy}>
        {VACCINE_MOMENT_OPTIONS.map((option, index) => {
          const active = selected === option.value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!selected && index === 0) ? 0 : -1}
              className={`vaccine-moment-choice ${active ? "is-selected" : ""}`}
              disabled={disabled}
              key={option.value}
              onClick={() => onSelect(option.value)}
              onKeyDown={handleRadioNavigation}
            >
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgressSteps({ status }) {
  return (
    <ol className="vaccine-progress" aria-label={`Avance documentado de ${status.definition.label}`}>
      {status.positionStates.map((item) => {
        const registered = item.state === "registered";
        const missing = item.state === "unregistered";
        const next = item.position === status.nextDose;
        return (
          <li className={`${registered ? "is-complete" : ""} ${missing ? "is-missing" : ""} ${next ? "is-next" : ""}`} key={item.label}>
            <span>
              {registered ? <CheckCircle2 size={15} /> : missing ? <CircleDashed size={15} /> : item.position}
            </span>
            <small>{item.label}</small>
            {missing ? <em>No registrada</em> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function AppointmentCard({ recommendation, preview = false }) {
  if (!recommendation) return null;
  const minimum = formatClinicalDateSpanish(recommendation.minimumDate);
  const suggested = formatClinicalDateSpanish(recommendation.suggestedDate);
  return (
    <aside className={`vaccine-appointment ${preview ? "is-preview" : "is-confirmed"}`} aria-live="polite">
      <span className="vaccine-appointment-icon"><CalendarClock size={22} /></span>
      <div>
        <strong>{preview ? "Vista previa de próxima cita" : "Próxima cita recomendada"}</strong>
        <p>
          {recommendation.completedLabel} de {recommendation.vaccine} {preview ? "permitiría" : "permite"} administrar {recommendation.nextLabel} a partir del {minimum}.
        </p>
        {recommendation.movedForWeekend ? (
          <p>Como esa fecha cae en fin de semana, se recomienda citar a la paciente para el {suggested}.</p>
        ) : (
          <p>Se recomienda citar a la paciente para el {suggested}.</p>
        )}
        {preview ? <small>Recomendación basada en el intervalo mínimo. La información será verificada al guardar.</small> : null}
      </div>
    </aside>
  );
}

export function IntervalWarningCard({ alert }) {
  if (!alert?.minimumDate) return null;
  const minimum = formatClinicalDateSpanish(alert.minimumDate);
  const suggested = formatClinicalDateSpanish(alert.suggestedDate);
  return (
    <aside className="vaccine-appointment is-warning" aria-live="polite">
      <span className="vaccine-appointment-icon"><AlertTriangle size={22} /></span>
      <div>
        <strong>Intervalo pendiente</strong>
        <p>{alert.affectedDose} de {alert.vaccine} puede registrarse a partir del {minimum}.</p>
        {alert.movedForWeekend ? (
          <p>Como la fecha mínima corresponde a fin de semana, se recomienda citar a la paciente para el {suggested}.</p>
        ) : (
          <p>Se recomienda citar a la paciente para el {suggested}.</p>
        )}
        <small>Corrige la fecha antes de registrar esta aplicación.</small>
      </div>
    </aside>
  );
}

export function ClinicalStatus({ type, status, pregnancy, currentGestationalAge, applicationGestationalAge, readOnly }) {
  if (!type || !status) return null;
  if (type === VACCINE_TYPES.INFLUENZA) {
    return (
      <section className="vaccine-status-card vaccine-simple-status" aria-live="polite">
        <div className="vaccine-status-heading">
          <div><span className="vaccine-step-label">Aplicación simple</span><h2>Influenza</h2></div>
        </div>
        <p>Registra la aplicación que consta en el carné o antecedente de la paciente.</p>
      </section>
    );
  }
  const pregnancyState = String(pregnancy?.estado || "").toLowerCase();
  const lastDate = status.lastApplication
    ? formatClinicalDateSpanish(clinicalDateFromRecord(status.lastApplication), { includeWeekday: false })
    : "Sin aplicaciones registradas";

  return (
    <section className="vaccine-status-card" aria-live="polite">
      <div className="vaccine-status-heading">
        <div><span className="vaccine-step-label">Paso 2 · Estado clínico</span><h2>{vaccineLabel(type)}</h2></div>
        <span className={`badge ${status.complete ? "badge-green" : "badge-blue"}`}>
          {status.complete ? "Posición final registrada" : `${status.completed} registrada${status.completed === 1 ? "" : "s"}`}
        </span>
      </div>

      {[VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(type) ? <ProgressSteps status={status} /> : null}

      <div className="vaccine-status-facts">
        <div><span>Aplicaciones registradas</span><strong>{status.completed}</strong></div>
        <div><span>Sugerida según historial</span><strong>{status.nextLabel || "Ninguna"}</strong></div>
        <div><span>Última aplicación registrada</span><strong>{lastDate}</strong></div>
      </div>

      {type === VACCINE_TYPES.TD && status.complete ? (
        <div className="vaccine-clinical-message is-success"><ShieldCheck size={18} /><span><strong>Refuerzo 2 registrado.</strong> No se sugiere otra posición, aunque los huecos documentales pueden completarse posteriormente.</span></div>
      ) : null}

      {type === VACCINE_TYPES.SPR_SR && status.complete ? (
        <div className="vaccine-clinical-message is-success"><ShieldCheck size={18} /><span><strong>Dosis 2 registrada.</strong> El esquema se considera completo; una Dosis 1 ausente sólo indica que no consta en el sistema.</span></div>
      ) : null}

      {type === VACCINE_TYPES.TDAP ? (
        <div className="vaccine-tdap-context">
          <div className="vaccine-clinical-message"><ShieldCheck size={18} /><span><strong>{pregnancyState === "puerperio" ? "Puerperio" : pregnancyState === "cerrado" ? "Embarazo cerrado" : "Embarazo activo"}.</strong> Permitida desde las 20 semanas durante el embarazo.</span></div>
          <div className="vaccine-status-facts is-compact">
            <div><span>Edad gestacional actual</span><strong>{currentGestationalAge ? `${currentGestationalAge.weeks} sem ${currentGestationalAge.days} días` : "No calculable"}</strong></div>
            <div><span>Según fecha ingresada</span><strong>{applicationGestationalAge ? `${applicationGestationalAge.weeks} sem ${applicationGestationalAge.days} días` : "Pendiente"}</strong></div>
            <div><span>Aplicación de este embarazo</span><strong>{status.complete ? "Completada" : "Pendiente"}</strong></div>
          </div>
          {pregnancyState === "activo" ? <p className="vaccine-context-note">La edad gestacional puede cambiar según la fecha histórica ingresada y será comprobada al guardar.</p> : null}
          {pregnancyState === "puerperio" ? <p className="vaccine-context-note">Puede registrarse en postparto si no fue administrada durante este embarazo.</p> : null}
          {readOnly ? <p className="vaccine-context-note is-danger">El embarazo está cerrado y el expediente es de solo lectura.</p> : null}
        </div>
      ) : null}

      {type === VACCINE_TYPES.SPR_SR ? (
        <div className="vaccine-clinical-message is-warning"><AlertTriangle size={18} /><span>SR/SPR no puede registrarse como aplicada durante el embarazo.</span></div>
      ) : null}

      {status.nextAppointment ? <AppointmentCard recommendation={status.nextAppointment} preview /> : null}
    </section>
  );
}

function recordOrigin(record, pregnancy) {
  if (record.embarazo_origen_numero) return `Embarazo ${record.embarazo_origen_numero}`;
  if (String(record.embarazo_id) === String(pregnancy?.id)) return `Embarazo ${pregnancy?.numero_embarazo || "seleccionado"}`;
  return "Antecedente";
}

function RegisteredApplication({ type, record, pregnancy }) {
  return (
    <div>
      <strong>{vaccineDoseLabel(type, record.numero_dosis)}</strong>
      <small>{formatClinicalDateSpanish(clinicalDateFromRecord(record), { includeWeekday: false })} · {vaccineMomentLabel(record.momento)} · {recordOrigin(record, pregnancy)}</small>
    </div>
  );
}

export function VaccineHistory({ type, status, pregnancy }) {
  if (!type || !status) return null;
  const positional = [VACCINE_TYPES.TD, VACCINE_TYPES.SPR_SR].includes(type);
  return (
    <section className="vaccine-selected-history">
      <div className="vaccine-status-heading"><div><span className="vaccine-step-label">Historial visible</span><h2>Aplicaciones de {vaccineLabel(type)}</h2></div></div>
      {positional ? (
        <ol className="vaccine-history-list">
          {status.positionStates.map((item) => (
            <li className={`is-${item.state}`} key={item.position}>
              <span>{item.record ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}</span>
              {item.record ? <RegisteredApplication type={type} record={item.record} pregnancy={pregnancy} /> : (
                <div><strong>{item.label}</strong><small>{item.state === "unregistered" ? "No registrada en el sistema" : "Pendiente"}</small></div>
              )}
            </li>
          ))}
        </ol>
      ) : !status.applications.length ? (
        <p className="vaccine-history-empty">No hay aplicaciones registradas para esta vacuna.</p>
      ) : (
        <ol className="vaccine-history-list">
          {status.applications.map((record) => (
            <li key={record.id}><span><CheckCircle2 size={16} /></span><RegisteredApplication type={type} record={record} pregnancy={pregnancy} /></li>
          ))}
        </ol>
      )}
    </section>
  );
}
