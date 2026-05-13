import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Save } from "lucide-react";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getGuatemalaDateInputValue } from "../utils/guatemalaTime";
import { calculateGestationalWeeks } from "../utils/gestationalAge";

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label className="input-label">{label}</label>
      {children}
    </div>
  );
}

function Input({ label, name, form, set, type = "text", placeholder = "", ...rest }) {
  return (
    <Field label={label}>
      <input
        className="input-field"
        type={type}
        placeholder={placeholder}
        value={form[name] ?? ""}
        onChange={(e) =>
          set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        {...rest}
      />
    </Field>
  );
}

function Select({ label, name, form, set, options }) {
  return (
    <Field label={label}>
      <select className="input-field" value={form[name] ?? ""} onChange={(e) => set(name, e.target.value)}>
        <option value="">Seleccionar...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
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
        display: "flex",
        alignItems: "center",
        gap: "0.55rem",
        cursor: "pointer",
        padding: "0.45rem 0.65rem",
        borderRadius: 8,
        background: val ? "var(--primary-lt)" : "var(--surface2)",
        border: `1.5px solid ${val ? "var(--primary)" : "var(--border)"}`,
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          flexShrink: 0,
          background: val ? "var(--primary)" : "var(--border)",
          display: "grid",
          placeItems: "center",
        }}
      >
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
  no_registro: "",
  servicio_salud: "",
  lugar_residencia: "",
  fecha: getGuatemalaDateInputValue(),
  nombre_conyuge: "",
  telefono: "",
  fecha_nacimiento: "",
  estado_civil: "",
  pueblo: "",
  escolaridad: "",
  con_quien_vive: "",
  idioma: "",
  ha_tenido_atencion_prenatal: false,
  no_embarazos: "",
  no_partos: "",
  no_abortos: "",
  no_hijos_vivos: "",
  no_hijos_muertos: "",
  fur: "",
  fecha_probable_parto: "",
  no_cesareas: "",
  fecha_ultima_cesarea: "",
  edad_gestacional_semanas: "",
  edad_gestacional_au: "",
  parto_anterior_hospital: false,
  parto_anterior_caimi: false,
  parto_anterior_cap: false,
  parto_anterior_comadrona: false,
  parto_anterior_clinica_privada: false,
  parto_anterior_otro: "",
  peligro_dolor_cabeza: false,
  peligro_vision_borrosa: false,
  peligro_embarazo_multiple: false,
  peligro_hemorragia_vaginal: false,
  peligro_edema_mi: false,
  peligro_nino_transverso: false,
  peligro_dolor_estomago: false,
  peligro_salida_liquidos: false,
  peligro_convulsiones: false,
  peligro_fiebre: false,
  peligro_ausencia_mov_fetales: false,
  peligro_placenta_no_salia: false,
  posicion_parto: "",
  posicion_parto_otro: "",
  lugar_atencion_parto: "",
  lugar_atencion_parto_otro: "",
  horas_distancia: "",
  kms_servicio: "",
  casa_materna_cercana: false,
  usara_casa_materna: false,
  como_trasladara: "",
  acompana_traslado: "",
  acompana_parto: "",
  bebida_durante_parto: "",
  bebida_despues_parto: "",
  ropa_nino: false,
  ropa_madre: false,
  otros_articulos: "",
  lleva_dpi_madre: false,
  lleva_dpi_conyuge: false,
  lleva_partida_nacimiento: false,
  cuenta_ahorro: false,
  comunicado_comite: false,
  con_quien_hijos: "",
  quien_cuida_casa: "",
  telefono_vehiculo: "",
  responsable_activar: "",
  nombre_activara_plan: "",
  nombre_proveedor_salud: "",
};

function toDateInput(value) {
  return value ? String(value).split("T")[0] : "";
}

