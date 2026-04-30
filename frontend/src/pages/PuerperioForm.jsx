import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";

const INIT = {
  numero_atencion: 1,
  fecha: new Date().toISOString().split("T")[0],
  hora: "",
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

function Field({ label, children }) {
  return <div className="form-group"><label className="input-label">{label}</label>{children}</div>;
}

function Input({ label, name, form, set, type = "text" }) {
  return (
    <Field label={label}>
      <input className="input-field" type={type} value={form[name] ?? ""}
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
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [loading, setLoading] = useState(false);
  const editando = Boolean(puerperioId);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const request = editando
      ? api.get(`/pacientes/${id}/controles/puerperio/${puerperioId}`)
      : api.get(`/pacientes/${id}/controles/puerperio`);
    request.then(({ data }) => {
      if (editando) {
        setForm({ ...INIT, ...data, fecha: data.fecha ? data.fecha.split("T")[0] : INIT.fecha });
      } else {
        const siguiente = Math.min(2, Math.max(0, ...(data || []).map((r) => Number(r.numero_atencion) || 0)) + 1);
        setForm((f) => ({ ...f, numero_atencion: siguiente }));
      }
    }).catch(() => toast("Error al cargar puerperio", "error"));
  }, [id, puerperioId, editando, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editando) await api.put(`/pacientes/${id}/controles/puerperio/${puerperioId}`, form);
      else await api.post(`/pacientes/${id}/controles/puerperio`, form);
      toast(editando ? "Puerperio actualizado" : "Puerperio registrado", "success");
      navigate(`/pacientes/${id}`);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar puerperio", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}><ChevronLeft size={15} /> Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Puerperio" : "Registrar Puerperio"}</h1>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="form-section-body col-4">
          <Input label="No. atención" name="numero_atencion" type="number" form={form} set={set} />
          <Input label="Fecha" name="fecha" type="date" form={form} set={set} />
          <Input label="Hora" name="hora" type="time" form={form} set={set} />
          <Input label="Días después del parto" name="dias_despues_parto" type="number" form={form} set={set} />
          <Input label="Lugar del parto" name="lugar_atencion_parto" form={form} set={set} />
          <Input label="Quién atendió parto" name="quien_atendio_parto" form={form} set={set} />
          <Field label="Tipo de parto">
            <select className="input-field" value={form.tipo_parto} onChange={(e) => set("tipo_parto", e.target.value)}>
              <option value="">—</option><option value="vaginal">Vaginal</option><option value="cesarea">Cesárea</option><option value="forceps">Fórceps</option><option value="otro">Otro</option>
            </select>
          </Field>
          <Input label="P/A sistólica" name="pa_sistolica" type="number" form={form} set={set} />
          <Input label="P/A diastólica" name="pa_diastolica" type="number" form={form} set={set} />
          <Input label="Temperatura" name="temperatura" type="number" form={form} set={set} />
          <Input label="Nombre/cargo atiende" name="nombre_cargo_atiende" form={form} set={set} />
        </div>
        <div style={{ display: "flex", gap: "1rem", padding: "1rem", flexWrap: "wrap" }}>
          <Toggle label="RN vivo" name="recien_nacido_vivo" form={form} set={set} />
          <Toggle label="Apego inmediato" name="tuvo_apego_inmediato" form={form} set={set} />
          <Toggle label="Lactancia materna exclusiva" name="lactancia_materna_exclusiva" form={form} set={set} />
        </div>
        <div className="form-section-body col-2">
          {["signos_peligro","herida_operatoria","examen_mamas","examen_ginecologico","orientacion_consejeria","impresion_clinica","tratamiento"].map((name) => (
            <Field key={name} label={name.replaceAll("_", " ")}>
              <textarea className="input-field" rows={2} value={form[name] ?? ""} onChange={(e) => set(name, e.target.value)} />
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
