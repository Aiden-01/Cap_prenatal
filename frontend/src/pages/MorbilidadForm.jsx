import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";

const INIT = {
  fecha: new Date().toISOString().split("T")[0],
  hora: "",
  motivo_consulta: "",
  historia_enfermedad_actual: "",
  revision_por_sistemas: "",
  examen_fisico: "",
  impresion_clinica: "",
  tratamiento_referencia: "",
  nombre_cargo_atiende: "",
};

function Field({ label, children }) {
  return <div className="form-group"><label className="input-label">{label}</label>{children}</div>;
}

export default function MorbilidadForm() {
  const { id, morbilidadId } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [loading, setLoading] = useState(false);
  const editando = Boolean(morbilidadId);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editando) return;
    api.get(`/pacientes/${id}/morbilidad/${morbilidadId}`)
      .then(({ data }) => setForm({ ...INIT, ...data, fecha: data.fecha ? data.fecha.split("T")[0] : INIT.fecha }))
      .catch(() => toast("Error al cargar morbilidad", "error"));
  }, [id, morbilidadId, editando, toast]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editando) await api.put(`/pacientes/${id}/morbilidad/${morbilidadId}`, form);
      else await api.post(`/pacientes/${id}/morbilidad`, form);
      toast(editando ? "Morbilidad actualizada" : "Morbilidad registrada", "success");
      navigate(`/pacientes/${id}`);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar morbilidad", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}><ChevronLeft size={15} /> Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Morbilidad" : "Registrar Morbilidad"}</h1>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="form-section-body col-3">
          <Field label="Fecha"><input className="input-field" type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora"><input className="input-field" type="time" value={form.hora ?? ""} onChange={(e) => set("hora", e.target.value)} /></Field>
          <Field label="Motivo de consulta"><input className="input-field" value={form.motivo_consulta ?? ""} onChange={(e) => set("motivo_consulta", e.target.value)} /></Field>
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
            <Field key={name} label={label}>
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
