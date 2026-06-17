import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";
import { useFieldErrors } from "../hooks/useFieldErrors";

const INIT = {
  tipo_vacuna: "td_tdap",
  momento: "durante_embarazo",
  numero_dosis: 1,
  fecha_dosis: "",
};

const INIT_TD_TDAP_FECHAS = { 1: "", 2: "", 3: "" };

const FIELD_LABELS = {
  tipo_vacuna: "Tipo de vacuna",
  momento: "Momento",
  numero_dosis: "No. dosis",
  fecha_dosis: "Fecha dosis",
};

function inferVacunaFieldErrors(err) {
  const code = err?.response?.data?.code;
  const message = getErrorMessage(err, "");
  if (code === "DUPLICATE_RESOURCE" && message.toLowerCase().includes("vacuna")) {
    return { numero_dosis: message };
  }
  return {};
}

function Field({ label, children, error }) {
  return <div className="form-group"><label className="input-label">{label}</label>{children}{error && <div className="field-error-text">{error}</div>}</div>;
}

const stopNumberWheel = (event) => {
  event.currentTarget.blur();
};

export default function VacunaForm() {
  const { id, vacunaId } = useParams();
  const navigate = useNavigate();
  const expedientePath = `/pacientes/${id}?tab=vacunas`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [tdTdapFechas, setTdTdapFechas] = useState(INIT_TD_TDAP_FECHAS);
  const [loading, setLoading] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS, inferVacunaFieldErrors);
  const editando = Boolean(vacunaId);
  const isTdTdapBatch = !editando && form.tipo_vacuna === "td_tdap";
  const maxDosis = form.tipo_vacuna === "td_tdap" ? 3 : 10;
  const dosisCount = Math.min(Number(form.numero_dosis || 1), maxDosis);
  const set = (k, v) => fieldErrors.setFormValue(setForm, k, v);

  const setTipoVacuna = (value) => {
    setForm((f) => ({
      ...f,
      tipo_vacuna: value,
      numero_dosis: value === "td_tdap" ? Math.min(Number(f.numero_dosis || 1), 3) : f.numero_dosis,
    }));
    fieldErrors.clearFieldError("tipo_vacuna");
    fieldErrors.clearFieldError("numero_dosis");
  };

  const setNumeroDosis = (value) => {
    const parsed = value === "" ? "" : Number(value);
    if (parsed === "") {
      set("numero_dosis", "");
      return;
    }
    set("numero_dosis", Math.max(1, Math.min(parsed, maxDosis)));
  };

  const setTdTdapFecha = (dosis, value) => {
    setTdTdapFechas((prev) => ({ ...prev, [dosis]: value }));
    fieldErrors.clearFieldError("fecha_dosis");
  };

  useEffect(() => {
    if (!editando) return;
    api.get(`/pacientes/${id}/vacunas/${vacunaId}`)
      .then(({ data }) => setForm({ ...INIT, ...data, fecha_dosis: data.fecha_dosis ? data.fecha_dosis.split("T")[0] : "" }))
      .catch(() => toast("Error al cargar vacuna", "error"));
  }, [id, vacunaId, editando, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    fieldErrors.clearFieldErrors();
    try {
      if (editando) {
        await api.put(`/pacientes/${id}/vacunas/${vacunaId}`, form);
      } else if (form.tipo_vacuna === "td_tdap") {
        const totalDosis = Math.max(1, Math.min(Number(form.numero_dosis || 1), 3));
        await Promise.all(Array.from({ length: totalDosis }, (_, index) => {
          const numeroDosis = index + 1;
          return api.post(`/pacientes/${id}/vacunas`, {
            ...form,
            numero_dosis: numeroDosis,
            fecha_dosis: tdTdapFechas[numeroDosis] || "",
          });
        }));
      } else {
        await api.post(`/pacientes/${id}/vacunas`, form);
      }
      toast(editando ? "Vacuna actualizada" : "Vacuna registrada", "success");
      navigate(expedientePath);
    } catch (err) {
      toast(fieldErrors.setErrorsFromResponse(err, "Error al guardar vacuna").message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(expedientePath)}><ChevronLeft size={15} /> Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Vacuna" : "Registrar Vacuna"}</h1>
      </div>
      <form className="card" onSubmit={submit}>
        {fieldErrors.summary.length > 0 && (
          <div className="error-box" style={{ marginBottom: "1rem" }}>
            <strong>Revisa estos datos:</strong>{" "}
            {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" | ")}
          </div>
        )}
        <div className="form-section-body col-4">
          <Field label="Tipo de vacuna" error={fieldErrors.fieldError("tipo_vacuna")}>
            <select className={fieldErrors.inputClass("tipo_vacuna")} value={form.tipo_vacuna} onChange={(e) => setTipoVacuna(e.target.value)}>
              <option value="td_tdap">Td/Tdap</option>
              <option value="influenza">Influenza</option>
              <option value="spr_sr">SPR/SR</option>
            </select>
          </Field>
          <Field label="Momento" error={fieldErrors.fieldError("momento")}>
            <select className={fieldErrors.inputClass("momento")} value={form.momento} onChange={(e) => set("momento", e.target.value)}>
              <option value="previo_embarazo">Previo embarazo</option>
              <option value="durante_embarazo">Durante embarazo</option>
              <option value="postparto_aborto">Postparto/Aborto</option>
            </select>
          </Field>
          <Field label="No. dosis" error={fieldErrors.fieldError("numero_dosis")}>
            <input className={fieldErrors.inputClass("numero_dosis")} type="number" min="1" max={maxDosis} value={form.numero_dosis ?? ""} onWheel={stopNumberWheel} onChange={(e) => setNumeroDosis(e.target.value)} />
          </Field>
          {isTdTdapBatch ? (
            Array.from({ length: dosisCount }, (_, index) => {
              const dosis = index + 1;
              return (
                <Field key={dosis} label={`Fecha dosis ${dosis}`} error={fieldErrors.fieldError("fecha_dosis")}>
                  <input className={fieldErrors.inputClass("fecha_dosis")} type="date" value={tdTdapFechas[dosis] ?? ""} onChange={(e) => setTdTdapFecha(dosis, e.target.value)} />
                </Field>
              );
            })
          ) : (
            <Field label="Fecha dosis" error={fieldErrors.fieldError("fecha_dosis")}>
              <input className={fieldErrors.inputClass("fecha_dosis")} type="date" value={form.fecha_dosis ?? ""} onChange={(e) => set("fecha_dosis", e.target.value)} />
            </Field>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button className="btn-primary" disabled={loading}><Save size={15} /> {loading ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