function defaultsDesdeExpediente(exp) {
  const p = exp?.paciente || {};
  const e = exp?.embarazo_activo || {};
  const r = exp?.ficha_riesgo || {};
  const controles = exp?.controles_prenatales || [];
  const ultimoControl = controles.at(-1) || {};

  return {
    fecha: getGuatemalaDateInputValue(),
    no_registro: p.cui || "",
    servicio_salud: p.nombre_establecimiento || "CAP El Chal",
    lugar_residencia: p.comunidad || p.domicilio || "",
    nombre_conyuge: r.nombre_esposo_conviviente || p.nombre_esposo_conviviente || "",
    telefono: r.telefono || p.telefono || "",
    fecha_nacimiento: toDateInput(p.fecha_nacimiento),
    estado_civil: r.estado_civil || p.estado_civil || "",
    pueblo: r.pueblo || p.pueblo || "",
    escolaridad: r.escolaridad || p.nivel_estudios || "",
    con_quien_vive: p.nombre_esposo_conviviente ? "esposo" : p.vive_sola ? "sola" : "",
    idioma: p.comunidad_linguistica || "",
    ha_tenido_atencion_prenatal: controles.length > 0,
    no_embarazos: r.no_embarazos ?? p.gestas_previas ?? "",
    no_partos: r.no_partos ?? p.partos_vaginales ?? "",
    no_abortos: r.no_abortos ?? p.abortos ?? "",
    no_hijos_vivos: r.no_hijos_vivos ?? p.hijos_viven ?? p.nacidos_vivos ?? "",
    no_hijos_muertos: r.no_hijos_muertos ?? ((Number(p.nacidos_muertos || 0) + Number(p.muertos_antes_1sem || 0) + Number(p.muertos_despues_1sem || 0)) || ""),
    fur: toDateInput(r.fecha_ultima_regla || e.fur || p.fur),
    fecha_probable_parto: toDateInput(r.fecha_probable_parto || e.fpp || p.fpp),
    no_cesareas: r.no_cesareas ?? p.cesareas ?? "",
    fecha_ultima_cesarea: toDateInput(p.fin_embarazo_anterior),
    edad_gestacional_semanas: r.edad_embarazo_semanas ?? ultimoControl.edad_gestacional_semanas ?? "",
    edad_gestacional_au: ultimoControl.edad_gestacional_semanas ?? "",
    parto_anterior_hospital: false,
    parto_anterior_caimi: false,
    parto_anterior_cap: false,
    parto_anterior_clinica_privada: false,
    peligro_dolor_cabeza: Boolean(ultimoControl.peligro_dolor_cabeza),
    peligro_vision_borrosa: Boolean(ultimoControl.peligro_trastornos_visuales),
    peligro_embarazo_multiple: Boolean(r.embarazo_multiple || p.antec_gemelares),
    peligro_hemorragia_vaginal: Boolean(ultimoControl.peligro_hemorragia_vaginal || r.hemorragia_vaginal),
    peligro_edema_mi: Boolean(ultimoControl.peligro_hipertension),
    peligro_nino_transverso: false,
    peligro_dolor_estomago: Boolean(ultimoControl.peligro_dolor_epigastrico || r.dolor_abdominal),
    peligro_salida_liquidos: false,
    peligro_convulsiones: Boolean(p.antec_eclampsia),
    peligro_fiebre: Boolean(ultimoControl.peligro_fiebre),
    peligro_ausencia_mov_fetales: ultimoControl.movimientos_fetales === false,
    peligro_placenta_no_salia: false,
    posicion_parto: ultimoControl.situacion_fetal || "",
    posicion_parto_otro: "",
    lugar_atencion_parto: p.viene_referida ? "cap" : "",
    lugar_atencion_parto_otro: "",
    horas_distancia: r.tiempo_horas ?? "",
    kms_servicio: r.distancia_servicio_km ?? "",
    casa_materna_cercana: false,
    usara_casa_materna: false,
    como_trasladara: "",
    acompana_traslado: p.nombre_esposo_conviviente ? "conyuge" : "",
    acompana_parto: p.nombre_esposo_conviviente ? "esposo" : "",
    bebida_durante_parto: "",
    bebida_despues_parto: "",
    ropa_nino: false,
    ropa_madre: false,
    otros_articulos: "",
    lleva_dpi_madre: Boolean(p.cui),
    lleva_dpi_conyuge: false,
    lleva_partida_nacimiento: false,
    cuenta_ahorro: false,
    comunicado_comite: false,
    con_quien_hijos: "",
    quien_cuida_casa: "",
    telefono_vehiculo: "",
    responsable_activar: "",
    nombre_activara_plan: "",
    nombre_proveedor_salud: ultimoControl.nombre_cargo_atiende || r.nombre_personal_atendio || "",
  };
}

function normalizePayload(form) {
  const out = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === "boolean") {
      out[key] = value;
    } else if (value === "") {
      out[key] = "";
    } else {
      out[key] = value;
    }
  }
  return out;
}

const viveOptions = [
  { value: "esposo", label: "Esposo" },
  { value: "sola", label: "Sola" },
  { value: "familia", label: "Familia" },
  { value: "amigo", label: "Amigo/a" },
];

