import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, ClipboardCheck, FileText, Save, Stethoscope } from "lucide-react";
import api from "../api/axios";
import {
  ClinicalActionBar,
  ClinicalNotice,
  ClinicalSection,
  ClinicalWorkflowShell,
} from "../components/clinical/ClinicalWorkflow";
import { useGlobalToast } from "../context/ToastContext";
import { getGuatemalaDateInputValue, getGuatemalaTimeInputValue } from "../utils/guatemalaTime";
import { useFieldErrors } from "../hooks/useFieldErrors";
import "./clinical-tertiary-workflows.css";

const INIT = {
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
  motivo_consulta: "",
  historia_enfermedad_actual: "",
  revision_por_sistemas: "",
  examen_fisico: "",
  impresion_clinica: "",
  tratamiento_referencia: "",
  nombre_cargo_atiende: "",
};

const initialMorbilidadForm = () => ({
  ...INIT,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
});

const FIELD_LABELS = {
  fecha: "Fecha",
  hora: "Hora",
  motivo_consulta: "Motivo de consulta",
  historia_enfermedad_actual: "Historia enfermedad actual",
  revision_por_sistemas: "Revision por sistemas",
  examen_fisico: "Examen fisico",
  impresion_clinica: "Impresion clinica",
  tratamiento_referencia: "Tratamiento / Referencia",
  nombre_cargo_atiende: "Nombre / cargo atiende",
};

function Field({ label, children, error, htmlFor, className = "" }) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className={`form-group ${className}`.trim()}>
      <label className="input-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <div id={errorId} className="field-error-text" role="alert">{error}</div>}
    </div>
  );
}

