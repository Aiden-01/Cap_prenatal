import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import { useChatbotScreenContext } from "../hooks/useChatbotScreenContext";
import SemaforoCompletitud from "../components/SemaforoCompletitud";
import TimelineControles from "../components/TimelineControles";
import {
  ChevronLeft, Plus, AlertTriangle, CheckCircle, Pencil, Trash2,
  Syringe, Activity, FlaskConical, Baby, FileText, Printer,
  CalendarDays, ChevronRight, Droplets, LockKeyhole, Microscope,
  ShieldCheck, TestTube2, ChevronDown, Car,
  PackageCheck, ClipboardCheck, MapPin, PenLine, Clock, UserRound
} from "lucide-react";
import { getErrorMessage } from "../utils/errorMessage";
import {
  canCreatePregnancy,
  hasPregnancyBlockingCreation,
  hasPuerperiumPregnancy,
  hasSelectedPregnancy,
  isValidPregnancyId,
  pregnancyActionConfirmation,
  pregnancyActionLabel,
  selectedPregnancy,
} from "../utils/pregnancyState";

// ─── HELPERS ────────────────────────────────────────────────
function Row({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="field-readonly">
      <span className="field-readonly-label">
        {label}
      </span>
      <span className="field-readonly-value">{String(value)}</span>
    </div>
  );
}

function SiNo({ label, value }) {
  if (value === undefined || value === null) return null;
  return (
    <div className={`boolean-field ${value ? "is-on" : ""}`}>
      <div className="boolean-check">
        {value && <span>✓</span>}
      </div>
      <span className="boolean-label">{label}</span>
    </div>
  );
}

function SecTitle({ children, style }) {
  return (
    <div className="section-title" style={style}>
      {children}
    </div>
  );
}

function Grid({ cols = 3, children }) {
  return (
    <div className="readonly-grid" style={{ "--cols": cols }}>
      {children}
    </div>
  );
}

function GridAuto({ children }) {
  return (
    <div className="readonly-grid-auto">
      {children}
    </div>
  );
}

