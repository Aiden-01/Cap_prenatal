import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { useAuth } from "../hooks/useAuth";
import SemaforoCompletitud from "../components/SemaforoCompletitud";
import TimelineControles from "../components/TimelineControles";
import {
  ChevronLeft, Plus, AlertTriangle, CheckCircle, Pencil, Trash2,
  Syringe, Activity, FlaskConical, Baby, FileText, Printer,
  CalendarDays, ChevronRight, Droplets, LockKeyhole, Microscope,
  ShieldCheck, TestTube2, ChevronDown, Car,
  PackageCheck, ClipboardCheck, MapPin, PenLine
} from "lucide-react";
import { getErrorMessage } from "../utils/errorMessage";

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

function fecha(d) {
  if (!d) return "—";
  const dateOnly = String(d).split("T")[0];
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-GT");
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
  const [exp, setExp]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [printing, setPrinting] = useState(false);
  const [antecedentesVacunas, setAntecedentesVacunas] = useState([]);
  const [selectedLabControlId, setSelectedLabControlId] = useState(null);
  const [selectedPlanSectionId, setSelectedPlanSectionId] = useState("generales");
  const [openRiskSections, setOpenRiskSections] = useState({
    antecedentes: true,
    embarazo: false,
    historia: false,
  });
  const selectedEmbarazoId = searchParams.get("embarazo_id") || "";

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
    setLoading(true);
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
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, selectedEmbarazoId, toast]);

  const tab = searchParams.get("tab") || "general";

  const cambiarTab = (nextTab) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "general") next.delete("tab");
    else next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  const embarazoSeleccionado = exp?.embarazo_seleccionado || exp?.embarazo_activo;
  const embarazoSeleccionadoId = embarazoSeleccionado?.id ? String(embarazoSeleccionado.id) : "";
  const isReadOnly = exp?.is_read_only ?? embarazoSeleccionado?.estado === "cerrado";
  const isEmbarazoActual = exp?.is_embarazo_actual ?? embarazoSeleccionadoId === String(exp?.embarazo_actual?.id || "");

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

  const expedienteDesactualizado = Boolean(
    exp && selectedEmbarazoId &&
    String(exp.embarazo_seleccionado?.id || exp.embarazo_activo?.id || '') !== String(selectedEmbarazoId)
  );

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
  const estadoEmbarazo = embarazoSeleccionado?.estado;
  const puedeRegistrarPrenatal = estadoEmbarazo === "activo";
  const puedeRegistrarPuerperio = estadoEmbarazo === "activo" || estadoEmbarazo === "puerperio";
  const riskTotalCriteria = riskTotalCount();
  const riskPositiveCriteria = exp.ficha_riesgo
    ? RISK_SECTIONS.reduce((total, section) => total + riskPositiveCount(exp.ficha_riesgo, section), 0)
    : 0;
  const riskNegativeCriteria = riskTotalCriteria - riskPositiveCriteria;
  const planSections = exp.plan_parto ? buildPlanSections(exp.plan_parto) : [];
  const selectedPlanSection = planSections.find((section) => section.id === selectedPlanSectionId) || planSections[0];
  const planTotalRegistered = planSections.reduce((total, section) => total + section.count, 0);
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

    setLoading(true);
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
    if (!window.confirm("Esto cerrara el embarazo activo y creara un nuevo embarazo para esta paciente. ¿Continuar?")) return;
    const fur = window.prompt("FUR del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fur === null) return;
    const fpp = window.prompt("FPP del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fpp === null) return;

    try {
      const { data: nuevoEmbarazo } = await api.post(`/pacientes/${id}/embarazos`, { fur, fpp });
      toast("Nuevo embarazo creado", "success");
      const next = new URLSearchParams();
      if (nuevoEmbarazo?.id) next.set("embarazo_id", String(nuevoEmbarazo.id));
      setLoading(true);
      setSearchParams(next);
    } catch (err) {
      toast(getErrorMessage(err, "Error al crear nuevo embarazo"), "error");
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
            {embarazoSeleccionado && (
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
          <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/editar`)}>
            <Pencil size={14} /> Editar paciente
          </button>
          <button className="btn-secondary" onClick={imprimirFichaMspas} disabled={printing}>
            <Printer size={14} /> {printing ? "Generando..." : "Expediente"}
          </button>
          <button className="btn-create" onClick={crearNuevoEmbarazo}>
            <Plus size={14} /> Nuevo embarazo
          </button>
        </div>
      </div>

      {isReadOnly && (
        <div className="card" style={{ marginTop: "1rem", borderColor: "var(--warn)", background: "var(--warn-lt)", color: "var(--warn)", fontWeight: 800 }}>
          Embarazo cerrado · solo lectura
        </div>
      )}

      {isEmbarazoActual && !isReadOnly && (
        <SemaforoCompletitud pacienteId={id} initialData={buildCompletitudFromExp(exp, id)} />
      )}

      {/* ── TABS ── */}
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

      {/* ══════════════════════════════════════════
          TAB: DATOS GENERALES
      ══════════════════════════════════════════ */}
      {tab === "general" && (
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
      {tab === "controles" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!isReadOnly && puedeRegistrarPrenatal && exp.controles_prenatales?.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/controles/nuevo`))}>
                <Plus size={14} /> Agregar siguiente control
              </button>
            </div>
          )}
          <TimelineControles pacienteId={id} embarazoId={embarazoSeleccionado?.id} controles={exp.controles_prenatales} isReadOnly={isReadOnly} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: PUERPERIO
      ══════════════════════════════════════════ */}
      {tab === "puerperio" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!isReadOnly && puedeRegistrarPuerperio && (exp.controles_puerperio?.length ?? 0) < 2 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={registrarPuerperio}>
                <Plus size={14} /> Registrar puerperio
              </button>
            </div>
          )}
          {exp.controles_puerperio?.length === 0 ? (
            <div className="card empty-state">
              No hay atenciones de puerperio registradas.
            </div>
          ) : (
            exp.controles_puerperio.map((pu) => (
              <div className="card" key={pu.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span className="badge badge-blue">{pu.numero_atencion === 1 ? "1ª Atención" : "2ª Atención"} — Puerperio</span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{fecha(pu.fecha)}</span>
                    {!isReadOnly && <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/puerperio/${pu.id}/editar`))}>
                      <Pencil size={13} /> Editar
                    </button>}
                    {!isReadOnly && <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta atención de puerperio?", rutaClinica(`/pacientes/${id}/controles/puerperio/${pu.id}`))}>
                      <Trash2 size={13} /> Eliminar
                    </button>}
                  </div>
                </div>

                {pu.signos_peligro && (
                  <div style={{ background: "var(--danger-lt)", border: "1px solid var(--danger)", borderRadius: 8, padding: "0.6rem 0.9rem", marginBottom: "0.85rem" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--danger)" }}>⚠ Signos de peligro: </span>
                    <span style={{ fontSize: "0.82rem" }}>{pu.signos_peligro}</span>
                  </div>
                )}

                <Grid cols={3}>
                  <Row label="Días postparto"   value={pu.dias_despues_parto} />
                  <Row label="Lugar del parto"  value={pu.lugar_atencion_parto} />
                  <Row label="Quién atendió"    value={pu.quien_atendio_parto} />
                  <Row label="Tipo de parto"    value={pu.tipo_parto} />
                  <Row label="P/A" value={pu.pa_sistolica ? `${pu.pa_sistolica}/${pu.pa_diastolica}` : null} />
                  <Row label="Temperatura"      value={pu.temperatura ? `${pu.temperatura}°C` : null} />
                </Grid>
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <SiNo label="RN vivo"               value={pu.recien_nacido_vivo} />
                  <SiNo label="Apego inmediato"        value={pu.tuvo_apego_inmediato} />
                  <SiNo label="Lactancia materna excl." value={pu.lactancia_materna_exclusiva} />
                </div>
                {pu.examen_mamas      && <div style={{ marginTop: "0.6rem" }}><Row label="Examen de mamas" value={pu.examen_mamas} /></div>}
                {pu.examen_ginecologico && <div style={{ marginTop: "0.4rem" }}><Row label="Examen ginecológico" value={pu.examen_ginecologico} /></div>}
                {pu.impresion_clinica  && <div style={{ marginTop: "0.4rem" }}><Row label="Impresión clínica" value={pu.impresion_clinica} /></div>}
                {pu.tratamiento        && <div style={{ marginTop: "0.4rem" }}><Row label="Tratamiento" value={pu.tratamiento} /></div>}
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: MORBILIDAD
      ══════════════════════════════════════════ */}
      {tab === "morbilidad" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!isReadOnly && <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/morbilidad/nuevo`))}>
              <Plus size={14} /> Registrar morbilidad
            </button>
          </div>}
          {exp.morbilidad?.length === 0 ? (
            <div className="card empty-state">
              No hay consultas intercurrentes registradas.
            </div>
          ) : (
            exp.morbilidad.map((m) => (
              <div className="card" key={m.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9rem" }}>{m.motivo_consulta}</span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      {fecha(m.fecha)}{m.hora ? ` — ${m.hora}` : ""}
                    </span>
                    {!isReadOnly && <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/morbilidad/${m.id}/editar`))}>
                      <Pencil size={13} /> Editar
                    </button>}
                    {!isReadOnly && <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta morbilidad?", rutaClinica(`/pacientes/${id}/morbilidad/${m.id}`))}>
                      <Trash2 size={13} /> Eliminar
                    </button>}
                  </div>
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <Row label="Historia enfermedad actual" value={m.historia_enfermedad_actual} />
                  <Row label="Revisión por sistemas"      value={m.revision_por_sistemas} />
                  <Row label="Examen físico"              value={m.examen_fisico} />
                  <Row label="Impresión clínica"          value={m.impresion_clinica} />
                  <Row label="Tratamiento / Referencia"   value={m.tratamiento_referencia} />
                  <Row label="Nombre / cargo atiende"     value={m.nombre_cargo_atiende} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: RIESGO OBSTÉTRICO
      ══════════════════════════════════════════ */}
      {tab === "riesgo" && (
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

      {tab === "plan" && (
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
      {tab === "vacunas" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!isReadOnly && (
            <div className="card">
              <SecTitle>Antecedentes de vacunación de la paciente</SecTitle>
              {!antecedentesVacunas.length ? (
                <div className="empty-state">No hay antecedentes de vacunación registrados.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="tabla">
                    <thead><tr><th>Vacuna</th><th>Momento</th><th>Dosis</th><th>Fecha</th><th>Origen</th></tr></thead>
                    <tbody>{antecedentesVacunas.map((v) => (
                      <tr key={v.id}>
                        <td>{v.tipo_vacuna?.replace("_", " ").toUpperCase()}</td>
                        <td>{v.momento?.replaceAll("_", " ")}</td>
                        <td>{v.numero_dosis}</td>
                        <td>{fecha(v.fecha_dosis)}</td>
                        <td><span className="badge badge-blue">{v.embarazo_origen_numero ? `Embarazo ${v.embarazo_origen_numero} · ${v.embarazo_origen_estado}` : "Antecedente · solo lectura"}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="card">
          <SecTitle>Vacunas registradas en este embarazo</SecTitle>
          {!isReadOnly && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
              <button className="btn-primary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/vacunas/nuevo`))}>
                <Plus size={14} /> Registrar vacuna
              </button>
          </div>}
          {!exp.vacunas?.length ? (
            <div className="empty-state">
              No hay vacunas registradas.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Vacuna</th>
                    <th>Momento</th>
                    <th>No. Dosis</th>
                    <th>Fecha</th>
                    {!isReadOnly && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {exp.vacunas.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 500 }}>{v.tipo_vacuna?.replace("_", " ").toUpperCase()}</td>
                      <td>
                        <span className="badge badge-blue">
                          {v.momento === "previo_embarazo" ? "Previo embarazo"
                            : v.momento === "durante_embarazo" ? "Durante embarazo"
                            : "Postparto/Aborto"}
                        </span>
                      </td>
                      <td>{v.numero_dosis}</td>
                      <td>{fecha(v.fecha_dosis)}</td>
                      {!isReadOnly && <td>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button className="btn-secondary" onClick={() => navigate(rutaClinica(`/pacientes/${id}/vacunas/${v.id}/editar`))}>
                            <Pencil size={13} /> Editar
                          </button>
                          <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta vacuna?", rutaClinica(`/pacientes/${id}/vacunas/${v.id}`))}>
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: LABORATORIOS
      ══════════════════════════════════════════ */}
      {tab === "laboratorio" && (
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
