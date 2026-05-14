import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label className="input-label">{label}</label>
      {children}
    </div>
  );
}

function Input({ label, name, form, set, type = "text", ...rest }) {
  return (
    <Field label={label}>
      <input
        className="input-field"
        name={name}
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        {...rest}
      />
    </Field>
  );
}

function Select({ label, name, options, form, set }) {
  return (
    <Field label={label}>
      <select className="input-field" value={form[name] ?? ""} onChange={(e) => set(name, e.target.value)}>
        <option value="">— Seleccionar —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
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

const PUEBLO_CONVIVIENTE_OPTIONS = [
  { value: "maya", label: "Maya" },
  { value: "xinca", label: "Xinca" },
  { value: "garifuna", label: "Garífuna" },
  { value: "mestiza", label: "Mestiza" },
];

const ESCOLARIDAD_CONVIVIENTE_OPTIONS = [
  { value: "primaria", label: "Primaria" },
  { value: "basico", label: "Básico" },
  { value: "diversificado", label: "Diversificado" },
  { value: "universitario", label: "Universitario" },
  { value: "ninguna", label: "Ninguna" },
];

const RISK_FIELDS = [
  "muerte_fetal_neonatal_previa",
  "abortos_espontaneos_3mas",
  "gestas_3mas",
  "peso_ultimo_bebe_menor_2500g",
  "peso_ultimo_bebe_mayor_4500g",
  "antec_hipertension_preeclampsia",
  "cirugias_tracto_reproductivo",
  "embarazo_multiple",
  "menor_20_anos",
  "mayor_35_anos",
  "paciente_rh_negativo",
  "hemorragia_vaginal",
  "vih_positivo_sifilis",
  "presion_diastolica_90mas",
  "anemia",
  "desnutricion_obesidad",
  "dolor_abdominal",
  "sintomatologia_urinaria",
  "ictericia",
  "diabetes",
  "enfermedad_renal",
  "enfermedad_corazon",
  "hipertension_arterial",
  "consumo_drogas_alcohol_tabaco",
  "otra_enfermedad_severa",
];

function toDateInput(value) {
  return value ? value.split("T")[0] : "";
}

function calcularEdadAnios(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(`${toDateInput(fechaNacimiento)}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
}

function formatEdad(edad) {
  if (edad === null || edad === undefined || edad === "") return "";
  return `${edad} año${edad === 1 ? "" : "s"}`;
}

function defaultsDesdePaciente(paciente = {}, embarazo = {}) {
  const edad = calcularEdadAnios(paciente.fecha_nacimiento);
  const hijosMuertos =
    Number(paciente.nacidos_muertos || 0) +
    Number(paciente.muertos_antes_1sem || 0) +
    Number(paciente.muertos_despues_1sem || 0);

  return {
    telefono: paciente.telefono || "",
    pueblo: paciente.pueblo || "",
    migrante: Boolean(paciente.es_migrante),
    estado_civil: paciente.estado_civil || "",
    escolaridad: paciente.nivel_estudios || "",
    ocupacion: paciente.profesion_oficio || "",
    nombre_esposo_conviviente: paciente.nombre_esposo_conviviente || "",
    fecha_ultima_regla: toDateInput(embarazo.fur || paciente.fur),
    fecha_probable_parto: toDateInput(embarazo.fpp || paciente.fpp),
    no_embarazos: paciente.gestas_previas ?? "",
    no_partos: paciente.partos_vaginales ?? "",
    no_cesareas: paciente.cesareas ?? "",
    no_abortos: paciente.abortos ?? "",
    no_hijos_vivos: paciente.hijos_viven ?? paciente.nacidos_vivos ?? "",
    no_hijos_muertos: hijosMuertos || "",
    abortos_espontaneos_3mas: Boolean(paciente.abortos_3_espont_consecutivos),
    gestas_3mas: Number(paciente.gestas_previas || 0) >= 3,
    peso_ultimo_bebe_menor_2500g: Boolean(paciente.rn_menor_2500g),
    peso_ultimo_bebe_mayor_4500g: Boolean(paciente.rn_mayor_4000g),
    antec_hipertension_preeclampsia: Boolean(paciente.antec_hipertension || paciente.antec_preeclampsia),
    cirugias_tracto_reproductivo: Boolean(paciente.cirugia_genito_urinaria || paciente.cirugia_genito_urinaria_pers),
    menor_20_anos: edad !== null ? edad < 20 : false,
    mayor_35_anos: edad !== null ? edad > 35 : false,
    vih_positivo_sifilis: Boolean(paciente.antec_vih_positivo),
    diabetes: Boolean(paciente.antec_diabetes),
    enfermedad_renal: Boolean(paciente.antec_nefropatia),
    enfermedad_corazon: Boolean(paciente.antec_cardiopatia),
    hipertension_arterial: Boolean(paciente.antec_hipertension),
    consumo_drogas_alcohol_tabaco: Boolean(
      paciente.consume_drogas || paciente.consume_alcohol || paciente.fuma_activamente || paciente.fuma_pasivamente
    ),
    otra_enfermedad_severa: Boolean(paciente.antec_otra_condicion),
    otra_enfermedad_descripcion: paciente.antec_otra_condicion_desc || "",
  };
}

export default function FichaRiesgo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [paciente, setPaciente] = useState(null);
  const [existingRisk, setExistingRisk] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showReferralAlert, setShowReferralAlert] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const p = { form, set };
  const edadPaciente = paciente ? calcularEdadAnios(paciente.fecha_nacimiento) : null;
  const hasRiskFeatures = RISK_FIELDS.some((field) => Boolean(form[field]));
  const referralMissing = !String(form.referida_a || "").trim();

  useEffect(() => {
    api.get(`/pacientes/${id}/expediente`)
      .then(({ data }) => {
        const pacienteData = data?.paciente;
        const embarazoData = data?.embarazo_activo;
        const ficha = data?.ficha_riesgo;
        setPaciente(pacienteData || null);
        setExistingRisk(Boolean(ficha));

        if (ficha) {
          setForm((f) => ({
            ...f,
            ...ficha,
            fecha: ficha.fecha ? toDateInput(ficha.fecha) : f.fecha,
            fecha_ultima_regla: toDateInput(ficha.fecha_ultima_regla),
            fecha_probable_parto: toDateInput(ficha.fecha_probable_parto),
          }));
          return;
        }

        setForm((f) => ({
          ...f,
          ...defaultsDesdePaciente(pacienteData, embarazoData),
        }));
      })
      .catch(() => toast("Error al cargar datos de la paciente", "error"))
      .finally(() => setLoadingData(false));
  }, [id, toast]);

  const saveFicha = async () => {
    setLoading(true);
    try {
      if (existingRisk) {
        await api.put(`/pacientes/${id}/riesgo`, form);
      } else {
        await api.post(`/pacientes/${id}/riesgo`, form);
      }
      toast(existingRisk ? "Ficha de riesgo actualizada" : "Ficha de riesgo guardada", "success");
      setTimeout(() => navigate(`/pacientes/${id}`), 600);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar ficha de riesgo", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (hasRiskFeatures && referralMissing) {
      setShowReferralAlert(true);
      return;
    }
    await saveFicha();
  };

  const handleAddReferral = () => {
    setShowReferralAlert(false);
    setTimeout(() => {
      const field = document.querySelector('input[name="referida_a"]');
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus();
    }, 50);
  };

  const handleSkipReferral = async () => {
    setShowReferralAlert(false);
    await saveFicha();
  };

  return (
    <div>
      {showReferralAlert && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15, 23, 42, 0.42)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "min(460px, 100%)",
              padding: "1.25rem",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
            }}
          >
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.45rem" }}>
              Referencia pendiente
            </div>
            <p style={{ fontSize: "0.86rem", color: "var(--text-muted)", lineHeight: 1.45, margin: 0 }}>
              Se marcó una o más características de riesgo. Debe añadir el campo "Referida a" antes de guardar, o confirmar que no desea añadirlo.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSkipReferral}
                disabled={loading}
                style={{
                  border: "1px solid #eab308",
                  background: "#fef3c7",
                  color: "#854d0e",
                  borderRadius: 8,
                  padding: "0.55rem 0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                No añadir
              </button>
              <button
                type="button"
                onClick={handleAddReferral}
                style={{
                  border: "1px solid #16a34a",
                  background: "#16a34a",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "0.55rem 0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}

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

      {paciente && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.9rem 1rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            {existingRisk ? "Editando ficha de" : "Agregando ficha a"}
          </span>
          <div style={{ marginTop: 3, fontSize: "1rem", fontWeight: 800, color: "var(--text)" }}>
            {paciente.nombres} {paciente.apellidos}
          </div>
          {edadPaciente !== null && (
            <div style={{ marginTop: 4, fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Edad: <strong style={{ color: "var(--text)" }}>{formatEdad(edadPaciente)}</strong>
            </div>
          )}
        </div>
      )}

      {loadingData ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          Cargando datos de la paciente...
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="card">
        <div className="form-section">
          <div className="form-section-header">Datos generales</div>
          <div className="form-section-body col-4">
            <Input label="Fecha" name="fecha" type="date" form={form} set={set} />
            <Field label="Edad">
              <input className="input-field" value={formatEdad(edadPaciente)} readOnly />
            </Field>
            <Input label="Teléfono" name="telefono" form={form} set={set} />
            <Input label="Pueblo" name="pueblo" form={form} set={set} />
            <Input label="Estado civil" name="estado_civil" form={form} set={set} />
            <Input label="Escolaridad" name="escolaridad" form={form} set={set} />
            <Input label="Ocupación" name="ocupacion" form={form} set={set} />
            <Input label="Distancia al servicio (km)" name="distancia_servicio_km" type="number" form={form} set={set} min="0" />
            <Input label="Tiempo al servicio (horas)" name="tiempo_horas" type="number" form={form} set={set} min="0" />
            <Input label="FUR" name="fecha_ultima_regla" type="date" form={form} set={set} />
            <Input label="FPP" name="fecha_probable_parto" type="date" form={form} set={set} />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">Esposo o conviviente</div>
          <div className="form-section-body col-4">
            <Input label="Nombre del esposo o conviviente" name="nombre_esposo_conviviente" form={form} set={set} />
            <Input label="Edad" name="edad_esposo" type="number" form={form} set={set} min="0" />
            <Select label="Pueblo" name="pueblo_esposo" options={PUEBLO_CONVIVIENTE_OPTIONS} form={form} set={set} />
            <Select label="Escolaridad" name="escolaridad_esposo" options={ESCOLARIDAD_CONVIVIENTE_OPTIONS} form={form} set={set} />
            <Input label="Ocupación" name="ocupacion_esposo" form={form} set={set} />
          </div>
        </div>

        <Section title="Antecedentes obstétricos">
          <Input label="No. de embarazos" name="no_embarazos" type="number" form={form} set={set} min="0" />
          <Input label="No. de partos" name="no_partos" type="number" form={form} set={set} min="0" />
          <Input label="No. de cesáreas" name="no_cesareas" type="number" form={form} set={set} min="0" />
          <Input label="No. de abortos" name="no_abortos" type="number" form={form} set={set} min="0" />
          <Input label="No. de hijos vivos" name="no_hijos_vivos" type="number" form={form} set={set} min="0" />
          <Input label="No. de hijos muertos" name="no_hijos_muertos" type="number" form={form} set={set} min="0" />
          <Input label="Edad de embarazo (semanas)" name="edad_embarazo_semanas" type="number" form={form} set={set} min="0" />
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
            <Save size={15} /> {loading ? "Guardando..." : existingRisk ? "Guardar cambios" : "Guardar ficha"}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
