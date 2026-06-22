import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getGuatemalaDateInputValue, getGuatemalaTimeInputValue } from "../utils/guatemalaTime";
import { useFieldErrors } from "../hooks/useFieldErrors";

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

function Field({ label, children, error }) {
  return <div className="form-group"><label className="input-label">{label}</label>{children}{error && <div className="field-error-text">{error}</div>}</div>;
}

export default function MorbilidadForm() {
  const { id, morbilidadId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const expedientePath = `/pacientes/${id}?embarazo_id=${embarazoId}&tab=morbilidad`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(initialMorbilidadForm);
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

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(expedientePath)}><ChevronLeft size={15} /> Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Morbilidad" : "Registrar Morbilidad"}</h1>
      </div>
      <form className="card" onSubmit={submit}>
        {fieldErrors.summary.length > 0 && (
          <div className="error-box" style={{ marginBottom: "1rem" }}>
            <strong>Revisa estos datos:</strong>{" "}
            {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}
          </div>
        )}
        <div className="form-section-body col-3">
          <Field label="Fecha" error={fieldErrors.fieldError("fecha")}><input className={fieldErrors.inputClass("fecha")} type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora" error={fieldErrors.fieldError("hora")}><input className={fieldErrors.inputClass("hora")} type="time" value={form.hora ?? ""} onChange={(e) => set("hora", e.target.value)} /></Field>
          <Field label="Motivo de consulta" error={fieldErrors.fieldError("motivo_consulta")}><input className={fieldErrors.inputClass("motivo_consulta")} value={form.motivo_consulta ?? ""} onChange={(e) => set("motivo_consulta", e.target.value)} /></Field>
        </div>
        <div className="form-section-body col-2">
          {[
            ["historia_enfermedad_actual", "Historia enfermedad actual"],
            ["revision_por_sistemas", "Revisión por sistemas"],
            ["examen_fisico", "Examen físico"],
            ["impresion_clinica", "Impresión clínica"],
            ["tratamiento_referencia", "Tratamiento / Referencia"],
            ["nombre_cargo_atiende", "Nombre / cargo atiende"],
          ].map(([name, label]) => (
            <Field key={name} label={label} error={fieldErrors.fieldError(name)}>
              <textarea className={fieldErrors.inputClass(name)} rows={2} value={form[name] ?? ""} onChange={(e) => set(name, e.target.value)} />
            </Field>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button className="btn-primary" disabled={loading}><Save size={15} /> {loading ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
