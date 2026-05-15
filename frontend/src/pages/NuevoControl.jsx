import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { ChevronLeft, Save, Stethoscope, FlaskConical, Pill, BookOpen } from "lucide-react";
import { getGuatemalaDateInputValue, getGuatemalaTimeInputValue } from "../utils/guatemalaTime";
import { calculateGestationalWeeks } from "../utils/gestationalAge";

// ─── HELPERS ────────────────────────────────────────────────
function Field({ label, children, col }) {
  return (
    <div className="form-group" style={col ? { gridColumn: `span ${col}` } : {}}>
      <label className="input-label">{label}</label>
      {children}
    </div>
  );
}

function Inp({ label, name, type = "text", form, set, col, ...rest }) {
  return (
    <Field label={label} col={col}>
      <input
        className="input-field"
        type={type}
        value={form[name] ?? ""}
        onChange={(e) =>
          set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        {...rest}
      />
    </Field>
  );
}

function Toggle({ label, name, form, set }) {
  const val = form[name] ?? false;
  return (
    <div
      onClick={() => set(name, !val)}
      className={`toggle-control ${val ? "is-on" : ""}`}
    >
      <div className="toggle-mark">
        {val && "✓"}
      </div>
      <span className="toggle-label">
        {label}
      </span>
    </div>
  );
}

function LabRow({ label, realizadoKey, resultadoKey, form, set, extra }) {
  return (
    <div className="lab-row">
      <Toggle label={label} name={realizadoKey} form={form} set={set} />
      {form[realizadoKey] && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 120 }}
            placeholder="Resultado"
            value={form[resultadoKey] ?? ""}
            onChange={(e) => set(resultadoKey, e.target.value)}
          />
          {extra}
        </div>
      )}
    </div>
  );
}

// ─── ESTADO INICIAL ──────────────────────────────────────────
const INIT = {
  numero_control: 1,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
  motivo_consulta: "",
  // Signos de peligro
  peligro_hemorragia_vaginal: false, peligro_palidez: false,
  peligro_dolor_cabeza: false, peligro_hipertension: false,
  peligro_dolor_epigastrico: false, peligro_trastornos_visuales: false,
  peligro_fiebre: false, peligro_otro: "",
  // Info
  edad_gestacional_semanas: "", nombre_acompanante: "", nombre_cargo_atiende: "",
  // Examen físico
  pa_sistolica: "", pa_diastolica: "", frecuencia_cardiaca: "",
  frecuencia_respiratoria: "", temperatura: "", perimetro_braquial_cm: "",
  peso_kg: "", talla_cm: "", imc: "",
  examen_bucodental: null, examen_mamas: null,
  // Examen obstétrico
  altura_uterina_cm: "", fcf: "", movimientos_fetales: null,
  situacion_fetal: "", presentacion_fetal: "",
  // Ginecológico
  sangre_manchado: false, verrugas_herpes_papilomas: false,
  flujo_vaginal: false, otros_ginecologico: "",
  // Labs
  hematologia_realizada: false, hematologia_resultado: "",
  glicemia_realizada: false, glicemia_resultado: "",
  grupo_rh_realizado: false, grupo_rh_resultado: "",
  orina_realizada: false, orina_bacteriuria: null, orina_proteinuria: null,
  heces_realizada: false, heces_resultado: "",
  vih_realizado: false, vih_resultado: "", vih_resultado_valor: "",
  vdrl_realizado: false, vdrl_resultado: "", vdrl_tratamiento_indicado: false,
  torch_realizado: false, torch_resultado_positivo: null, torch_resultado_valor: "",
  papanicolau_ivaa_realizado: false, papanicolau_ivaa_fecha_toma: "", papanicolau_ivaa_resultado: "",
  hepatitis_b_realizado: false, hepatitis_b_resultado: "",
  otros_lab: "",
  // USG
  usg_realizado: false, usg_hallazgos: "",
  // Suplementación
  sulfato_ferroso: false, sulfato_ferroso_tabletas: "",
  acido_folico: false, acido_folico_tabletas: "",
  suplementacion_hallazgos: "", suplementacion_tratamiento: "",
  // Orientaciones
  orient_plan_emergencia_parto: false, orient_alimentacion_embarazo: false,
  orient_senales_peligro: false, orient_lactancia_materna: false,
  orient_planificacion_familiar: false, orient_importancia_postparto: false,
  orient_vacunacion_nino: false, orient_pre_post_prueba_vih: false,
  orient_importancia_atenciones: false, orient_tratamiento_its_pareja: false,
  orient_otros: "",
  // IC / Tx
  impresion_clinica: "", tratamiento: "", cita_siguiente: "",
};

