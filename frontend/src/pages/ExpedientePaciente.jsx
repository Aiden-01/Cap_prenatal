import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import {
  ChevronLeft, Plus, AlertTriangle, CheckCircle, Pencil, Trash2,
  Syringe, Activity, FlaskConical, Baby, FileText, Printer
} from "lucide-react";

// ─── HELPERS ────────────────────────────────────────────────
function Row({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: "0.88rem", color: "var(--text)" }}>{String(value)}</span>
    </div>
  );
}

function SiNo({ label, value }) {
  if (value === undefined || value === null) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
      <div style={{
        width: 15, height: 15, borderRadius: 4,
        background: value ? "var(--accent)" : "var(--border)",
        display: "grid", placeItems: "center", flexShrink: 0,
      }}>
        {value && <span style={{ color: "#fff", fontSize: "0.58rem", fontWeight: 800 }}>✓</span>}
      </div>
      <span style={{ fontSize: "0.82rem", color: value ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function SecTitle({ children }) {
  return (
    <div style={{
      fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.09em",
      textTransform: "uppercase", color: "var(--primary)",
      borderBottom: "1.5px solid var(--primary-lt)",
      paddingBottom: "0.35rem", marginBottom: "0.85rem",
    }}>
      {children}
    </div>
  );
}

function Grid({ cols = 3, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "0.9rem" }}>
      {children}
    </div>
  );
}

function GridAuto({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "0.55rem" }}>
      {children}
    </div>
  );
}

