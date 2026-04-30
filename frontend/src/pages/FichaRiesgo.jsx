import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label className="input-label">{label}</label>
      {children}
    </div>
  );
}

function Input({ label, name, form, set, type = "text" }) {
  return (
    <Field label={label}>
      <input
        className="input-field"
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      />
    </Field>
  );
}

function Toggle({ label, name, form, set }) {
  const val = form[name] ?? false;
  return (
    <div
      onClick={() => set(name, !val)}
      style={{
        display: "flex", alignItems: "center", gap: "0.55rem",
        cursor: "pointer", padding: "0.45rem 0.65rem", borderRadius: 8,
        background: val ? "var(--primary-lt)" : "var(--surface2)",
        border: `1.5px solid ${val ? "var(--primary)" : "var(--border)"}`,
        userSelect: "none",
      }}
    >
      <div style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        background: val ? "var(--primary)" : "var(--border)",
        display: "grid", placeItems: "center",
      }}>
        {val && <span style={{ color: "#fff", fontSize: "0.6rem", fontWeight: 800 }}>✓</span>}
      </div>
      <span style={{ fontSize: "0.8rem", color: val ? "var(--primary)" : "var(--text-muted)", fontWeight: val ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="form-section">
      <div className="form-section-header">{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: "0.6rem", padding: "1rem" }}>
        {children}
      </div>
    </div>
  );
}

const INIT = {
  fecha: new Date().toISOString().split("T")[0],
  telefono: "", pueblo: "", migrante: false, estado_civil: "", escolaridad: "",
  ocupacion: "", nombre_esposo_conviviente: "", edad_esposo: "",
  pueblo_esposo: "", escolaridad_esposo: "", ocupacion_esposo: "",
  distancia_servicio_km: "", tiempo_horas: "", fecha_ultima_regla: "",
  fecha_probable_parto: "", no_embarazos: "", no_partos: "", no_cesareas: "",
  no_abortos: "", no_hijos_vivos: "", no_hijos_muertos: "", edad_embarazo_semanas: "",
  muerte_fetal_neonatal_previa: false, abortos_espontaneos_3mas: false,
  gestas_3mas: false, peso_ultimo_bebe_menor_2500g: false,
  peso_ultimo_bebe_mayor_4500g: false, antec_hipertension_preeclampsia: false,
  cirugias_tracto_reproductivo: false, embarazo_multiple: false,
  menor_20_anos: false, mayor_35_anos: false, paciente_rh_negativo: false,
  hemorragia_vaginal: false, vih_positivo_sifilis: false,
  presion_diastolica_90mas: false, anemia: false, desnutricion_obesidad: false,
  dolor_abdominal: false, sintomatologia_urinaria: false, ictericia: false,
  diabetes: false, enfermedad_renal: false, enfermedad_corazon: false,
  hipertension_arterial: false, consumo_drogas_alcohol_tabaco: false,
  otra_enfermedad_severa: false, otra_enfermedad_descripcion: "",
  referida_a: "", nombre_personal_atendio: "",
};

