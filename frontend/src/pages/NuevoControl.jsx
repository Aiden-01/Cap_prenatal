import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";

export default function NuevoControl() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    numero_control: 1, fecha: new Date().toISOString().split("T")[0],
    temperatura: "", respiraciones: "", pa_sistolica: "", pa_diastolica: "",
    pulso: "", au_cm: "", fcf: "", peso_kg: "", talla_cm: "",
    circunferencia_brazo_cm: "", edad_embarazo_semanas: "", imc: "",
    impresion_clinica: "", tratamiento: "", consejeria: "",
    plan_parto: "", plan_emergencia: "", cita_siguiente: "", personal_atendio: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post(`/pacientes/${id}/controles`, form);
      toast("Control registrado exitosamente", "success");
      setTimeout(() => navigate(`/pacientes/${id}`), 900);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar", "error");
    } finally { setLoading(false); }
  };

  const inp = (label, key, type = "text") => (
    <div className="form-group" key={key}>
      <label className="input-label">{label}</label>
      <input className="input-field" type={type} value={form[key] ?? ""} onChange={(e) => set(key, type === "number" ? Number(e.target.value) : e.target.value)} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem" }}>
        <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>â† Volver</button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Registrar Control Prenatal</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <div className="form-section-header">â—ˆ Datos del Control</div>
          <div className="form-section-body col-4">
            <div className="form-group">
              <label className="input-label">No. Control</label>
              <select className="input-field" value={form.numero_control} onChange={(e) => set("numero_control", Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n <= 4 ? `${n}er${n===1?'':" o"}Â° Control` : `Otro (${n})`}</option>)}
              </select>
            </div>
            {inp("Fecha", "fecha", "date")}
            {inp("Temperatura (Â°C)", "temperatura", "number")}
            {inp("Respiraciones (x min)", "respiraciones", "number")}
            {inp("P/A SistÃ³lica", "pa_sistolica", "number")}
            {inp("P/A DiastÃ³lica", "pa_diastolica", "number")}
            {inp("Pulso (x min)", "pulso", "number")}
            {inp("AU (cm)", "au_cm", "number")}
            {inp("FCF (lpm)", "fcf", "number")}
            {inp("Peso (kg)", "peso_kg", "number")}
            {inp("Talla (cm)", "talla_cm", "number")}
            {inp("Circ. brazo (cm)", "circunferencia_brazo_cm", "number")}
            {inp("Semanas gestaciÃ³n", "edad_embarazo_semanas", "number")}
            {inp("IMC", "imc", "number")}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">â—ˆ IC / Tx / Plan</div>
          <div className="form-section-body col-2">
            {["impresion_clinica","tratamiento","consejeria","plan_parto","plan_emergencia"].map((key) => (
              <div className="form-group" key={key}>
                <label className="input-label">{key.replace(/_/g," ").replace(/\b\w/g, l => l.toUpperCase())}</label>
                <textarea className="input-field" rows={2} value={form[key]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
            {inp("Cita siguiente", "cita_siguiente", "date")}
            {inp("Personal de salud que atendiÃ³", "personal_atendio")}
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Guardando..." : "Guardar control"}</button>
        </div>
      </form>
    </div>
  );
}
