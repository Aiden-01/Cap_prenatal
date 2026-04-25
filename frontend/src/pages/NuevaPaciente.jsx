import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";

import {
  ClipboardList,
  User,
  HeartPulse,
  Stethoscope,
  CheckCircle
} from "lucide-react";

const STEPS = [
  { label: "Servicio", icon: ClipboardList },
  { label: "Paciente", icon: User },
  { label: "Antecedentes", icon: HeartPulse },
  { label: "Examen", icon: Stethoscope },
  { label: "Confirmar", icon: CheckCircle },
];

export default function NuevaPaciente() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const toast = useGlobalToast();

  const [form, setForm] = useState({
    nombre_servicio_salud: "CAP El Chal",
    area_salud: "Petén Sur Oriente",
    nombre: "",
    edad: "",
    motivo_consulta: "",
    peso_lbs: "",
    talla_cm: "",
    impresion_clinica: "",
  });

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/pacientes", form);
      toast("Paciente registrada", "success");
      navigate(`/pacientes/${data.id}`);
    } catch (e) {
      toast("Error al guardar", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>

      {/* HEADER */}
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "1rem" }}>
        Nueva paciente
      </h1>

      {/* PROGRESS */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} style={{
              flex: 1,
              padding: "0.5rem",
              borderRadius: 8,
              background: i <= step ? "var(--primary)" : "var(--card)",
              color: i <= step ? "#fff" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              fontSize: "0.8rem"
            }}>
              <Icon size={14} />
              {s.label}
            </div>
          );
        })}
      </div>

      {/* CONTENIDO */}
      <div className="card" style={{ padding: "1.5rem" }}>

        {/* STEP 1 */}
        {step === 0 && (
          <>
            <h2>Servicio de salud</h2>

            <select
              className="input-field"
              value={form.nombre_servicio_salud}
              onChange={(e) => setForm({ ...form, nombre_servicio_salud: e.target.value })}
            >
              <option>CAP El Chal</option>
              <option>P/S Colpetén</option>
              <option>C/C Nuevas Delicias</option>
              <option>P/S Las Flores</option>
              <option>P/S Santa Amelia</option>
            </select>

            <input
              className="input-field"
              placeholder="Área de salud"
              value={form.area_salud}
              onChange={(e) => setForm({ ...form, area_salud: e.target.value })}
            />
          </>
        )}

        {/* STEP 2 */}
        {step === 1 && (
          <>
            <h2>Datos del paciente</h2>

            <input
              className="input-field"
              placeholder="Nombre completo"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />

            <input
              type="number"
              className="input-field"
              placeholder="Edad"
              value={form.edad}
              onChange={(e) => setForm({ ...form, edad: e.target.value })}
            />

            <textarea
              className="input-field"
              placeholder="Motivo de consulta"
              value={form.motivo_consulta}
              onChange={(e) => setForm({ ...form, motivo_consulta: e.target.value })}
            />
          </>
        )}

        {/* STEP 3 */}
        {step === 2 && (
          <>
            <h2>Antecedentes</h2>
            <textarea
              className="input-field"
              placeholder="Antecedentes relevantes"
            />
          </>
        )}

        {/* STEP 4 */}
        {step === 3 && (
          <>
            <h2>Examen</h2>

            <input
              type="number"
              className="input-field"
              placeholder="Peso (lbs)"
              value={form.peso_lbs}
              onChange={(e) => setForm({ ...form, peso_lbs: e.target.value })}
            />

            <input
              type="number"
              className="input-field"
              placeholder="Talla (cm)"
              value={form.talla_cm}
              onChange={(e) => setForm({ ...form, talla_cm: e.target.value })}
            />

            <textarea
              className="input-field"
              placeholder="Impresión clínica"
              value={form.impresion_clinica}
              onChange={(e) => setForm({ ...form, impresion_clinica: e.target.value })}
            />
          </>
        )}

        {/* STEP 5 */}
        {step === 4 && (
          <>
            <h2>Confirmar datos</h2>

            <pre style={{
              background: "#000",
              color: "#0f0",
              padding: "1rem",
              borderRadius: 8,
              fontSize: "0.8rem"
            }}>
              {JSON.stringify(form, null, 2)}
            </pre>
          </>
        )}

        {/* BOTONES */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "1.5rem"
        }}>
          <button onClick={back} disabled={step === 0}>
            Atrás
          </button>

          {step < 4 ? (
            <button onClick={next}>
              Siguiente
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}>
              {loading ? "Guardando..." : "Finalizar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}