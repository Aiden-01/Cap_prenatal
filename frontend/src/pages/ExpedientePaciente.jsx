import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useGlobalToast } from "../components/Layout";
import {
  ChevronLeft, Plus, AlertTriangle, CheckCircle,
  Syringe, Activity, FlaskConical, Baby, FileText
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

  useEffect(() => {
    api.get(`/pacientes/${id}/expediente`)
      .then(({ data }) => setExp(data))
      .catch(() => toast("Error al cargar expediente", "error"))
      .finally(() => setLoading(false));
  }, [id]);

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

  const TABS = [
    { id: "general",    label: "Datos generales",                          icon: FileText     },
    { id: "controles",  label: `Controles (${exp.controles_prenatales?.length ?? 0})`, icon: Activity     },
    { id: "puerperio",  label: `Puerperio (${exp.controles_puerperio?.length ?? 0})`,  icon: Baby         },
    { id: "morbilidad", label: `Morbilidad (${exp.morbilidad?.length ?? 0})`,          icon: Plus         },
    { id: "riesgo",     label: "Riesgo obstétrico",                        icon: AlertTriangle },
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
            {p.cui && <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>CUI: {p.cui}</span>}
            {p.fur  && <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>FUR: {fecha(p.fur)}</span>}
            {p.fpp  && <span style={{ color: "var(--accent)", fontSize: "0.82rem", fontWeight: 600 }}>FPP: {fecha(p.fpp)}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Plus size={14} /> Control
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
              <Row label="Hijos que viven"   value={p.hijos_viven} />
              <Row label="Muertos < 1 sem"   value={p.muertos_antes_1sem} />
              <Row label="Muertos > 1 sem"   value={p.muertos_despues_1sem} />
            </Grid>
            <div style={{ marginTop: "0.85rem" }}>
              <GridAuto>
                <SiNo label="Cirugía génito-urinaria" value={p.cirugia_genito_urinaria} />
                <SiNo label="Infertilidad"            value={p.infertilidad} />
                <SiNo label="RN anterior < 2500g"     value={p.rn_menor_2500g} />
                <SiNo label="RN anterior ≥ 4000g"     value={p.rn_mayor_4000g} />
                <SiNo label="Antec. VIH+"             value={p.antec_vih_positivo} />
                <SiNo label="Antec. emb. ectópico"    value={p.antec_emb_ectopico} />
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
              <SiNo label="Gemelares"  value={p.fam_gemelos} />
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
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    {fecha(ctrl.fecha)}{ctrl.hora ? ` — ${ctrl.hora}` : ""}
                  </span>
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
          {exp.controles_puerperio?.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              No hay atenciones de puerperio registradas.
            </div>
          ) : (
            exp.controles_puerperio.map((pu) => (
              <div className="card" key={pu.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span className="badge badge-blue">{pu.numero_atencion === 1 ? "1ª Atención" : "2ª Atención"} — Puerperio</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{fecha(pu.fecha)}</span>
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
          {exp.morbilidad?.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              No hay consultas intercurrentes registradas.
            </div>
          ) : (
            exp.morbilidad.map((m) => (
              <div className="card" key={m.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9rem" }}>{m.motivo_consulta}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    {fecha(m.fecha)}{m.hora ? ` — ${m.hora}` : ""}
                  </span>
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
                {exp.ficha_riesgo.tiene_riesgo
                  ? <span className="badge badge-red">⚠ PRESENTA RIESGO</span>
                  : <span className="badge badge-green"><CheckCircle size={11} /> SIN RIESGO</span>}
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

      {/* ══════════════════════════════════════════
          TAB: VACUNAS
      ══════════════════════════════════════════ */}
      {tab === "vacunas" && (
        <div className="card">
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