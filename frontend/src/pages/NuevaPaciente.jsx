import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import {
  Building2, User, Heart, Baby, ShieldAlert, CheckCircle,
  ChevronLeft, ChevronRight, Save
} from "lucide-react";

// ─── STEPS ──────────────────────────────────────────────────
const STEPS = [
  { label: "Establecimiento", icon: Building2 },
  { label: "Paciente",        icon: User       },
  { label: "Gestación",       icon: Baby       },
  { label: "Antecedentes",    icon: Heart      },
  { label: "Riesgo social",   icon: ShieldAlert },
  { label: "Confirmar",       icon: CheckCircle },
];

// ─── HELPERS DE CAMPO ────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="form-group">
      <label className="input-label">
        {label}{required && <span style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ label, name, type = "text", required, form, set, ...rest }) {
  return (
    <Field label={label} required={required}>
      <input
        className="input-field"
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        {...rest}
      />
    </Field>
  );
}

function Select({ label, name, options, required, form, set }) {
  return (
    <Field label={label} required={required}>
      <select className="input-field" value={form[name] ?? ""} onChange={(e) => set(name, e.target.value)}>
        <option value="">— Seleccionar —</option>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
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
        display: "flex", alignItems: "center", gap: "0.6rem",
        cursor: "pointer", padding: "0.45rem 0.6rem",
        borderRadius: 8,
        background: val ? "var(--primary-lt)" : "var(--surface2)",
        border: `1.5px solid ${val ? "var(--primary)" : "var(--border)"}`,
        transition: "all 0.15s",
        userSelect: "none",
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: val ? "var(--primary)" : "var(--border)",
        display: "grid", placeItems: "center", transition: "background 0.15s",
      }}>
        {val && <span style={{ color: "#fff", fontSize: "0.65rem", fontWeight: 800 }}>✓</span>}
      </div>
      <span style={{ fontSize: "0.82rem", color: val ? "var(--primary)" : "var(--text-muted)", fontWeight: val ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

function TrimesterChecks({ label, names, form, set }) {
  return (
    <div className="trimester-row">
      <span className="trimester-label">{label}</span>
      <div className="trimester-options">
        <Toggle label="1er trimestre" name={names[0]} form={form} set={set} />
        <Toggle label="2do trimestre" name={names[1]} form={form} set={set} />
        <Toggle label="3er trimestre" name={names[2]} form={form} set={set} />
      </div>
    </div>
  );
}

// ─── ESTADO INICIAL ──────────────────────────────────────────
const INIT = {
  // Establecimiento
  no_expediente: "", cui: "",
  nombre_establecimiento: "CAP El Chal",
  distrito: "El Chal",
  area_salud: "Petén Sur Oriente",
  categoria_servicio: "CS_B",
  // Datos personales
  nombres: "", apellidos: "",
  fecha_nacimiento: "", edad_manual: "", edad_calculada: "", rango_edad: "",
  clasificacion_alfa_beta: "",
  domicilio: "", municipio: "El Chal", territorio: "",
  sector: "", comunidad: "", telefono: "",
  nivel_estudios: "", ultimo_anio_aprobado: "",
  profesion_oficio: "", estado_civil: "",
  vive_sola: false,
  nombre_esposo_conviviente: "",
  cobertura_igss: false, cobertura_privada: false, cobertura_privada_detalle: "",
  viene_referida: false, referida_de: "",
  es_migrante: false, migrante_municipio_depto_pais: "",
  pueblo: "", comunidad_linguistica: "",
  // Gestación actual
  fur: "", fpp: "",
  eg_confiable_fur: false, eg_confiable_usg: false,
  // Antecedentes obstétricos
  gestas_previas: 0, abortos: 0, partos_vaginales: 0, cesareas: 0,
  nacidos_vivos: 0, hijos_viven: 0,
  muertos_antes_1sem: 0, muertos_despues_1sem: 0,
  cirugia_genito_urinaria: false, infertilidad: false,
  fin_embarazo_anterior: "", fin_embarazo_menos_1anio: false,
  embarazo_planeado: false, fracaso_metodo: "",
  clasificacion_antec_obstetrico: "",
  rn_menor_2500g: false, rn_mayor_4000g: false,
  antec_vih_positivo: false, antec_emb_ectopico: false, antec_violencia: false,
  // Antecedentes personales
  antec_diabetes: false, antec_diabetes_tipo: "", antec_tbc: false, antec_hipertension: false,
  antec_preeclampsia: false, antec_eclampsia: false, antec_cardiopatia: false,
  antec_nefropatia: false, antec_otra_condicion: false, antec_otra_condicion_desc: "",
  cirugia_genito_urinaria_pers: false,
  // Antecedentes familiares
  fam_diabetes: false, fam_tbc: false, fam_hipertension: false,
  fam_preeclampsia: false, fam_eclampsia: false,
  fam_cardiopatia: false, fam_gemelos: false,
  fam_otra_condicion_medica_grave: false,
  // Riesgo social
  fuma_activamente: false, fuma_pasivamente: false,
  consume_drogas: false, consume_alcohol: false,
  fuma_activamente_1er_trimestre: false,
  fuma_activamente_2do_trimestre: false,
  fuma_activamente_3er_trimestre: false,
  fuma_pasivamente_1er_trimestre: false,
  fuma_pasivamente_2do_trimestre: false,
  fuma_pasivamente_3er_trimestre: false,
  consume_alcohol_1er_trimestre: false,
  consume_alcohol_2do_trimestre: false,
  consume_alcohol_3er_trimestre: false,
  consume_drogas_1er_trimestre: false,
  consume_drogas_2do_trimestre: false,
  consume_drogas_3er_trimestre: false,
  violencia_1er_trimestre: false, violencia_2do_trimestre: false,
  violencia_3er_trimestre: false, embarazo_abuso_sexual: false,
  tiene_ficha_riesgo: false,
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function NuevaPaciente() {
  const { id } = useParams();
  const [step, setStep]       = useState(0);
  const [form, setForm]       = useState(INIT);
  const [loading, setLoading] = useState(false);
  const navigate              = useNavigate();
  const toast                 = useGlobalToast();
  const editando              = Boolean(id);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!editando) return;

    api.get(`/pacientes/${id}`)
      .then(({ data }) => {
        setForm((f) => ({
          ...f,
          ...data,
          fecha_nacimiento: data.fecha_nacimiento ? data.fecha_nacimiento.split("T")[0] : "",
          fur: data.fur ? data.fur.split("T")[0] : "",
          fpp: data.fpp ? data.fpp.split("T")[0] : "",
          fin_embarazo_anterior: data.fin_embarazo_anterior ? data.fin_embarazo_anterior.split("T")[0] : "",
        }));
      })
      .catch(() => toast("Error al cargar datos de la paciente", "error"))
  }, [editando, id, toast]);

  const clasificarEdad = (edad) => {
    if (edad === "" || edad === null || edad === undefined) return "";
    if (edad < 14) return "menor_14";
    if (edad <= 19) return "14_19";
    if (edad <= 35) return "20_35";
    return "mayor_35";
  };

  const calcularEdad = (fecha) => {
    if (!fecha) return { texto: "", anios: "" };

    const nacimiento = new Date(`${fecha}T00:00:00`);
    const hoy = new Date();
    if (Number.isNaN(nacimiento.getTime()) || nacimiento > hoy) {
      return { texto: "", anios: "" };
    }

    let anios = hoy.getFullYear() - nacimiento.getFullYear();
    let meses = hoy.getMonth() - nacimiento.getMonth();
    let dias = hoy.getDate() - nacimiento.getDate();

    if (dias < 0) {
      meses -= 1;
      const ultimoDiaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
      dias += ultimoDiaMesAnterior;
    }

    if (meses < 0) {
      anios -= 1;
      meses += 12;
    }

    return {
      texto: `${anios} año${anios !== 1 ? "s" : ""}, ${meses} mes${meses !== 1 ? "es" : ""} y ${dias} día${dias !== 1 ? "s" : ""}`,
      anios,
    };
  };

  const fechaDesdeEdad = (edad) => {
    if (edad === "" || edad === null || edad === undefined) return "";
    const hoy = new Date();
    const fecha = new Date(hoy.getFullYear() - Number(edad), hoy.getMonth(), hoy.getDate());
    return fecha.toISOString().split("T")[0];
  };

  const handleFechaNacimiento = (val) => {
    const edad = calcularEdad(val);
    setForm((f) => ({
      ...f,
      fecha_nacimiento: val,
      edad_manual: edad.anios,
      edad_calculada: edad.texto,
      rango_edad: clasificarEdad(edad.anios),
    }));
  };

  const handleEdadManual = (val) => {
    const edad = val === "" ? "" : Number(val);
    const fecha = fechaDesdeEdad(edad);
    const edadCalculada = calcularEdad(fecha);

    setForm((f) => ({
      ...f,
      edad_manual: edad,
      fecha_nacimiento: fecha,
      edad_calculada: edadCalculada.texto,
      rango_edad: clasificarEdad(edad),
    }));
  };

  // FPP automática al ingresar FUR
  const handleFUR = (val) => {
    set("fur", val);
    if (val) {
      const fpp = new Date(new Date(val).getTime() + 280 * 86400000);
      set("fpp", fpp.toISOString().split("T")[0]);
    }
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!form.no_expediente || !form.nombres || !form.apellidos) {
      toast("No. expediente, nombres y apellidos son requeridos", "error");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        antec_diabetes: Boolean(form.antec_diabetes_tipo),
        fuma_activamente: Boolean(
          form.fuma_activamente_1er_trimestre ||
          form.fuma_activamente_2do_trimestre ||
          form.fuma_activamente_3er_trimestre
        ),
        fuma_pasivamente: Boolean(
          form.fuma_pasivamente_1er_trimestre ||
          form.fuma_pasivamente_2do_trimestre ||
          form.fuma_pasivamente_3er_trimestre
        ),
        consume_alcohol: Boolean(
          form.consume_alcohol_1er_trimestre ||
          form.consume_alcohol_2do_trimestre ||
          form.consume_alcohol_3er_trimestre
        ),
        consume_drogas: Boolean(
          form.consume_drogas_1er_trimestre ||
          form.consume_drogas_2do_trimestre ||
          form.consume_drogas_3er_trimestre
        ),
      };

      const { data } = editando
        ? await api.put(`/pacientes/${id}`, payload)
        : await api.post("/pacientes", payload);

      toast(editando ? "Paciente actualizada exitosamente" : "Paciente registrada exitosamente", "success");
      setTimeout(() => navigate(`/pacientes/${editando ? id : data.id}`), 800);
    } catch (e) {
      const msg = e.response?.data?.error || "Error al guardar";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const p = { form, set };

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate("/pacientes")}>
          <ChevronLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>Nueva paciente</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
            {editando ? "Modificar datos de la paciente" : "Ficha Clínica Prenatal y Puerperio — MSPAS"}
          </p>
        </div>
      </div>

      {/* STEPPER */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.75rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done    = i < step;
          const current = i === step;
          return (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                flex: "1 1 auto", minWidth: 90,
                padding: "0.55rem 0.75rem",
                borderRadius: 10,
                border: current ? "2px solid var(--primary)" : "2px solid var(--border)",
                background: done ? "var(--primary)" : current ? "var(--primary-lt)" : "var(--surface)",
                color: done ? "#fff" : current ? "var(--primary)" : "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "0.4rem", fontSize: "0.78rem", fontWeight: current ? 700 : 500,
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              <Icon size={14} />
              {done ? "✓ " : ""}{s.label}
            </button>
          );
        })}
      </div>

      {/* FORM CARD */}
      <div className="card" style={{ padding: "1.75rem" }}>

        {/* ── STEP 0: ESTABLECIMIENTO ── */}
        {step === 0 && (
          <div>
            <div className="form-section">
              <div className="form-section-header">Datos del Establecimiento</div>
              <div className="form-section-body col-2">
                <Input label="No. de Expediente" name="no_expediente" required form={form} set={set} placeholder="Ej: 2025-001" />
                <Input label="CUI (DPI)" name="cui" form={form} set={set} placeholder="13 dígitos" maxLength={13} />
                <Input label="Nombre del Establecimiento" name="nombre_establecimiento" form={form} set={set} />
                <Input label="Distrito" name="distrito" form={form} set={set} />
                <Input label="Área de Salud" name="area_salud" form={form} set={set} />
                <Select label="Categoría" name="categoria_servicio" form={form} set={set}
                  options={[
                    { value: "CCS", label: "CCS" },
                    { value: "PS",  label: "PS" },
                    { value: "CS_B", label: 'CS "B"' },
                    { value: "CS_A", label: 'CS "A"' },
                    { value: "CAP",  label: "CAP" },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: DATOS PERSONALES ── */}
        {step === 1 && (
          <div>
            <div className="form-section">
              <div className="form-section-header">Datos de la Embarazada</div>
              <div className="form-section-body col-2">
                <Input label="Nombres" name="nombres" required form={form} set={set} />
                <Input label="Apellidos" name="apellidos" required form={form} set={set} />
                <Field label="Fecha de Nacimiento">
                  <input
                    className="input-field"
                    type="date"
                    value={form.fecha_nacimiento}
                    onChange={(e) => handleFechaNacimiento(e.target.value)}
                  />
                </Field>
                <Field label="Edad">
                  <input
                    className="input-field"
                    type="number"
                    min="0"
                    max="120"
                    value={form.edad_manual ?? ""}
                    onChange={(e) => handleEdadManual(e.target.value)}
                    placeholder="Si no conoce la fecha, ingrese edad"
                  />
                </Field>
                {form.edad_calculada && (
                  <div className="age-preview">
                    Edad calculada: <strong>{form.edad_calculada}</strong>
                  </div>
                )}
                <Select label="Alfabeta" name="clasificacion_alfa_beta" form={form} set={set}
                  options={[
                    { value: "SI", label: "Sí" },
                    { value: "NO", label: "No" },
                  ]}
                />
                <Input label="Domicilio" name="domicilio" form={form} set={set} />
                <Input label="Municipio" name="municipio" form={form} set={set} />
                <Select label="Territorio" name="territorio" form={form} set={set}
                  options={["1", "2", "3", "4"]}
                />
                <Select label="Sector" name="sector" form={form} set={set}
                  options={["A", "B"]}
                />
                <Input label="Comunidad" name="comunidad" form={form} set={set} />
                <Input label="Teléfono" name="telefono" form={form} set={set} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Situación Personal</div>
              <div className="form-section-body col-2">
                <Select label="Nivel de Estudios" name="nivel_estudios" form={form} set={set}
                  options={[
                    { value: "ninguno",      label: "Ninguno" },
                    { value: "primaria",     label: "Primaria" },
                    { value: "basico",       label: "Básico" },
                    { value: "diversificado",label: "Diversificado" },
                    { value: "universitaria",label: "Universitaria" },
                  ]}
                />
                <Input label="Último año aprobado" name="ultimo_anio_aprobado" type="number" form={form} set={set} />
                <Input label="Profesión u oficio" name="profesion_oficio" form={form} set={set} />
                <Select label="Estado Civil" name="estado_civil" form={form} set={set}
                  options={[
                    { value: "casada",    label: "Casada" },
                    { value: "unida",     label: "Unida" },
                    { value: "soltera",   label: "Soltera" },
                    { value: "separada",  label: "Separada" },
                  ]}
                />
                <Field label="¿Vive sola?">
                  <select
                    className="input-field"
                    value={form.vive_sola === "" ? "" : String(form.vive_sola)}
                    onChange={(e) => set("vive_sola", e.target.value === "true")}
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </Field>
                <Input label="Nombre del esposo/conviviente" name="nombre_esposo_conviviente" form={form} set={set} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Identidad y Origen</div>
              <div className="form-section-body col-2">
                <Select label="Pueblo" name="pueblo" form={form} set={set}
                  options={[
                    { value: "maya",     label: "Maya" },
                    { value: "garifuna", label: "Garífuna" },
                    { value: "xinca",    label: "Xinca" },
                    { value: "mestizo",  label: "Mestizo" },
                    { value: "otro",     label: "Otro" },
                  ]}
                />
                <Input label="Comunidad Lingüística" name="comunidad_linguistica" form={form} set={set} />
              </div>
              <div className="form-section-body col-2" style={{ marginTop: "0.75rem" }}>
                <Toggle label="Es migrante" name="es_migrante" {...p} />
                {form.es_migrante && (
                  <Input label="Municipio/Dpto/País de origen" name="migrante_municipio_depto_pais" form={form} set={set} />
                )}
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Cobertura y Referencia</div>
              <div className="form-section-body col-2">
                <Toggle label="Cobertura IGSS" name="cobertura_igss" {...p} />
                <Toggle label="Cobertura Privada" name="cobertura_privada" {...p} />
                {form.cobertura_privada && (
                  <Input label="Especifique cobertura privada" name="cobertura_privada_detalle" form={form} set={set} />
                )}
                <Toggle label="Viene referida" name="viene_referida" {...p} />
                {form.viene_referida && (
                  <Input label="¿De dónde?" name="referida_de" form={form} set={set} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: GESTACIÓN ACTUAL ── */}
        {step === 2 && (
          <div>
            <div className="form-section">
              <div className="form-section-header">Gestación Actual</div>
              <div className="form-section-body col-2">
                <Field label="FUR (Fecha Última Regla)" required>
                  <input className="input-field" type="date" value={form.fur}
                    onChange={(e) => handleFUR(e.target.value)} />
                </Field>
                <Input label="FPP (Fecha Probable de Parto)" name="fpp" type="date" form={form} set={set} />
                <Toggle label="EG confiable por FUR" name="eg_confiable_fur" {...p} />
                <Toggle label="EG confiable por USG" name="eg_confiable_usg" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Antecedentes Obstétricos</div>
              <div className="form-section-body col-4">
                <Input label="Gestas previas" name="gestas_previas" type="number" form={form} set={set} />
                <Input label="Abortos" name="abortos" type="number" form={form} set={set} />
                <Input label="Partos vaginales" name="partos_vaginales" type="number" form={form} set={set} />
                <Input label="Cesáreas" name="cesareas" type="number" form={form} set={set} />
                <Input label="Nacidos vivos" name="nacidos_vivos" type="number" form={form} set={set} />
                <Input label="Hijos que viven" name="hijos_viven" type="number" form={form} set={set} />
                <Input label="Muertos antes 1ª sem." name="muertos_antes_1sem" type="number" form={form} set={set} />
                <Input label="Muertos después 1ª sem." name="muertos_despues_1sem" type="number" form={form} set={set} />
              </div>
              <div className="form-section-body col-2" style={{ marginTop: "0.75rem" }}>
                <Toggle label="Cirugía génito-urinaria" name="cirugia_genito_urinaria" {...p} />
                <Toggle label="Infertilidad" name="infertilidad" {...p} />
                <Toggle label="RN anterior &lt; 2500g" name="rn_menor_2500g" {...p} />
                <Toggle label="RN anterior ≥ 4000g" name="rn_mayor_4000g" {...p} />
                <Toggle label="Antec. VIH+" name="antec_vih_positivo" {...p} />
                <Toggle label="Antec. embarazo ectópico" name="antec_emb_ectopico" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Fin del Embarazo Anterior</div>
              <div className="form-section-body col-2">
                <Input label="Fecha fin embarazo anterior" name="fin_embarazo_anterior" type="date" form={form} set={set} />
                <Toggle label="Menos de 1 año desde último embarazo" name="fin_embarazo_menos_1anio" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Planificación</div>
              <div className="form-section-body col-2">
                <Toggle label="Embarazo planeado" name="embarazo_planeado" {...p} />
                <Select label="Fracaso de método anticonceptivo" name="fracaso_metodo" form={form} set={set}
                  options={[
                    { value: "no",        label: "No usaba" },
                    { value: "barrera",   label: "Barrera" },
                    { value: "hormonal",  label: "Hormonal" },
                    { value: "DIU",       label: "DIU" },
                    { value: "natural",   label: "Natural" },
                    { value: "emergencia",label: "Emergencia" },
                  ]}
                />
                <Select label="Clasificación antec. obstétrico" name="clasificacion_antec_obstetrico" form={form} set={set}
                  options={["N/C", "Normal", "3 espontáneos consecutivos", "Último previo"]}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: ANTECEDENTES ── */}
        {step === 3 && (
          <div>
            <div className="form-section">
              <div className="form-section-header">Antecedentes Personales</div>
              <div className="form-section-body col-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.6rem" }}>
                <Toggle label="Tuberculosis" name="antec_tbc" {...p} />
                <Select label="Diabetes" name="antec_diabetes_tipo" form={form} set={set}
                  options={[
                    { value: "1", label: "Tipo 1" },
                    { value: "2", label: "Tipo 2" },
                    { value: "G", label: "Gestacional" },
                  ]}
                />
                <Toggle label="Hipertensión arterial" name="antec_hipertension" {...p} />
                <Toggle label="Preeclampsia" name="antec_preeclampsia" {...p} />
                <Toggle label="Eclampsia" name="antec_eclampsia" {...p} />
                <Toggle label="Otra condición médica grave" name="antec_otra_condicion" {...p} />
                <Toggle label="Cirugía génito-urinaria" name="cirugia_genito_urinaria_pers" {...p} />
                <Toggle label="Infertilidad" name="infertilidad" {...p} />
                <Toggle label="Cardiopatía" name="antec_cardiopatia" {...p} />
                <Toggle label="Nefropatía" name="antec_nefropatia" {...p} />
                <Toggle label="Violencia" name="antec_violencia" {...p} />
                <Toggle label="VIH+" name="antec_vih_positivo" {...p} />
              </div>
              {form.antec_otra_condicion && (
                <div style={{ marginTop: "0.75rem" }}>
                  <Input label="Describa la condición" name="antec_otra_condicion_desc" form={form} set={set} />
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="form-section-header">Antecedentes Familiares</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.6rem", padding: "1rem" }}>
                <Toggle label="Diabetes" name="fam_diabetes" {...p} />
                <Toggle label="Tuberculosis" name="fam_tbc" {...p} />
                <Toggle label="Hipertensión" name="fam_hipertension" {...p} />
                <Toggle label="Preeclampsia" name="fam_preeclampsia" {...p} />
                <Toggle label="Eclampsia" name="fam_eclampsia" {...p} />
                <Toggle label="Otra condición médica grave" name="fam_otra_condicion_medica_grave" {...p} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: RIESGO SOCIAL ── */}
        {step === 4 && (
          <div>
            <div className="form-section">
              <div className="form-section-header">Hábitos por trimestre</div>
              <div className="trimester-list">
                <TrimesterChecks
                  label="Fuma activamente"
                  names={["fuma_activamente_1er_trimestre", "fuma_activamente_2do_trimestre", "fuma_activamente_3er_trimestre"]}
                  {...p}
                />
                <TrimesterChecks
                  label="Fuma pasivamente"
                  names={["fuma_pasivamente_1er_trimestre", "fuma_pasivamente_2do_trimestre", "fuma_pasivamente_3er_trimestre"]}
                  {...p}
                />
                <TrimesterChecks
                  label="Consume alcohol"
                  names={["consume_alcohol_1er_trimestre", "consume_alcohol_2do_trimestre", "consume_alcohol_3er_trimestre"]}
                  {...p}
                />
                <TrimesterChecks
                  label="Consume drogas"
                  names={["consume_drogas_1er_trimestre", "consume_drogas_2do_trimestre", "consume_drogas_3er_trimestre"]}
                  {...p}
                />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Violencia (por trimestre)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.6rem", padding: "1rem" }}>
                <Toggle label="Violencia 1er trimestre" name="violencia_1er_trimestre" {...p} />
                <Toggle label="Violencia 2do trimestre" name="violencia_2do_trimestre" {...p} />
                <Toggle label="Violencia 3er trimestre" name="violencia_3er_trimestre" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Embarazo producto de violencia sexual</div>
              <div style={{ padding: "1rem" }}>
                <Toggle label="Sí, embarazo producto de violencia sexual" name="embarazo_abuso_sexual" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Ficha de Riesgo Obstétrico</div>
              <div style={{ padding: "1rem" }}>
                <Toggle label="Ya se llenó ficha de riesgo obstétrico" name="tiene_ficha_riesgo" {...p} />
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                  Podrá registrar la ficha de riesgo completa desde el expediente de la paciente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 5: CONFIRMAR ── */}
        {step === 5 && (
          <div>
            <div style={{
              background: "var(--surface2)", borderRadius: 12, padding: "1.25rem",
              marginBottom: "1rem", border: "1px solid var(--border)",
            }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--primary)", marginBottom: "1rem" }}>
                Resumen del registro
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "0.75rem" }}>
                {[
                  ["No. Expediente", form.no_expediente],
                  ["CUI", form.cui],
                  ["Nombres", form.nombres],
                  ["Apellidos", form.apellidos],
                  ["Establecimiento", form.nombre_establecimiento],
                  ["Categoría", form.categoria_servicio],
                  ["Municipio", form.municipio],
                  ["Comunidad", form.comunidad],
                  ["Pueblo", form.pueblo],
                  ["Estado civil", form.estado_civil],
                  ["FUR", form.fur],
                  ["FPP", form.fpp],
                  ["Gestas previas", form.gestas_previas],
                  ["Partos vaginales", form.partos_vaginales],
                  ["Cesáreas", form.cesareas],
                  ["Abortos", form.abortos],
                ].map(([lbl, val]) => val !== "" && val !== null && val !== undefined ? (
                  <div key={lbl}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{lbl}</div>
                    <div style={{ fontSize: "0.88rem", color: "var(--text)", fontWeight: 500, marginTop: 2 }}>{String(val)}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {(!form.no_expediente || !form.nombres || !form.apellidos) && (
              <div style={{
                background: "var(--danger-lt)", border: "1.5px solid var(--danger)",
                borderRadius: 10, padding: "0.9rem 1.1rem",
                color: "var(--danger)", fontSize: "0.85rem", fontWeight: 500,
              }}>
                ⚠ Faltan campos requeridos: No. expediente, Nombres y Apellidos.
                Regresa a los pasos anteriores para completarlos.
              </div>
            )}
          </div>
        )}

        {/* NAVEGACIÓN */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: "2rem", paddingTop: "1.25rem",
          borderTop: "1px solid var(--border)",
        }}>
          <button
            className="btn-secondary"
            onClick={back}
            disabled={step === 0}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <ChevronLeft size={15} /> Atrás
          </button>

          {step < STEPS.length - 1 ? (
            <button
              className="btn-primary"
              onClick={next}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              Siguiente <ChevronRight size={15} />
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={loading || !form.no_expediente || !form.nombres || !form.apellidos}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Save size={15} />
              {loading ? "Guardando..." : editando ? "Guardar cambios" : "Registrar paciente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