const initialControlForm = () => ({
  ...INIT,
  fecha: getGuatemalaDateInputValue(),
  hora: getGuatemalaTimeInputValue(),
});

const TABS = [
  { id: "general",       label: "General",       icon: Stethoscope  },
  { id: "laboratorio",   label: "Laboratorios",  icon: FlaskConical },
  { id: "suplementacion",label: "Suplementación",icon: Pill         },
  { id: "orientaciones", label: "Orientaciones", icon: BookOpen     },
];

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function NuevoControl() {
  const { id, controlId } = useParams();
  const navigate = useNavigate();
  const toast    = useGlobalToast();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab]         = useState("general");
  const [form, setForm]       = useState(initialControlForm);
  const [fur, setFur]         = useState("");
  const editando = Boolean(controlId);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const p   = { form, set };

  useEffect(() => {
    const parseControl = (control) => ({
      ...initialControlForm(),
      ...control,
      fecha: control.fecha ? control.fecha.split("T")[0] : INIT.fecha,
      cita_siguiente: control.cita_siguiente ? control.cita_siguiente.split("T")[0] : "",
      papanicolau_ivaa_fecha_toma: control.papanicolau_ivaa_fecha_toma
        ? control.papanicolau_ivaa_fecha_toma.split("T")[0]
        : "",
    });

    const controlesRequest = editando
      ? api.get(`/pacientes/${id}/controles/${controlId}`)
      : api.get(`/pacientes/${id}/controles`);

    Promise.all([controlesRequest, api.get(`/pacientes/${id}/expediente`)])
      .then(([{ data }, { data: expediente }]) => {
        setFur(expediente?.embarazo_activo?.fur || expediente?.paciente?.fur || "");
        if (editando) {
          setForm(parseControl(data));
          return;
        }
        const ultimo = Math.max(0, ...(data || []).map((control) => Number(control.numero_control) || 0));
        setForm((f) => ({ ...f, numero_control: ultimo + 1 }));
      })
      .catch(() => toast(editando ? "Error al cargar control" : "Error al calcular siguiente control", "error"))
      .finally(() => setLoadingData(false));
  }, [id, controlId, editando, toast]);

  const edadGestacionalSemanas = calculateGestationalWeeks(fur, form.fecha);
  const formConEdadGestacional = {
    ...form,
    edad_gestacional_semanas: edadGestacionalSemanas,
  };

  // IMC automático
  const handlePeso = (v) => {
    set("peso_kg", v);
    if (v && form.talla_cm) {
      const h = Number(form.talla_cm) / 100;
      set("imc", h > 0 ? +(Number(v) / (h * h)).toFixed(1) : "");
    }
  };
  const handleTalla = (v) => {
    set("talla_cm", v);
    if (v && form.peso_kg) {
      const h = Number(v) / 100;
      set("imc", h > 0 ? +(Number(form.peso_kg) / (h * h)).toFixed(1) : "");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      ...form,
      edad_gestacional_semanas: edadGestacionalSemanas,
    };
    try {
      if (editando) {
        await api.put(`/pacientes/${id}/controles/${controlId}`, payload);
      } else {
        await api.post(`/pacientes/${id}/controles`, payload);
      }
      toast(editando ? "Control actualizado exitosamente" : "Control registrado exitosamente", "success");
      setTimeout(() => navigate(`/pacientes/${id}`), 800);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar", "error");
    } finally { setLoading(false); }
  };

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem" }}>
        <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>
          <ChevronLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{editando ? "Editar Control Prenatal" : "Registrar Control Prenatal"}</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
            {editando ? `Control ${form.numero_control}` : `Se registrara como control ${form.numero_control}`}
          </p>
        </div>
      </div>

      {loadingData ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          Cargando control...
        </div>
      ) : (
      <form onSubmit={handleSubmit}>

        {/* DATOS BÁSICOS DEL CONTROL — siempre visibles */}
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div className="form-section-body col-4">
            <Field label="No. Control">
              <select className="input-field" value={form.numero_control}
                onChange={(e) => set("numero_control", Number(e.target.value))}>
                {[1,2,3,4].map(n => <option key={n} value={n}>{n}° Control</option>)}
                {[5,6,7,8,9,10].map(n => <option key={n} value={n}>Otro ({n})</option>)}
              </select>
            </Field>
            <Inp label="Fecha" name="fecha" type="date" form={form} set={set} />
            <Inp label="Hora" name="hora" type="time" form={form} set={set} />
            <Inp label="Semanas de gestación" name="edad_gestacional_semanas" type="number" form={formConEdadGestacional} set={set} readOnly />
          </div>
          <div className="form-section-body col-2" style={{ marginTop: "0.5rem" }}>
            <Inp label="Motivo de consulta" name="motivo_consulta" form={form} set={set} />
            <Inp label="Nombre del acompañante" name="nombre_acompanante" form={form} set={set} />
            <Inp label="Nombre y cargo de quien atiende" name="nombre_cargo_atiende" form={form} set={set} col={2} />
          </div>
        </div>

        {/* SIGNOS DE PELIGRO */}
        <div className="card" style={{ marginBottom: "1.25rem", borderLeft: "3px solid var(--danger)" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--danger)", marginBottom: "0.85rem" }}>
            ⚠ Signos de Peligro
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.5rem" }}>
            <Toggle label="Hemorragia vía vaginal" name="peligro_hemorragia_vaginal" {...p} />
            <Toggle label="Palidez" name="peligro_palidez" {...p} />
            <Toggle label="Dolor de cabeza" name="peligro_dolor_cabeza" {...p} />
            <Toggle label="Hipertensión" name="peligro_hipertension" {...p} />
            <Toggle label="Dolor boca del estómago" name="peligro_dolor_epigastrico" {...p} />
            <Toggle label="Trastornos visuales" name="peligro_trastornos_visuales" {...p} />
            <Toggle label="Fiebre" name="peligro_fiebre" {...p} />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <Inp label="Otro signo de peligro" name="peligro_otro" form={form} set={set} />
          </div>
        </div>

        {/* TABS */}
        <div className="content-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`content-tab ${tab === t.id ? "is-active" : ""}`}>
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB: GENERAL ── */}
        {tab === "general" && (
          <div className="card">
            <div className="form-section">
              <div className="form-section-header">Examen Físico</div>
              <div className="form-section-body col-4">
                <Inp label="P/A Sistólica" name="pa_sistolica" type="number" form={form} set={set} />
                <Inp label="P/A Diastólica" name="pa_diastolica" type="number" form={form} set={set} />
                <Inp label="FC (x min)" name="frecuencia_cardiaca" type="number" form={form} set={set} />
                <Inp label="FR (x min)" name="frecuencia_respiratoria" type="number" form={form} set={set} />
                <Inp label="Temperatura (°C)" name="temperatura" type="number" form={form} set={set} />
                <Inp label="Perímetro braquial (cm)" name="perimetro_braquial_cm" type="number" form={form} set={set} />
                <Field label="Peso (kg)">
                  <input className="input-field" type="number" value={form.peso_kg ?? ""}
                    onChange={(e) => handlePeso(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Talla (cm)">
                  <input className="input-field" type="number" value={form.talla_cm ?? ""}
                    onChange={(e) => handleTalla(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Inp label="IMC" name="imc" type="number" form={form} set={set} />
              </div>
              <div style={{ display: "flex", gap: "0.6rem", padding: "0 1rem 1rem", flexWrap: "wrap" }}>
                <Toggle label="Examen bucodental (Si)" name="examen_bucodental" {...p} />
                <Toggle label="Examen de mamas (Si)" name="examen_mamas" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Examen Obstétrico</div>
              <div className="form-section-body col-4">
                <Inp label="Altura uterina (cm)" name="altura_uterina_cm" type="number" form={form} set={set} />
                <Inp label="FCF (lpm)" name="fcf" type="number" form={form} set={set} />
                <Inp label="Situación fetal" name="situacion_fetal" form={form} set={set} />
                <Inp label="Presentación fetal" name="presentacion_fetal" form={form} set={set} />
              </div>
              <div style={{ padding: "0 1rem 1rem" }}>
                <Toggle label="Movimientos fetales" name="movimientos_fetales" {...p} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Examen Ginecológico</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.5rem", padding: "0.75rem 1rem" }}>
                <Toggle label="Sangre o manchado" name="sangre_manchado" {...p} />
                <Toggle label="Verrugas/Herpes/Papilomas/Úlceras" name="verrugas_herpes_papilomas" {...p} />
                <Toggle label="Flujo vaginal" name="flujo_vaginal" {...p} />
              </div>
              <div style={{ padding: "0 1rem 1rem" }}>
                <Inp label="Otros hallazgos ginecológicos" name="otros_ginecologico" form={form} set={set} />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Impresión Clínica / Tratamiento</div>
              <div className="form-section-body col-2">
                <Field label="Impresión clínica" col={2}>
                  <textarea className="input-field" rows={2} value={form.impresion_clinica}
                    onChange={(e) => set("impresion_clinica", e.target.value)} />
                </Field>
                <Field label="Tratamiento" col={2}>
                  <textarea className="input-field" rows={2} value={form.tratamiento}
                    onChange={(e) => set("tratamiento", e.target.value)} />
                </Field>
                <Inp label="Cita siguiente" name="cita_siguiente" type="date" form={form} set={set} />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: LABORATORIOS ── */}
        {tab === "laboratorio" && (
          <div className="card">
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Marque los exámenes realizados en este control e ingrese el resultado.
            </p>

            <LabRow label="Hematología" realizadoKey="hematologia_realizada" resultadoKey="hematologia_resultado" {...p} />
            <LabRow label="Glicemia en ayunas" realizadoKey="glicemia_realizada" resultadoKey="glicemia_resultado" {...p} />
            <LabRow label="Grupo y RH" realizadoKey="grupo_rh_realizado" resultadoKey="grupo_rh_resultado" {...p} />

            {/* Orina — con bacteriuria y proteinuria */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="Orina" name="orina_realizada" {...p} />
              {form.orina_realizada && (
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <Toggle label="Bacteriuria +" name="orina_bacteriuria" {...p} />
                  <Toggle label="Proteinuria +" name="orina_proteinuria" {...p} />
                </div>
              )}
            </div>

            <LabRow label="Heces" realizadoKey="heces_realizada" resultadoKey="heces_resultado" {...p} />

            {/* VIH */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="VIH" name="vih_realizado" {...p} />
              {form.vih_realizado && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <Field label="Resultado">
                    <select className="input-field" style={{ minWidth: 130 }} value={form.vih_resultado}
                      onChange={(e) => set("vih_resultado", e.target.value)}>
                      <option value="">—</option>
                      <option value="positivo">Positivo (+)</option>
                      <option value="negativo">Negativo (−)</option>
                      <option value="no_aplica">No aplica</option>
                    </select>
                  </Field>
                  <Field label="Valor/Detalle">
                    <input className="input-field" value={form.vih_resultado_valor}
                      onChange={(e) => set("vih_resultado_valor", e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            {/* VDRL/RPR */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="VDRL / RPR" name="vdrl_realizado" {...p} />
              {form.vdrl_realizado && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Resultado">
                    <select className="input-field" style={{ minWidth: 130 }} value={form.vdrl_resultado}
                      onChange={(e) => set("vdrl_resultado", e.target.value)}>
                      <option value="">—</option>
                      <option value="positivo">Positivo (+)</option>
                      <option value="negativo">Negativo (−)</option>
                    </select>
                  </Field>
                  {form.vdrl_resultado === "positivo" && (
                    <Toggle label="Indicar tratamiento (pareja)" name="vdrl_tratamiento_indicado" {...p} />
                  )}
                </div>
              )}
            </div>

            {/* TORCH */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="TORCH" name="torch_realizado" {...p} />
              {form.torch_realizado && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <Toggle label="Resultado positivo (+)" name="torch_resultado_positivo" {...p} />
                  <Field label="Valor/Detalle">
                    <input className="input-field" value={form.torch_resultado_valor}
                      onChange={(e) => set("torch_resultado_valor", e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            {/* Papanicolau / IVAA */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="Papanicolau / IVAA" name="papanicolau_ivaa_realizado" {...p} />
              {form.papanicolau_ivaa_realizado && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <Field label="Fecha toma de muestra">
                    <input className="input-field" type="date" value={form.papanicolau_ivaa_fecha_toma}
                      onChange={(e) => set("papanicolau_ivaa_fecha_toma", e.target.value)} />
                  </Field>
                  <Field label="Resultado">
                    <input className="input-field" value={form.papanicolau_ivaa_resultado}
                      onChange={(e) => set("papanicolau_ivaa_resultado", e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <LabRow label="Hepatitis B" realizadoKey="hepatitis_b_realizado" resultadoKey="hepatitis_b_resultado" {...p} />

            {/* USG */}
            <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
              <Toggle label="USG (Ultrasonido)" name="usg_realizado" {...p} />
              {form.usg_realizado && (
                <div style={{ marginTop: "0.5rem" }}>
                  <Field label="Hallazgos de USG">
                    <textarea className="input-field" rows={2} value={form.usg_hallazgos}
                      onChange={(e) => set("usg_hallazgos", e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <div style={{ marginTop: "1rem" }}>
              <Field label="Otros laboratorios">
                <textarea className="input-field" rows={2} value={form.otros_lab}
                  onChange={(e) => set("otros_lab", e.target.value)}
                  placeholder="Gota gruesa (malaria), Tamizaje Chagas, etc." />
              </Field>
            </div>
          </div>
        )}

        {/* ── TAB: SUPLEMENTACIÓN ── */}
        {tab === "suplementacion" && (
          <div className="card">
            <div className="form-section">
              <div className="form-section-header">Micronutrientes</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", padding: "1rem" }}>
                <div>
                  <Toggle label="Sulfato Ferroso" name="sulfato_ferroso" {...p} />
                  {form.sulfato_ferroso && (
                    <div style={{ marginTop: "0.6rem" }}>
                      <Inp label="No. de tabletas" name="sulfato_ferroso_tabletas" type="number" form={form} set={set} />
                    </div>
                  )}
                </div>
                <div>
                  <Toggle label="Ácido Fólico" name="acido_folico" {...p} />
                  {form.acido_folico && (
                    <div style={{ marginTop: "0.6rem" }}>
                      <Inp label="No. de tabletas" name="acido_folico_tabletas" type="number" form={form} set={set} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">Hallazgos y Tratamiento</div>
              <div className="form-section-body col-2">
                <Field label="Hallazgos" col={2}>
                  <textarea className="input-field" rows={2} value={form.suplementacion_hallazgos}
                    onChange={(e) => set("suplementacion_hallazgos", e.target.value)} />
                </Field>
                <Field label="Tratamiento" col={2}>
                  <textarea className="input-field" rows={2} value={form.suplementacion_tratamiento}
                    onChange={(e) => set("suplementacion_tratamiento", e.target.value)} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: ORIENTACIONES ── */}
        {tab === "orientaciones" && (
          <div className="card">
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
              Marque los temas de orientación brindados en esta atención.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: "0.6rem" }}>
              <Toggle label="Plan de emergencia del parto, familiar y comunitario" name="orient_plan_emergencia_parto" {...p} />
              <Toggle label="Alimentación durante el embarazo" name="orient_alimentacion_embarazo" {...p} />
              <Toggle label="Señales de peligro" name="orient_senales_peligro" {...p} />
              <Toggle label="Lactancia materna" name="orient_lactancia_materna" {...p} />
              <Toggle label="Planificación familiar" name="orient_planificacion_familiar" {...p} />
              <Toggle label="Importancia de atención del postparto" name="orient_importancia_postparto" {...p} />
              <Toggle label="Vacunación y cuidados del niño/a" name="orient_vacunacion_nino" {...p} />
              <Toggle label="Pre y post prueba de VIH" name="orient_pre_post_prueba_vih" {...p} />
              <Toggle label="Importancia del No. de atenciones prenatales" name="orient_importancia_atenciones" {...p} />
              <Toggle label="Importancia de tratamiento de ITS a cónyuge/pareja" name="orient_tratamiento_its_pareja" {...p} />
            </div>
            <div style={{ marginTop: "1rem" }}>
              <Field label="Otras orientaciones">
                <input className="input-field" value={form.orient_otros}
                  onChange={(e) => set("orient_otros", e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {/* BOTONES */}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Save size={15} />
            {loading ? "Guardando..." : editando ? "Guardar cambios" : "Guardar control"}
          </button>
        </div>

      </form>
      )}
    </div>
  );
}