export default function FichaRiesgo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const p = { form, set };

  useEffect(() => {
    api.get(`/pacientes/${id}/riesgo`)
      .then(({ data }) => {
        if (!data) return;
        setForm((f) => ({
          ...f,
          ...data,
          fecha: data.fecha ? data.fecha.split("T")[0] : f.fecha,
          fecha_ultima_regla: data.fecha_ultima_regla ? data.fecha_ultima_regla.split("T")[0] : "",
          fecha_probable_parto: data.fecha_probable_parto ? data.fecha_probable_parto.split("T")[0] : "",
        }));
      })
      .catch(() => toast("Error al cargar ficha de riesgo", "error"));
  }, [id, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/pacientes/${id}/riesgo`, form);
      toast("Ficha de riesgo guardada", "success");
      setTimeout(() => navigate(`/pacientes/${id}`), 600);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar ficha de riesgo", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>
          <ChevronLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Ficha de Riesgo Obstétrico</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
            Criterios de clasificación de riesgo
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="form-section">
          <div className="form-section-header">Datos generales</div>
          <div className="form-section-body col-4">
            <Input label="Fecha" name="fecha" type="date" form={form} set={set} />
            <Input label="Teléfono" name="telefono" form={form} set={set} />
            <Input label="Pueblo" name="pueblo" form={form} set={set} />
            <Input label="Estado civil" name="estado_civil" form={form} set={set} />
            <Input label="Escolaridad" name="escolaridad" form={form} set={set} />
            <Input label="Ocupación" name="ocupacion" form={form} set={set} />
            <Input label="FUR" name="fecha_ultima_regla" type="date" form={form} set={set} />
            <Input label="FPP" name="fecha_probable_parto" type="date" form={form} set={set} />
          </div>
        </div>

        <Section title="Antecedentes obstétricos">
          <Toggle label="Muerte fetal/neonatal previa" name="muerte_fetal_neonatal_previa" {...p} />
          <Toggle label="3+ abortos espontáneos consecutivos" name="abortos_espontaneos_3mas" {...p} />
          <Toggle label="3+ gestas" name="gestas_3mas" {...p} />
          <Toggle label="RN anterior < 2500g" name="peso_ultimo_bebe_menor_2500g" {...p} />
          <Toggle label="RN anterior > 4500g" name="peso_ultimo_bebe_mayor_4500g" {...p} />
          <Toggle label="Antecedente HTA / preeclampsia" name="antec_hipertension_preeclampsia" {...p} />
          <Toggle label="Cirugías tracto reproductivo" name="cirugias_tracto_reproductivo" {...p} />
        </Section>

        <Section title="Embarazo actual">
          <Toggle label="Embarazo múltiple" name="embarazo_multiple" {...p} />
          <Toggle label="Menor de 20 años" name="menor_20_anos" {...p} />
          <Toggle label="Mayor de 35 años" name="mayor_35_anos" {...p} />
          <Toggle label="Paciente Rh negativo" name="paciente_rh_negativo" {...p} />
          <Toggle label="Hemorragia vaginal" name="hemorragia_vaginal" {...p} />
          <Toggle label="VIH+ / Sífilis" name="vih_positivo_sifilis" {...p} />
          <Toggle label="P/A diastólica ≥ 90" name="presion_diastolica_90mas" {...p} />
          <Toggle label="Anemia" name="anemia" {...p} />
          <Toggle label="Desnutrición / obesidad" name="desnutricion_obesidad" {...p} />
          <Toggle label="Dolor abdominal" name="dolor_abdominal" {...p} />
          <Toggle label="Sintomatología urinaria" name="sintomatologia_urinaria" {...p} />
          <Toggle label="Ictericia" name="ictericia" {...p} />
        </Section>

        <Section title="Historia clínica general">
          <Toggle label="Diabetes" name="diabetes" {...p} />
          <Toggle label="Enfermedad renal" name="enfermedad_renal" {...p} />
          <Toggle label="Enfermedad del corazón" name="enfermedad_corazon" {...p} />
          <Toggle label="Hipertensión arterial" name="hipertension_arterial" {...p} />
          <Toggle label="Drogas / alcohol / tabaco" name="consumo_drogas_alcohol_tabaco" {...p} />
          <Toggle label="Otra enfermedad severa" name="otra_enfermedad_severa" {...p} />
        </Section>

        <div className="form-section">
          <div className="form-section-header">Referencia</div>
          <div className="form-section-body col-2">
            <Input label="Otra enfermedad / descripción" name="otra_enfermedad_descripcion" form={form} set={set} />
            <Input label="Referida a" name="referida_a" form={form} set={set} />
            <Input label="Nombre del personal que atendió" name="nombre_personal_atendio" form={form} set={set} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.8rem", marginTop: "1.25rem" }}>
          <button type="button" className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={loading}>
            <Save size={15} /> {loading ? "Guardando..." : "Guardar ficha"}
          </button>
        </div>
      </form>
    </div>
  );
}
