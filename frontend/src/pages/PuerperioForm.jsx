import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getGuatemalaDateInputValue, getGuatemalaTimeInputValue } from "../utils/guatemalaTime";
import { getErrorMessage } from "../utils/errorMessage";
import { useFieldErrors } from "../hooks/useFieldErrors";

const INIT = {
  numero_atencion: 1,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
  signos_peligro: "",
  dias_despues_parto: "",
  lugar_atencion_parto: "",
  quien_atendio_parto: "",
  recien_nacido_vivo: false,
  tipo_parto: "",
  tuvo_apego_inmediato: false,
  lactancia_materna_exclusiva: false,
  herida_operatoria: "",
  pa_sistolica: "",
  pa_diastolica: "",
  frecuencia_cardiaca: "",
  frecuencia_respiratoria: "",
  temperatura: "",
  examen_mamas: "",
  examen_ginecologico: "",
  orientacion_consejeria: "",
  impresion_clinica: "",
  tratamiento: "",
  nombre_cargo_atiende: "",
};

const initialPuerperioForm = () => ({
  ...INIT,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
});

const FIELD_LABELS = {
  numero_atencion: "No. atencion",
  fecha: "Fecha",
  hora: "Hora",
  dias_despues_parto: "Dias despues del parto",
  tipo_parto: "Tipo de parto",
  pa_sistolica: "P/A sistolica",
  pa_diastolica: "P/A diastolica",
  frecuencia_cardiaca: "Frecuencia cardiaca",
  frecuencia_respiratoria: "Frecuencia respiratoria",
  temperatura: "Temperatura",
  signos_peligro: "Signos de peligro",
};

function inferPuerperioFieldErrors(err) {
  const code = err?.response?.data?.code;
  const message = getErrorMessage(err, "");
  if (code === "DUPLICATE_RESOURCE" && message.toLowerCase().includes("puerperio")) {
    return { numero_atencion: message };
  }
  return {};
}

function Field({ label, children, error }) {
  return <div className="form-group"><label className="input-label">{label}</label>{children}{error && <div className="field-error-text">{error}</div>}</div>;
}

function Input({ label, name, form, set, type = "text", errors = {}, inputClass }) {
  return (
    <Field label={label} error={errors[name]}>
      <input className={inputClass ? inputClass(name) : "input-field"} type={type} value={form[name] ?? ""}
        onChange={(e) => set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
    </Field>
  );
}

function Toggle({ label, name, form, set }) {
  return (
    <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: "0.85rem" }}>
      <input type="checkbox" checked={Boolean(form[name])} onChange={(e) => set(name, e.target.checked)} />
      {label}
    </label>
  );
}

export default function PuerperioForm() {
  const { id, puerperioId } = useParams();
  const navigate = useNavigate();
  const expedientePath = `/pacientes/${id}?tab=puerperio`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(initialPuerperioForm);
  const [loading, setLoading] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferPuerperioFieldErrors);
  const editando = Boolean(puerperioId);
  const set = (k, v) => fieldErrors.setFormValue(setForm, k, v);
  const p = { form, set, errors: fieldErrors.fieldErrors, inputClass: fieldErrors.inputClass };

  useEffect(() => {
    const request = editando
      ? api.get(`/pacientes/${id}/controles/puerperio/${puerperioId}`)
      : api.get(`/pacientes/${id}/controles/puerperio`);
    request.then(({ data }) => {
      if (editando) {
        setForm({ ...initialPuerperioForm(), ...data, fecha: data.fecha ? data.fecha.split("T")[0] : INIT.fecha });
      } else {
        const siguiente = Math.min(2, Math.max(0, ...(data || []).map((r) => Number(r.numero_atencion) || 0)) + 1);
        setForm((f) => ({ ...f, numero_atencion: siguiente }));
      }
    }).catch(() => toast("Error al cargar puerperio", "error"));
  }, [id, puerperioId, editando, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    fieldErrors.clearFieldErrors();
    try {
      if (editando) await api.put(`/pacientes/${id}/controles/puerperio/${puerperioId}`, form);
      else await api.post(`/pacientes/${id}/controles/puerperio`, form);
      toast(editando ? "Puerperio actualizado" : "Puerperio registrado", "success");
      navigate(expedientePath);
    } catch (err) {
      toast(fieldErrors.setErrorsFromResponse(err, "Error al guardar puerperio").message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(expedientePath)}><ChevronLeft size={15} /> Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Puerperio" : "Registrar Puerperio"}</h1>
      </div>
      <form className="card" onSubmit={submit}>
        {fieldErrors.summary.length > 0 && (
          <div className="error-box" style={{ marginBottom: "1rem" }}>
            <strong>Revisa estos datos:</strong>{" "}
            {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}
          </div>
        )}
        <div className="form-section-body col-4">
          <Input label="No. atención" name="numero_atencion" type="number" {...p} />
          <Input label="Fecha" name="fecha" type="date" {...p} />
          <Input label="Hora" name="hora" type="time" {...p} />
          <Input label="Días después del parto" name="dias_despues_parto" type="number" {...p} />
          <Input label="Lugar del parto" name="lugar_atencion_parto" {...p} />
          <Input label="Quién atendió parto" name="quien_atendio_parto" {...p} />
          <Field label="Tipo de parto" error={fieldErrors.fieldError("tipo_parto")}>
            <select className={fieldErrors.inputClass("tipo_parto")} value={form.tipo_parto} onChange={(e) => set("tipo_parto", e.target.value)}>
              <option value="">—</option><option value="vaginal">Vaginal</option><option value="cesarea">Cesárea</option><option value="forceps">Fórceps</option><option value="otro">Otro</option>
            </select>
          </Field>
          <Input label="P/A sistólica" name="pa_sistolica" type="number" {...p} />
          <Input label="P/A diastólica" name="pa_diastolica" type="number" {...p} />
          <Input label="Temperatura" name="temperatura" type="number" {...p} />
          <Input label="Nombre/cargo atiende" name="nombre_cargo_atiende" {...p} />
        </div>
        <div style={{ display: "flex", gap: "1rem", padding: "1rem", flexWrap: "wrap" }}>
          <Toggle label="RN vivo" name="recien_nacido_vivo" form={form} set={set} />
          <Toggle label="Apego inmediato" name="tuvo_apego_inmediato" form={form} set={set} />
          <Toggle label="Lactancia materna exclusiva" name="lactancia_materna_exclusiva" form={form} set={set} />
        </div>
        <div className="form-section-body col-2">
          {["signos_peligro","herida_operatoria","examen_mamas","examen_ginecologico","orientacion_consejeria","impresion_clinica","tratamiento"].map((name) => (
            <Field key={name} label={name.replaceAll("_", " ")} error={fieldErrors.fieldError(name)}>
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
