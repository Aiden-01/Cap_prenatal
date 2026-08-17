import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Baby,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  Hospital,
  MapPinned,
  PackageCheck,
  Route,
  Save,
  UsersRound,
} from "lucide-react";
import api from "../api/axios";
import {
  ClinicalActionBar,
  ClinicalLoadingSkeleton,
  ClinicalNotice,
  ClinicalSection,
  ClinicalWorkflowShell,
} from "../components/clinical/ClinicalWorkflow";
import { useGlobalToast } from "../context/ToastContext";
import { getGuatemalaDateInputValue } from "../utils/guatemalaTime";
import { calculateGestationalWeeks } from "../utils/gestationalAge";
import { useFieldErrors } from "../hooks/useFieldErrors";
import "./clinical-secondary-workflows.css";

const FormErrorContext = createContext({
  fieldError: () => "",
  inputClass: () => "input-field",
});

function useFormErrorUi() {
  return useContext(FormErrorContext);
}

function Field({ label, children, name, inputId, hint }) {
  const { fieldError } = useFormErrorUi();
  const error = name ? fieldError(name) : "";
  return (
    <div className="form-group">
      <label className="input-label" htmlFor={inputId}>{label}</label>
      {children}
      {hint && <div id={`${inputId}-hint`} className="secondary-field-hint">{hint}</div>}
      {error && <div id={`${inputId}-error`} className="field-error-text" role="alert">{error}</div>}
    </div>
  );
}

function blurNumberInputOnWheel(event) {
  event.currentTarget.blur();
}

