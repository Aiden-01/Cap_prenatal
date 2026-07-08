import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

const SECOND_PUERPERIO_INHERITED_FIELDS = [
  "lugar_atencion_parto",
  "quien_atendio_parto",
  "recien_nacido_vivo",
  "tipo_parto",
];

function dateOnly(value) {
  return value ? String(value).split("T")[0] : "";
}

function daysBetweenDates(start, end) {
  const startDate = new Date(`${dateOnly(start)}T00:00:00`);
  const endDate = new Date(`${dateOnly(end)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function calculateSecondPuerperioDays(firstPuerperio, secondDate) {
  if (!firstPuerperio) return "";
  const firstDays = Number(firstPuerperio.dias_despues_parto);
  const diff = daysBetweenDates(firstPuerperio.fecha, secondDate);
  if (!Number.isFinite(firstDays) || diff === null) return "";
  return Math.max(0, firstDays + diff);
}

function getInheritedSecondPuerperioFields(firstPuerperio) {
  if (!firstPuerperio) return {};
  return SECOND_PUERPERIO_INHERITED_FIELDS.reduce((acc, field) => {
    acc[field] = firstPuerperio[field] ?? INIT[field];
    return acc;
  }, { tuvo_apego_inmediato: false });
}

function preventNumberWheel(e) {
  if (document.activeElement === e.currentTarget) {
    e.currentTarget.blur();
  }
}

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

function Input({ label, name, form, set, type = "text", errors = {}, inputClass, ...rest }) {
  return (
    <Field label={label} error={errors[name]}>
      <input className={inputClass ? inputClass(name) : "input-field"} type={type} value={form[name] ?? ""}
        onChange={(e) => set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        onWheel={type === "number" ? preventNumberWheel : undefined}
        {...rest}
      />
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
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const expedientePath = `/pacientes/${id}?embarazo_id=${embarazoId}&tab=puerperio`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(initialPuerperioForm);
  const [firstPuerperio, setFirstPuerperio] = useState(null);
  const [loading, setLoading] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferPuerperioFieldErrors);
  const editando = Boolean(puerperioId);
  const isSecondPuerperio = Number(form.numero_atencion) === 2;
  const set = (k, v) => {
    fieldErrors.setFormValue(setForm, k, v);
    if (k === "fecha" && isSecondPuerperio && firstPuerperio && !editando) {
      fieldErrors.setFormValue(setForm, "dias_despues_parto", calculateSecondPuerperioDays(firstPuerperio, v));
    }
    if (k === "numero_atencion" && Number(v) === 2 && firstPuerperio && !editando) {
      setForm((current) => ({
        ...current,
        ...getInheritedSecondPuerperioFields(firstPuerperio),
        dias_despues_parto: calculateSecondPuerperioDays(firstPuerperio, current.fecha),
      }));
    }
  };
  const p = { form, set, errors: fieldErrors.fieldErrors, inputClass: fieldErrors.inputClass };

  useEffect(() => {
    if (!embarazoId) {
      toast("Selecciona un embarazo antes de registrar puerperio", "error");
      navigate(`/pacientes/${id}?tab=puerperio`, { replace: true });
      return;
    }
    const request = editando
      ? api.get(`/pacientes/${id}/controles/puerperio/${puerperioId}`, { params: { embarazo_id: embarazoId } })
      : api.get(`/pacientes/${id}/controles/puerperio`, { params: { embarazo_id: embarazoId } });
    Promise.all([request, api.get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId } })]).then(([{ data }, { data: expediente }]) => {
      if (expediente?.is_read_only) {
        toast("El embarazo esta cerrado y es de solo lectura", "error");
        navigate(expedientePath, { replace: true });
        return;
      }
      if (editando) {
        setForm({ ...initialPuerperioForm(), ...data, fecha: data.fecha ? data.fecha.split("T")[0] : INIT.fecha });
      } else {
        const registros = data || [];
        const primerRegistro = registros.find((r) => Number(r.numero_atencion) === 1) || null;
        const siguiente = Math.min(2, Math.max(0, ...registros.map((r) => Number(r.numero_atencion) || 0)) + 1);
        setFirstPuerperio(primerRegistro);
        setForm((f) => ({
          ...f,
          ...(siguiente === 2 ? getInheritedSecondPuerperioFields(primerRegistro) : {}),
          numero_atencion: siguiente,
          dias_despues_parto: siguiente === 2
            ? calculateSecondPuerperioDays(primerRegistro, f.fecha)
            : f.dias_despues_parto,
        }));
      }
    }).catch(() => toast("Error al cargar puerperio", "error"));
  }, [id, puerperioId, editando, embarazoId, expedientePath, navigate, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    fieldErrors.clearFieldErrors();
    try {
      const payload = Number(form.numero_atencion) === 2 ? { ...form, tuvo_apego_inmediato: false } : form;
      if (editando) await api.put(`/pacientes/${id}/controles/puerperio/${puerperioId}`, payload, { params: { embarazo_id: embarazoId } });
      else await api.post(`/pacientes/${id}/controles/puerperio`, payload, { params: { embarazo_id: embarazoId } });
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
          <Input label="No. atención" name="numero_atencion" type="number" min="1" max="2" step="1" inputMode="numeric" {...p} />
          <Input label="Fecha" name="fecha" type="date" max={getGuatemalaDateInputValue()} {...p} />
          <Input label="Hora" name="hora" type="time" {...p} />
          <Input label="Días después del parto" name="dias_despues_parto" type="number" min="0" max="60" step="1" inputMode="numeric" {...p} />
          <Input label="Lugar del parto" name="lugar_atencion_parto" {...p} />
          <Input label="Quién atendió parto" name="quien_atendio_parto" {...p} />
          <Field label="Tipo de parto" error={fieldErrors.fieldError("tipo_parto")}>
            <select className={fieldErrors.inputClass("tipo_parto")} value={form.tipo_parto} onChange={(e) => set("tipo_parto", e.target.value)}>
              <option value="">—</option><option value="vaginal">Vaginal</option><option value="cesarea">Cesárea</option>
            </select>
          </Field>
          <Input label="P/A sistólica" name="pa_sistolica" type="number" min="50" max="250" step="1" inputMode="numeric" {...p} />
          <Input label="P/A diastólica" name="pa_diastolica" type="number" min="30" max="160" step="1" inputMode="numeric" {...p} />
          <Input label="FC" name="frecuencia_cardiaca" type="number" min="30" max="220" step="1" inputMode="numeric" placeholder="Frecuencia cardiaca (lpm)" {...p} />
          <Input label="FR" name="frecuencia_respiratoria" type="number" min="5" max="80" step="1" inputMode="numeric" placeholder="Frecuencia respiratoria (rpm)" {...p} />
          <Input label="Temperatura" name="temperatura" type="number" min="30" max="45" step="0.1" inputMode="decimal" {...p} />
          <Input label="Nombre/cargo atiende" name="nombre_cargo_atiende" {...p} />
        </div>
        <div style={{ display: "flex", gap: "1rem", padding: "1rem", flexWrap: "wrap" }}>
          <Toggle label="RN vivo" name="recien_nacido_vivo" form={form} set={set} />
          {!isSecondPuerperio && <Toggle label="Apego inmediato" name="tuvo_apego_inmediato" form={form} set={set} />}
          <Toggle label="Lactancia materna exclusiva" name="lactancia_materna_exclusiva" form={form} set={set} />
        </div>
        {isSecondPuerperio && firstPuerperio && !editando && (
          <div className="muted-text" style={{ padding: "0 1rem 1rem", fontSize: "0.8rem" }}>
            Se heredaron los datos del parto desde la primera atencion. Los dias despues del parto se calculan segun la fecha del segundo control.
          </div>
        )}
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