function fecha(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-GT");
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────
export default function ExpedientePaciente() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const toast      = useGlobalToast();
  const [exp, setExp]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState("general");
  const [printing, setPrinting] = useState(false);

  const cargarExpediente = () => {
    api.get(`/pacientes/${id}/expediente`)
      .then(({ data }) => setExp(data))
      .catch(() => toast("Error al cargar expediente", "error"))
  };

  useEffect(() => {
    api.get(`/pacientes/${id}/expediente`)
      .then(({ data }) => setExp(data))
      .catch(() => toast("Error al cargar expediente", "error"))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
      Cargando expediente...
    </div>
  );
  if (!exp) return (
    <div style={{ padding: "3rem", textAlign: "center", color: "var(--danger)" }}>
      Paciente no encontrada.
    </div>
  );

  const p = exp.paciente;

  const eliminarRegistro = async (mensaje, endpoint) => {
    if (!window.confirm(mensaje)) return;
    try {
      await api.delete(endpoint);
      toast("Registro eliminado", "success");
      cargarExpediente();
    } catch (err) {
      toast(err.response?.data?.error || "Error al eliminar registro", "error");
    }
  };

  const crearNuevoEmbarazo = async () => {
    if (!window.confirm("Esto cerrara el embarazo activo y creara un nuevo embarazo para esta paciente. ¿Continuar?")) return;
    const fur = window.prompt("FUR del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fur === null) return;
    const fpp = window.prompt("FPP del nuevo embarazo (AAAA-MM-DD). Puedes dejarlo vacio:");
    if (fpp === null) return;

    try {
      await api.post(`/pacientes/${id}/embarazos`, { fur, fpp });
      toast("Nuevo embarazo creado", "success");
      cargarExpediente();
      setTab("general");
    } catch (err) {
      toast(err.response?.data?.error || "Error al crear nuevo embarazo", "error");
    }
  };

  const imprimirFichaMspas = async () => {
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/mspas/pdf`, { responseType: "blob" });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar expediente";
        try {
          message = JSON.parse(errorText).error || message;
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
      let message = err.message || "Error al generar expediente";
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          message = JSON.parse(errorText).error || message;
        } catch {
          message = errorText || message;
        }
      } else if (err.response?.data?.error) {
        message = err.response.data.error;
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const imprimirFichaRiesgo = async () => {
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/riesgo/pdf`, { responseType: "blob" });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar ficha de riesgo";
        try {
          message = JSON.parse(errorText).error || message;
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
      let message = err.message || "Error al generar ficha de riesgo";
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          message = JSON.parse(errorText).error || message;
        } catch {
          message = errorText || message;
        }
      } else if (err.response?.data?.error) {
        message = err.response.data.error;
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const imprimirPlanParto = async () => {
    setPrinting(true);
    try {
      const res = await api.get(`/pacientes/${id}/plan-parto/pdf`, { responseType: "blob" });
      const contentType = res.headers["content-type"] || "";
      if (!contentType.includes("application/pdf")) {
        const errorText = await res.data.text();
        let message = "Error al generar plan de parto";
        try {
          message = JSON.parse(errorText).error || message;
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
      let message = err.message || "Error al generar plan de parto";
      if (err.response?.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
          message = JSON.parse(errorText).error || message;
        } catch {
          message = errorText || message;
        }
      } else if (err.response?.data?.error) {
        message = err.response.data.error;
      }
      toast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const TABS = [
    { id: "general",    label: "Datos generales",                          icon: FileText     },
    { id: "controles",  label: `Controles (${exp.controles_prenatales?.length ?? 0})`, icon: Activity     },
    { id: "puerperio",  label: `Puerperio (${exp.controles_puerperio?.length ?? 0})`,  icon: Baby         },
    { id: "morbilidad", label: `Morbilidad (${exp.morbilidad?.length ?? 0})`,          icon: Plus         },
    { id: "riesgo",     label: "Riesgo obstétrico",                        icon: AlertTriangle },
    { id: "plan",       label: "Plan de parto",                            icon: FileText },
    { id: "vacunas",    label: "Vacunas",                                  icon: Syringe      },
    { id: "laboratorio",label: "Laboratorios",                             icon: FlaskConical },
  ];

  return (
    <div>
      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={() => navigate("/pacientes")}
          style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <ChevronLeft size={15} /> Volver
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)" }}>
              {p.nombres} {p.apellidos}
            </h1>
            {exp.ficha_riesgo?.tiene_riesgo && (
              <span className="badge badge-red">⚠ Riesgo obstétrico</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge badge-blue">Exp: {p.no_expediente}</span>
            {exp.embarazo_activo && <span className="badge badge-green">Embarazo {exp.embarazo_activo.numero_embarazo} activo</span>}
            {p.cui && <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>CUI: {p.cui}</span>}
            {(exp.embarazo_activo?.fur || p.fur)  && <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>FUR: {fecha(exp.embarazo_activo?.fur || p.fur)}</span>}
            {(exp.embarazo_activo?.fpp || p.fpp)  && <span style={{ color: "var(--accent)", fontSize: "0.82rem", fontWeight: 600 }}>FPP: {fecha(exp.embarazo_activo?.fpp || p.fpp)}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Plus size={14} /> Control
          </button>
          <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/editar`)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Pencil size={14} /> Editar paciente
          </button>
          <button className="btn-primary" onClick={imprimirFichaMspas} disabled={printing}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Printer size={14} /> {printing ? "Generando..." : "Expediente"}
          </button>
          <button className="btn-secondary" onClick={crearNuevoEmbarazo}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Plus size={14} /> Nuevo embarazo
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: "0.15rem", borderBottom: "2px solid var(--border)", marginBottom: "1.5rem", overflowX: "auto" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "0.55rem 1rem", border: "none", background: "transparent", whiteSpace: "nowrap",
              borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -2, color: tab === t.id ? "var(--primary)" : "var(--text-muted)",
              fontFamily: "DM Sans", fontSize: "0.82rem", fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem",
            }}>
              <Icon size={13} />{t.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          TAB: DATOS GENERALES
      ══════════════════════════════════════════ */}
      {tab === "general" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>

          <div className="card">
            <SecTitle>Historial de embarazos</SecTitle>
            <Grid cols={4}>
              {exp.embarazos?.map((emb) => (
                <div key={emb.id} style={{ padding: "0.6rem", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong>Embarazo {emb.numero_embarazo}</strong>
                    <span className={emb.estado === "activo" ? "badge badge-green" : "badge badge-blue"}>{emb.estado}</span>
                  </div>
                  <div style={{ marginTop: "0.5rem", display: "grid", gap: 2 }}>
                    <Row label="FUR" value={fecha(emb.fur)} />
                    <Row label="FPP" value={fecha(emb.fpp)} />
                    <Row label="Inicio" value={fecha(emb.fecha_inicio)} />
                    {emb.fecha_cierre && <Row label="Cierre" value={fecha(emb.fecha_cierre)} />}
                  </div>
                </div>
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
            <SecTitle>Gestación Actual</SecTitle>
            <Grid cols={4}>
              <Row label="FUR" value={fecha(p.fur)} />
              <Row label="FPP" value={fecha(p.fpp)} />
              <Row label="EG confiable FUR" value={p.eg_confiable_fur ? "Sí" : "No"} />
              <Row label="EG confiable USG" value={p.eg_confiable_usg ? "Sí" : "No"} />
            </Grid>
          </div>

          <div className="card">
            <SecTitle>Antecedentes Obstétricos</SecTitle>
            <Grid cols={4}>
              <Row label="Gestas previas"    value={p.gestas_previas} />
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
          {exp.controles_prenatales?.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}>
                <Plus size={14} /> Agregar siguiente control
              </button>
            </div>
          )}
          {exp.controles_prenatales?.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              No hay controles registrados.
              <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}>
                  + Registrar 1er control
                </button>
              </div>
            </div>
          ) : (
            exp.controles_prenatales.map((ctrl) => (
              <div className="card" key={ctrl.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span className="badge badge-blue">Control {ctrl.numero_control}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                      {fecha(ctrl.fecha)}{ctrl.hora ? ` — ${ctrl.hora}` : ""}
                    </span>
                    <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/controles/${ctrl.id}/editar`)}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar este control prenatal?", `/pacientes/${id}/controles/${ctrl.id}`)}>
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>

                {/* Signos de peligro */}
                {(ctrl.peligro_hemorragia_vaginal || ctrl.peligro_palidez || ctrl.peligro_dolor_cabeza ||
                  ctrl.peligro_hipertension || ctrl.peligro_dolor_epigastrico ||
                  ctrl.peligro_trastornos_visuales || ctrl.peligro_fiebre || ctrl.peligro_otro) && (
                  <div style={{ background: "var(--danger-lt)", border: "1px solid var(--danger)", borderRadius: 8, padding: "0.6rem 0.9rem", marginBottom: "0.85rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.4rem" }}>⚠ SIGNOS DE PELIGRO</div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {ctrl.peligro_hemorragia_vaginal && <span className="badge badge-red">Hemorragia vaginal</span>}
                      {ctrl.peligro_palidez           && <span className="badge badge-red">Palidez</span>}
                      {ctrl.peligro_dolor_cabeza      && <span className="badge badge-red">Dolor de cabeza</span>}
                      {ctrl.peligro_hipertension      && <span className="badge badge-red">Hipertensión</span>}
                      {ctrl.peligro_dolor_epigastrico && <span className="badge badge-red">Dolor epigástrico</span>}
                      {ctrl.peligro_trastornos_visuales && <span className="badge badge-red">Trast. visuales</span>}
                      {ctrl.peligro_fiebre            && <span className="badge badge-red">Fiebre</span>}
                      {ctrl.peligro_otro && <span className="badge badge-red">{ctrl.peligro_otro}</span>}
                    </div>
                  </div>
                )}

                <Grid cols={4}>
                  <Row label="P/A" value={ctrl.pa_sistolica ? `${ctrl.pa_sistolica}/${ctrl.pa_diastolica} mmHg` : null} />
                  <Row label="Temperatura" value={ctrl.temperatura ? `${ctrl.temperatura}°C` : null} />
                  <Row label="Peso" value={ctrl.peso_kg ? `${ctrl.peso_kg} kg` : null} />
                  <Row label="Talla" value={ctrl.talla_cm ? `${ctrl.talla_cm} cm` : null} />
                  <Row label="IMC" value={ctrl.imc} />
                  <Row label="Perím. braquial" value={ctrl.perimetro_braquial_cm ? `${ctrl.perimetro_braquial_cm} cm` : null} />
                  <Row label="AU" value={ctrl.altura_uterina_cm ? `${ctrl.altura_uterina_cm} cm` : null} />
                  <Row label="FCF" value={ctrl.fcf ? `${ctrl.fcf} lpm` : null} />
                  <Row label="FC" value={ctrl.frecuencia_cardiaca ? `${ctrl.frecuencia_cardiaca} x min` : null} />
                  <Row label="FR" value={ctrl.frecuencia_respiratoria ? `${ctrl.frecuencia_respiratoria} x min` : null} />
                  <Row label="Semanas gest." value={ctrl.edad_gestacional_semanas ? `${ctrl.edad_gestacional_semanas} sem` : null} />
                  <Row label="Cita siguiente" value={fecha(ctrl.cita_siguiente)} />
                  <Row label="Situación fetal" value={ctrl.situacion_fetal} />
                  <Row label="Presentación" value={ctrl.presentacion_fetal} />
                </Grid>

                {ctrl.impresion_clinica && (
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                    <Row label="Impresión Clínica" value={ctrl.impresion_clinica} />
                  </div>
                )}
                {ctrl.tratamiento && <div style={{ marginTop: "0.5rem" }}><Row label="Tratamiento" value={ctrl.tratamiento} /></div>}

                {/* Suplementación */}
                {(ctrl.sulfato_ferroso || ctrl.acido_folico) && (
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {ctrl.sulfato_ferroso && <span className="badge badge-green">Sulfato ferroso: {ctrl.sulfato_ferroso_tabletas ?? "—"} tab.</span>}
                    {ctrl.acido_folico   && <span className="badge badge-green">Ácido fólico: {ctrl.acido_folico_tabletas ?? "—"} tab.</span>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: PUERPERIO
      ══════════════════════════════════════════ */}
      {tab === "puerperio" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {(exp.controles_puerperio?.length ?? 0) < 2 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/puerperio/nuevo`)}>
                <Plus size={14} /> Registrar puerperio
              </button>
            </div>
          )}
          {exp.controles_puerperio?.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              No hay atenciones de puerperio registradas.
            </div>
          ) : (
            exp.controles_puerperio.map((pu) => (
              <div className="card" key={pu.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span className="badge badge-blue">{pu.numero_atencion === 1 ? "1ª Atención" : "2ª Atención"} — Puerperio</span>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{fecha(pu.fecha)}</span>
                    <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/puerperio/${pu.id}/editar`)}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta atención de puerperio?", `/pacientes/${id}/controles/puerperio/${pu.id}`)}>
                      <Trash2 size={13} /> Eliminar
                    </button>
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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/morbilidad/nuevo`)}>
              <Plus size={14} /> Registrar morbilidad
            </button>
          </div>
          {exp.morbilidad?.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
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
                    <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/morbilidad/${m.id}/editar`)}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta morbilidad?", `/pacientes/${id}/morbilidad/${m.id}`)}>
                      <Trash2 size={13} /> Eliminar
                    </button>
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
        <div className="card">
          {!exp.ficha_riesgo ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No hay ficha de riesgo registrada.
              <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/riesgo`)}>
                  Registrar ficha de riesgo
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ fontFamily: "Syne", fontSize: "1rem", fontWeight: 700 }}>Ficha de Riesgo Obstétrico</h3>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {exp.ficha_riesgo.tiene_riesgo
                    ? <span className="badge badge-red">⚠ PRESENTA RIESGO</span>
                    : <span className="badge badge-green"><CheckCircle size={11} /> SIN RIESGO</span>}
                  <button className="btn-primary" onClick={imprimirFichaRiesgo} disabled={printing}>
                    <Printer size={13} /> {printing ? "Generando..." : "Imprimir"}
                  </button>
                  <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/riesgo`)}>
                    <Pencil size={13} /> Editar
                  </button>
                  <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar la ficha de riesgo?", `/pacientes/${id}/riesgo`)}>
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              </div>

              <SecTitle>Antecedentes Obstétricos (criterios 1-7)</SecTitle>
              <GridAuto>
                <SiNo label="Muerte fetal/neonatal previa"       value={exp.ficha_riesgo.muerte_fetal_neonatal_previa} />
                <SiNo label="3+ abortos espontáneos consecutivos" value={exp.ficha_riesgo.abortos_espontaneos_3mas} />
                <SiNo label="3+ gestas"                           value={exp.ficha_riesgo.gestas_3mas} />
                <SiNo label="RN anterior < 2500g"                 value={exp.ficha_riesgo.peso_ultimo_bebe_menor_2500g} />
                <SiNo label="RN anterior > 4500g"                 value={exp.ficha_riesgo.peso_ultimo_bebe_mayor_4500g} />
                <SiNo label="Antec. HTA / preeclampsia"           value={exp.ficha_riesgo.antec_hipertension_preeclampsia} />
                <SiNo label="Cirugías tracto reproductivo"        value={exp.ficha_riesgo.cirugias_tracto_reproductivo} />
              </GridAuto>

              <SecTitle style={{ marginTop: "1rem" }}>Embarazo Actual (criterios 8-19)</SecTitle>
              <GridAuto>
                <SiNo label="Embarazo múltiple"        value={exp.ficha_riesgo.embarazo_multiple} />
                <SiNo label="Menor de 20 años"         value={exp.ficha_riesgo.menor_20_anos} />
                <SiNo label="Mayor de 35 años"         value={exp.ficha_riesgo.mayor_35_anos} />
                <SiNo label="Paciente Rh (−)"          value={exp.ficha_riesgo.paciente_rh_negativo} />
                <SiNo label="Hemorragia vaginal"        value={exp.ficha_riesgo.hemorragia_vaginal} />
                <SiNo label="VIH+ / Sífilis"           value={exp.ficha_riesgo.vih_positivo_sifilis} />
                <SiNo label="P/A diastólica ≥ 90"      value={exp.ficha_riesgo.presion_diastolica_90mas} />
                <SiNo label="Anemia"                   value={exp.ficha_riesgo.anemia} />
                <SiNo label="Desnutrición / Obesidad"  value={exp.ficha_riesgo.desnutricion_obesidad} />
                <SiNo label="Dolor abdominal"          value={exp.ficha_riesgo.dolor_abdominal} />
                <SiNo label="Sintomatología urinaria"  value={exp.ficha_riesgo.sintomatologia_urinaria} />
                <SiNo label="Ictericia"                value={exp.ficha_riesgo.ictericia} />
              </GridAuto>

              <SecTitle style={{ marginTop: "1rem" }}>Historia Clínica General (criterios 20-25)</SecTitle>
              <GridAuto>
                <SiNo label="Diabetes"               value={exp.ficha_riesgo.diabetes} />
                <SiNo label="Enfermedad renal"       value={exp.ficha_riesgo.enfermedad_renal} />
                <SiNo label="Enfermedad del corazón" value={exp.ficha_riesgo.enfermedad_corazon} />
                <SiNo label="Hipertensión arterial"  value={exp.ficha_riesgo.hipertension_arterial} />
                <SiNo label="Drogas/alcohol/tabaco"  value={exp.ficha_riesgo.consumo_drogas_alcohol_tabaco} />
                <SiNo label="Otra enf. severa"       value={exp.ficha_riesgo.otra_enfermedad_severa} />
              </GridAuto>

              {exp.ficha_riesgo.referida_a && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--warn-lt)", borderRadius: 8, border: "1px solid var(--warn)" }}>
                  <span style={{ color: "var(--warn)", fontWeight: 600, fontSize: "0.82rem" }}>Referida a: </span>
                  <span style={{ fontSize: "0.85rem" }}>{exp.ficha_riesgo.referida_a}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "plan" && (
        <div className="card">
          {!exp.plan_parto ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No hay plan de parto registrado.
              <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/plan-parto`)}>
                  Registrar plan de parto
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ fontFamily: "Syne", fontSize: "1rem", fontWeight: 700 }}>Plan de Parto</h3>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button className="btn-secondary" onClick={imprimirPlanParto} disabled={printing}>
                    <Printer size={13} /> {printing ? "Generando..." : "Imprimir"}
                  </button>
                  <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/plan-parto`)}>
                    <Pencil size={13} /> Editar
                  </button>
                </div>
              </div>

              <SecTitle>Datos generales</SecTitle>
              <Grid cols={3}>
                <Row label="No. registro" value={exp.plan_parto.no_registro} />
                <Row label="Servicio de salud" value={exp.plan_parto.servicio_salud} />
                <Row label="Lugar residencia" value={exp.plan_parto.lugar_residencia} />
                <Row label="Fecha" value={fecha(exp.plan_parto.fecha)} />
                <Row label="Nombre cónyuge" value={exp.plan_parto.nombre_conyuge} />
                <Row label="Teléfono" value={exp.plan_parto.telefono} />
                <Row label="Fecha de nacimiento" value={fecha(exp.plan_parto.fecha_nacimiento)} />
                <Row label="Estado civil" value={exp.plan_parto.estado_civil} />
                <Row label="Pueblo" value={exp.plan_parto.pueblo} />
                <Row label="Escolaridad" value={exp.plan_parto.escolaridad} />
                <Row label="Con quién vive" value={exp.plan_parto.con_quien_vive} />
                <Row label="Idioma" value={exp.plan_parto.idioma} />
              </Grid>

              <div style={{ marginTop: "0.85rem" }}>
                <GridAuto>
                  <SiNo label="Atención prenatal" value={exp.plan_parto.ha_tenido_atencion_prenatal} />
                  <SiNo label="Casa materna cercana" value={exp.plan_parto.casa_materna_cercana} />
                  <SiNo label="Usará casa materna" value={exp.plan_parto.usara_casa_materna} />
                  <SiNo label="Ropa niño" value={exp.plan_parto.ropa_nino} />
                  <SiNo label="Ropa madre" value={exp.plan_parto.ropa_madre} />
                  <SiNo label="Lleva DPI madre" value={exp.plan_parto.lleva_dpi_madre} />
                  <SiNo label="Lleva DPI cónyuge" value={exp.plan_parto.lleva_dpi_conyuge} />
                  <SiNo label="Lleva partida" value={exp.plan_parto.lleva_partida_nacimiento} />
                  <SiNo label="Cuenta ahorro" value={exp.plan_parto.cuenta_ahorro} />
                  <SiNo label="Comité comunicado" value={exp.plan_parto.comunicado_comite} />
                </GridAuto>
              </div>

              <SecTitle style={{ marginTop: "1rem" }}>Resumen obstétrico</SecTitle>
              <Grid cols={4}>
                <Row label="No. embarazos" value={exp.plan_parto.no_embarazos} />
                <Row label="No. partos" value={exp.plan_parto.no_partos} />
                <Row label="No. abortos" value={exp.plan_parto.no_abortos} />
                <Row label="No. hijos vivos" value={exp.plan_parto.no_hijos_vivos} />
                <Row label="No. hijos muertos" value={exp.plan_parto.no_hijos_muertos} />
                <Row label="FUR" value={fecha(exp.plan_parto.fur)} />
                <Row label="FPP" value={fecha(exp.plan_parto.fecha_probable_parto)} />
                <Row label="No. cesáreas" value={exp.plan_parto.no_cesareas} />
                <Row label="Última cesárea" value={fecha(exp.plan_parto.fecha_ultima_cesarea)} />
                <Row label="Edad gestacional UR" value={exp.plan_parto.edad_gestacional_semanas} />
                <Row label="Edad gestacional AU" value={exp.plan_parto.edad_gestacional_au} />
              </Grid>

              <SecTitle style={{ marginTop: "1rem" }}>Logística y responsables</SecTitle>
              <Grid cols={3}>
                <Row label="Posición parto" value={exp.plan_parto.posicion_parto} />
                <Row label="Lugar atención parto" value={exp.plan_parto.lugar_atencion_parto} />
                <Row label="Cómo se trasladará" value={exp.plan_parto.como_trasladara} />
                <Row label="Acompaña traslado" value={exp.plan_parto.acompana_traslado} />
                <Row label="Acompaña parto" value={exp.plan_parto.acompana_parto} />
                <Row label="Horas distancia" value={exp.plan_parto.horas_distancia} />
                <Row label="Kms servicio" value={exp.plan_parto.kms_servicio} />
                <Row label="Con quién hijos" value={exp.plan_parto.con_quien_hijos} />
                <Row label="Quién cuida casa" value={exp.plan_parto.quien_cuida_casa} />
                <Row label="Teléfono vehículo" value={exp.plan_parto.telefono_vehiculo} />
                <Row label="Responsable activar" value={exp.plan_parto.responsable_activar} />
                <Row label="Nombre activa plan" value={exp.plan_parto.nombre_activara_plan} />
                <Row label="Proveedor salud" value={exp.plan_parto.nombre_proveedor_salud} />
              </Grid>

              <SecTitle style={{ marginTop: "1rem" }}>Signos de peligro</SecTitle>
              <GridAuto>
                <SiNo label="Dolor de cabeza" value={exp.plan_parto.peligro_dolor_cabeza} />
                <SiNo label="Visión borrosa" value={exp.plan_parto.peligro_vision_borrosa} />
                <SiNo label="Embarazo múltiple" value={exp.plan_parto.peligro_embarazo_multiple} />
                <SiNo label="Hemorragia vaginal" value={exp.plan_parto.peligro_hemorragia_vaginal} />
                <SiNo label="Edema MI" value={exp.plan_parto.peligro_edema_mi} />
                <SiNo label="Niño transverso" value={exp.plan_parto.peligro_nino_transverso} />
                <SiNo label="Dolor de estómago" value={exp.plan_parto.peligro_dolor_estomago} />
                <SiNo label="Salida de líquidos" value={exp.plan_parto.peligro_salida_liquidos} />
                <SiNo label="Convulsiones" value={exp.plan_parto.peligro_convulsiones} />
                <SiNo label="Fiebre" value={exp.plan_parto.peligro_fiebre} />
                <SiNo label="Ausencia movimientos fetales" value={exp.plan_parto.peligro_ausencia_mov_fetales} />
                <SiNo label="Placenta no salió" value={exp.plan_parto.peligro_placenta_no_salia} />
              </GridAuto>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: VACUNAS
      ══════════════════════════════════════════ */}
      {tab === "vacunas" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
            <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/vacunas/nuevo`)}>
              <Plus size={14} /> Registrar vacuna
            </button>
          </div>
          {!exp.vacunas?.length ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
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
                    <th>Acciones</th>
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
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button className="btn-secondary" onClick={() => navigate(`/pacientes/${id}/vacunas/${v.id}/editar`)}>
                            <Pencil size={13} /> Editar
                          </button>
                          <button className="btn-secondary" onClick={() => eliminarRegistro("¿Eliminar esta vacuna?", `/pacientes/${id}/vacunas/${v.id}`)}>
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: LABORATORIOS
      ══════════════════════════════════════════ */}
      {tab === "laboratorio" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {!exp.controles_prenatales?.some(c =>
            c.hematologia_realizada || c.glicemia_realizada || c.orina_realizada ||
            c.vih_realizado || c.vdrl_realizado || c.hepatitis_b_realizado
          ) ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No hay resultados de laboratorio registrados.
            </div>
          ) : (
            exp.controles_prenatales
              .filter(c =>
                c.hematologia_realizada || c.glicemia_realizada || c.grupo_rh_realizado ||
                c.orina_realizada || c.heces_realizada || c.vih_realizado ||
                c.vdrl_realizado || c.torch_realizado || c.papanicolau_ivaa_realizado ||
                c.hepatitis_b_realizado || c.usg_realizado
              )
              .map((ctrl) => (
                <div className="card" key={ctrl.id}>
                  <div style={{ marginBottom: "0.85rem" }}>
                    <span className="badge badge-blue">Control {ctrl.numero_control}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.75rem" }}>{fecha(ctrl.fecha)}</span>
                  </div>
                  <Grid cols={3}>
                    {ctrl.hematologia_realizada     && <Row label="Hematología"       value={ctrl.hematologia_resultado} />}
                    {ctrl.glicemia_realizada         && <Row label="Glicemia en ayunas" value={ctrl.glicemia_resultado} />}
                    {ctrl.grupo_rh_realizado         && <Row label="Grupo y RH"        value={ctrl.grupo_rh_resultado} />}
                    {ctrl.orina_realizada            && <Row label="Orina" value={[ctrl.orina_bacteriuria && "Bacteriuria+", ctrl.orina_proteinuria && "Proteinuria+"].filter(Boolean).join(" / ") || "Realizada"} />}
                    {ctrl.heces_realizada            && <Row label="Heces"             value={ctrl.heces_resultado} />}
                    {ctrl.vih_realizado              && <Row label="VIH"               value={ctrl.vih_resultado} />}
                    {ctrl.vdrl_realizado             && <Row label="VDRL/RPR"          value={ctrl.vdrl_resultado} />}
                    {ctrl.torch_realizado            && <Row label="TORCH"             value={ctrl.torch_resultado_positivo ? "Positivo" : "Negativo"} />}
                    {ctrl.papanicolau_ivaa_realizado && <Row label="Papanicolau/IVAA"  value={ctrl.papanicolau_ivaa_resultado} />}
                    {ctrl.hepatitis_b_realizado      && <Row label="Hepatitis B"       value={ctrl.hepatitis_b_resultado} />}
                    {ctrl.usg_realizado              && <Row label="USG" value={ctrl.usg_hallazgos || "Realizado"} />}
                  </Grid>
                  {ctrl.vdrl_resultado === "positivo" && ctrl.vdrl_tratamiento_indicado && (
                    <div style={{ marginTop: "0.6rem", padding: "0.5rem 0.75rem", background: "var(--warn-lt)", borderRadius: 6, fontSize: "0.8rem", color: "var(--warn)", fontWeight: 600 }}>
                      ⚠ VDRL positivo — Tratamiento indicado a pareja
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}

    </div>
  );
}
