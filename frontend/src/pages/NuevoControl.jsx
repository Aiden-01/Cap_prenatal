import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import {
  Activity,
  AlertTriangle,
  Baby,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  HeartPulse,
  Pill,
  Save,
  Stethoscope,
} from "lucide-react";
import { getGuatemalaDateInputValue, getGuatemalaTimeInputValue } from "../utils/guatemalaTime";
import { calculateGestationalWeeks } from "../utils/gestationalAge";
import { getErrorMessage, getFieldErrors } from "../utils/errorMessage";
import { isValidPregnancyId } from "../utils/pregnancyState";
import {
  ClinicalActionBar,
  ClinicalLoadingSkeleton,
  ClinicalNotice,
  ClinicalSection,
  ClinicalWorkflowShell,
} from "../components/clinical/ClinicalWorkflow";
import {
  canConsultPrenatalControl,
  canEditPrenatalControl,
} from "../utils/prenatalControlAccess";
import "./nuevo-control.css";

// ─── HELPERS ────────────────────────────────────────────────
function Field({ label, children, col, error, htmlFor }) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className="form-group" style={col ? { gridColumn: `span ${col}` } : {}}>
      <label className="input-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <div id={errorId} className="field-error-text" role="alert">{error}</div>}
    </div>
  );
}

function blurNumberInputOnWheel(event) {
  event.currentTarget.blur();
}

