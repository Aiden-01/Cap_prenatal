import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  Ruler,
  Scale,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { isValidPregnancyId } from "../utils/pregnancyState";
import {
  canConsultPrenatalControl,
  prenatalControlDetailPath,
} from "../utils/prenatalControlAccess";

function fecha(value) {
  if (!value) return "-";
  const dateOnly = String(value).split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-GT");
}

function controlTime(control) {
  const value = control.fecha_control || control.fecha;
  if (!value) return 0;
  const dateOnly = String(value).split("T")[0];
  const time = new Date(`${dateOnly}T00:00:00`).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatPeso(control) {
  const peso = control.peso ?? control.peso_kg;
  return peso ? `${peso} kg` : "-";
}

function formatPa(control) {
  if (control.presion_arterial) return control.presion_arterial;
  if (control.pa_sistolica && control.pa_diastolica) return `${control.pa_sistolica}/${control.pa_diastolica}`;
  return "-";
}

function formatSemana(control) {
  return control.semana_gestacional || control.edad_gestacional_semanas || "-";
}

function isControlComplete(control) {
  return Boolean(
    (control.fecha_control || control.fecha) &&
      formatSemana(control) !== "-" &&
      formatPeso(control) !== "-" &&
      (control.frecuencia_cardiaca_fetal || control.fcf) &&
      (control.presentacion || control.presentacion_fetal)
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="prenatal-detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function ControlRow({ control, index, pacienteId, embarazoId, puedeConsultarControles, isOpen, onToggle }) {
  const navigate = useNavigate();
  const observaciones = control.observaciones || control.impresion_clinica;
  const numeroControl = control.numero_control ?? index + 1;
  const complete = isControlComplete(control);
  const estadoClass = control.tiene_hallazgo ? "badge-red" : complete ? "badge-green" : "badge-orange";
  const estadoLabel = control.tiene_hallazgo ? "Hallazgo" : complete ? "Completo" : "Incompleto";
  const EstadoIcon = control.tiene_hallazgo ? AlertTriangle : complete ? CheckCircle2 : AlertTriangle;
  const puedeConsultar = canConsultPrenatalControl({
    canRead: puedeConsultarControles,
    pacienteId,
    embarazoId,
    controlId: control.id,
  });

  const openControl = () => {
    if (!puedeConsultar) return;
    navigate(prenatalControlDetailPath({ pacienteId, embarazoId, controlId: control.id }));
  };

  return (
    <div className={`prenatal-control-record ${isOpen ? "is-open" : ""}`}>
      <div className="prenatal-control-row">
        <button
          type="button"
          className="prenatal-row-toggle"
          onClick={onToggle}
          aria-label={isOpen ? "Ocultar observacion" : "Ver observacion"}
        >
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <strong className="prenatal-control-number">#{numeroControl}</strong>
        <span className="prenatal-cell" data-label="Fecha">{fecha(control.fecha_control || control.fecha)}</span>
        <span className="prenatal-cell" data-label="Semana">{formatSemana(control)}</span>
        <span className="prenatal-cell" data-label="Peso">{formatPeso(control)}</span>
        <span className="prenatal-cell" data-label="PA">{formatPa(control)}</span>
        <span className="prenatal-cell" data-label="FCF">{control.frecuencia_cardiaca_fetal || control.fcf || "-"}</span>
        <span className="prenatal-cell" data-label="Presentacion">{control.presentacion || control.presentacion_fetal || "-"}</span>
        <span className={`badge prenatal-status ${estadoClass}`}>
          <EstadoIcon size={13} /> {estadoLabel}
        </span>
        <div className="prenatal-actions">
          <button
            type="button"
            className="btn-secondary prenatal-open-button"
            onClick={openControl}
            disabled={!puedeConsultar}
          >
            <ExternalLink size={14} /> Abrir
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="prenatal-observation-panel">
          <div className="prenatal-observation-note">
            <ClipboardList size={18} />
            <div>
              <span>Observacion clinica</span>
              <p>{observaciones || "Sin observacion clinica registrada."}</p>
            </div>
          </div>
          <div className="prenatal-detail-grid">
            <DetailItem label="Situacion" value={control.situacion || control.situacion_fetal} />
            <DetailItem label="Motivo" value={control.motivo_consulta} />
            <DetailItem label="Altura uterina" value={control.altura_uterina_cm ? `${control.altura_uterina_cm} cm` : null} />
            <DetailItem label="Temperatura" value={control.temperatura ? `${control.temperatura} °C` : null} />
            <DetailItem label="Tratamiento" value={control.tratamiento} />
            <DetailItem label="Proxima cita" value={fecha(control.cita_siguiente)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimelineControles({
  pacienteId,
  embarazoId,
  controles = [],
  isReadOnly = false,
  puedeConsultar = false,
  puedeCrear = false,
}) {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState(null);
  const hasEmbarazoId = isValidPregnancyId(embarazoId);

  const controlesOrdenados = Array.isArray(controles)
    ? [...controles].sort((a, b) => controlTime(b) - controlTime(a))
    : [];

  if (!controlesOrdenados.length) {
    return (
      <div className="card empty-state" style={{ display: "grid", justifyItems: "center", gap: "0.85rem" }}>
        <ClipboardList size={28} style={{ color: "var(--primary)" }} />
        <span>Sin controles registrados aun</span>
        {!isReadOnly && puedeCrear && hasEmbarazoId && (
          <button className="btn-primary" onClick={() => navigate(`/pacientes/${pacienteId}/controles/nuevo?embarazo_id=${encodeURIComponent(embarazoId)}`)}>
            Registrar primer control
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="prenatal-controls-card">
      <div className="prenatal-controls-titlebar">
        <div className="prenatal-controls-icon">
          <HeartPulse size={24} />
        </div>
        <div>
          <h3>Controles prenatales</h3>
          <p>Seguimiento y monitoreo de controles prenatales</p>
        </div>
      </div>
      <div className="prenatal-controls-table">
        <div className="prenatal-controls-head" aria-hidden="true">
          <span></span>
          <span>Control</span>
          <span><CalendarDays size={14} /> Fecha</span>
          <span><Ruler size={14} /> Semana</span>
          <span><Scale size={14} /> Peso</span>
          <span><HeartPulse size={14} /> PA</span>
          <span><Stethoscope size={14} /> FCF</span>
          <span>Presentacion</span>
          <span><ShieldCheck size={14} /> Estado</span>
          <span>Accion</span>
        </div>
        {controlesOrdenados.map((control, index) => (
          <ControlRow
            key={control.id}
            control={control}
            index={index}
            pacienteId={pacienteId}
            embarazoId={embarazoId}
            puedeConsultarControles={puedeConsultar}
            isOpen={expandedId === control.id}
            onToggle={() => setExpandedId((value) => (value === control.id ? null : control.id))}
          />
        ))}
      </div>
      <div className="prenatal-controls-footer">
        Mostrando {controlesOrdenados.length} de {controlesOrdenados.length} controles
      </div>
    </section>
  );
}
