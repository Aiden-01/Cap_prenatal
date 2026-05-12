import { useState } from "react";
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Download,
  Loader2
} from "lucide-react";
import api from "../api/axios";

export default function Reportes() {
  const hoy = new Date();
  const MODO_PRIMER_CONTROL = "primer_control";
  const MODO_GENERAL = "general";

  const [desde, setDesde] = useState(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString()
      .split("T")[0]
  );

  const [hasta, setHasta] = useState(
    hoy.toISOString().split("T")[0]
  );

  const [censo, setCenso] = useState(null);
  const [modoCenso, setModoCenso] = useState(MODO_PRIMER_CONTROL);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [descargado, setDescargado] = useState(false);
  const [error, setError] = useState("");

  const cargar = async (modo = MODO_PRIMER_CONTROL) => {
    setLoading(true);
    setError("");
    setCenso(null);
    setModoCenso(modo);

    try {
      if (new Date(desde) > new Date(hasta)) {
        setError("La fecha 'Desde' no puede ser mayor que 'Hasta'.");
        return;
      }

      const endpoint =
        modo === MODO_PRIMER_CONTROL
          ? "/reportes/censo/primer-control"
          : "/reportes/censo";

      const { data } = await api.get(endpoint, {
        params: { desde, hasta },
      });

      setCenso(data);
    } catch (err) {
      setError(err.response?.data?.error || "Error al generar el censo.");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 DESCARGA PRO
  const exportar = async () => {
    setDownloading(true);
    setDescargado(false);

    try {
      const endpoint =
        modoCenso === MODO_PRIMER_CONTROL
          ? "/reportes/censo/primer-control/excel"
          : "/reportes/censo/excel";

      const res = await api.get(endpoint, {
        params: { desde, hasta },
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        modoCenso === MODO_PRIMER_CONTROL
          ? `censo_primer_control_${desde}_${hasta}.xlsx`
          : `censo_${desde}_${hasta}.xlsx`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setDescargado(true);

      // 🔥 reset animación
      setTimeout(() => setDescargado(false), 2000);

    } catch {
      setError("Error descargando Excel");
    } finally {
      setDownloading(false);
    }
  };

  const labelPeriodo = `${new Date(desde + "T00:00:00").toLocaleDateString("es-GT")} — ${new Date(hasta + "T00:00:00").toLocaleDateString("es-GT")}`;
  const esPrimerControl = modoCenso === MODO_PRIMER_CONTROL;
  const tituloCenso = esPrimerControl
    ? "Censo mensual de embarazadas"
    : "Censo actual de embarazadas";
  const descripcionCenso = esPrimerControl
    ? "Tomando únicamente el primer control prenatal de cada embarazo en el período seleccionado."
    : "Pacientes registradas en el período seleccionado.";

  // 🎯 SEMÁFORO
  const getRiesgo = (p) => {
    if (p.tiene_riesgo) return "alto";
    if (p.edad < 20 || p.edad > 35) return "medio";
    return "bajo";
  };

  const renderRiesgo = (p) => {
    const nivel = getRiesgo(p);

    if (nivel === "alto") {
      return (
        <span className="badge badge-red">
          <AlertTriangle size={12} /> Alto
        </span>
      );
    }

    if (nivel === "medio") {
      return (
        <span className="badge badge-yellow">
          <AlertTriangle size={12} /> Medio
        </span>
      );
    }

    return (
      <span className="badge badge-green">
        <CheckCircle size={12} /> Bajo
      </span>
    );
  };

  return (
    <div className="reportes-page">
      <div className="reportes-titlebar">
        <div>
          <span className="reportes-kicker">Ministerio de Salud Pública y Asistencia Social</span>
          <h1>Reportes y estadísticas</h1>
          <p>Censo nominal de mujeres embarazadas por periodo seleccionado.</p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="card reportes-filter-card">
        <div className="reportes-section-heading">
          <div>
            <span className="reportes-kicker">Módulo de reportes</span>
            <h2>Censo de mujeres embarazadas</h2>
          </div>
          <span className="reportes-periodo">{labelPeriodo}</span>
        </div>

        <div className="reportes-filtros">
          
          <div className="form-group">
            <label className="input-label">Desde</label>
            <input
              type="date"
              className="input-field"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="input-label">Hasta</label>
            <input
              type="date"
              className="input-field"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>

          <button
            className="btn-primary"
            onClick={() => cargar(MODO_PRIMER_CONTROL)}
            disabled={loading}
          >
            <Search size={15} />
            {loading && esPrimerControl ? "Generando..." : "Generar censo mensual"}
          </button>

          <button
            className="btn-secondary"
            onClick={() => cargar(MODO_GENERAL)}
            disabled={loading}
          >
            <Search size={15} />
            {loading && !esPrimerControl ? "Generando..." : "Ver censo actual"}
          </button>

          {/* 🔥 BOTÓN PRO */}
          <button
            className={`btn-secondary btn-download ${descargado ? "done" : ""}`}
            onClick={exportar}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="spin" size={15} />
            ) : descargado ? (
              "✔ Descargado"
            ) : (
              <>
                <Download size={15} />
                Excel
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}
      </div>

      {/* RESULTADO */}
      {censo && (
        <div className="card reportes-censo-card">
          
          <div className="card-header reportes-card-header">
            <div>
              <h3>{tituloCenso} — {labelPeriodo}</h3>
              <p>{descripcionCenso}</p>
            </div>

            <div className="reportes-header-actions">
              <span className="badge badge-blue">
                {censo.total} paciente{censo.total !== 1 ? "s" : ""}
              </span>
              <div className="reportes-semaforo">
                <span><i className="riesgo-dot riesgo-alto" /> Alto</span>
                <span><i className="riesgo-dot riesgo-medio" /> Medio</span>
                <span><i className="riesgo-dot riesgo-bajo" /> Bajo</span>
              </div>
            </div>
          </div>

          {censo.total === 0 ? (
            <div className="empty">
              {esPrimerControl
                ? "No se encontraron primeros controles de embarazo en este período."
                : "No se encontraron pacientes en este período."}
            </div>
          ) : (
            <div className="tabla-wrapper reportes-tabla-wrapper">
              <table className="tabla reportes-tabla">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>No. Historia</th>
                    <th>Nombre</th>
                    <th>Edad</th>
                    <th>Etnia</th>
                    <th>FUR</th>
                    <th>FPP</th>
                    <th>Sem.</th>
                    <th>Emb.</th>
                    <th>Partos</th>
                    <th>Abortos</th>
                    <th>Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {censo.pacientes.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>{p.no_historia_clinica || p.no_expediente || "—"}</td>
                      <td>{p.nombre_completo}</td>
                      <td>{p.edad ?? "—"}</td>
                      <td>{p.grupo_etnico ?? "—"}</td>
                      <td>{p.fur ? new Date(p.fur).toLocaleDateString("es-GT") : "—"}</td>
                      <td>{(p.fecha_probable_parto || p.fpp) ? new Date(p.fecha_probable_parto || p.fpp).toLocaleDateString("es-GT") : "—"}</td>
                      <td>{p.semanas_gestacion ?? "—"}</td>
                      <td>{p.no_embarazos ?? "—"}</td>
                      <td>{p.no_partos ?? "—"}</td>
                      <td>{p.no_abortos ?? "—"}</td>
                      <td>{renderRiesgo(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