const posicionOptions = [
  { value: "semi_reclinada", label: "Semi-reclinada" },
  { value: "acostada", label: "Acostada" },
  { value: "cuclillas", label: "En cuclillas" },
  { value: "rodillas", label: "De rodillas" },
  { value: "de_pie", label: "De pie" },
  { value: "otro", label: "Otro" },
];

const lugarOptions = [
  { value: "cap", label: "CAP" },
  { value: "caimi", label: "CAIMI" },
  { value: "hospital", label: "Hospital" },
  { value: "clinica", label: "Clinica privada" },
  { value: "otro", label: "Otro" },
];

const trasladoOptions = [
  { value: "vehiculo_familiar", label: "Vehiculo familiar" },
  { value: "ambulancia", label: "Ambulancia" },
  { value: "bomberos", label: "Bomberos" },
  { value: "otro", label: "Otro" },
];

const acompanaTrasladoOptions = [
  { value: "conyuge", label: "Conyuge" },
  { value: "hermano", label: "Hermano/a" },
  { value: "madre_padre", label: "Madre/Padre" },
  { value: "suegra", label: "Suegra" },
  { value: "vecina", label: "Vecina" },
];

const acompanaPartoOptions = [
  { value: "esposo", label: "Esposo" },
  { value: "comadrona", label: "Comadrona" },
  { value: "familiar", label: "Familiar" },
];

const cuidadoHijosOptions = [
  { value: "hijos_mayores", label: "Hijos mayores" },
  { value: "parientes", label: "Parientes" },
  { value: "vecinos", label: "Vecinos" },
  { value: "otros", label: "Otros" },
];

const cuidadoCasaOptions = [
  { value: "parientes", label: "Parientes" },
  { value: "vecinos", label: "Vecinos" },
  { value: "otros", label: "Otros" },
];

const responsableOptions = [
  { value: "conyuge", label: "Conyuge" },
  { value: "hermano", label: "Hermano/a" },
  { value: "madre_padre", label: "Madre/Padre" },
  { value: "vecina", label: "Vecina" },
  { value: "suegra", label: "Suegra/o" },
  { value: "comadrona", label: "Comadrona" },
  { value: "otro_familiar", label: "Otro familiar" },
];

const hasOptionValue = (options, value) => options.some((option) => option.value === value);