function PuerperioMetric({ label, value }) {
  return (
    <div className="puerperium-metric">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function PuerperioIndicator({ label, value }) {
  return (
    <span className={`puerperium-indicator ${value ? "is-on" : "is-off"}`}>
      <CheckCircle size={15} />
      {label}
    </span>
  );
}

function PuerperioClinicalRow({ icon: Icon, title, children }) {
  if (!children) return null;
  return (
    <div className="puerperium-clinical-row">
      <div className="puerperium-clinical-heading">
        <span className="puerperium-clinical-icon"><Icon size={18} /></span>
        <strong>{title}</strong>
      </div>
      <p>{children}</p>
    </div>
  );
}

function fecha(d) {
  if (!d) return "—";
  const dateOnly = String(d).split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-GT");
}

function tipoParto(value) {
  const normalized = normalizeResult(value).toLowerCase();
  if (normalized === "cesarea") return "Cesárea";
  if (normalized === "vaginal") return "Vaginal";
  return value || "";
}

function normalizeResult(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readableResult(value) {
  const text = normalizeResult(value);
  if (!text) return "";
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isNoAplica(value) {
  return normalizeResult(value).toLowerCase() === "no_aplica";
}

function labStudy(label, realizado, value, fallback = "Realizado") {
  if (isNoAplica(value)) {
    return { label, status: "not-applicable", value: "No corresponde" };
  }
  if (!realizado) {
    return { label, status: "not-done", value: "No realizado" };
  }
  return { label, status: "done", value: normalizeResult(value) || fallback };
}

function labTorch(control) {
  if (!control.torch_realizado) return { label: "TORCH", status: "not-done", value: "No realizado" };
  if (control.torch_resultado_positivo === null || control.torch_resultado_positivo === undefined) {
    return { label: "TORCH", status: "done", value: control.torch_resultado_valor || "Realizado" };
  }
  const result = control.torch_resultado_positivo ? "Positivo" : "Negativo";
  return {
    label: "TORCH",
    status: "done",
    value: control.torch_resultado_valor ? `${result} · ${control.torch_resultado_valor}` : result,
  };
}

function labOrina(control) {
  const value = [
    control.orina_bacteriuria && "Bacteriuria+",
    control.orina_proteinuria && "Proteinuria+",
  ].filter(Boolean).join(" / ");
  return labStudy("Orina", control.orina_realizada, value, "Realizada");
}

function labVih(control, puedeVerVih) {
  if (!puedeVerVih) {
    return { label: "VIH", status: "restricted", value: "Sin permiso para visualizar" };
  }
  if (isNoAplica(control.vih_resultado)) {
    return { label: "VIH", status: "not-applicable", value: "No corresponde" };
  }
  if (!control.vih_realizado) {
    return { label: "VIH", status: "not-done", value: "No realizado" };
  }
  return {
    label: "VIH",
    status: "done",
    value: control.vih_resultado_valor || readableResult(control.vih_resultado) || "Realizado",
  };
}

function hasAnyLabResult(control) {
  return Boolean(
    control.hematologia_realizada || control.glicemia_realizada || control.grupo_rh_realizado ||
    control.orina_realizada || control.heces_realizada || control.vih_realizado ||
    control.vdrl_realizado || control.torch_realizado || control.papanicolau_ivaa_realizado ||
    control.hepatitis_b_realizado || control.usg_realizado || normalizeResult(control.otros_lab)
  );
}

function labDoneCount(control, puedeVerVih) {
  const fields = [
    control.hematologia_realizada,
    control.glicemia_realizada,
    control.grupo_rh_realizado,
    control.orina_realizada,
    control.heces_realizada,
    puedeVerVih && control.vih_realizado,
    control.vdrl_realizado,
    control.torch_realizado,
    control.papanicolau_ivaa_realizado,
    control.hepatitis_b_realizado,
    control.usg_realizado,
    Boolean(normalizeResult(control.otros_lab)),
  ];
  return fields.filter(Boolean).length;
}

function LabStudyRow({ study }) {
  const restricted = study.status === "restricted";
  return (
    <div className={`lab-study-row is-${study.status}`}>
      <span className="lab-study-label">{study.label}</span>
      <span className="lab-study-value">
        {restricted && <LockKeyhole size={13} />}
        {study.value}
      </span>
    </div>
  );
}

function LabCategoryCard({ icon: Icon, title, studies }) {
  return (
    <article className="lab-category-card">
      <div className="lab-category-title">
        <Icon size={18} />
        <h4>{title}</h4>
      </div>
      <div className="lab-study-list">
        {studies.map((study) => (
          <LabStudyRow key={study.label} study={study} />
        ))}
      </div>
    </article>
  );
}

const RISK_SECTIONS = [
  {
    id: "antecedentes",
    title: "Antecedentes obstétricos",
    criteria: [
      ["muerte_fetal_neonatal_previa", "Muerte fetal/neonatal previa"],
      ["abortos_espontaneos_3mas", "3+ abortos espontáneos consecutivos"],
      ["gestas_3mas", "3+ gestas"],
      ["peso_ultimo_bebe_menor_2500g", "RN anterior < 2500g"],
      ["peso_ultimo_bebe_mayor_4500g", "RN anterior > 4500g"],
      ["antec_hipertension_preeclampsia", "Antec. HTA / preeclampsia"],
      ["cirugias_tracto_reproductivo", "Cirugías tracto reproductivo"],
    ],
  },
  {
    id: "embarazo",
    title: "Embarazo actual",
    criteria: [
      ["embarazo_multiple", "Embarazo múltiple"],
      ["menor_20_anos", "Menor de 20 años"],
      ["mayor_35_anos", "Mayor de 35 años"],
      ["paciente_rh_negativo", "Paciente Rh (-)"],
      ["hemorragia_vaginal", "Hemorragia vaginal"],
      ["vih_positivo_sifilis", "VIH+ / Sífilis"],
      ["presion_diastolica_90mas", "P/A diastólica >= 90"],
      ["anemia", "Anemia"],
      ["desnutricion_obesidad", "Desnutrición / Obesidad"],
      ["dolor_abdominal", "Dolor abdominal"],
      ["sintomatologia_urinaria", "Sintomatología urinaria"],
      ["ictericia", "Ictericia"],
    ],
  },
  {
    id: "historia",
    title: "Historia clínica general",
    criteria: [
      ["diabetes", "Diabetes"],
      ["enfermedad_renal", "Enfermedad renal"],
      ["enfermedad_corazon", "Enfermedad del corazón"],
      ["hipertension_arterial", "Hipertensión arterial"],
      ["consumo_drogas_alcohol_tabaco", "Drogas/alcohol/tabaco"],
      ["otra_enfermedad_severa", "Otra enf. severa"],
    ],
  },
];

function riskPositiveCount(risk, section) {
  return section.criteria.filter(([field]) => Boolean(risk?.[field])).length;
}

function riskTotalCount() {
  return RISK_SECTIONS.reduce((total, section) => total + section.criteria.length, 0);
}

function RiskCriterion({ label, checked }) {
  return (
    <div className={`risk-criterion ${checked ? "is-on" : ""}`}>
      <span className="risk-criterion-check">{checked && <CheckCircle size={13} />}</span>
      <span>{label}</span>
    </div>
  );
}

function RiskSection({ number, section, risk, isOpen, onToggle }) {
  const selected = riskPositiveCount(risk, section);
  return (
    <article className={`risk-section-card ${isOpen ? "is-open" : ""}`}>
      <button type="button" className="risk-section-header" onClick={onToggle}>
        <span className="risk-section-number">{number}</span>
        <strong>{section.title}</strong>
        {!isOpen && <span className="risk-section-count">{selected} criterios seleccionados</span>}
        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {isOpen && (
        <div className="risk-criteria-grid">
          {section.criteria.map(([field, label]) => (
            <RiskCriterion key={field} label={label} checked={Boolean(risk?.[field])} />
          ))}
        </div>
      )}
    </article>
  );
}

function planValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function planDate(value) {
  if (!value) return "-";
  return fecha(value);
}

function planBoolValue(value) {
  return value ? "Sí" : "No";
}

function planItem(label, value) {
  return { label, value: planValue(value), filled: value !== null && value !== undefined && value !== "" };
}

function planDateItem(label, value) {
  return { label, value: planDate(value), filled: Boolean(value) };
}

function planBoolItem(label, value) {
  return { label, value: planBoolValue(value), filled: Boolean(value), isBoolean: true };
}

function countPlanFilled(items) {
  return items.filter((item) => item.filled).length;
}

function buildPlanSections(plan) {
  const sections = [
    {
      id: "generales",
      number: 1,
      title: "Datos generales",
      Icon: FileText,
      summary: "Identificación, residencia y datos personales.",
      metricLabel: "datos registrados",
      criticalFields: ["servicio_salud", "lugar_residencia", "telefono"],
      items: [
        planItem("No. registro", plan.no_registro),
        planItem("Servicio de salud", plan.servicio_salud),
        planDateItem("Fecha", plan.fecha),
        planItem("Lugar de residencia", plan.lugar_residencia),
        planItem("Nombre cónyuge", plan.nombre_conyuge),
        planItem("Teléfono", plan.telefono),
        planDateItem("Fecha de nacimiento", plan.fecha_nacimiento),
        planItem("Estado civil", plan.estado_civil),
        planItem("Pueblo", plan.pueblo),
        planItem("Escolaridad", plan.escolaridad),
        planItem("Con quién vive", plan.con_quien_vive),
        planItem("Idioma", plan.idioma),
      ],
    },
    {
      id: "obstetrico",
      number: 2,
      title: "Resumen obstétrico",
      Icon: Activity,
      summary: "Antecedentes obstétricos y edad gestacional.",
      metricLabel: "datos registrados",
      criticalFields: ["fur", "fecha_probable_parto", "ha_tenido_atencion_prenatal"],
      items: [
        planBoolItem("Atención prenatal", plan.ha_tenido_atencion_prenatal),
        planItem("No. embarazos", plan.no_embarazos),
        planItem("No. partos", plan.no_partos),
        planItem("No. abortos", plan.no_abortos),
        planItem("No. hijos vivos", plan.no_hijos_vivos),
        planItem("No. hijos muertos", plan.no_hijos_muertos),
        planDateItem("FUR", plan.fur),
        planDateItem("FPP", plan.fecha_probable_parto),
        planItem("No. cesáreas", plan.no_cesareas),
        planDateItem("Última cesárea", plan.fecha_ultima_cesarea),
        planItem("Edad gestacional UR", plan.edad_gestacional_semanas),
        planItem("Edad gestacional AU", plan.edad_gestacional_au),
      ],
    },
    {
      id: "peligro",
      number: 3,
      title: "Signos de peligro",
      Icon: AlertTriangle,
      summary: "Signos reconocidos para activar atención o traslado.",
      metricLabel: "signos evaluados",
      criticalFields: [
        "peligro_hemorragia_vaginal",
        "peligro_convulsiones",
        "peligro_ausencia_mov_fetales",
      ],
      items: [
        planBoolItem("Dolor de cabeza", plan.peligro_dolor_cabeza),
        planBoolItem("Visión borrosa", plan.peligro_vision_borrosa),
        planBoolItem("Embarazo múltiple", plan.peligro_embarazo_multiple),
        planBoolItem("Hemorragia vaginal", plan.peligro_hemorragia_vaginal),
        planBoolItem("Edema MI", plan.peligro_edema_mi),
        planBoolItem("Niño transverso", plan.peligro_nino_transverso),
        planBoolItem("Dolor de estómago", plan.peligro_dolor_estomago),
        planBoolItem("Salida de líquidos", plan.peligro_salida_liquidos),
        planBoolItem("Convulsiones", plan.peligro_convulsiones),
        planBoolItem("Fiebre", plan.peligro_fiebre),
        planBoolItem("Ausencia movimientos fetales", plan.peligro_ausencia_mov_fetales),
        planBoolItem("Placenta no salió", plan.peligro_placenta_no_salia),
      ],
    },
    {
      id: "atencion",
      number: 4,
      title: "Atención del parto",
      Icon: MapPin,
      summary: "Lugar, posición y distancia al servicio elegido.",
      metricLabel: "decisiones registradas",
      criticalFields: ["lugar_atencion_parto", "posicion_parto", "nombre_proveedor_salud"],
      items: [
        planItem("Posición parto", plan.posicion_parto),
        planItem("Lugar atención parto", plan.lugar_atencion_parto),
        planBoolItem("Casa materna cercana", plan.casa_materna_cercana),
        planBoolItem("Usará casa materna", plan.usara_casa_materna),
        planItem("Horas distancia", plan.horas_distancia),
        planItem("Kms servicio", plan.kms_servicio),
        planItem("Proveedor salud", plan.nombre_proveedor_salud),
      ],
    },
    {
      id: "traslado",
      number: 5,
      title: "Traslado y recursos",
      Icon: Car,
      summary: "Movilización, contacto y recursos para emergencia.",
      metricLabel: "recursos definidos",
      criticalFields: ["como_trasladara", "telefono_vehiculo", "responsable_activar"],
      items: [
        planItem("Cómo se trasladará", plan.como_trasladara),
        planItem("Acompaña traslado", plan.acompana_traslado),
        planItem("Teléfono vehículo", plan.telefono_vehiculo),
        planBoolItem("Cuenta ahorro", plan.cuenta_ahorro),
        planItem("Con quién hijos", plan.con_quien_hijos),
        planItem("Quién cuida casa", plan.quien_cuida_casa),
        planItem("Responsable activar", plan.responsable_activar),
        planItem("Nombre activa plan", plan.nombre_activara_plan),
      ],
    },
    {
      id: "preparacion",
      number: 6,
      title: "Acompañamiento y preparación",
      Icon: PackageCheck,
      summary: "Acompañantes, bebidas y artículos preparados.",
      metricLabel: "preparativos registrados",
      criticalFields: ["acompana_parto", "ropa_nino", "ropa_madre"],
      items: [
        planItem("Acompaña parto", plan.acompana_parto),
        planItem("Bebida durante parto", plan.bebida_durante_parto),
        planItem("Bebida después parto", plan.bebida_despues_parto),
        planBoolItem("Ropa niño", plan.ropa_nino),
        planBoolItem("Ropa madre", plan.ropa_madre),
        planItem("Otros artículos", plan.otros_articulos),
      ],
    },
    {
      id: "documentos",
      number: 7,
      title: "Documentos y responsables",
      Icon: ClipboardCheck,
      summary: "Documentos y comité de emergencia.",
      metricLabel: "puntos verificados",
      criticalFields: ["lleva_dpi_madre", "comunicado_comite"],
      items: [
        planBoolItem("DPI madre", plan.lleva_dpi_madre),
        planBoolItem("DPI cónyuge", plan.lleva_dpi_conyuge),
        planBoolItem("Partida nacimiento", plan.lleva_partida_nacimiento),
        planBoolItem("Comité comunicado", plan.comunicado_comite),
        planItem("Responsable activar", plan.responsable_activar),
        planItem("Nombre activa plan", plan.nombre_activara_plan),
      ],
    },
    {
      id: "firmas",
      number: 8,
      title: "Firmas / constancias",
      Icon: PenLine,
      summary: "Constancias y responsables visibles en la ficha oficial.",
      metricLabel: "constancias registradas",
      criticalFields: ["nombre_proveedor_salud", "no_registro"],
      items: [
        planItem("No. registro", plan.no_registro),
        planItem("Embarazada", plan.no_registro ? "Identificada" : ""),
        planItem("Cónyuge / conviviente", plan.nombre_conyuge),
        planItem("Proveedor de salud", plan.nombre_proveedor_salud),
        planItem("Servicio de salud", plan.servicio_salud),
      ],
    },
  ];

  return sections.map((section) => ({
    ...section,
    count: countPlanFilled(section.items),
    criticalCount: section.criticalFields.filter((field) => Boolean(plan?.[field])).length,
    criticalTotal: section.criticalFields.length,
  }));
}

function PlanSummaryItem({ item }) {
  return (
    <div className={`plan-summary-item ${item.isBoolean && item.filled ? "is-on" : ""}`}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
    </div>
  );
}

function morbilidadTime(item) {
  const dateOnly = String(item?.fecha || "").split("T")[0];
  const time = item?.hora || "00:00";
  const value = new Date(`${dateOnly || "1970-01-01"}T${time}`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function morbilidadDateParts(value) {
  if (!value) return { day: "--", month: "---", year: "" };
  const dateOnly = String(value).split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "--", month: "---", year: "" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleDateString("es-GT", { month: "short" }).replace(".", "").toUpperCase(),
    year: String(date.getFullYear()),
  };
}

function MorbilidadBlock({ icon: Icon, title, children }) {
  return (
    <section className="morbidity-detail-block">
      <div className="morbidity-block-title">
        <Icon size={15} />
        <h4>{title}</h4>
      </div>
      <p>{children || "-"}</p>
    </section>
  );
}

const VACCINE_GROUPS = [
  { id: "previo_embarazo", label: "Previo embarazo" },
  { id: "durante_embarazo", label: "Durante embarazo" },
  { id: "postparto_aborto", label: "Postparto/Aborto" },
];

function vaccineLabel(value) {
  return (value || "-").replaceAll("_", " ").toUpperCase();
}

function vaccineGroups(vaccines = []) {
  return VACCINE_GROUPS.map((group) => ({
    ...group,
    items: vaccines.filter((vaccine) => vaccine.momento === group.id),
  }));
}

function buildCompletitudFromExp(exp, pacienteId) {
  const totalControles = exp.controles_prenatales?.length ?? 0;
  const minimoControles = 4;
  const items = [
    {
      label: "Ficha de riesgo",
      completado: Boolean(exp.ficha_riesgo),
      ruta: `/pacientes/${pacienteId}?tab=riesgo`,
    },
    {
      label: "Controles prenatales",
      completado: totalControles >= minimoControles,
      detalle: `${totalControles} controles registrados`,
      total_controles: totalControles,
      minimo_controles: minimoControles,
      ruta: `/pacientes/${pacienteId}?tab=controles`,
    },
    {
      label: "Vacunas",
      completado: Boolean(exp.vacunas?.length),
      ruta: `/pacientes/${pacienteId}?tab=vacunas`,
    },
    {
      label: "Plan de parto",
      completado: Boolean(exp.plan_parto),
      ruta: `/pacientes/${pacienteId}?tab=plan`,
    },
    {
      label: "Morbilidad",
      completado: Boolean(exp.morbilidad?.length),
      ruta: `/pacientes/${pacienteId}?tab=morbilidad`,
    },
  ];

  return {
    porcentaje: items.filter((item) => item.completado).length * 20,
    embarazo_id: exp.embarazo_seleccionado?.id || exp.embarazo_activo?.id,
    total_controles: totalControles,
    items,
  };
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function ExpedientePaciente() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast      = useGlobalToast();
  const { usuario } = useAuth();
  const { setPregnancyStatus } = useChatbotScreenContext();
  const [exp, setExp]       = useState(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const [loadError, setLoadError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [creatingPregnancy, setCreatingPregnancy] = useState(false);
  const [antecedentesVacunas, setAntecedentesVacunas] = useState([]);
  const [selectedLabControlId, setSelectedLabControlId] = useState(null);
  const [selectedPlanSectionId, setSelectedPlanSectionId] = useState("generales");
  const [selectedMorbilidadId, setSelectedMorbilidadId] = useState(null);
  const [selectedPuerperioId, setSelectedPuerperioId] = useState(null);
  const [openVaccineGroups, setOpenVaccineGroups] = useState({
    previo_embarazo: true,
    durante_embarazo: true,
    postparto_aborto: true,
  });
  const [openRiskSections, setOpenRiskSections] = useState({
    antecedentes: true,
    embarazo: false,
    historia: false,
  });
  const selectedEmbarazoId = searchParams.get("embarazo_id") || "";
  const requestKey = `${id}:${selectedEmbarazoId || "actual"}`;
  const loading = loadedRequestKey !== requestKey;

  const cargarExpediente = () => {
    api.get(`/pacientes/${id}/expediente`, {
      params: selectedEmbarazoId ? { embarazo_id: selectedEmbarazoId } : undefined,
    })
      .then(({ data }) => setExp(data))
      .catch(() => toast("Error al cargar expediente", "error"))
  };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    api.get(`/pacientes/${id}/expediente`, {
      params: selectedEmbarazoId ? { embarazo_id: selectedEmbarazoId } : undefined,
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (active) {
          setLoadError("");
          setExp(data);
        }
      })
      .catch((err) => {
        if (!active || err?.code === "ERR_CANCELED") return;
        setExp(null);
        const message = "El embarazo solicitado no existe o no pertenece a la paciente";
        setLoadError(message);
        toast(message, "error");
      })
      .finally(() => {
        if (active) setLoadedRequestKey(requestKey);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, requestKey, selectedEmbarazoId, toast]);

  const tab = searchParams.get("tab") || "general";

  const cambiarTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "general") next.delete("tab");
    else next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  const embarazoSeleccionado = selectedPregnancy(exp);
  const hasEmbarazo = hasSelectedPregnancy(exp);
  const tieneEmbarazoQueBloqueaCreacion = hasPregnancyBlockingCreation(exp);
  const tieneEmbarazoEnPuerperio = hasPuerperiumPregnancy(exp);
  const puedeEditarPacientes = Boolean(usuario?.permisos?.includes("pacientes.editar"));
  const puedeConsultarControles = Boolean(usuario?.permisos?.includes("pacientes.ver"));
  const puedeCrearControles = Boolean(usuario?.permisos?.includes("controles.crear"));
  const puedeCrearEmbarazo = canCreatePregnancy(exp, puedeEditarPacientes);
  const etiquetaCrearEmbarazo = pregnancyActionLabel(exp);
  const embarazoSeleccionadoId = embarazoSeleccionado?.id ? String(embarazoSeleccionado.id) : "";
  const estadoEmbarazo = embarazoSeleccionado?.estado;
  const isReadOnly = hasEmbarazo && (exp?.is_read_only ?? embarazoSeleccionado?.estado === "cerrado");
  const isEmbarazoActual = hasEmbarazo && (
    exp?.is_embarazo_actual
    ?? embarazoSeleccionadoId === String(exp?.embarazo_actual?.id || "")
  );
  const expedienteDesactualizado = Boolean(
    exp && selectedEmbarazoId &&
    String(exp.embarazo_seleccionado?.id || exp.embarazo_activo?.id || '') !== String(selectedEmbarazoId)
  );

  useEffect(() => {
    if (loading || expedienteDesactualizado) setPregnancyStatus(null);
    else setPregnancyStatus(estadoEmbarazo);
    return () => setPregnancyStatus(null);
  }, [estadoEmbarazo, expedienteDesactualizado, loading, setPregnancyStatus]);

  useEffect(() => {
    if (!exp || isReadOnly || !embarazoSeleccionado?.id) return;
    const controller = new AbortController();
    api.get(`/pacientes/${id}/vacunas/antecedentes`, {
      params: { excluir_embarazo_id: embarazoSeleccionado.id },
      signal: controller.signal,
    })
      .then(({ data }) => setAntecedentesVacunas(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err?.code !== "ERR_CANCELED") setAntecedentesVacunas([]);
      });
    return () => controller.abort();
  }, [id, exp, isReadOnly, embarazoSeleccionado?.id]);

  if (loading || expedienteDesactualizado) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
      Cargando expediente...
    </div>
  );
  if (!exp) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--danger)" }}>
      {loadError || "Paciente no encontrada."}
    </div>
  );

  const p = exp.paciente;
  const nombreCompleto = `${p.nombres} ${p.apellidos}`.trim();
  const nombreSizeClass = nombreCompleto.length > 44
    ? "is-extra-long"
    : nombreCompleto.length > 32
      ? "is-long"
      : nombreCompleto.length > 24
        ? "is-medium"
      : "";
  const puedeRegistrarPrenatal = estadoEmbarazo === "activo" && puedeCrearControles;
  const puedeRegistrarPuerperio = estadoEmbarazo === "activo" || estadoEmbarazo === "puerperio";
  const riskTotalCriteria = riskTotalCount();
  const riskPositiveCriteria = exp.ficha_riesgo
    ? RISK_SECTIONS.reduce((total, section) => total + riskPositiveCount(exp.ficha_riesgo, section), 0)
    : 0;
  const riskNegativeCriteria = riskTotalCriteria - riskPositiveCriteria;
  const planSections = exp.plan_parto ? buildPlanSections(exp.plan_parto) : [];
  const selectedPlanSection = planSections.find((section) => section.id === selectedPlanSectionId) || planSections[0];
  const morbilidadOrdenada = Array.isArray(exp.morbilidad)
    ? [...exp.morbilidad].sort((a, b) => morbilidadTime(b) - morbilidadTime(a))
    : [];
  const selectedMorbilidad = morbilidadOrdenada.find((item) => item.id === selectedMorbilidadId) || morbilidadOrdenada[0];
  const puerperioOrdenado = Array.isArray(exp.controles_puerperio)
    ? [...exp.controles_puerperio].sort((a, b) => Number(a.numero_atencion || 0) - Number(b.numero_atencion || 0))
    : [];
  const selectedPuerperio = puerperioOrdenado.find((item) => item.id === selectedPuerperioId) || puerperioOrdenado[0];
  const vacunasAgrupadas = vaccineGroups(exp.vacunas || []);
  const puedeVerVih = usuario?.permisos?.includes("controles.ver_vih");
  const controlesLaboratorio = (exp.controles_prenatales || []).filter(hasAnyLabResult);
  const selectedLabControl = controlesLaboratorio.find((control) => control.id === selectedLabControlId) || controlesLaboratorio[0];
  const selectedLabCategories = selectedLabControl ? [
    {
      title: "Hematología",
      icon: Droplets,
      studies: [
        labStudy("Hemoglobina (Hb)", selectedLabControl.hematologia_realizada, selectedLabControl.hematologia_resultado),
      ],
    },
    {
      title: "Química",
      icon: TestTube2,
      studies: [
        labStudy("Glicemia en ayunas", selectedLabControl.glicemia_realizada, selectedLabControl.glicemia_resultado),
      ],
    },
    {
      title: "Tamizajes / Infecciosos",
      icon: ShieldCheck,
      studies: [
        labStudy("Grupo y RH", selectedLabControl.grupo_rh_realizado, selectedLabControl.grupo_rh_resultado),
        labStudy("VDRL/RPR", selectedLabControl.vdrl_realizado, readableResult(selectedLabControl.vdrl_resultado)),
        labVih(selectedLabControl, puedeVerVih),
        labStudy("Hepatitis B", selectedLabControl.hepatitis_b_realizado, readableResult(selectedLabControl.hepatitis_b_resultado)),
        labTorch(selectedLabControl),
      ],
    },
    {
      title: "Orina y Heces",
      icon: FlaskConical,
      studies: [
        labOrina(selectedLabControl),
        labStudy("Heces", selectedLabControl.heces_realizada, selectedLabControl.heces_resultado),
      ],
    },
    {
      title: "Citología",
      icon: FileText,
      studies: [
        labStudy("Papanicolau / IVAA", selectedLabControl.papanicolau_ivaa_realizado, selectedLabControl.papanicolau_ivaa_resultado),
      ],
    },
    {
      title: "Complementarios",
      icon: Microscope,
      studies: [
        labStudy("USG", selectedLabControl.usg_realizado, selectedLabControl.usg_hallazgos),
        labStudy("Otros", Boolean(normalizeResult(selectedLabControl.otros_lab)), selectedLabControl.otros_lab),
      ],
    },
  ] : [];
  const badgeEmbarazo = estadoEmbarazo === "activo"
    ? "badge-green"
    : estadoEmbarazo === "puerperio"
      ? "badge-yellow"
      : "badge-blue";
  const rutaClinica = (path) => {
    if (!embarazoSeleccionado?.id) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}embarazo_id=${embarazoSeleccionado.id}`;
  };

  const seleccionarEmbarazo = (embarazoId) => {
    const nextEmbarazoId = String(embarazoId || "");
    if (nextEmbarazoId === embarazoSeleccionadoId) return;

    setExp(null);
    setLoadError("");
    const next = new URLSearchParams(searchParams);
    next.set("embarazo_id", nextEmbarazoId);
    setSearchParams(next);
  };

  const eliminarRegistro = async (mensaje, endpoint) => {
    if (!window.confirm(mensaje)) return;
    try {
      await api.delete(endpoint);
      toast("Registro eliminado", "success");
      cargarExpediente();
    } catch (err) {
      toast(getErrorMessage(err, "Error al eliminar registro"), "error");
    }
  };

  const crearNuevoEmbarazo = async () => {
    if (!puedeCrearEmbarazo || creatingPregnancy) return;
    if (!window.confirm(pregnancyActionConfirmation(exp))) return;
    const fur = window.prompt("FUR del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fur === null) return;
    const fpp = window.prompt("FPP del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fpp === null) return;

    setCreatingPregnancy(true);
    try {
      const { data } = await api.post(`/pacientes/${id}/embarazos`, { fur, fpp });
      const nuevoEmbarazo = data?.embarazo || data;
      if (!isValidPregnancyId(nuevoEmbarazo?.id)) {
        throw new Error("El servidor no devolvio el embarazo creado");
      }

      toast(
        etiquetaCrearEmbarazo === "Iniciar embarazo" ? "Embarazo iniciado" : "Nuevo embarazo creado",
        "success"
      );
      const next = new URLSearchParams();
      next.set("embarazo_id", String(nuevoEmbarazo.id));
      setSearchParams(next);
    } catch (err) {
      toast(getErrorMessage(err, "Error al registrar embarazo"), "error");
    } finally {
      setCreatingPregnancy(false);
    }
  };

  const cerrarEmbarazo = async () => {
    if (!window.confirm("Esto cerrara el seguimiento de este embarazo. El expediente quedara en historial. ¿Continuar?")) return;

    try {
      await api.post(`/pacientes/${id}/embarazo/cerrar`, {}, { params: { embarazo_id: embarazoSeleccionado.id } });
      toast("Embarazo cerrado", "success");
      cargarExpediente();
      cambiarTab("general");
    } catch (err) {
      toast(getErrorMessage(err, "Error al cerrar embarazo"), "error");
    }
  };

  const registrarPuerperio = async () => {
    if (estadoEmbarazo === "activo") {
      if (!window.confirm("Para registrar puerperio primero se marcara el embarazo como postparto. ¿Continuar?")) return;
      try {
        await api.post(`/pacientes/${id}/embarazo/puerperio`, {}, { params: { embarazo_id: embarazoSeleccionado.id } });
        toast("Embarazo marcado en puerperio", "success");
        cargarExpediente();
      } catch (err) {
        toast(getErrorMessage(err, "Error al pasar a puerperio"), "error");
        return;
      }
    }

    navigate(rutaClinica(`/pacientes/${id}/puerperio/nuevo`));
  };

  const imprimirFichaMspas = async () => {
    if (!hasEmbarazo) {
      toast("Selecciona o inicia un embarazo antes de generar el PDF", "error");
      return;
    }
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/mspas/pdf`, {
        responseType: "blob",
        params: embarazoSeleccionado?.id ? { embarazo_id: embarazoSeleccionado.id } : undefined,
      });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar expediente";
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      let message = getErrorMessage(err, "Error al generar expediente");
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const imprimirFichaRiesgo = async () => {
    if (!hasEmbarazo) {
      toast("Selecciona un embarazo antes de generar la ficha de riesgo", "error");
      return;
    }
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/riesgo/pdf`, {
        responseType: "blob",
        params: embarazoSeleccionado?.id ? { embarazo_id: embarazoSeleccionado.id } : undefined,
      });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar ficha de riesgo";
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      let message = getErrorMessage(err, "Error al generar ficha de riesgo");
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const imprimirPlanParto = async () => {
    if (!hasEmbarazo) {
      toast("Selecciona un embarazo antes de generar el plan de parto", "error");
      return;
    }
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/plan-parto/pdf`, {
        responseType: "blob",
        params: embarazoSeleccionado?.id ? { embarazo_id: embarazoSeleccionado.id } : undefined,
      });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar plan de parto";
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      let message = getErrorMessage(err, "Error al generar plan de parto");
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          const payload = JSON.parse(errorText);
          message = getErrorMessage({ response: { data: payload } }, message);
        } catch {
          message = errorText || message;
        }
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const TABS = [
    { id: "general",    label: "Datos generales",                          icon: FileText     },
    { id: "controles",  label: `Controles (${exp.controles_prenatales?.length ?? 0})`, icon: Activity     },
    { id: "laboratorio",label: "Laboratorios",                             icon: FlaskConical },
    { id: "riesgo",     label: "Riesgo obstétrico",                        icon: AlertTriangle },
    { id: "plan",       label: "Plan de parto",                            icon: FileText },
    { id: "morbilidad", label: `Morbilidad (${exp.morbilidad?.length ?? 0})`,          icon: Plus         },
    { id: "puerperio",  label: `Puerperio (${exp.controles_puerperio?.length ?? 0})`,  icon: Baby         },
    { id: "vacunas",    label: "Vacunas",                                  icon: Syringe      },
  ];

  return (
    <div className="record-page">
      {/* ── HEADER ── */}
      <div className="patient-hero">
        <button className="btn-secondary patient-hero-back" onClick={() => navigate("/pacientes")}>
          <ChevronLeft size={15} /> Volver
        </button>

        <div className="patient-hero-main">
          <div className="patient-hero-title-row">
            <h1 className={`patient-hero-title ${nombreSizeClass}`}>
              {nombreCompleto}
            </h1>
          </div>
          <div className="patient-hero-meta">
            <span className="badge badge-blue">Exp: {p.no_expediente}</span>
            {hasEmbarazo && (
              <span className={`badge ${badgeEmbarazo}`}>
                Embarazo {embarazoSeleccionado.numero_embarazo} {embarazoSeleccionado.estado}
              </span>
            )}
            {p.cui && <span>CUI: {p.cui}</span>}
            {embarazoSeleccionado?.fur && <span>FUR: {fecha(embarazoSeleccionado.fur)}</span>}
            {embarazoSeleccionado?.fpp && <span className="patient-hero-fpp">FPP: {fecha(embarazoSeleccionado.fpp)}</span>}
            {exp.ficha_riesgo?.tiene_riesgo && (
              <span className="badge badge-red patient-risk-badge">
                <AlertTriangle size={13} /> Riesgo obstétrico
              </span>
            )}
          </div>
        </div>

        <div className="patient-hero-actions">
          {!isReadOnly && puedeRegistrarPrenatal && (
            <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/controles/nuevo`))}>
              <Plus size={14} /> Control
            </button>
          )}
          {puedeEditarPacientes && (
            <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/editar`)}>
              <Pencil size={14} /> Editar paciente
            </button>
          )}
          <button
            className="btn-secondary"
            onClick={imprimirFichaMspas}
            disabled={printing || !hasEmbarazo}
            title={!hasEmbarazo ? "Inicia un embarazo antes de generar el PDF clinico" : undefined}
          >
            <Printer size={14} /> {printing ? "Generando..." : "Expediente"}
          </button>
          {hasEmbarazo && puedeCrearEmbarazo && (
            <button className="btn-create" onClick={crearNuevoEmbarazo} disabled={creatingPregnancy}>
              <Plus size={14} /> {creatingPregnancy ? "Registrando..." : etiquetaCrearEmbarazo}
            </button>
          )}
        </div>
      </div>

      {!hasEmbarazo && (
        <div
          className="card empty-state"
          style={{ marginTop: "1rem", display: "grid", justifyItems: "center", gap: "0.75rem" }}
        >
          <Baby size={30} style={{ color: "var(--primary)" }} />
          <h3 style={{ margin: 0 }}>Sin embarazo registrado</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", textAlign: "center" }}>
            El expediente puede consultarse sin crear registros. Inicia un embarazo solo cuando corresponda.
          </p>
          {puedeCrearEmbarazo && (
            <button className="btn-primary" onClick={crearNuevoEmbarazo} disabled={creatingPregnancy}>
              <Plus size={14} /> {creatingPregnancy ? "Iniciando..." : "Iniciar embarazo"}
            </button>
          )}
        </div>
      )}

      {hasEmbarazo && isReadOnly && (
        <div className="card" style={{ marginTop: "1rem", borderColor: "var(--warn)", background: "var(--warn-lt)", color: "var(--warn)", fontWeight: 800 }}>
          Embarazo cerrado · solo lectura
        </div>
      )}

      {hasEmbarazo && tieneEmbarazoQueBloqueaCreacion && tieneEmbarazoEnPuerperio && (
        <div
          className="card"
          role="status"
          style={{ marginTop: "1rem", borderColor: "var(--warn)", background: "var(--warn-lt)", color: "var(--warn)", fontWeight: 800 }}
        >
          Complete y cierre el puerperio antes de registrar un embarazo nuevo.
        </div>
      )}

      {hasEmbarazo && isEmbarazoActual && !isReadOnly && (
        <SemaforoCompletitud pacienteId={id} initialData={buildCompletitudFromExp(exp, id)} />
      )}

      {/* ── TABS ── */}
      {hasEmbarazo && (
        <div className="content-tabs" style={{ marginBottom: "1.5rem", marginTop: "1.5rem" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => cambiarTab(t.id)} className={`content-tab ${tab === t.id ? "is-active" : ""}`}>
                <Icon size={13} />{t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: DATOS GENERALES
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "general" && (
        <div className="clinical-card-list">

          <div className="card">
            <SecTitle>Historial de embarazos</SecTitle>
            <Grid cols={4}>
              {exp.embarazos?.map((emb) => (
                <button
                  type="button"
                  key={emb.id}
                  className="mini-record-card"
                  onClick={() => seleccionarEmbarazo(emb.id)}
                  style={{ textAlign: "left", cursor: "pointer", borderColor: String(emb.id) === embarazoSeleccionadoId ? "var(--primary)" : undefined }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong>Embarazo {emb.numero_embarazo}</strong>
                    <span className={emb.estado === "activo" ? "badge badge-green" : "badge badge-blue"}>{emb.estado}</span>
                  </div>
                  <div style={{ marginTop: "0.5rem", display: "grid", gap: 2 }}>
                    <Row label="FUR" value={fecha(emb.fur)} />
                    <Row label="FPP" value={fecha(emb.fpp)} />
                    <Row label="Inicio" value={fecha(emb.fecha_inicio)} />
                    {emb.fecha_cierre && <Row label="Cierre" value={fecha(emb.fecha_cierre)} />}
                    {String(emb.id) === embarazoSeleccionadoId && <span className="badge badge-blue">Seleccionado</span>}
                  </div>
                  {(emb.estado === "activo" || emb.estado === "puerperio") && String(emb.id) === embarazoSeleccionadoId && (
                    <span className="btn-critical pregnancy-close-action" onClick={(event) => { event.stopPropagation(); cerrarEmbarazo(); }}>
                      <CheckCircle size={14} /> Cerrar embarazo
                    </span>
                  )}
                </button>
              ))}
            </Grid>
          </div>

          <div className="card">
            <SecTitle>Establecimiento</SecTitle>
            <Grid cols={3}>
              <Row label="Nombre establecimiento" value={p.nombre_establecimiento} />
              <Row label="Distrito" value={p.distrito} />
              <Row label="Área de salud" value={p.area_salud} />
              <Row label="Categoría" value={p.categoria_servicio} />
            </Grid>
          </div>

          <div className="card">
            <SecTitle>Datos Personales</SecTitle>
            <Grid cols={3}>
              <Row label="Nombres" value={p.nombres} />
              <Row label="Apellidos" value={p.apellidos} />
              <Row label="Fecha de nacimiento" value={fecha(p.fecha_nacimiento)} />
              <Row label="CUI" value={p.cui} />
              <Row label="Domicilio" value={p.domicilio} />
              <Row label="Municipio" value={p.municipio} />
              <Row label="Comunidad" value={p.comunidad} />
              <Row label="Teléfono" value={p.telefono} />
              <Row label="Estado civil" value={p.estado_civil} />
              <Row label="Pueblo" value={p.pueblo} />
              <Row label="Comunidad lingüística" value={p.comunidad_linguistica} />
              <Row label="Profesión/oficio" value={p.profesion_oficio} />
              <Row label="Esposo/conviviente" value={p.nombre_esposo_conviviente} />
            </Grid>
            <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <SiNo label="IGSS"         value={p.cobertura_igss} />
              <SiNo label="Cob. privada" value={p.cobertura_privada} />
              <SiNo label="Migrante"     value={p.es_migrante} />
              <SiNo label="Referida"     value={p.viene_referida} />
            </div>
          </div>

          <div className="card">
            <SecTitle>Gestación seleccionada</SecTitle>
            <Grid cols={4}>
              <Row label="FUR" value={fecha(embarazoSeleccionado?.fur)} />
              <Row label="FPP" value={fecha(embarazoSeleccionado?.fpp)} />
              <Row label="EG confiable FUR" value={p.eg_confiable_fur ? "Sí" : "No"} />
              <Row label="EG confiable USG" value={p.eg_confiable_usg ? "Sí" : "No"} />
            </Grid>
          </div>

          <div className="card">
            <SecTitle>Antecedentes Obstétricos</SecTitle>
            <Grid cols={4}>
              <Row label="Gestas previas"    value={p.gestas_previas} />
              <Row label="Partos"            value={p.partos} />
              <Row label="Partos vaginales"  value={p.partos_vaginales} />
              <Row label="Cesáreas"          value={p.cesareas} />
              <Row label="Abortos"           value={p.abortos} />
              <Row label="Nacidos vivos"     value={p.nacidos_vivos} />
              <Row label="Nacidos muertos"   value={p.nacidos_muertos} />
              <Row label="Hijos que viven"   value={p.hijos_viven} />
              <Row label="Muertos < 1 sem"   value={p.muertos_antes_1sem} />
              <Row label="Muertos > 1 sem"   value={p.muertos_despues_1sem} />
              <Row label="Emb. ectópico"      value={p.antec_emb_ectopico_num} />
            </Grid>
            <div style={{ marginTop: "0.85rem" }}>
              <GridAuto>
                <SiNo label="Cirugía génito-urinaria" value={p.cirugia_genito_urinaria} />
                <SiNo label="Infertilidad"            value={p.infertilidad} />
                <SiNo label="RN anterior N/C"          value={p.rn_nc} />
                <SiNo label="RN anterior normal"       value={p.rn_normal} />
                <SiNo label="RN anterior < 2500g"     value={p.rn_menor_2500g} />
                <SiNo label="RN anterior ≥ 4000g"     value={p.rn_mayor_4000g} />
                <SiNo label="Antec. VIH+"             value={p.antec_vih_positivo} />
                <SiNo label="Antecedentes gemelares"  value={p.antec_gemelares} />
                <SiNo label="3 espont. consecutivos"  value={p.abortos_3_espont_consecutivos} />
              </GridAuto>
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <Row label="Embarazo planeado" value={p.embarazo_planeado ? "Sí" : "No"} />
              <Row label="Fracaso de método" value={p.fracaso_metodo} />
              <Row label="Fin embarazo anterior" value={fecha(p.fin_embarazo_anterior)} />
            </div>
          </div>

          <div className="card">
            <SecTitle>Antecedentes Personales</SecTitle>
            <GridAuto>
              <SiNo label="Diabetes"          value={p.antec_diabetes} />
              <SiNo label="Tuberculosis"      value={p.antec_tbc} />
              <SiNo label="Hipertensión"      value={p.antec_hipertension} />
              <SiNo label="Preeclampsia"      value={p.antec_preeclampsia} />
              <SiNo label="Eclampsia"         value={p.antec_eclampsia} />
              <SiNo label="Cardiopatía"       value={p.antec_cardiopatia} />
              <SiNo label="Nefropatía"        value={p.antec_nefropatia} />
              <SiNo label="Violencia"         value={p.antec_violencia} />
            </GridAuto>
          </div>

          <div className="card">
            <SecTitle>Antecedentes Familiares</SecTitle>
            <GridAuto>
              <SiNo label="Diabetes"   value={p.fam_diabetes} />
              <SiNo label="TBC"        value={p.fam_tbc} />
              <SiNo label="HTA"        value={p.fam_hipertension} />
              <SiNo label="Preeclamp." value={p.fam_preeclampsia} />
              <SiNo label="Eclampsia"  value={p.fam_eclampsia} />
              <SiNo label="Cardiopatía"value={p.fam_cardiopatia} />
            </GridAuto>
          </div>

          <div className="card">
            <SecTitle>Riesgo Social</SecTitle>
            <GridAuto>
              <SiNo label="Fuma act."          value={p.fuma_activamente} />
              <SiNo label="Fuma pas."          value={p.fuma_pasivamente} />
              <SiNo label="Alcohol"            value={p.consume_alcohol} />
              <SiNo label="Drogas"             value={p.consume_drogas} />
              <SiNo label="Violencia 1er trim" value={p.violencia_1er_trimestre} />
              <SiNo label="Violencia 2do trim" value={p.violencia_2do_trimestre} />
              <SiNo label="Violencia 3er trim" value={p.violencia_3er_trimestre} />
              <SiNo label="Abuso sexual"       value={p.embarazo_abuso_sexual} />
            </GridAuto>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: CONTROLES PRENATALES
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "controles" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!isReadOnly && puedeRegistrarPrenatal && exp.controles_prenatales?.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/controles/nuevo`))}>
                <Plus size={14} /> Agregar siguiente control
              </button>
            </div>
          )}
          <TimelineControles
            pacienteId={id}
            embarazoId={embarazoSeleccionado?.id}
            controles={exp.controles_prenatales}
            isReadOnly={isReadOnly}
            puedeConsultar={puedeConsultarControles}
            puedeCrear={puedeCrearControles}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: PUERPERIO
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "puerperio" && (
        <div className="puerperium-module">
          {!isReadOnly && puedeRegistrarPuerperio && puerperioOrdenado.length > 0 && puerperioOrdenado.length < 2 && (
            <div className="puerperium-top-actions">
              <button className="btn-primary" onClick={registrarPuerperio}>
                <Plus size={14} /> Registrar puerperio
              </button>
            </div>
          )}

          {puerperioOrdenado.length === 0 ? (
            <div className="puerperium-empty-state">
              <span className="puerperium-empty-icon"><Baby size={24} /></span>
              <h3>No hay atenciones de puerperio registradas.</h3>
              <p>Cuando se registre una atención, aparecerá en este historial.</p>
              {!isReadOnly && puedeRegistrarPuerperio && (
                <button className="btn-primary" onClick={registrarPuerperio}>
                  <Plus size={14} /> Registrar puerperio
                </button>
              )}
            </div>
          ) : (
            <div className="puerperium-layout">
              <aside className="puerperium-history-panel">
                <div className="puerperium-panel-heading">
                  <h3>Puerperio</h3>
                  <p>{puerperioOrdenado.length} {puerperioOrdenado.length === 1 ? "atención registrada" : "atenciones registradas"}</p>
                </div>
                <div className="puerperium-timeline-list">
                  {puerperioOrdenado.map((pu, index) => {
                    const selected = selectedPuerperio?.id === pu.id;
                    return (
                      <button
                        key={pu.id}
                        type="button"
                        className={`puerperium-timeline-item ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedPuerperioId(pu.id)}
                      >
                        <span className="puerperium-timeline-dot">{index + 1}</span>
                        <span className="puerperium-history-card">
                          <strong>{pu.numero_atencion === 1 ? "1ª Atención" : "2ª Atención"} — Puerperio</strong>
                          <small>{fecha(pu.fecha)}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              </aside>

              {selectedPuerperio && (
                <section className="puerperium-detail-panel">
                  <div className="puerperium-detail-header">
                    <div className="puerperium-detail-title">
                      <span className="badge badge-blue">
                        {selectedPuerperio.numero_atencion === 1 ? "1ª Atención" : "2ª Atención"} — Puerperio
                      </span>
                      <span><CalendarDays size={15} /> {fecha(selectedPuerperio.fecha)}</span>
                    </div>
                    {!isReadOnly && (
                      <div className="puerperium-detail-actions">
                        <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/puerperio/${selectedPuerperio.id}/editar`))}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button className="btn-secondary danger-outline" onClick={() => eliminarRegistro("¿Eliminar esta atención de puerperio?", rutaClinica(`/pacientes/${id}/controles/puerperio/${selectedPuerperio.id}`))}>
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedPuerperio.signos_peligro && (
                    <div className="puerperium-danger-alert">
                      <AlertTriangle size={17} />
                      <strong>Signos de peligro</strong>
                      <p>{selectedPuerperio.signos_peligro}</p>
                    </div>
                  )}

                  <section className="puerperium-summary-section">
                    <div className="puerperium-section-title">
                      <Activity size={17} />
                      <h4>Resumen clínico</h4>
                    </div>
                    <div className="puerperium-summary-grid">
                      <PuerperioMetric label="Días postparto" value={selectedPuerperio.dias_despues_parto} />
                      <PuerperioMetric label="Tipo de parto" value={tipoParto(selectedPuerperio.tipo_parto)} />
                      <PuerperioMetric label="Lugar del parto" value={selectedPuerperio.lugar_atencion_parto} />
                      <PuerperioMetric label="P/A" value={selectedPuerperio.pa_sistolica ? `${selectedPuerperio.pa_sistolica}/${selectedPuerperio.pa_diastolica || ""}` : ""} />
                      <PuerperioMetric label="FC" value={selectedPuerperio.frecuencia_cardiaca ? `${selectedPuerperio.frecuencia_cardiaca} lpm` : ""} />
                      <PuerperioMetric label="FR" value={selectedPuerperio.frecuencia_respiratoria ? `${selectedPuerperio.frecuencia_respiratoria} rpm` : ""} />
                      <PuerperioMetric label="Temperatura" value={selectedPuerperio.temperatura ? `${selectedPuerperio.temperatura} °C` : ""} />
                      <PuerperioMetric label="Quién atendió" value={selectedPuerperio.quien_atendio_parto} />
                    </div>
                  </section>

                  <section className="puerperium-indicators-section">
                    <div className="puerperium-section-title">
                      <Baby size={17} />
                      <h4>Indicadores postparto</h4>
                    </div>
                    <div className="puerperium-indicators">
                      <PuerperioIndicator label="RN vivo" value={selectedPuerperio.recien_nacido_vivo} />
                      {(Number(selectedPuerperio.numero_atencion) !== 2 || selectedPuerperio.tuvo_apego_inmediato) && (
                        <PuerperioIndicator label="Apego inmediato" value={selectedPuerperio.tuvo_apego_inmediato} />
                      )}
                      <PuerperioIndicator label="Lactancia materna excl." value={selectedPuerperio.lactancia_materna_exclusiva} />
                    </div>
                  </section>

                  <section className="puerperium-clinical-list">
                    <PuerperioClinicalRow icon={Activity} title="Examen de mamas">{selectedPuerperio.examen_mamas}</PuerperioClinicalRow>
                    <PuerperioClinicalRow icon={Baby} title="Examen ginecológico">{selectedPuerperio.examen_ginecologico}</PuerperioClinicalRow>
                    <PuerperioClinicalRow icon={ClipboardCheck} title="Orientación / Consejería">{selectedPuerperio.orientacion_consejeria}</PuerperioClinicalRow>
                    <PuerperioClinicalRow icon={FileText} title="Impresión clínica">{selectedPuerperio.impresion_clinica}</PuerperioClinicalRow>
                    <PuerperioClinicalRow icon={ClipboardCheck} title="Tratamiento">{selectedPuerperio.tratamiento}</PuerperioClinicalRow>
                  </section>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: MORBILIDAD
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "morbilidad" && (
        <div className="morbidity-module">
          {!isReadOnly && (
            <div className="morbidity-top-actions">
              <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/morbilidad/nuevo`))}>
                <Plus size={14} /> Registrar morbilidad
              </button>
            </div>
          )}
          {morbilidadOrdenada.length === 0 ? (
            <div className="card empty-state">
              No hay consultas intercurrentes registradas.
            </div>
          ) : (
            <div className="morbidity-layout">
              <aside className="morbidity-timeline-panel">
                <div className="morbidity-panel-heading">
                  <h3>Historial de morbilidad</h3>
                  <p>{morbilidadOrdenada.length} episodio{morbilidadOrdenada.length === 1 ? "" : "s"} registrado{morbilidadOrdenada.length === 1 ? "" : "s"}</p>
                </div>
                <div className="morbidity-timeline-list">
                  {morbilidadOrdenada.map((m) => {
                    const parts = morbilidadDateParts(m.fecha);
                    const selected = selectedMorbilidad?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`morbidity-timeline-item ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedMorbilidadId(m.id)}
                      >
                        <span className="morbidity-date-chip">
                          <strong>{parts.day}</strong>
                          <small>{parts.month}</small>
                          <em>{parts.year}</em>
                        </span>
                        <span className="morbidity-timeline-dot" />
                        <span className="morbidity-episode-card">
                          <strong>{m.motivo_consulta || "Morbilidad registrada"}</strong>
                          <small><Clock size={12} /> {m.hora || "--:--"}</small>
                          {m.nombre_cargo_atiende && <small><UserRound size={12} /> {m.nombre_cargo_atiende}</small>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!isReadOnly && (
                  <button className="btn-secondary morbidity-register-inline" onClick={() => navigate(rutaClinica(`/pacientes/${id}/morbilidad/nuevo`))}>
                    <Plus size={14} /> Registrar morbilidad
                  </button>
                )}
              </aside>

              {selectedMorbilidad && (
                <section className="morbidity-detail-panel">
                  <div className="morbidity-detail-header">
                    <div className="morbidity-detail-title">
                      <span className="morbidity-detail-icon"><FileText size={18} /></span>
                      <div>
                        <h3>{selectedMorbilidad.motivo_consulta || "Morbilidad registrada"}</h3>
                        <p><CalendarDays size={13} /> {fecha(selectedMorbilidad.fecha)}{selectedMorbilidad.hora ? ` · ${selectedMorbilidad.hora}` : ""}</p>
                      </div>
                    </div>
                    {!isReadOnly && (
                      <div className="morbidity-detail-actions">
                        <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/morbilidad/${selectedMorbilidad.id}/editar`))}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta morbilidad?", rutaClinica(`/pacientes/${id}/morbilidad/${selectedMorbilidad.id}`))}>
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="morbidity-detail-grid">
                    <div className="morbidity-detail-column">
                      <MorbilidadBlock icon={FileText} title="Historia enfermedad actual">
                        {selectedMorbilidad.historia_enfermedad_actual}
                      </MorbilidadBlock>
                      <MorbilidadBlock icon={Activity} title="Revisión por sistemas">
                        {selectedMorbilidad.revision_por_sistemas}
                      </MorbilidadBlock>
                      <MorbilidadBlock icon={Microscope} title="Examen físico">
                        {selectedMorbilidad.examen_fisico}
                      </MorbilidadBlock>
                    </div>
                    <div className="morbidity-detail-column">
                      <MorbilidadBlock icon={ClipboardCheck} title="Impresión clínica">
                        {selectedMorbilidad.impresion_clinica}
                      </MorbilidadBlock>
                      <MorbilidadBlock icon={ShieldCheck} title="Tratamiento / referencia">
                        {selectedMorbilidad.tratamiento_referencia}
                      </MorbilidadBlock>
                      <MorbilidadBlock icon={UserRound} title="Nombre / cargo atiende">
                        {selectedMorbilidad.nombre_cargo_atiende}
                      </MorbilidadBlock>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: RIESGO OBSTÉTRICO
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "riesgo" && (
        <div className="risk-module-card">
          {!exp.ficha_riesgo ? (
            <div className="empty-state">
              No hay ficha de riesgo registrada.
              {!isReadOnly && <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/riesgo`))}>
                  Registrar ficha de riesgo
                </button>
              </div>}
            </div>
          ) : (
            <>
              <div className="risk-module-header">
                <div className="risk-title-row">
                  <h3>Ficha de Riesgo Obstétrico</h3>
                  {exp.ficha_riesgo.tiene_riesgo
                    ? <span className="badge badge-red risk-status-badge"><AlertTriangle size={13} /> Presenta riesgo</span>
                    : <span className="badge badge-green risk-status-badge"><CheckCircle size={13} /> Sin riesgo</span>}
                </div>
                <div className="risk-action-row">
                  <button className="btn-secondary risk-action-button" onClick={imprimirFichaRiesgo} disabled={printing}>
                    <Printer size={13} /> {printing ? "Generando..." : "Imprimir"}
                  </button>
                  {!isReadOnly && <button className="btn-secondary risk-action-button" onClick={() => navigate(rutaClinica(`/pacientes/${id}/riesgo`))}>
                    <Pencil size={13} /> Editar
                  </button>}
                  {!isReadOnly && <button className="btn-secondary risk-action-button" onClick={() => eliminarRegistro("¿Eliminar la ficha de riesgo?", rutaClinica(`/pacientes/${id}/riesgo`))}>
                    <Trash2 size={13} /> Eliminar
                  </button>}
                </div>
              </div>

              <div className="risk-content-layout">
                <div className="risk-sections-stack">
                  {RISK_SECTIONS.map((section, index) => (
                    <RiskSection
                      key={section.id}
                      number={index + 1}
                      section={section}
                      risk={exp.ficha_riesgo}
                      isOpen={Boolean(openRiskSections[section.id])}
                      onToggle={() => setOpenRiskSections((current) => ({
                        ...current,
                        [section.id]: !current[section.id],
                      }))}
                    />
                  ))}
                </div>

                <aside className="risk-summary-panel">
                  <h4>Resumen del riesgo</h4>
                  <div className="risk-summary-block">
                    <span>Estado actual</span>
                    {exp.ficha_riesgo.tiene_riesgo
                      ? <strong className="risk-summary-status is-risk">Presenta riesgo</strong>
                      : <strong className="risk-summary-status is-ok">Sin riesgo</strong>}
                  </div>
                  <div className="risk-summary-metrics">
                    <div>
                      <span>Criterios positivos</span>
                      <strong>{riskPositiveCriteria}</strong>
                    </div>
                    <div>
                      <span>Criterios no presentes</span>
                      <strong>{riskNegativeCriteria}</strong>
                    </div>
                  </div>
                  <div className="risk-summary-date">
                    <CalendarDays size={16} />
                    <span>Evaluación realizada el:<strong>{fecha(exp.ficha_riesgo.fecha)}</strong></span>
                  </div>
                </aside>
              </div>

              {exp.ficha_riesgo.referida_a && (
                <div className="risk-referral-strip">
                  <FileText size={18} />
                  <span><strong>Referida a:</strong> {exp.ficha_riesgo.referida_a}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {hasEmbarazo && tab === "plan" && (
        <div className="birth-plan-card">
          {!exp.plan_parto ? (
            <div className="empty-state">
              No hay plan de parto registrado.
              {!isReadOnly && <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/plan-parto`))}>
                  Registrar plan de parto
                </button>
              </div>}
            </div>
          ) : (
            <>
              <div className="birth-plan-header">
                <div>
                  <div className="birth-plan-title-row">
                    <h3>Plan de Parto</h3>
                    <span className="badge badge-green birth-plan-status">
                      <CheckCircle size={13} /> Registrado
                    </span>
                  </div>
                  <p>Preparación, traslado y atención planificada para el parto.</p>
                </div>
                <div className="birth-plan-actions">
                  <button className="btn-secondary birth-plan-action" onClick={imprimirPlanParto} disabled={printing}>
                    <Printer size={13} /> {printing ? "Generando..." : "Imprimir"}
                  </button>
                  {!isReadOnly && <button className="btn-secondary birth-plan-action" onClick={() => navigate(rutaClinica(`/pacientes/${id}/plan-parto`))}>
                    <Pencil size={13} /> Editar
                  </button>}
                </div>
              </div>

              <div className="birth-plan-layout">
                <div className="birth-plan-section-grid">
                  {planSections.map((section) => {
                    const Icon = section.Icon;
                    const selected = selectedPlanSection?.id === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        className={`birth-plan-section-card ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedPlanSectionId(section.id)}
                      >
                        <span className="birth-plan-card-icon"><Icon size={20} /></span>
                        <span className="birth-plan-card-number">{section.number}</span>
                        <strong>{section.title}</strong>
                        <small>{section.summary}</small>
                        <span className="birth-plan-card-footer">
                          <span>Completa</span>
                          <em>{section.count} {section.metricLabel}</em>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedPlanSection && (
                  <aside className="birth-plan-detail-panel">
                    <div className="birth-plan-detail-heading">
                      <span className="birth-plan-card-icon">
                        {(() => {
                          const Icon = selectedPlanSection.Icon;
                          return <Icon size={20} />;
                        })()}
                      </span>
                      <div>
                        <h4>{selectedPlanSection.title}</h4>
                        <p>{selectedPlanSection.summary}</p>
                      </div>
                    </div>
                    <div className="birth-plan-detail-stats">
                      <div>
                        <span>Bloques registrados</span>
                        <strong>{selectedPlanSection.count} / {selectedPlanSection.items.length}</strong>
                      </div>
                      <div>
                        <span>Datos críticos</span>
                        <strong>
                          {selectedPlanSection.criticalCount === selectedPlanSection.criticalTotal
                            ? "Completos"
                            : `${selectedPlanSection.criticalCount} / ${selectedPlanSection.criticalTotal}`}
                        </strong>
                      </div>
                      <div>
                        <span>Última actualización</span>
                        <strong>{fecha(exp.plan_parto.fecha)}</strong>
                      </div>
                    </div>
                    <div className="birth-plan-summary-list">
                      {selectedPlanSection.items.map((item) => (
                        <PlanSummaryItem key={item.label} item={item} />
                      ))}
                    </div>
                  </aside>
                )}
              </div>

              <div className="birth-plan-key-strip">
                <MapPin size={18} />
                <span>
                  <strong>Lugar de atención del parto:</strong> {planValue(exp.plan_parto.lugar_atencion_parto)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: VACUNAS
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "vacunas" && (
        <div className="vaccines-module">
          {!isReadOnly && (
            <section className="vaccines-card">
              <div className="vaccines-card-heading">
                <h3>Antecedentes de vacunación de la paciente</h3>
              </div>
              {!antecedentesVacunas.length ? (
                <div className="vaccines-empty-state">
                  <div className="vaccines-empty-icon">
                    <ShieldCheck size={28} />
                  </div>
                  <strong>No hay antecedentes de vacunación registrados.</strong>
                  <p>Cuando se registren vacunas en embarazos anteriores, se mostrarán aquí.</p>
                </div>
              ) : (
                <div className="vaccines-table-wrap">
                  <table className="vaccines-table">
                    <thead><tr><th>Vacuna</th><th>Momento</th><th>Dosis</th><th>Fecha</th><th>Origen</th></tr></thead>
                    <tbody>{antecedentesVacunas.map((v) => (
                      <tr key={v.id}>
                        <td>{vaccineLabel(v.tipo_vacuna)}</td>
                        <td>{v.momento?.replaceAll("_", " ")}</td>
                        <td>{v.numero_dosis}</td>
                        <td>{fecha(v.fecha_dosis)}</td>
                        <td><span className="badge badge-blue">{v.embarazo_origen_numero ? `Embarazo ${v.embarazo_origen_numero} · ${v.embarazo_origen_estado}` : "Antecedente · solo lectura"}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="vaccines-card vaccines-main-card">
            <div className="vaccines-card-heading">
              <h3>Vacunas registradas en este embarazo</h3>
              {!isReadOnly && (
                <button className="btn-primary vaccines-register-button" onClick={() => navigate(rutaClinica(`/pacientes/${id}/vacunas/nuevo`))}>
                  <Plus size={14} /> Registrar vacuna
                </button>
              )}
            </div>

            {!exp.vacunas?.length ? (
              <div className="vaccines-empty-state is-compact">
                <div className="vaccines-empty-icon">
                  <Syringe size={26} />
                </div>
                <strong>No hay vacunas registradas.</strong>
                <p>Al registrar vacunas para este embarazo, aparecerán agrupadas por momento.</p>
              </div>
            ) : (
              <div className="vaccines-group-stack">
                {vacunasAgrupadas.map((group) => {
                  const open = Boolean(openVaccineGroups[group.id]);
                  return (
                    <article className="vaccines-group" key={group.id}>
                      <button
                        type="button"
                        className="vaccines-group-header"
                        onClick={() => setOpenVaccineGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                      >
                        <span className="vaccines-group-title">
                          <CalendarDays size={16} />
                          <strong>{group.label}</strong>
                          <em>{group.items.length}</em>
                        </span>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>

                      {open && (
                        <div className="vaccines-table-wrap">
                          {group.items.length ? (
                            <table className="vaccines-table">
                              <thead>
                                <tr>
                                  <th>Vacuna</th>
                                  <th>No. dosis</th>
                                  <th>Fecha</th>
                                  {!isReadOnly && <th>Acciones</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((v) => (
                                  <tr key={v.id}>
                                    <td><span className="vaccine-name"><Syringe size={14} /> {vaccineLabel(v.tipo_vacuna)}</span></td>
                                    <td>{v.numero_dosis}</td>
                                    <td>{fecha(v.fecha_dosis)}</td>
                                    {!isReadOnly && (
                                      <td>
                                        <div className="vaccines-actions">
                                          <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/vacunas/${v.id}/editar`))}>
                                            <Pencil size={13} /> Editar
                                          </button>
                                          <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta vacuna?", rutaClinica(`/pacientes/${id}/vacunas/${v.id}`))}>
                                            <Trash2 size={13} /> Eliminar
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="vaccines-group-empty">No hay vacunas registradas en este momento.</div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
            </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: LABORATORIOS
      ══════════════════════════════════════════ */}
      {hasEmbarazo && tab === "laboratorio" && (
        <div className="lab-explorer-shell">
          {!controlesLaboratorio.length ? (
            <div className="card empty-state">
              No hay resultados de laboratorio registrados.
            </div>
          ) : (
            <>
              <aside className="lab-history-panel">
                <div className="lab-panel-heading">
                  <h3>Controles / Laboratorios</h3>
                  <p>Historial de resultados de laboratorio</p>
                </div>
                <div className="lab-control-list">
                  {controlesLaboratorio.map((ctrl) => {
                    const selected = selectedLabControl?.id === ctrl.id;
                    const count = labDoneCount(ctrl, puedeVerVih);
                    return (
                      <button
                        key={ctrl.id}
                        type="button"
                        className={`lab-control-item ${selected ? "is-selected" : ""}`}
                        onClick={() => setSelectedLabControlId(ctrl.id)}
                      >
                        <span className="lab-control-marker">{count}</span>
                        <span className="lab-control-main">
                          <strong>Control {ctrl.numero_control}</strong>
                          <small><CalendarDays size={13} /> {fecha(ctrl.fecha_control || ctrl.fecha)}</small>
                        </span>
                        <span className="lab-control-summary">{count} registrado{count === 1 ? "" : "s"}</span>
                        <ChevronRight size={17} />
                      </button>
                    );
                  })}
                </div>
                <div className="lab-history-footer">
                  Mostrando {controlesLaboratorio.length} de {controlesLaboratorio.length} controles
                </div>
              </aside>

              <section className="lab-detail-panel">
                <div className="lab-detail-header">
                  <div>
                    <span className="lab-selected-pill">Control {selectedLabControl?.numero_control}</span>
                    <span className="lab-selected-date">{fecha(selectedLabControl?.fecha_control || selectedLabControl?.fecha)}</span>
                  </div>
                </div>
                <div className="lab-category-grid">
                  {selectedLabCategories.map((category) => (
                    <LabCategoryCard
                      key={category.title}
                      icon={category.icon}
                      title={category.title}
                      studies={category.studies}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}

    </div>
  );
}