function Inp({ label, name, type = "text", form, set, col, errors = {}, ...rest }) {
  const error = errors[name];
  const inputId = `control-${name}`;
  return (
    <Field label={label} col={col} error={error} htmlFor={inputId}>
      <input
        id={inputId}
        name={name}
        className={`input-field ${error ? "input-error" : ""}`}
        type={type}
        value={form[name] ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onWheel={type === "number" ? blurNumberInputOnWheel : undefined}
        onChange={(e) =>
          set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        {...rest}
      />
    </Field>
  );
}

function Toggle({ label, name, form, set, disabled = false }) {
  const val = form[name] ?? false;
  return (
    <button
      type="button"
      onClick={() => set(name, !val)}
      className={`toggle-control ${val ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}
      aria-pressed={Boolean(val)}
      aria-disabled={disabled}
      disabled={disabled}
    >
      <div className="toggle-mark">
        {val && "✓"}
      </div>
      <span className="toggle-label">
        {label}
      </span>
    </button>
  );
}

function LabEntry({ label, realizadoKey, form, set, disabled = false, children }) {
  const realizado = Boolean(form[realizadoKey]);
  return (
    <div className="lab-row control-lab-entry">
      <div className="control-lab-check">
        <Toggle label={label} name={realizadoKey} form={form} set={set} disabled={disabled} />
        <span className={`control-lab-state ${realizado ? "is-complete" : ""}`}>
          {realizado ? "Realizado" : "No realizado"}
        </span>
      </div>
      <div className="control-lab-result">
        {realizado ? children : <span className="control-lab-empty">Sin resultado registrado</span>}
      </div>
    </div>
  );
}

function LabRow({ label, realizadoKey, resultadoKey, form, set, errors = {}, extra, disabled = false }) {
  const error = errors[resultadoKey];
  const inputId = `control-${resultadoKey}`;
  return (
    <LabEntry label={label} realizadoKey={realizadoKey} form={form} set={set} disabled={disabled}>
      <div className="control-lab-result-fields">
          <input
            id={inputId}
            name={resultadoKey}
            className={`input-field ${error ? "input-error" : ""}`}
            placeholder="Resultado"
            aria-label={`${label}: resultado`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            value={form[resultadoKey] ?? ""}
            onChange={(e) => set(resultadoKey, e.target.value)}
            disabled={disabled}
          />
          {extra}
          {error && <div id={`${inputId}-error`} className="field-error-text" role="alert" style={{ flexBasis: "100%" }}>{error}</div>}
      </div>
    </LabEntry>
  );
}

function ResultadoSelect({ value, onChange, error, inputId, name, label }) {
  return (
    <select
      id={inputId}
      name={name}
      aria-label={label}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${inputId}-error` : undefined}
      className={`input-field ${error ? "input-error" : ""}`}
      style={{ minWidth: 130 }}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-</option>
      <option value="positivo">Positivo (+)</option>
      <option value="negativo">Negativo (-)</option>
    </select>
  );
}

const BLOOD_GROUP_OPTIONS = ["O", "A", "B", "AB"];

function parseBloodGroupRh(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  const rh = normalized.endsWith("+") ? "+" : normalized.endsWith("-") ? "-" : "";
  const group = rh ? normalized.slice(0, -1) : normalized;

  return {
    group: BLOOD_GROUP_OPTIONS.includes(group) ? group : "",
    rh,
  };
}

function BloodGroupRh({ form, set, errors = {} }) {
  const error = errors.grupo_rh_resultado;
  const inputId = "control-grupo_rh_resultado";
  const { group, rh } = parseBloodGroupRh(form.grupo_rh_resultado);

  const updateValue = (nextGroup, nextRh) => {
    set("grupo_rh_resultado", nextGroup ? `${nextGroup}${nextRh || ""}` : "");
  };

  return (
    <Field label="Resultado" error={error} htmlFor={inputId}>
      <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          id={inputId}
          name="grupo_rh_resultado"
          className={`input-field ${error ? "input-error" : ""}`}
          style={{ width: 120, minWidth: 120 }}
          value={group}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(e) => updateValue(e.target.value, rh)}
        >
          <option value="">Grupo</option>
          {BLOOD_GROUP_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>RH</span>
          {["+", "-"].map((option) => (
            <button
              key={option}
              type="button"
              className={`btn-secondary ${rh === option ? "is-active" : ""}`}
              onClick={() => updateValue(group, rh === option ? "" : option)}
              style={{
                width: 38,
                height: 38,
                padding: 0,
                justifyContent: "center",
                borderColor: rh === option ? "var(--primary)" : "var(--border)",
                background: rh === option ? "var(--primary-lt)" : "var(--surface)",
                color: rh === option ? "var(--primary)" : "var(--text)",
                fontWeight: 800,
              }}
              aria-pressed={rh === option}
              aria-label={`Factor RH ${option === "+" ? "positivo" : "negativo"}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}

// ─── ESTADO INICIAL ──────────────────────────────────────────
const INIT = {
  numero_control: 1,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
  motivo_consulta: "",
  // Signos de peligro
  peligro_hemorragia_vaginal: false, peligro_palidez: false,
  peligro_dolor_cabeza: false, peligro_hipertension: false,
  peligro_dolor_epigastrico: false, peligro_trastornos_visuales: false,
  peligro_fiebre: false, peligro_otro: "",
  // Info
  edad_gestacional_semanas: "", nombre_acompanante: "", nombre_cargo_atiende: "",
  // Examen físico
  pa_sistolica: "", pa_diastolica: "", frecuencia_cardiaca: "",
  frecuencia_respiratoria: "", temperatura: "", perimetro_braquial_cm: "",
  peso_kg: "", talla_cm: "", imc: "",
  examen_bucodental: null, examen_mamas: null,
  // Examen obstétrico
  altura_uterina_cm: "", fcf: "", movimientos_fetales: null,
  situacion_fetal: "", presentacion_fetal: "",
  // Ginecológico
  sangre_manchado: false, verrugas_herpes_papilomas: false,
  flujo_vaginal: false, otros_ginecologico: "",
  // Labs
  hematologia_realizada: false, hematologia_resultado: "",
  glicemia_realizada: false, glicemia_resultado: "",
  grupo_rh_realizado: false, grupo_rh_resultado: "",
  orina_realizada: false, orina_bacteriuria: null, orina_proteinuria: null,
  heces_realizada: false, heces_resultado: "",
  vih_realizado: false, vih_resultado: "", vih_resultado_valor: "",
  vdrl_realizado: false, vdrl_resultado: "", vdrl_tratamiento_indicado: false,
  torch_realizado: false, torch_resultado_positivo: null, torch_resultado_valor: "",
  papanicolau_ivaa_realizado: false, papanicolau_ivaa_fecha_toma: "", papanicolau_ivaa_resultado: "",
  hepatitis_b_realizado: false, hepatitis_b_resultado: "",
  otros_lab: "",
  // USG
  usg_realizado: false, usg_hallazgos: "",
  // Suplementación
  sulfato_ferroso: false, sulfato_ferroso_tabletas: "",
  acido_folico: false, acido_folico_tabletas: "",
  suplementacion_hallazgos: "", suplementacion_tratamiento: "",
  // Orientaciones
  orient_plan_emergencia_parto: false, orient_alimentacion_embarazo: false,
  orient_senales_peligro: false, orient_lactancia_materna: false,
  orient_planificacion_familiar: false, orient_importancia_postparto: false,
  orient_vacunacion_nino: false, orient_pre_post_prueba_vih: false,
  orient_importancia_atenciones: false, orient_tratamiento_its_pareja: false,
  orient_otros: "",
  // IC / Tx
  impresion_clinica: "", tratamiento: "", cita_siguiente: "",
};

const initialControlForm = () => ({
  ...INIT,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
});

const TABS = [
  { id: "general",       label: "General",       icon: Stethoscope  },
  { id: "laboratorio",   label: "Laboratorios",  icon: FlaskConical },
  { id: "suplementacion",label: "Suplementación",icon: Pill         },
  { id: "orientaciones", label: "Orientaciones", icon: BookOpen     },
];

const CONTROL_FIELD_LABELS = {
  numero_control: "No. Control",
  fecha: "Fecha",
  hora: "Hora",
  edad_gestacional_semanas: "Semanas de gestación",
  pa_sistolica: "P/A Sistólica",
  pa_diastolica: "P/A Diastólica",
  frecuencia_cardiaca: "FC (x min)",
  frecuencia_respiratoria: "FR (x min)",
  temperatura: "Temperatura",
  perimetro_braquial_cm: "Perímetro braquial",
  peso_kg: "Peso",
  talla_cm: "Talla",
  imc: "IMC",
  altura_uterina_cm: "Altura uterina",
  fcf: "FCF",
  cita_siguiente: "Cita siguiente",
  vih_resultado: "Resultado VIH",
  vdrl_resultado: "Resultado VDRL / RPR",
  papanicolau_ivaa_resultado: "Resultado Papanicolau / IVAA",
  hepatitis_b_resultado: "Resultado Hepatitis B",
  sulfato_ferroso_tabletas: "Tabletas de sulfato ferroso",
  acido_folico_tabletas: "Tabletas de ácido fólico",
};

const CONTROL_TAB_BY_FIELD = {
  pa_sistolica: "general",
  pa_diastolica: "general",
  frecuencia_cardiaca: "general",
  frecuencia_respiratoria: "general",
  temperatura: "general",
  perimetro_braquial_cm: "general",
  peso_kg: "general",
  talla_cm: "general",
  imc: "general",
  altura_uterina_cm: "general",
  fcf: "general",
  cita_siguiente: "general",
  vih_resultado: "laboratorio",
  vdrl_resultado: "laboratorio",
  papanicolau_ivaa_resultado: "laboratorio",
  hepatitis_b_resultado: "laboratorio",
  sulfato_ferroso_tabletas: "suplementacion",
  acido_folico_tabletas: "suplementacion",
};

function toDateInputValue(value, fallback = "") {
  if (!value) return fallback;
  const dateOnly = String(value).split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : dateOnly;
}

function normalizeControlForForm(control) {
  const initial = initialControlForm();
  return Object.fromEntries(
    Object.entries(control || {}).map(([key, value]) => [key, value ?? initial[key] ?? ""])
  );
}

function inferControlFieldErrors(err) {
  const code = err?.response?.data?.code;
  const message = getErrorMessage(err, "");

  if (code === "DUPLICATE_RESOURCE" && message.toLowerCase().includes("control")) {
    return { numero_control: message };
  }

  return {};
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function NuevoControl() {
  const { id, controlId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const hasEmbarazoId = isValidPregnancyId(embarazoId);
  const editando = Boolean(controlId);
  const expedientePath = hasEmbarazoId
    ? `/pacientes/${id}?embarazo_id=${encodeURIComponent(embarazoId)}&tab=controles`
    : `/pacientes/${id}?tab=controles`;
  const toast    = useGlobalToast();
  const { usuario } = useAuth();
  const tienePermisoLectura = Boolean(usuario?.permisos?.includes("pacientes.ver"));
  const tienePermisoEscritura = Boolean(usuario?.permisos?.includes(editando ? "controles.editar" : "controles.crear"));
  const puedeVerVih = usuario?.permisos?.includes("controles.ver_vih");
  const puedeCapturarVih = !controlId || puedeVerVih;
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab]         = useState("general");
  const [form, setForm]       = useState(initialControlForm);
  const [fur, setFur]         = useState("");
  const [paciente, setPaciente] = useState(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const todayInputValue = getGuatemalaDateInputValue();
  const puedeConsultar = editando && canConsultPrenatalControl({
    canRead: tienePermisoLectura,
    pacienteId: id,
    embarazoId,
    controlId,
  });
  const puedeEditar = editando
    ? canEditPrenatalControl({
      canConsult: puedeConsultar,
      canWrite: tienePermisoEscritura,
      isReadOnly,
    })
    : Boolean(hasEmbarazoId && tienePermisoEscritura && !isReadOnly);
  const soloLectura = editando && puedeConsultar && !puedeEditar;

  const set = (k, v) => {
    if (soloLectura) return;
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((errors) => {
      if (!errors[k]) return errors;
      const next = { ...errors };
      delete next[k];
      return next;
    });
  };
  const inputClass = (name) => `input-field ${fieldErrors[name] ? "input-error" : ""}`;
  const fieldError = (name) => fieldErrors[name];
  const p = { form, set, errors: fieldErrors, disabled: soloLectura };
  const handleTabKeyDown = (event, currentTabId) => {
    const currentIndex = TABS.findIndex((item) => item.id === currentTabId);
    let nextIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % TABS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTabId = TABS[nextIndex].id;
    setTab(nextTabId);
    requestAnimationFrame(() => document.getElementById(`control-tab-${nextTabId}`)?.focus());
  };
  const visibleFieldErrors = Object.entries(fieldErrors).map(([field, message]) => ({
    field,
    label: CONTROL_FIELD_LABELS[field] || field,
    message,
  }));

  useEffect(() => {
    if (!hasEmbarazoId) {
      toast("Selecciona un embarazo antes de registrar controles", "error");
      navigate(`/pacientes/${id}?tab=controles`, { replace: true });
      return;
    }
    const parseControl = (control) => {
      const normalized = normalizeControlForForm(control);
      return ({
      ...initialControlForm(),
      ...normalized,
      vih_resultado: control.vih_resultado === "no_aplica" ? "" : control.vih_resultado ?? "",
      vih_resultado_valor: control.vih_resultado_valor ?? "",
      torch_resultado_valor: "",
      papanicolau_ivaa_fecha_toma: "",
      fecha: toDateInputValue(control.fecha, INIT.fecha),
      cita_siguiente: toDateInputValue(control.cita_siguiente),
    });
    };

    const controlesRequest = editando
      ? api.get(`/pacientes/${id}/controles/${controlId}`, { params: { embarazo_id: embarazoId } })
      : api.get(`/pacientes/${id}/controles`, { params: { embarazo_id: embarazoId } });

    Promise.all([controlesRequest, api.get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId } })])
      .then(([{ data }, { data: expediente }]) => {
        const readOnly = Boolean(expediente?.is_read_only);
        setIsReadOnly(readOnly);
        if (readOnly && !editando) {
          toast("El embarazo esta cerrado y es de solo lectura", "error");
          navigate(expedientePath, { replace: true });
          return;
        }
        setFur(expediente?.embarazo_seleccionado?.fur || "");
        setPaciente(expediente?.paciente || null);
        if (editando) {
          setForm(parseControl(data));
          return;
        }
        const ultimo = Math.max(0, ...(data || []).map((control) => Number(control.numero_control) || 0));
        setForm((f) => ({ ...f, numero_control: ultimo + 1 }));
      })
      .catch(() => toast(editando ? "Error al cargar control" : "Error al calcular siguiente control", "error"))
      .finally(() => setLoadingData(false));
  }, [id, controlId, editando, embarazoId, expedientePath, hasEmbarazoId, navigate, toast]);

  const edadGestacionalSemanas = calculateGestationalWeeks(fur, form.fecha);
  const formConEdadGestacional = {
    ...form,
    edad_gestacional_semanas: edadGestacionalSemanas,
  };
  const nombrePaciente = [paciente?.nombres, paciente?.apellidos].filter(Boolean).join(" ");
  const workflowMode = soloLectura ? "readonly" : editando ? "edit" : "new";
  const workflowTitle = soloLectura
    ? "Detalle del Control Prenatal"
    : editando
      ? "Editar Control Prenatal"
      : "Registrar Control Prenatal";
  const workflowDescription = soloLectura
    ? `Control ${form.numero_control} · Consulta histórica`
    : editando
      ? `Control ${form.numero_control}`
      : `Se registrará como control ${form.numero_control}`;

  // IMC automático
  const handlePeso = (v) => {
    set("peso_kg", v);
    if (v && form.talla_cm) {
      const h = Number(form.talla_cm) / 100;
      set("imc", h > 0 ? +(Number(v) / (h * h)).toFixed(1) : "");
    }
  };
  const handleTalla = (v) => {
    set("talla_cm", v);
    if (v && form.peso_kg) {
      const h = Number(v) / 100;
      set("imc", h > 0 ? +(Number(form.peso_kg) / (h * h)).toFixed(1) : "");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!puedeEditar) {
      toast("Este control es de solo lectura", "error");
      return;
    }
    if (!hasEmbarazoId) {
      toast("Selecciona un embarazo antes de guardar el control", "error");
      return;
    }
    setLoading(true);
    setFieldErrors({});
    const payload = {
      ...form,
      edad_gestacional_semanas: edadGestacionalSemanas,
      vih_resultado_valor: "",
      vdrl_tratamiento_indicado: false,
      torch_resultado_valor: "",
      papanicolau_ivaa_fecha_toma: "",
    };
    if (editando && !puedeVerVih) {
      delete payload.vih_realizado;
      delete payload.vih_resultado;
      delete payload.vih_resultado_valor;
    }
    try {
      if (editando) {
        await api.put(`/pacientes/${id}/controles/${controlId}`, payload, { params: { embarazo_id: embarazoId } });
      } else {
        await api.post(`/pacientes/${id}/controles`, payload, { params: { embarazo_id: embarazoId } });
      }
      toast(editando ? "Control actualizado exitosamente" : "Control registrado exitosamente", "success");
      setTimeout(() => navigate(expedientePath), 800);
    } catch (err) {
      const parsedFieldErrors = getFieldErrors(err);
      const nextFieldErrors = Object.keys(parsedFieldErrors).length
        ? parsedFieldErrors
        : inferControlFieldErrors(err);
      const firstErrorField = Object.keys(nextFieldErrors)[0];
      setFieldErrors(nextFieldErrors);
      if (firstErrorField && CONTROL_TAB_BY_FIELD[firstErrorField]) {
        setTab(CONTROL_TAB_BY_FIELD[firstErrorField]);
      }
      const fieldLabel = CONTROL_FIELD_LABELS[firstErrorField];
      toast(
        fieldLabel ? `${fieldLabel}: ${nextFieldErrors[firstErrorField]}` : getErrorMessage(err, "Error al guardar"),
        "error"
      );
    } finally { setLoading(false); }
  };

  return (
    <ClinicalWorkflowShell
      className="control-workflow"
      onBack={() => navigate(expedientePath)}
      eyebrow="Atención prenatal"
      title={workflowTitle}
      description={workflowDescription}
      patientName={nombrePaciente}
      recordNumber={paciente?.no_expediente}
      mode={workflowMode}
      icon={Stethoscope}
    >
      {loadingData ? (
        <ClinicalLoadingSkeleton label="Cargando control prenatal" />
      ) : (
      <form className="control-workflow-form" onSubmit={handleSubmit}>
        {soloLectura && (
          <ClinicalNotice variant="readonly" title="Consulta histórica" className="control-workflow-notice">
            Este embarazo está cerrado. Puedes revisar toda la información del control, pero no modificarla.
          </ClinicalNotice>
        )}

        {visibleFieldErrors.length > 0 && (
          <ClinicalNotice variant="error" title="Revisa estos datos" className="control-workflow-notice">
            {visibleFieldErrors.map((error) => `${error.label}: ${error.message}`).join(" · ")}
          </ClinicalNotice>
        )}

        <fieldset disabled={soloLectura} className="control-form-fieldset">
        <div className="control-context-summary" aria-label="Resumen del control">
          <div className="control-context-item">
            <span className="control-context-icon" aria-hidden="true"><ClipboardList size={16} /></span>
            <div><span>No. de control</span><strong>{form.numero_control || "—"}</strong></div>
          </div>
          <div className="control-context-item">
            <span className="control-context-icon" aria-hidden="true"><CalendarDays size={16} /></span>
            <div><span>Fecha</span><strong>{form.fecha || "Por definir"}</strong></div>
          </div>
          <div className="control-context-item">
            <span className="control-context-icon" aria-hidden="true"><Baby size={16} /></span>
            <div><span>Edad gestacional</span><strong>{edadGestacionalSemanas === "" ? "Sin dato" : `${edadGestacionalSemanas} semanas`}</strong></div>
          </div>
          <div className="control-context-item">
            <span className="control-context-icon" aria-hidden="true"><CalendarDays size={16} /></span>
            <div><span>Próxima cita</span><strong>{form.cita_siguiente || "Por definir"}</strong></div>
          </div>
        </div>

        <div className="control-foundation-panel">
        <ClinicalSection
          title="Datos del control"
          description="Identificación y contexto de esta atención prenatal."
          icon={ClipboardList}
        >
          <div className="form-section-body col-4">
            <Field label="No. Control" htmlFor="control-numero_control" error={fieldError("numero_control")}>
              <select id="control-numero_control" name="numero_control" className={inputClass("numero_control")} value={form.numero_control}
                aria-invalid={Boolean(fieldError("numero_control"))}
                aria-describedby={fieldError("numero_control") ? "control-numero_control-error" : undefined}
                onChange={(e) => set("numero_control", Number(e.target.value))}>
                {[1,2,3,4].map(n => <option key={n} value={n}>{n}° Control</option>)}
                {[5,6,7,8,9,10].map(n => <option key={n} value={n}>Otro ({n})</option>)}
              </select>
            </Field>
            <Inp label="Fecha" name="fecha" type="date" max={todayInputValue} {...p} />
            <Inp label="Hora" name="hora" type="time" {...p} />
            <Inp label="Semanas de gestación" name="edad_gestacional_semanas" type="number" form={formConEdadGestacional} set={set} errors={fieldErrors} readOnly />
          </div>
          <div className="form-section-body col-2" style={{ marginTop: "0.5rem" }}>
            <Inp label="Motivo de consulta" name="motivo_consulta" {...p} />
            <Inp label="Nombre del acompañante" name="nombre_acompanante" {...p} />
            <Inp label="Nombre y cargo de quien atiende" name="nombre_cargo_atiende" {...p} col={2} />
          </div>
        </ClinicalSection>

        <ClinicalSection
          title="Signos de peligro"
          description="Marca únicamente los signos identificados durante esta atención."
          icon={AlertTriangle}
          tone="danger"
          className="control-danger-section"
        >
          <div className="control-toggle-grid">
            <Toggle label="Hemorragia vía vaginal" name="peligro_hemorragia_vaginal" {...p} />
            <Toggle label="Palidez" name="peligro_palidez" {...p} />
            <Toggle label="Dolor de cabeza" name="peligro_dolor_cabeza" {...p} />
            <Toggle label="Hipertensión" name="peligro_hipertension" {...p} />
            <Toggle label="Dolor boca del estómago" name="peligro_dolor_epigastrico" {...p} />
            <Toggle label="Trastornos visuales" name="peligro_trastornos_visuales" {...p} />
            <Toggle label="Fiebre" name="peligro_fiebre" {...p} />
          </div>
          <div className="control-danger-other">
            <Inp label="Otro signo de peligro" name="peligro_otro" {...p} placeholder="Especifique..." />
          </div>
        </ClinicalSection>
        </div>
        </fieldset>

        {/* TABS */}
        <div className="control-workflow-tabs" role="tablist" aria-label="Áreas del control prenatal" aria-orientation="horizontal">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                id={`control-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`control-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(event) => handleTabKeyDown(event, t.id)}
                className={`control-workflow-tab ${tab === t.id ? "is-active" : ""}`}
              >
                <Icon size={14} aria-hidden="true" />{t.label}
              </button>
            );
          })}
        </div>

        <fieldset disabled={soloLectura} className="control-form-fieldset">
        {/* ── TAB: GENERAL ── */}
        {tab === "general" && (
          <div
            key="general"
            id="control-panel-general"
            className="control-tab-panel"
            role="tabpanel"
            aria-labelledby="control-tab-general"
            tabIndex={0}
          >
            <ClinicalSection
              title="Examen físico"
              description="Signos vitales, antropometría y evaluaciones físicas."
              icon={Activity}
            >
              <div className="form-section-body col-4">
                <Inp label="P/A Sistólica" name="pa_sistolica" type="number" {...p} />
                <Inp label="P/A Diastólica" name="pa_diastolica" type="number" {...p} />
                <Inp label="FC (x min)" name="frecuencia_cardiaca" type="number" {...p} />
                <Inp label="FR (x min)" name="frecuencia_respiratoria" type="number" {...p} />
                <Inp label="Temperatura (°C)" name="temperatura" type="number" {...p} />
                <Inp label="Perímetro braquial (cm)" name="perimetro_braquial_cm" type="number" {...p} />
                <Field label="Peso (kg)" htmlFor="control-peso_kg" error={fieldError("peso_kg")}>
                  <input id="control-peso_kg" name="peso_kg" className={inputClass("peso_kg")} type="number" value={form.peso_kg ?? ""}
                    aria-invalid={Boolean(fieldError("peso_kg"))}
                    aria-describedby={fieldError("peso_kg") ? "control-peso_kg-error" : undefined}
                    onWheel={blurNumberInputOnWheel}
                    onChange={(e) => handlePeso(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Talla (cm)" htmlFor="control-talla_cm" error={fieldError("talla_cm")}>
                  <input id="control-talla_cm" name="talla_cm" className={inputClass("talla_cm")} type="number" value={form.talla_cm ?? ""}
                    aria-invalid={Boolean(fieldError("talla_cm"))}
                    aria-describedby={fieldError("talla_cm") ? "control-talla_cm-error" : undefined}
                    onWheel={blurNumberInputOnWheel}
                    onChange={(e) => handleTalla(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Inp label="IMC" name="imc" type="number" {...p} />
              </div>
              <div className="control-inline-toggles">
                <Toggle label="Examen bucodental (Si)" name="examen_bucodental" {...p} />
                <Toggle label="Examen de mamas (Si)" name="examen_mamas" {...p} />
              </div>
            </ClinicalSection>

            <ClinicalSection
              title="Examen obstétrico"
              description="Evaluación del crecimiento y bienestar fetal."
              icon={Baby}
            >
              <div className="form-section-body col-4">
                <Inp label="Altura uterina (cm)" name="altura_uterina_cm" type="number" {...p} />
                <Inp label="FCF (lpm)" name="fcf" type="number" {...p} />
                <Inp label="Situación fetal" name="situacion_fetal" {...p} />
                <Inp label="Presentación fetal" name="presentacion_fetal" {...p} />
              </div>
              <div className="control-inline-toggles">
                <Toggle label="Movimientos fetales" name="movimientos_fetales" {...p} />
              </div>
            </ClinicalSection>

            <ClinicalSection
              title="Examen ginecológico"
              description="Hallazgos observados durante la evaluación."
              icon={HeartPulse}
            >
              <div className="control-toggle-grid">
                <Toggle label="Sangre o manchado" name="sangre_manchado" {...p} />
                <Toggle label="Verrugas/Herpes/Papilomas/Úlceras" name="verrugas_herpes_papilomas" {...p} />
                <Toggle label="Flujo vaginal" name="flujo_vaginal" {...p} />
              </div>
              <div className="control-section-followup">
                <Inp label="Otros hallazgos ginecológicos" name="otros_ginecologico" {...p} />
              </div>
            </ClinicalSection>

            <ClinicalSection
              title="Impresión clínica y tratamiento"
              description="Conclusión de la atención, conducta indicada y seguimiento."
              icon={FileText}
            >
              <div className="form-section-body col-2">
                <Field label="Impresión clínica" htmlFor="control-impresion_clinica" col={2} error={fieldError("impresion_clinica")}>
                  <textarea id="control-impresion_clinica" name="impresion_clinica" className={inputClass("impresion_clinica")} rows={2} value={form.impresion_clinica}
                    aria-invalid={Boolean(fieldError("impresion_clinica"))}
                    aria-describedby={fieldError("impresion_clinica") ? "control-impresion_clinica-error" : undefined}
                    onChange={(e) => set("impresion_clinica", e.target.value)} />
                </Field>
                <Field label="Tratamiento" htmlFor="control-tratamiento" col={2} error={fieldError("tratamiento")}>
                  <textarea id="control-tratamiento" name="tratamiento" className={inputClass("tratamiento")} rows={2} value={form.tratamiento}
                    aria-invalid={Boolean(fieldError("tratamiento"))}
                    aria-describedby={fieldError("tratamiento") ? "control-tratamiento-error" : undefined}
                    onChange={(e) => set("tratamiento", e.target.value)} />
                </Field>
                <Inp label="Cita siguiente" name="cita_siguiente" type="date" {...p} />
              </div>
            </ClinicalSection>
          </div>
        )}

        {/* ── TAB: LABORATORIOS ── */}
        {tab === "laboratorio" && (
          <div
            key="laboratorio"
            id="control-panel-laboratorio"
            className="control-tab-panel"
            role="tabpanel"
            aria-labelledby="control-tab-laboratorio"
            tabIndex={0}
          >
            <ClinicalSection
              title="Laboratorios y estudios"
              description="Marca los exámenes realizados en este control y registra el resultado disponible."
              icon={FlaskConical}
            >
            <div className="control-lab-list">
              <div className="control-lab-head" aria-hidden="true">
                <span>Examen y estado</span>
                <span>Resultado</span>
              </div>

            <LabRow label="Hematología" realizadoKey="hematologia_realizada" resultadoKey="hematologia_resultado" {...p} />
            <LabRow label="Glicemia en ayunas" realizadoKey="glicemia_realizada" resultadoKey="glicemia_resultado" {...p} />
            <LabEntry label="Grupo y RH" realizadoKey="grupo_rh_realizado" {...p}>
              <BloodGroupRh {...p} />
            </LabEntry>

            {/* Orina — con bacteriuria y proteinuria */}
            <LabEntry label="Orina" realizadoKey="orina_realizada" {...p}>
              <div className="control-lab-result-fields">
                <Toggle label="Bacteriuria +" name="orina_bacteriuria" {...p} />
                <Toggle label="Proteinuria +" name="orina_proteinuria" {...p} />
              </div>
            </LabEntry>

            <LabRow label="Heces" realizadoKey="heces_realizada" resultadoKey="heces_resultado" {...p} />

            {puedeCapturarVih && (
              <LabEntry label="VIH" realizadoKey="vih_realizado" {...p}>
                  <div className="control-lab-result-fields">
                    <Field label="Resultado" htmlFor="control-vih_resultado" error={fieldError("vih_resultado")}>
                      <select id="control-vih_resultado" name="vih_resultado" className={inputClass("vih_resultado")} style={{ minWidth: 130 }} value={form.vih_resultado}
                        aria-invalid={Boolean(fieldError("vih_resultado"))}
                        aria-describedby={fieldError("vih_resultado") ? "control-vih_resultado-error" : undefined}
                        onChange={(e) => set("vih_resultado", e.target.value)}>
                        <option value="">-</option>
                        <option value="positivo">Positivo (+)</option>
                        <option value="negativo">Negativo (-)</option>
                      </select>
                    </Field>
                  </div>
              </LabEntry>
            )}

            {/* VDRL/RPR */}
            <LabEntry label="VDRL / RPR" realizadoKey="vdrl_realizado" {...p}>
                <div className="control-lab-result-fields">
                  <Field label="Resultado" htmlFor="control-vdrl_resultado" error={fieldError("vdrl_resultado")}>
                    <select id="control-vdrl_resultado" name="vdrl_resultado" className={inputClass("vdrl_resultado")} style={{ minWidth: 130 }} value={form.vdrl_resultado}
                      aria-invalid={Boolean(fieldError("vdrl_resultado"))}
                      aria-describedby={fieldError("vdrl_resultado") ? "control-vdrl_resultado-error" : undefined}
                      onChange={(e) => set("vdrl_resultado", e.target.value)}>
                      <option value="">-</option>
                      <option value="positivo">Positivo (+)</option>
                      <option value="negativo">Negativo (-)</option>
                    </select>
                  </Field>
                </div>
            </LabEntry>

            {/* TORCH */}
            <LabEntry label="TORCH" realizadoKey="torch_realizado" {...p}>
                <div className="control-lab-result-fields">
                  <Field label="Resultado" htmlFor="control-torch_resultado_positivo" error={fieldError("torch_resultado_positivo")}>
                    <select
                      id="control-torch_resultado_positivo"
                      name="torch_resultado_positivo"
                      className={inputClass("torch_resultado_positivo")}
                      style={{ minWidth: 130 }}
                      value={form.torch_resultado_positivo === true ? "positivo" : form.torch_resultado_positivo === false ? "negativo" : ""}
                      aria-invalid={Boolean(fieldError("torch_resultado_positivo"))}
                      aria-describedby={fieldError("torch_resultado_positivo") ? "control-torch_resultado_positivo-error" : undefined}
                      onChange={(e) =>
                        set(
                          "torch_resultado_positivo",
                          e.target.value === "" ? null : e.target.value === "positivo"
                        )
                      }
                    >
                      <option value="">-</option>
                      <option value="positivo">Positivo (+)</option>
                      <option value="negativo">Negativo (-)</option>
                    </select>
                  </Field>
                </div>
            </LabEntry>

            {/* Papanicolau / IVAA */}
            <LabEntry label="Papanicolau / IVAA" realizadoKey="papanicolau_ivaa_realizado" {...p}>
                <div className="control-lab-result-fields">
                  <Field label="Resultado" htmlFor="control-papanicolau_ivaa_resultado" error={fieldError("papanicolau_ivaa_resultado")}>
                    <ResultadoSelect
                      inputId="control-papanicolau_ivaa_resultado"
                      name="papanicolau_ivaa_resultado"
                      label="Papanicolau / IVAA: resultado"
                      value={form.papanicolau_ivaa_resultado}
                      onChange={(value) => set("papanicolau_ivaa_resultado", value)}
                      error={fieldError("papanicolau_ivaa_resultado")}
                    />
                  </Field>
                </div>
            </LabEntry>

            {/* Hepatitis B */}
            <LabEntry label="Hepatitis B" realizadoKey="hepatitis_b_realizado" {...p}>
                <div className="control-lab-result-fields">
                  <Field label="Resultado" htmlFor="control-hepatitis_b_resultado" error={fieldError("hepatitis_b_resultado")}>
                    <ResultadoSelect
                      inputId="control-hepatitis_b_resultado"
                      name="hepatitis_b_resultado"
                      label="Hepatitis B: resultado"
                      value={form.hepatitis_b_resultado}
                      onChange={(value) => set("hepatitis_b_resultado", value)}
                      error={fieldError("hepatitis_b_resultado")}
                    />
                  </Field>
                </div>
            </LabEntry>

            {/* USG */}
            <LabEntry label="USG (Ultrasonido)" realizadoKey="usg_realizado" {...p}>
                <div className="control-lab-result-fields">
                  <Field label="Hallazgos de USG" htmlFor="control-usg_hallazgos" error={fieldError("usg_hallazgos")}>
                    <textarea id="control-usg_hallazgos" name="usg_hallazgos" className={inputClass("usg_hallazgos")} rows={2} value={form.usg_hallazgos}
                      aria-invalid={Boolean(fieldError("usg_hallazgos"))}
                      aria-describedby={fieldError("usg_hallazgos") ? "control-usg_hallazgos-error" : undefined}
                      onChange={(e) => set("usg_hallazgos", e.target.value)} />
                  </Field>
                </div>
            </LabEntry>
            </div>

            <div className="control-lab-other">
              <Field label="Otros laboratorios" htmlFor="control-otros_lab" error={fieldError("otros_lab")}>
                <textarea id="control-otros_lab" name="otros_lab" className={inputClass("otros_lab")} rows={2} value={form.otros_lab}
                  aria-invalid={Boolean(fieldError("otros_lab"))}
                  aria-describedby={fieldError("otros_lab") ? "control-otros_lab-error" : undefined}
                  onChange={(e) => set("otros_lab", e.target.value)}
                  placeholder="Gota gruesa (malaria), Tamizaje Chagas, etc." />
              </Field>
            </div>
            </ClinicalSection>
          </div>
        )}

        {/* ── TAB: SUPLEMENTACIÓN ── */}
        {tab === "suplementacion" && (
          <div
            key="suplementacion"
            id="control-panel-suplementacion"
            className="control-tab-panel"
            role="tabpanel"
            aria-labelledby="control-tab-suplementacion"
            tabIndex={0}
          >
            <ClinicalSection
              title="Micronutrientes"
              description="Suplementos entregados o indicados durante esta atención."
              icon={Pill}
            >
              <div className="control-supplement-grid">
                <div className="control-supplement-item">
                  <Toggle label="Sulfato Ferroso" name="sulfato_ferroso" {...p} />
                  {form.sulfato_ferroso && (
                    <div className="control-section-followup">
                      <Inp label="No. de tabletas" name="sulfato_ferroso_tabletas" type="number" {...p} />
                    </div>
                  )}
                </div>
                <div className="control-supplement-item">
                  <Toggle label="Ácido Fólico" name="acido_folico" {...p} />
                  {form.acido_folico && (
                    <div className="control-section-followup">
                      <Inp label="No. de tabletas" name="acido_folico_tabletas" type="number" {...p} />
                    </div>
                  )}
                </div>
              </div>
            </ClinicalSection>

            <ClinicalSection
              title="Hallazgos y tratamiento"
              description="Observaciones e indicaciones relacionadas con la suplementación."
              icon={FileText}
            >
              <div className="form-section-body col-2">
                <Field label="Hallazgos" htmlFor="control-suplementacion_hallazgos" col={2} error={fieldError("suplementacion_hallazgos")}>
                  <textarea id="control-suplementacion_hallazgos" name="suplementacion_hallazgos" className={inputClass("suplementacion_hallazgos")} rows={2} value={form.suplementacion_hallazgos}
                    aria-invalid={Boolean(fieldError("suplementacion_hallazgos"))}
                    aria-describedby={fieldError("suplementacion_hallazgos") ? "control-suplementacion_hallazgos-error" : undefined}
                    onChange={(e) => set("suplementacion_hallazgos", e.target.value)} />
                </Field>
                <Field label="Tratamiento" htmlFor="control-suplementacion_tratamiento" col={2} error={fieldError("suplementacion_tratamiento")}>
                  <textarea id="control-suplementacion_tratamiento" name="suplementacion_tratamiento" className={inputClass("suplementacion_tratamiento")} rows={2} value={form.suplementacion_tratamiento}
                    aria-invalid={Boolean(fieldError("suplementacion_tratamiento"))}
                    aria-describedby={fieldError("suplementacion_tratamiento") ? "control-suplementacion_tratamiento-error" : undefined}
                    onChange={(e) => set("suplementacion_tratamiento", e.target.value)} />
                </Field>
              </div>
            </ClinicalSection>
          </div>
        )}

        {/* ── TAB: ORIENTACIONES ── */}
        {tab === "orientaciones" && (
          <div
            key="orientaciones"
            id="control-panel-orientaciones"
            className="control-tab-panel"
            role="tabpanel"
            aria-labelledby="control-tab-orientaciones"
            tabIndex={0}
          >
            <ClinicalSection
              title="Orientación brindada"
              description="Marca los temas abordados con la paciente durante esta atención."
              icon={BookOpen}
            >
            <div className="control-orientation-grid">
              <Toggle label="Plan de emergencia del parto, familiar y comunitario" name="orient_plan_emergencia_parto" {...p} />
              <Toggle label="Alimentación durante el embarazo" name="orient_alimentacion_embarazo" {...p} />
              <Toggle label="Señales de peligro" name="orient_senales_peligro" {...p} />
              <Toggle label="Lactancia materna" name="orient_lactancia_materna" {...p} />
              <Toggle label="Planificación familiar" name="orient_planificacion_familiar" {...p} />
              <Toggle label="Importancia de atención del postparto" name="orient_importancia_postparto" {...p} />
              <Toggle label="Vacunación y cuidados del niño/a" name="orient_vacunacion_nino" {...p} />
              <Toggle label="Pre y post prueba de VIH" name="orient_pre_post_prueba_vih" {...p} />
              <Toggle label="Importancia del No. de atenciones prenatales" name="orient_importancia_atenciones" {...p} />
              <Toggle label="Importancia de tratamiento de ITS a cónyuge/pareja" name="orient_tratamiento_its_pareja" {...p} />
            </div>
            <div className="control-section-followup">
              <Field label="Otras orientaciones" htmlFor="control-orient_otros" error={fieldError("orient_otros")}>
                <input id="control-orient_otros" name="orient_otros" className={inputClass("orient_otros")} value={form.orient_otros}
                  aria-invalid={Boolean(fieldError("orient_otros"))}
                  aria-describedby={fieldError("orient_otros") ? "control-orient_otros-error" : undefined}
                  onChange={(e) => set("orient_otros", e.target.value)} />
              </Field>
            </div>
            </ClinicalSection>
          </div>
        )}
        </fieldset>

        {/* BOTONES */}
        <ClinicalActionBar
          readOnly={soloLectura}
          status={loading ? "Guardando control" : soloLectura ? "Modo de consulta" : editando ? "Edición del control" : "Nuevo control"}
          detail={loading ? "Espera mientras se registra la información" : workflowDescription}
        >
          <button type="button" className="btn-secondary" onClick={() => navigate(expedientePath)}>
            {soloLectura ? "Volver" : "Cancelar"}
          </button>
          {puedeEditar && (
            <button type="submit" className="btn-primary" disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Save size={15} />
              {loading ? "Guardando..." : editando ? "Guardar cambios" : "Guardar control"}
            </button>
          )}
        </ClinicalActionBar>

      </form>
      )}
    </ClinicalWorkflowShell>
  );
}
