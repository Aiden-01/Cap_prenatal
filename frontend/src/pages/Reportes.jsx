import { useState } from "react";
import api from "../api/axios";

export default function Reportes() {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [censo, setCenso] = useState(null);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reportes/censo", { params: { mes, anio } });
      setCenso(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  return (
    <div>
      <h1 style={{ fontSize: "1.6rem", fontWeight: 800, marginBottom: "1.75rem" }}>Reportes y EstadÃ­sticas</h1>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontFamily: "Syne", fontSize: "1rem", marginBottom: "1.25rem" }}>Censo Mensual de Mujeres Embarazadas</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
          <div className="form-group">
            <label className="input-label">Mes</label>
            <select className="input-field" style={{ width: 160 }} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="input-label">AÃ±o</label>
            <input className="input-field" type="number" style={{ width: 100 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </div>
          <button className="btn-primary" onClick={cargar} disabled={loading}>{loading ? "Cargando..." : "Generar censo"}</button>
        </div>
      </div>

      {censo && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontFamily: "Syne", fontSize: "0.95rem" }}>
              Censo â€” {MESES[mes-1]} {anio}
            </h3>
            <span className="badge badge-blue">{censo.total} pacientes</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>No. Historia</th>
                  <th>Nombre</th>
                  <th>Edad</th>
                  <th>Etnia</th>
                  <th>FUR</th>
                  <th>FPP</th>
                  <th>Sem. gest.</th>
                  <th>Embarazos</th>
                  <th>Partos</th>
                  <th>Abortos</th>
                  <th>Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {censo.pacientes.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                    <td><span className="badge badge-blue" style={{ fontSize: "0.75rem" }}>{p.no_historia_clinica}</span></td>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{p.nombre}</td>
                    <td>{p.edad ?? "â€”"}</td>
                    <td style={{ color: "var(--text-muted)" }}>{p.grupo_etnico ?? "â€”"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{p.fur ? new Date(p.fur).toLocaleDateString("es-GT") : "â€”"}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--accent)", fontWeight: 500 }}>{p.fecha_probable_parto ? new Date(p.fecha_probable_parto).toLocaleDateString("es-GT") : "â€”"}</td>
                    <td>{p.semanas_gestacion ?? "â€”"}</td>
                    <td>{p.no_embarazos ?? "â€”"}</td>
                    <td>{p.no_partos ?? "â€”"}</td>
                    <td>{p.no_abortos ?? "â€”"}</td>
                    <td>{p.tiene_riesgo ? <span className="badge badge-red">âš  SÃ­</span> : <span className="badge badge-green">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