export default function PlanPartoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [paciente, setPaciente] = useState(null);
  const [existingPlan, setExistingPlan] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const p = { form, set };

  useEffect(() => {
    api
      .get(`/pacientes/${id}/expediente`)
      .then(({ data }) => {
        setPaciente(data?.paciente || null);
        if (data?.plan_parto) {
          const posicionParto = data.plan_parto.posicion_parto || "";
          const lugarAtencionParto = data.plan_parto.lugar_atencion_parto || "";
          setExistingPlan(true);
          setForm((f) => ({
            ...f,
            ...data.plan_parto,
            posicion_parto: posicionParto && !hasOptionValue(posicionOptions, posicionParto) ? "otro" : posicionParto,
            posicion_parto_otro: posicionParto && !hasOptionValue(posicionOptions, posicionParto) ? posicionParto : "",
            lugar_atencion_parto: lugarAtencionParto && !hasOptionValue(lugarOptions, lugarAtencionParto) ? "otro" : lugarAtencionParto,
            lugar_atencion_parto_otro: lugarAtencionParto && !hasOptionValue(lugarOptions, lugarAtencionParto) ? lugarAtencionParto : "",
            no_registro: data.plan_parto.no_registro || data?.paciente?.cui || "",
            fecha: toDateInput(data.plan_parto.fecha) || f.fecha,
            fecha_nacimiento: toDateInput(data.plan_parto.fecha_nacimiento),
            fur: toDateInput(data.plan_parto.fur),
            fecha_probable_parto: toDateInput(data.plan_parto.fecha_probable_parto),
            fecha_ultima_cesarea: toDateInput(data.plan_parto.fecha_ultima_cesarea),
          }));
          return;
        }
        setForm((f) => ({ ...f, ...defaultsDesdeExpediente(data) }));
      })
      .catch(() => toast("Error al cargar datos para plan de parto", "error"))
      .finally(() => setLoadingData(false));
  }, [id, toast]);

  const edadGestacionalSemanas = calculateGestationalWeeks(form.fur, form.fecha);
  const formConEdadGestacional = {
    ...form,
    edad_gestacional_semanas: edadGestacionalSemanas,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      ...form,
      edad_gestacional_semanas: edadGestacionalSemanas,
      posicion_parto: form.posicion_parto === "otro" ? form.posicion_parto_otro || "otro" : form.posicion_parto,
      lugar_atencion_parto: form.lugar_atencion_parto === "otro" ? form.lugar_atencion_parto_otro || "otro" : form.lugar_atencion_parto,
    };
    try {
      await api.post(
        `/pacientes/${id}/controles/plan-parto`,
        normalizePayload(payload)
      );
      toast(existingPlan ? "Plan de parto actualizado" : "Plan de parto guardado", "success");
      setTimeout(() => navigate(`/pacientes/${id}`), 600);
    } catch (err) {
      toast(err.response?.data?.error || "Error al guardar plan de parto", "error");
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
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Plan de Parto</h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 2 }}>
            Formulario con datos prellenados desde expediente y embarazo activo
          </p>
        </div>
      </div>

      {paciente && (
        <div className="card" style={{ marginBottom: "1rem", padding: "0.9rem 1rem" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            {existingPlan ? "Editando plan de" : "Agregando plan a"}
          </span>
          <div style={{ marginTop: 3, fontSize: "1rem", fontWeight: 800, color: "var(--text)" }}>
            {paciente.nombres} {paciente.apellidos}
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          Cargando datos para plan de parto...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card">
          <div className="form-section">
            <div className="form-section-header">Datos generales</div>
            <div className="form-section-body col-4">
              <Input label="CUI (No. de registro)" name="no_registro" form={form} set={set} />
              <Input label="Servicio de salud" name="servicio_salud" form={form} set={set} />
              <Input label="Fecha" name="fecha" type="date" form={form} set={set} />
              <Input label="Lugar de residencia" name="lugar_residencia" form={form} set={set} />
              <Input label="Nombre cónyuge / conviviente" name="nombre_conyuge" form={form} set={set} />
              <Input label="Teléfono" name="telefono" form={form} set={set} />
              <Input label="Fecha de nacimiento" name="fecha_nacimiento" type="date" form={form} set={set} />
              <Input label="Estado civil" name="estado_civil" form={form} set={set} />
              <Input label="Pueblo" name="pueblo" form={form} set={set} />
              <Input label="Escolaridad" name="escolaridad" form={form} set={set} />
              <Select label="Con quién vive" name="con_quien_vive" form={form} set={set} options={viveOptions} />
              <Input label="Idioma" name="idioma" form={form} set={set} />
            </div>
          </div>

          <Section title="Antecedentes del embarazo">
            <Toggle label="Ha tenido atención prenatal" name="ha_tenido_atencion_prenatal" {...p} />
            <Input label="No. embarazos" name="no_embarazos" type="number" form={form} set={set} />
            <Input label="No. partos" name="no_partos" type="number" form={form} set={set} />
            <Input label="No. abortos" name="no_abortos" type="number" form={form} set={set} />
            <Input label="No. hijos vivos" name="no_hijos_vivos" type="number" form={form} set={set} />
            <Input label="No. hijos muertos" name="no_hijos_muertos" type="number" form={form} set={set} />
            <Input label="FUR" name="fur" type="date" form={form} set={set} />
            <Input label="FPP" name="fecha_probable_parto" type="date" form={form} set={set} />
            <Input label="No. cesáreas" name="no_cesareas" type="number" form={form} set={set} />
            <Input label="Fecha última cesárea" name="fecha_ultima_cesarea" type="date" form={form} set={set} />
            <Input label="Edad gestacional por UR" name="edad_gestacional_semanas" type="number" form={formConEdadGestacional} set={set} readOnly />
            <Input label="Edad gestacional por AU" name="edad_gestacional_au" type="number" form={form} set={set} />
          </Section>

          <Section title="Lugar de partos anteriores">
            <Toggle label="Hospital" name="parto_anterior_hospital" {...p} />
            <Toggle label="CAIMI" name="parto_anterior_caimi" {...p} />
            <Toggle label="Comadrona" name="parto_anterior_comadrona" {...p} />
            <Toggle label="Clínica privada" name="parto_anterior_clinica_privada" {...p} />
            <Input label="Otro" name="parto_anterior_otro" form={form} set={set} />
          </Section>

          <Section title="Signos de peligro reconocidos">
            <Toggle label="Dolor de cabeza" name="peligro_dolor_cabeza" {...p} />
            <Toggle label="Visión borrosa" name="peligro_vision_borrosa" {...p} />
            <Toggle label="Embarazo múltiple" name="peligro_embarazo_multiple" {...p} />
            <Toggle label="Hemorragia vaginal" name="peligro_hemorragia_vaginal" {...p} />
            <Toggle label="Edema en miembros inferiores" name="peligro_edema_mi" {...p} />
            <Toggle label="Niño transverso" name="peligro_nino_transverso" {...p} />
            <Toggle label="Dolor de estómago" name="peligro_dolor_estomago" {...p} />
            <Toggle label="Salida de líquidos" name="peligro_salida_liquidos" {...p} />
            <Toggle label="Convulsiones" name="peligro_convulsiones" {...p} />
            <Toggle label="Fiebre" name="peligro_fiebre" {...p} />
            <Toggle label="Ausencia de movimientos fetales" name="peligro_ausencia_mov_fetales" {...p} />
            <Toggle label="Placenta no salió" name="peligro_placenta_no_salia" {...p} />
          </Section>

          <div className="form-section">
            <div className="form-section-header">Logística para el parto</div>
            <div className="form-section-body col-4">
              <Select label="Posición para la atención del parto" name="posicion_parto" form={form} set={set} options={posicionOptions} />
              {form.posicion_parto === "otro" && (
                <Input label="Especifique otra posicion" name="posicion_parto_otro" form={form} set={set} />
              )}
              <Select label="Lugar de atención del parto" name="lugar_atencion_parto" form={form} set={set} options={lugarOptions} />
              {form.lugar_atencion_parto === "otro" && (
                <Input label="Especifique otro lugar" name="lugar_atencion_parto_otro" form={form} set={set} />
              )}
              <Input label="Horas de distancia" name="horas_distancia" type="number" form={form} set={set} />
              <Input label="Kilometros al servicio" name="kms_servicio" type="number" form={form} set={set} />
              <Select label="Como se trasladara" name="como_trasladara" form={form} set={set} options={trasladoOptions} />
              <Select label="Quien acompanara el traslado" name="acompana_traslado" form={form} set={set} options={acompanaTrasladoOptions} />
              <Select label="Quien acompanara durante el parto" name="acompana_parto" form={form} set={set} options={acompanaPartoOptions} />
              <Input label="Bebida durante el parto" name="bebida_durante_parto" form={form} set={set} />
              <Input label="Bebida despues del parto" name="bebida_despues_parto" form={form} set={set} />
              <Select label="Con quien quedaran los hijos" name="con_quien_hijos" form={form} set={set} options={cuidadoHijosOptions} />
              <Select label="Quien cuidara la casa" name="quien_cuida_casa" form={form} set={set} options={cuidadoCasaOptions} />
              <Input label="Telefono del vehiculo" name="telefono_vehiculo" form={form} set={set} />
              <Input label="Nombre proveedor de salud" name="nombre_proveedor_salud" form={form} set={set} />
            </div>
          </div>

          <Section title="Apoyos y artículos preparados">
            <Toggle label="Casa materna cercana" name="casa_materna_cercana" {...p} />
            <Toggle label="Usará casa materna" name="usara_casa_materna" {...p} />
            <Toggle label="Ropa para niño" name="ropa_nino" {...p} />
            <Toggle label="Ropa para madre" name="ropa_madre" {...p} />
            <Toggle label="Lleva DPI de la madre" name="lleva_dpi_madre" {...p} />
            <Toggle label="Lleva DPI del cónyuge" name="lleva_dpi_conyuge" {...p} />
            <Toggle label="Lleva partida de nacimiento de la madre si es menor" name="lleva_partida_nacimiento" {...p} />
            <Toggle label="Cuenta con ahorro" name="cuenta_ahorro" {...p} />
            <Toggle label="Comunicó al comité de emergencia" name="comunicado_comite" {...p} />
            <Input label="Otros artículos" name="otros_articulos" form={form} set={set} />
          </Section>

          <div className="form-section">
            <div className="form-section-header">Responsables del plan</div>
            <div className="form-section-body col-3">
              <Select label="Responsable de activar" name="responsable_activar" form={form} set={set} options={responsableOptions} />
              <Input label="Nombre quien activará el plan" name="nombre_activara_plan" form={form} set={set} />
              <Input label="Nombre proveedor de salud" name="nombre_proveedor_salud" form={form} set={set} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.8rem", marginTop: "1.25rem" }}>
            <button type="button" className="btn-secondary" onClick={() => navigate(`/pacientes/${id}`)}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={loading}>
              <Save size={15} /> {loading ? "Guardando..." : existingPlan ? "Guardar cambios" : "Guardar plan"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