function Input({ label, name, form, set, type = "text", placeholder = "", hint, ...rest }) {
  const { fieldError, inputClass } = useFormErrorUi();
  const inputId = `birth-plan-${name}`;
  const error = fieldError(name);
  const describedBy = [hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <Field label={label} name={name} inputId={inputId} hint={hint}>
      <input
        id={inputId}
        className={inputClass(name)}
        name={name}
        type={type}
        placeholder={placeholder}
        value={form[name] ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onWheel={type === "number" ? blurNumberInputOnWheel : undefined}
        onChange={(e) =>
          set(name, type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        {...rest}
      />
    </Field>
  );
}

function Select({ label, name, form, set, options }) {
  const { fieldError, inputClass } = useFormErrorUi();
  const inputId = `birth-plan-${name}`;
  const error = fieldError(name);
  return (
    <Field label={label} name={name} inputId={inputId}>
      <select
        id={inputId}
        className={inputClass(name)}
        name={name}
        value={form[name] ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => set(name, e.target.value)}
      >
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
    <button
      type="button"
      aria-pressed={val}
      onClick={() => set(name, !val)}
      className={`toggle-control ${val ? "is-on" : ""}`}
    >
      <span className="toggle-mark" aria-hidden="true">{val && "✓"}</span>
      <span className="toggle-label">{label}</span>
    </button>
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
  const nombreConyuge = r.nombre_esposo_conviviente || p.nombre_esposo_conviviente || "";

  return {
    fecha: getGuatemalaDateInputValue(),
    no_registro: p.cui || "",
    servicio_salud: p.nombre_establecimiento || "CAP El Chal",
    lugar_residencia: p.comunidad || p.domicilio || "",
    nombre_conyuge: nombreConyuge,
    telefono: r.telefono || p.telefono || "",
    fecha_nacimiento: toDateInput(p.fecha_nacimiento),
    estado_civil: r.estado_civil || p.estado_civil || "",
    pueblo: r.pueblo || p.pueblo || "",
    escolaridad: r.escolaridad || p.nivel_estudios || "",
    con_quien_vive: nombreConyuge ? "esposo" : p.vive_sola ? "sola" : "",
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
    parto_anterior_clinica_privada: false,
    peligro_dolor_cabeza: Boolean(ultimoControl.peligro_dolor_cabeza),
    peligro_vision_borrosa: Boolean(ultimoControl.peligro_trastornos_visuales),
    peligro_embarazo_multiple: false,
    peligro_hemorragia_vaginal: Boolean(ultimoControl.peligro_hemorragia_vaginal || r.hemorragia_vaginal),
    peligro_edema_mi: Boolean(ultimoControl.peligro_hipertension),
    peligro_nino_transverso: false,
    peligro_dolor_estomago: Boolean(ultimoControl.peligro_dolor_epigastrico || r.dolor_abdominal),
    peligro_salida_liquidos: false,
    peligro_convulsiones: Boolean(p.antec_eclampsia),
    peligro_fiebre: Boolean(ultimoControl.peligro_fiebre),
    peligro_ausencia_mov_fetales: ultimoControl.movimientos_fetales === false,
    peligro_placenta_no_salia: false,
    posicion_parto: "",
    posicion_parto_otro: "",
    lugar_atencion_parto: "",
    lugar_atencion_parto_otro: "",
    horas_distancia: r.tiempo_horas ?? "",
    kms_servicio: r.distancia_servicio_km ?? "",
    casa_materna_cercana: false,
    usara_casa_materna: false,
    como_trasladara: "",
    acompana_traslado: nombreConyuge ? "conyuge" : "",
    acompana_parto: nombreConyuge ? "esposo" : "",
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
    responsable_activar: nombreConyuge ? "conyuge" : "",
    nombre_activara_plan: nombreConyuge,
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

const FIELD_LABELS = {
  fecha: "Fecha",
  fecha_nacimiento: "Fecha de nacimiento",
  fur: "FUR",
  fecha_probable_parto: "FPP",
  fecha_ultima_cesarea: "Fecha ultima cesarea",
  no_embarazos: "No. embarazos",
  no_partos: "No. partos",
  no_abortos: "No. abortos",
  no_hijos_vivos: "No. hijos vivos",
  no_hijos_muertos: "No. hijos muertos",
  no_cesareas: "No. cesareas",
  edad_gestacional_semanas: "Edad gestacional por UR",
  edad_gestacional_au: "Edad gestacional por AU",
  horas_distancia: "Horas de distancia",
  kms_servicio: "Kilometros al servicio",
};

export default function PlanPartoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embarazoId = searchParams.get("embarazo_id") || "";
  const expedientePath = `/pacientes/${id}?embarazo_id=${embarazoId}&tab=plan`;
  const toast = useGlobalToast();
  const [form, setForm] = useState(INIT);
  const [paciente, setPaciente] = useState(null);
  const [existingPlan, setExistingPlan] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(false);
  const fieldErrors = useFieldErrors(FIELD_LABELS);

  const set = (k, v) => {
    setForm((current) => {
      const next = { ...current, [k]: v };
      if (k === "responsable_activar" && v === "conyuge" && current.nombre_conyuge) {
        next.nombre_activara_plan = current.nombre_conyuge;
      }
      if (
        k === "nombre_conyuge" &&
        current.responsable_activar === "conyuge" &&
        (!current.nombre_activara_plan || current.nombre_activara_plan === current.nombre_conyuge)
      ) {
        next.nombre_activara_plan = v;
      }
      return next;
    });
    fieldErrors.clearFieldError(k);
    if (k === "responsable_activar" || k === "nombre_conyuge") {
      fieldErrors.clearFieldError("nombre_activara_plan");
    }
  };
  const p = { form, set };
  const nombrePaciente = paciente ? `${paciente.nombres || ""} ${paciente.apellidos || ""}`.trim() : "";

  useEffect(() => {
    if (!embarazoId) {
      toast("Selecciona un embarazo antes de editar el plan de parto", "error");
      navigate(`/pacientes/${id}?tab=plan`, { replace: true });
      return;
    }
    api
      .get(`/pacientes/${id}/expediente`, { params: { embarazo_id: embarazoId } })
      .then(({ data }) => {
        if (data?.is_read_only) {
          toast("El embarazo esta cerrado y es de solo lectura", "error");
          navigate(expedientePath, { replace: true });
          return;
        }
        setPaciente(data?.paciente || null);
        if (data?.plan_parto) {
          const expedienteDefaults = defaultsDesdeExpediente(data);
          const posicionParto = data.plan_parto.posicion_parto || "";
          const lugarAtencionParto = data.plan_parto.lugar_atencion_parto || "";
          const nombreConyuge = data.plan_parto.nombre_conyuge || expedienteDefaults.nombre_conyuge || "";
          setExistingPlan(true);
          setForm((f) => ({
            ...f,
            ...data.plan_parto,
            posicion_parto: posicionParto && !hasOptionValue(posicionOptions, posicionParto) ? "otro" : posicionParto,
            posicion_parto_otro: posicionParto && !hasOptionValue(posicionOptions, posicionParto) ? posicionParto : "",
            lugar_atencion_parto: lugarAtencionParto && !hasOptionValue(lugarOptions, lugarAtencionParto) ? "otro" : lugarAtencionParto,
            lugar_atencion_parto_otro: lugarAtencionParto && !hasOptionValue(lugarOptions, lugarAtencionParto) ? lugarAtencionParto : "",
            no_registro: data.plan_parto.no_registro || data?.paciente?.cui || "",
            lugar_residencia: data.plan_parto.lugar_residencia || expedienteDefaults.lugar_residencia,
            nombre_conyuge: nombreConyuge,
            nombre_activara_plan:
              data.plan_parto.nombre_activara_plan ||
              (data.plan_parto.responsable_activar === "conyuge" ? nombreConyuge : ""),
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
  }, [id, embarazoId, expedientePath, navigate, toast]);

  const edadGestacionalSemanas = calculateGestationalWeeks(form.fur, form.fecha);
  const formConEdadGestacional = {
    ...form,
    edad_gestacional_semanas: edadGestacionalSemanas,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    fieldErrors.clearFieldErrors();
    const payload = {
      ...form,
      edad_gestacional_semanas: edadGestacionalSemanas,
      posicion_parto: form.posicion_parto === "otro" ? form.posicion_parto_otro || "otro" : form.posicion_parto,
      lugar_atencion_parto: form.lugar_atencion_parto === "otro" ? form.lugar_atencion_parto_otro || "otro" : form.lugar_atencion_parto,
    };
    try {
      await api.post(
        `/pacientes/${id}/controles/plan-parto`,
        normalizePayload(payload),
        { params: { embarazo_id: embarazoId } }
      );
      toast(existingPlan ? "Plan de parto actualizado" : "Plan de parto guardado", "success");
      setTimeout(() => navigate(expedientePath), 600);
    } catch (err) {
      toast(fieldErrors.setErrorsFromResponse(err, "Error al guardar plan de parto").message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClinicalWorkflowShell
      className="secondary-workflow birth-plan-workflow"
      onBack={() => navigate(expedientePath)}
      eyebrow="Preparación para el nacimiento"
      title="Plan de parto"
      description="Organiza el lugar, el traslado y las personas responsables sin limitar las respuestas del plan."
      patientName={nombrePaciente}
      recordNumber={paciente?.no_expediente}
      mode={existingPlan ? "edit" : "new"}
      icon={ClipboardCheck}
    >
      {loadingData ? (
        <ClinicalLoadingSkeleton label="Cargando plan de parto" />
      ) : (
        <form onSubmit={handleSubmit} className="secondary-workflow-form">
          <FormErrorContext.Provider value={fieldErrors}>
            {fieldErrors.summary.length > 0 && (
              <ClinicalNotice variant="error" title="Revisa estos datos" className="secondary-workflow-notice">
                {fieldErrors.summary.map((error) => `${error.label}: ${error.message}`).join(" · ")}
              </ClinicalNotice>
            )}

            <div className="secondary-context-summary" aria-label="Resumen del plan de parto">
              <div className="secondary-context-item">
                <span className="secondary-context-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                <div><span>Fecha del plan</span><strong>{form.fecha || "Por definir"}</strong></div>
              </div>
              <div className="secondary-context-item">
                <span className="secondary-context-icon" aria-hidden="true"><Baby size={16} /></span>
                <div><span>Edad gestacional</span><strong>{edadGestacionalSemanas === "" ? "Sin dato" : `${edadGestacionalSemanas} semanas`}</strong></div>
              </div>
              <div className="secondary-context-item">
                <span className="secondary-context-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                <div><span>FPP</span><strong>{form.fecha_probable_parto || "Sin dato"}</strong></div>
              </div>
              <div className="secondary-context-item">
                <span className="secondary-context-icon" aria-hidden="true"><MapPinned size={16} /></span>
                <div><span>Residencia</span><strong>{form.lugar_residencia || "Sin dato"}</strong></div>
              </div>
            </div>

            <section className="secondary-chapter" aria-labelledby="birth-plan-chapter-place">
              <header className="secondary-chapter-header">
                <span className="secondary-chapter-number" aria-hidden="true">01</span>
                <div>
                  <span className="secondary-chapter-kicker">Lugar y planificación</span>
                  <h2 id="birth-plan-chapter-place">Preparar dónde y cómo será la atención</h2>
                  <p>Datos generales, antecedentes y decisiones sobre el lugar del parto.</p>
                </div>
              </header>

              <ClinicalSection title="Información general" description="Identificación y contexto familiar ya disponible en el expediente." icon={ClipboardList}>
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
              </ClinicalSection>

              <ClinicalSection title="Antecedentes del embarazo" description="Información obstétrica utilizada para contextualizar el plan." icon={Baby}>
                <div className="plan-toggle-row">
                  <Toggle label="Ha tenido atención prenatal" name="ha_tenido_atencion_prenatal" {...p} />
                </div>
                <div className="form-section-body col-4">
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
                </div>
              </ClinicalSection>

              <ClinicalSection title="Lugar de partos anteriores" description="Marca los lugares que correspondan a la historia registrada." icon={Hospital}>
                <div className="plan-toggle-grid">
                  <Toggle label="Hospital" name="parto_anterior_hospital" {...p} />
                  <Toggle label="CAIMI" name="parto_anterior_caimi" {...p} />
                  <Toggle label="Comadrona" name="parto_anterior_comadrona" {...p} />
                  <Toggle label="Clínica privada" name="parto_anterior_clinica_privada" {...p} />
                </div>
                <div className="plan-section-followup">
                  <Input label="Otro" name="parto_anterior_otro" form={form} set={set} />
                </div>
              </ClinicalSection>

              <ClinicalSection title="Signos de peligro reconocidos" description="Marca los signos que la paciente reconoce para solicitar atención." icon={Baby} className="plan-danger-section">
                <div className="plan-toggle-grid plan-danger-toggle-grid">
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
                </div>
              </ClinicalSection>

              <ClinicalSection title="Preferencias para la atención" description="Lugar y posición previstos para el parto." icon={MapPinned}>
                <div className="form-section-body col-2">
                  <Select label="Posición para la atención del parto" name="posicion_parto" form={form} set={set} options={posicionOptions} />
                  {form.posicion_parto === "otro" && <Input label="Especifique otra posicion" name="posicion_parto_otro" form={form} set={set} />}
                  <Select label="Lugar de atención del parto" name="lugar_atencion_parto" form={form} set={set} options={lugarOptions} />
                  {form.lugar_atencion_parto === "otro" && <Input label="Especifique otro lugar" name="lugar_atencion_parto_otro" form={form} set={set} />}
                </div>
              </ClinicalSection>
            </section>

            <section className="secondary-chapter" aria-labelledby="birth-plan-chapter-route">
              <header className="secondary-chapter-header">
                <span className="secondary-chapter-number" aria-hidden="true">02</span>
                <div>
                  <span className="secondary-chapter-kicker">Distancia, transporte y logística</span>
                  <h2 id="birth-plan-chapter-route">Tener lista la ruta y lo necesario</h2>
                  <p>Tiempo de traslado, transporte disponible y artículos preparados.</p>
                </div>
              </header>

              <ClinicalSection title="Ruta y transporte" description="Información práctica para llegar al servicio previsto." icon={Route}>
                <div className="form-section-body col-3">
                  <Input
                    label="Horas de distancia"
                    name="horas_distancia"
                    type="number"
                    min="0"
                    max="72"
                    step="0.1"
                    inputMode="decimal"
                    hint="Puedes registrar fracciones de hora, por ejemplo 1.5."
                    form={form}
                    set={set}
                  />
                  <Input label="Kilometros al servicio" name="kms_servicio" type="number" form={form} set={set} />
                  <Select label="Como se trasladara" name="como_trasladara" form={form} set={set} options={trasladoOptions} />
                </div>
              </ClinicalSection>

              <ClinicalSection title="Apoyos y artículos preparados" description="Recursos definidos para la salida y la atención." icon={PackageCheck}>
                <div className="plan-toggle-grid">
                  <Toggle label="Casa materna cercana" name="casa_materna_cercana" {...p} />
                  <Toggle label="Usará casa materna" name="usara_casa_materna" {...p} />
                  <Toggle label="Ropa para niño" name="ropa_nino" {...p} />
                  <Toggle label="Ropa para madre" name="ropa_madre" {...p} />
                  <Toggle label="Lleva DPI de la madre" name="lleva_dpi_madre" {...p} />
                  <Toggle label="Lleva DPI del cónyuge" name="lleva_dpi_conyuge" {...p} />
                  <Toggle label="Lleva partida de nacimiento de la madre si es menor" name="lleva_partida_nacimiento" {...p} />
                  <Toggle label="Cuenta con ahorro" name="cuenta_ahorro" {...p} />
                  <Toggle label="Comunicó al comité de emergencia" name="comunicado_comite" {...p} />
                </div>
                <div className="form-section-body col-3 plan-preparation-fields">
                  <Input label="Bebida durante el parto" name="bebida_durante_parto" form={form} set={set} />
                  <Input label="Bebida despues del parto" name="bebida_despues_parto" form={form} set={set} />
                  <Input label="Otros artículos" name="otros_articulos" form={form} set={set} />
                </div>
              </ClinicalSection>
            </section>

            <section className="secondary-chapter" aria-labelledby="birth-plan-chapter-people">
              <header className="secondary-chapter-header">
                <span className="secondary-chapter-number" aria-hidden="true">03</span>
                <div>
                  <span className="secondary-chapter-kicker">Responsables, acompañantes y contactos</span>
                  <h2 id="birth-plan-chapter-people">Acordar quién acompaña y quién activa el plan</h2>
                  <p>Personas de apoyo, cuidados en casa y contactos para ejecutar el plan.</p>
                </div>
              </header>

              <ClinicalSection title="Acompañamiento y cuidados" description="Personas previstas para el traslado, el parto y el hogar." icon={UsersRound}>
                <div className="form-section-body col-3">
                  <Select label="Quien acompanara el traslado" name="acompana_traslado" form={form} set={set} options={acompanaTrasladoOptions} />
                  <Select label="Quien acompanara durante el parto" name="acompana_parto" form={form} set={set} options={acompanaPartoOptions} />
                  <Select label="Con quien quedaran los hijos" name="con_quien_hijos" form={form} set={set} options={cuidadoHijosOptions} />
                  <Select label="Quien cuidara la casa" name="quien_cuida_casa" form={form} set={set} options={cuidadoCasaOptions} />
                  <Input label="Telefono del vehiculo" name="telefono_vehiculo" form={form} set={set} />
                </div>
              </ClinicalSection>

              <ClinicalSection title="Responsables del plan" description="Contactos que activarán y acompañarán la atención." icon={ContactRound}>
                <div className="form-section-body col-3">
                  <Select label="Responsable de activar" name="responsable_activar" form={form} set={set} options={responsableOptions} />
                  <Input label="Nombre quien activará el plan" name="nombre_activara_plan" form={form} set={set} />
                  <Input label="Nombre proveedor de salud" name="nombre_proveedor_salud" form={form} set={set} />
                </div>
              </ClinicalSection>
            </section>

            <ClinicalActionBar
              status={loading ? "Guardando plan" : existingPlan ? "Edición del plan" : "Nuevo plan de parto"}
              detail={loading ? "Espera mientras se registra la información" : "Las respuestas permanecen abiertas y se guardan con el contrato vigente."}
            >
              <button type="button" className="btn-secondary" onClick={() => navigate(expedientePath)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                <Save size={15} aria-hidden="true" />
                {loading ? "Guardando..." : existingPlan ? "Guardar cambios" : "Guardar plan"}
              </button>
            </ClinicalActionBar>
          </FormErrorContext.Provider>
        </form>
      )}
    </ClinicalWorkflowShell>
  );
}
