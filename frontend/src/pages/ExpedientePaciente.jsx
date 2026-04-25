import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";

function Row({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: "0.9rem", color: "var(--text)", fontWeight: 400 }}>{String(value)}</span>
    </div>
  );
}

function SiNo({ label, value }) {
  if (value === undefined || value === null) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ width: 16, height: 16, borderRadius: 4, background: value ? "var(--accent)" : "var(--border)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {value && <span style={{ color: "#fff", fontSize: "0.6rem", fontWeight: 700 }}>✓</span>}
      </span>
      <span style={{ fontSize: "0.85rem", color: value ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

export default function ExpedientePaciente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exp, setExp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("general");

  useEffect(() => {
    api.get(`/pacientes/${id}/expediente`)
      .then(({ data }) => setExp(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: "2rem", color: "var(--text-muted)" }}>Cargando expediente...</div>;
  if (!exp) return <div style={{ padding: "2rem", color: "var(--danger)" }}>Paciente no encontrada.</div>;

  const p = exp.paciente;
  const fpp = p.fur ? new Date(new Date(p.fur).getTime() + 280 * 86400000) : null;

  const TABS = [
    { id: "general", label: "Primera consulta" },
    { id: "controles", label: `Controles (${exp.controles_prenatales.length})` },
    { id: "riesgo", label: "Riesgo obstétrico" },
    { id: "laboratorio", label: "Laboratorio" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem" }}>
        <button className="btn-secondary" onClick={() => navigate("/pacientes")}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>{p.nombre}</h1>
            {exp.ficha_riesgo?.tiene_riesgo && <span className="badge badge-red">⚠ Riesgo obstétrico</span>}
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: 6, flexWrap: "wrap" }}>
            <span className="badge badge-blue">HC: {p.no_historia_clinica}</span>
            {p.edad && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{p.edad} años</span>}
            {p.fur && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>FUR: {new Date(p.fur).toLocaleDateString("es-GT")}</span>}
            {fpp && <span style={{ color: "var(--accent)", fontSize: "0.85rem", fontWeight: 600 }}>FPP: {fpp.toLocaleDateString("es-GT")}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}>+ Control</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "2px solid var(--border)", marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "0.6rem 1.2rem", border: "none", background: "transparent",
            borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
            marginBottom: -2, color: tab === t.id ? "var(--primary)" : "var(--text-muted)",
            fontFamily: "DM Sans", fontSize: "0.88rem", fontWeight: tab === t.id ? 600 : 400,
            cursor: "pointer", transition: "all 0.15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Primera consulta */}
      {tab === "general" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <div className="card">
            <h3 style={{ fontFamily: "Syne", marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Datos Generales</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
              <Row label="Servicio de salud" value={p.nombre_servicio_salud} />
              <Row label="Ãrea de salud" value={p.area_salud} />
              <Row label="Lugar de residencia" value={p.lugar_residencia} />
              <Row label="Grupo Ã©tnico" value={p.grupo_etnico} />
              <Row label="Motivo de consulta" value={p.motivo_consulta} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontFamily: "Syne", marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Antecedentes Obstétricos</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem" }}>
              <Row label="# Embarazos" value={p.no_embarazos} />
              <Row label="# Partos eutócicos" value={p.no_partos_eutocicos} />
              <Row label="# Partos distócicos" value={p.no_partos_distocicos} />
              <Row label="# Cesáreas" value={p.no_cesarea} />
              <Row label="# Abortos" value={p.no_abortos} />
              <Row label="Muerte fetal/neonatal" value={p.muerte_fetal_neonatal} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontFamily: "Syne", marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Signos Vitales</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem" }}>
              <Row label="P/A" value={p.pa_sistolica && p.pa_diastolica ? `${p.pa_sistolica}/${p.pa_diastolica} mmHg` : null} />
              <Row label="Temperatura" value={p.temperatura ? `${p.temperatura}Â°C` : null} />
              <Row label="Peso" value={p.peso_lbs ? `${p.peso_lbs} lbs` : null} />
              <Row label="Talla" value={p.talla_cm ? `${p.talla_cm} cm` : null} />
              <Row label="FC" value={p.frecuencia_cardiaca ? `${p.frecuencia_cardiaca} x min` : null} />
              <Row label="Respiraciones" value={p.respiraciones ? `${p.respiraciones} x min` : null} />
              <Row label="Circ. brazo" value={p.circunferencia_brazo_cm ? `${p.circunferencia_brazo_cm} cm` : null} />
              <Row label="IMC" value={p.imc} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontFamily: "Syne", marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>Antecedentes Patológicos</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.75rem" }}>
              <SiNo label="Tuberculosis" value={p.tuberculosis} />
              <SiNo label="Cáncer" value={p.cancer} />
              <SiNo label="Asma bronquial" value={p.asma_bronquial} />
              <SiNo label="Diabetes" value={p.diabetes} />
              <SiNo label="Hipertensión" value={p.hipertension_arterial} />
              <SiNo label="Cardiopatía" value={p.cardiopatia} />
              <SiNo label="ITS/VIH/Sida" value={p.its_vih_sida} />
              <SiNo label="Sífilis positivo" value={p.sifilis_positivo} />
              <SiNo label="Chagas" value={p.chagas} />
              <SiNo label="Enfermedad mental" value={p.enfermedad_mental} />
            </div>
          </div>

          {(p.impresion_clinica || p.tratamiento || p.consejeria) && (
            <div className="card">
              <h3 style={{ fontFamily: "Syne", marginBottom: "1rem", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)" }}>IC / Tx / Plan</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <Row label="Impresión Clínica" value={p.impresion_clinica} />
                <Row label="Tratamiento" value={p.tratamiento} />
                <Row label="Consejería" value={p.consejeria} />
                <Row label="Plan de parto" value={p.plan_parto} />
                <Row label="Plan de emergencia" value={p.plan_emergencia} />
                <Row label="Cita siguiente" value={p.cita_siguiente ? new Date(p.cita_siguiente).toLocaleDateString("es-GT") : null} />
                <Row label="Personal que atendió" value={p.personal_atendio} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Controles */}
      {tab === "controles" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {exp.controles_prenatales.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              No hay controles registrados.
              <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/controles/nuevo`)}>+ Registrar 1er control</button>
              </div>
            </div>
          ) : (
            exp.controles_prenatales.map((ctrl) => (
              <div className="card" key={ctrl.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span className="badge badge-blue" style={{ fontSize: "0.85rem", padding: "0.3rem 0.9rem" }}>Control {ctrl.numero_control}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{new Date(ctrl.fecha).toLocaleDateString("es-GT")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.75rem" }}>
                  <Row label="P/A" value={ctrl.pa_sistolica ? `${ctrl.pa_sistolica}/${ctrl.pa_diastolica}` : null} />
                  <Row label="Temperatura" value={ctrl.temperatura ? `${ctrl.temperatura}Â°C` : null} />
                  <Row label="Peso" value={ctrl.peso_kg ? `${ctrl.peso_kg} kg` : null} />
                  <Row label="AU" value={ctrl.au_cm ? `${ctrl.au_cm} cm` : null} />
                  <Row label="FCF" value={ctrl.fcf ? `${ctrl.fcf} lpm` : null} />
                  <Row label="Semanas gest." value={ctrl.edad_embarazo_semanas ? `${ctrl.edad_embarazo_semanas} sem` : null} />
                  <Row label="Cita siguiente" value={ctrl.cita_siguiente ? new Date(ctrl.cita_siguiente).toLocaleDateString("es-GT") : null} />
                  <Row label="Personal" value={ctrl.personal_atendio} />
                </div>
                {ctrl.impresion_clinica && <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}><Row label="Impresión Clínica" value={ctrl.impresion_clinica} /></div>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Riesgo */}
      {tab === "riesgo" && (
        <div className="card">
          {!exp.ficha_riesgo ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No hay ficha de riesgo registrada.
              <div style={{ marginTop: "1rem" }}>
                <button className="btn-primary" onClick={() => navigate(`/pacientes/${id}/riesgo`)}>Registrar ficha de riesgo</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <h3 style={{ fontFamily: "Syne", fontSize: "1rem", fontWeight: 700 }}>Ficha de Riesgo Obstétrico</h3>
                {exp.ficha_riesgo.tiene_riesgo
                  ? <span className="badge badge-red">⚠ PRESENTA RIESGO</span>
                  : <span className="badge badge-green">✓ SIN RIESGO</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.6rem" }}>
                <SiNo label="Muerte fetal/neonatal previa" value={exp.ficha_riesgo.muerte_fetal_neonatal_previa} />
                <SiNo label="3+ abortos espontáneos" value={exp.ficha_riesgo.abortos_espontaneos_3mas} />
                <SiNo label="Menor de 20 años" value={exp.ficha_riesgo.menor_20_anos} />
                <SiNo label="Mayor de 35 años" value={exp.ficha_riesgo.mayor_35_anos} />
                <SiNo label="Embarazo múltiple" value={exp.ficha_riesgo.embarazo_multiple} />
                <SiNo label="Paciente Rh (-)" value={exp.ficha_riesgo.paciente_rh_negativo} />
                <SiNo label="Hemorragia vaginal" value={exp.ficha_riesgo.hemorragia_vaginal} />
                <SiNo label="VIH positivo / Sífilis" value={exp.ficha_riesgo.vih_positivo_sifilis} />
                <SiNo label="Presión diastólica ≥ 90" value={exp.ficha_riesgo.presion_diastolica_90mas} />
                <SiNo label="Anemia" value={exp.ficha_riesgo.anemia} />
                <SiNo label="Diabetes" value={exp.ficha_riesgo.diabetes} />
                <SiNo label="Hipertensión arterial" value={exp.ficha_riesgo.hipertension_arterial} />
              </div>
              {exp.ficha_riesgo.referida_a && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--warn-lt)", borderRadius: 8 }}>
                  <span style={{ color: "var(--warn)", fontWeight: 600, fontSize: "0.85rem" }}>Referida a: </span>
                  <span style={{ fontSize: "0.85rem" }}>{exp.ficha_riesgo.referida_a}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Laboratorio */}
      {tab === "laboratorio" && (
        <div className="card">
          {exp.laboratorio.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No hay resultados de laboratorio registrados.
            </div>
          ) : (
            exp.laboratorio.map((lab) => (
              <div key={lab.id} style={{ marginBottom: "1.5rem" }}>
                <h4 style={{ fontFamily: "Syne", fontSize: "0.85rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
                  Control {lab.numero_control}
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem" }}>
                  {lab.numero_control === 1 && (<>
                    <Row label="Orina" value={lab.orina_1} />
                    <Row label="Heces" value={lab.heces_1} />
                    <Row label="Hematología" value={lab.hematologia_1} />
                    <Row label="Glicemia en ayunas" value={lab.glicemia_ayunas_1} />
                    <Row label="Grupo y Rh" value={lab.grupo_rh_1} />
                    <Row label="VDRL/RPR" value={lab.vdrl_rpr_1} />
                    <Row label="Resultado VIH" value={lab.resultado_vih_1} />
                    <Row label="Hepatitis B" value={lab.hepatitis_b_1} />
                    <Row label="Papanicolaou/IVAA" value={lab.papanicolaou_ivaa_1} />
                    <Row label="TORCH" value={lab.torch_1} />
                  </>)}
                  {lab.numero_control === 2 && (<>
                    <Row label="Orina" value={lab.orina_2} />
                    <Row label="Glicemia en ayunas" value={lab.glicemia_ayunas_2} />
                    <Row label="Oferta VIH" value={lab.oferta_vih_2} />
                    <Row label="VDRL/RPR" value={lab.vdrl_rpr_2} />
                    <Row label="Hepatitis B" value={lab.hepatitis_b_2} />
                  </>)}
                  {lab.numero_control === 3 && (<>
                    <Row label="Hematología" value={lab.hematologia_3} />
                    <Row label="Orina" value={lab.orina_3} />
                    <Row label="Glicemia en ayunas" value={lab.glicemia_ayunas_3} />
                  </>)}
                  {lab.numero_control === 4 && (<>
                    <Row label="Orina" value={lab.orina_4} />
                    <Row label="Glicemia en ayunas" value={lab.glicemia_ayunas_4} />
                    <Row label="Oferta VIH" value={lab.oferta_vih_4} />
                    <Row label="VDRL/RPR" value={lab.vdrl_rpr_4} />
                    <Row label="Hepatitis B" value={lab.hepatitis_b_4} />
                  </>)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