export default function MorbilidadForm() {
  const { id, morbilidadId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const expedientePath = `/pacientes/${id}?embarazo_id=${embarazoId}&tab=morbilidad`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(initialMorbilidadForm);
  const [patientContext, setPatientContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS);
  const editando = Boolean(morbilidadId);
  const set = (k, v) => fieldErrors.setFormValue(setForm, k, v);

  useEffect(() => {
    if (!embarazoId) {
      toast("Selecciona un embarazo antes de registrar morbilidad", "error");
      navigate(`/pacientes/${id}?tab=morbilidad`, { replace: true });
      return;
    }
    const registroRequest = editando
      ? api.get(`/pacientes/${id}/morbilidad/${morbilidadId}`, { params: { embarazo_id: embarazoId } })
      : Promise.resolve({ data: null });
    Promise.all([
      registroRequest,
      api.get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId } }),
    ])
      .then(([{ data }, { data: expediente }]) => {
        if (expediente?.is_read_only) {
          toast("El embarazo esta cerrado y es de solo lectura", "error");
          navigate(expedientePath, { replace: true });
          return;
        }
        setPatientContext(expediente?.paciente || null);
        if (editando) setForm({ ...initialMorbilidadForm(), ...data, fecha: data.fecha ? data.fecha.split("T")[0] : INIT.fecha });
      })
      .catch(() => toast("Error al cargar morbilidad", "error"));
  }, [id, morbilidadId, editando, embarazoId, expedientePath, navigate, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    fieldErrors.clearFieldErrors();
    try {
      if (editando) await api.put(`/pacientes/${id}/morbilidad/${morbilidadId}`, form, { params: { embarazo_id: embarazoId } });
      else await api.post(`/pacientes/${id}/morbilidad`, form, { params: { embarazo_id: embarazoId } });
      toast(editando ? "Morbilidad actualizada" : "Morbilidad registrada", "success");
      navigate(expedientePath);
    } catch (err) {
      toast(fieldErrors.setErrorsFromResponse(err, "Error al guardar morbilidad").message, "error");
    } finally {
      setLoading(false);
    }
  };

  const patientName = `${patientContext?.nombres || ""} ${patientContext?.apellidos || ""}`.trim();

  return (
    <ClinicalWorkflowShell
      className="tertiary-workflow morbidity-workflow"
      eyebrow="Nota clínica compacta"
      title={editando ? "Editar morbilidad" : "Registrar morbilidad"}
      description="Captura el evento, la evaluación y la conducta clínica sin perder velocidad de registro."
      patientName={patientName}
      recordNumber={patientContext?.no_expediente}
      mode={editando ? "edit" : "new"}
      icon={FileText}
      onBack={() => navigate(expedientePath)}
    >
      <form className="tertiary-workflow-form morbidity-workflow-form" onSubmit={submit}>
        {fieldErrors.summary.length > 0 && (
          <ClinicalNotice variant="error" title="Revisa estos datos" className="tertiary-workflow-notice">
            {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}
          </ClinicalNotice>
        )}
        <div className="tertiary-flow-panel morbidity-note">
          <ClinicalSection
            title="Identidad del evento"
            description="Fecha, hora, motivo y responsable de la atención."
            icon={CalendarClock}
            className="morbidity-section"
            aside={<span className="tertiary-section-index">01</span>}
          >
            <div className="morbidity-identity-grid">
              <Field label="Fecha" htmlFor="morbilidad-fecha" error={fieldErrors.fieldError("fecha")}>
                <input id="morbilidad-fecha" name="fecha" className={fieldErrors.inputClass("fecha")} type="date" value={form.fecha}
                  aria-invalid={Boolean(fieldErrors.fieldError("fecha"))}
                  aria-describedby={fieldErrors.fieldError("fecha") ? "morbilidad-fecha-error" : undefined}
                  onChange={(e) => set("fecha", e.target.value)} />
              </Field>
              <Field label="Hora" htmlFor="morbilidad-hora" error={fieldErrors.fieldError("hora")}>
                <input id="morbilidad-hora" name="hora" className={fieldErrors.inputClass("hora")} type="time" value={form.hora ?? ""}
                  aria-invalid={Boolean(fieldErrors.fieldError("hora"))}
                  aria-describedby={fieldErrors.fieldError("hora") ? "morbilidad-hora-error" : undefined}
                  onChange={(e) => set("hora", e.target.value)} />
              </Field>
              <Field label="Motivo de consulta" htmlFor="morbilidad-motivo_consulta" error={fieldErrors.fieldError("motivo_consulta")} className="is-wide">
                <input id="morbilidad-motivo_consulta" name="motivo_consulta" className={fieldErrors.inputClass("motivo_consulta")} value={form.motivo_consulta ?? ""}
                  aria-invalid={Boolean(fieldErrors.fieldError("motivo_consulta"))}
                  aria-describedby={fieldErrors.fieldError("motivo_consulta") ? "morbilidad-motivo_consulta-error" : undefined}
                  onChange={(e) => set("motivo_consulta", e.target.value)} />
              </Field>
              <Field label="Nombre / cargo atiende" htmlFor="morbilidad-nombre_cargo_atiende" error={fieldErrors.fieldError("nombre_cargo_atiende")} className="is-wide">
                <input id="morbilidad-nombre_cargo_atiende" name="nombre_cargo_atiende" className={fieldErrors.inputClass("nombre_cargo_atiende")} value={form.nombre_cargo_atiende ?? ""}
                  aria-invalid={Boolean(fieldErrors.fieldError("nombre_cargo_atiende"))}
                  aria-describedby={fieldErrors.fieldError("nombre_cargo_atiende") ? "morbilidad-nombre_cargo_atiende-error" : undefined}
                  onChange={(e) => set("nombre_cargo_atiende", e.target.value)} />
              </Field>
            </div>
          </ClinicalSection>

          <ClinicalSection
            title="Evaluación"
            description="Hallazgos y valoración clínica documentada del evento."
            icon={Stethoscope}
            className="morbidity-section"
            aside={<span className="tertiary-section-index">02</span>}
          >
            <div className="morbidity-evaluation-grid">
              {[
                ["historia_enfermedad_actual", "Historia enfermedad actual"],
                ["revision_por_sistemas", "Revisión por sistemas"],
                ["examen_fisico", "Examen físico"],
                ["impresion_clinica", "Impresión clínica"],
              ].map(([name, label]) => (
                <Field key={name} label={label} htmlFor={`morbilidad-${name}`} error={fieldErrors.fieldError(name)}>
                  <textarea id={`morbilidad-${name}`} name={name} className={fieldErrors.inputClass(name)} rows={3} value={form[name] ?? ""}
                    aria-invalid={Boolean(fieldErrors.fieldError(name))}
                    aria-describedby={fieldErrors.fieldError(name) ? `morbilidad-${name}-error` : undefined}
                    onChange={(e) => set(name, e.target.value)} />
                </Field>
              ))}
            </div>
          </ClinicalSection>

          <ClinicalSection
            title="Conducta"
            description="Tratamiento, referencia o conducta consignada para el seguimiento."
            icon={ClipboardCheck}
            className="morbidity-section"
            aside={<span className="tertiary-section-index">03</span>}
          >
            <Field label="Tratamiento / Referencia" htmlFor="morbilidad-tratamiento_referencia" error={fieldErrors.fieldError("tratamiento_referencia")}>
              <textarea id="morbilidad-tratamiento_referencia" name="tratamiento_referencia" className={fieldErrors.inputClass("tratamiento_referencia")} rows={4} value={form.tratamiento_referencia ?? ""}
                aria-invalid={Boolean(fieldErrors.fieldError("tratamiento_referencia"))}
                aria-describedby={fieldErrors.fieldError("tratamiento_referencia") ? "morbilidad-tratamiento_referencia-error" : undefined}
                onChange={(e) => set("tratamiento_referencia", e.target.value)} />
            </Field>
          </ClinicalSection>
        </div>

        <ClinicalActionBar
          status={editando ? "Edición de morbilidad" : "Nueva nota de morbilidad"}
          detail={editando ? "Se actualizará el registro seleccionado" : "Se agregará una nota al embarazo seleccionado"}
        >
          <button type="button" className="btn-secondary" onClick={() => navigate(expedientePath)}>Volver al expediente</button>
          <button type="submit" className="btn-primary" disabled={loading}><Save size={15} /> {loading ? "Guardando..." : "Guardar"}</button>
        </ClinicalActionBar>
      </form>
    </ClinicalWorkflowShell>
  );
}
