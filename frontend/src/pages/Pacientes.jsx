import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  UserPlus,
} from "lucide-react";
import api from "../api/axios";

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const MS_DAY = 86400000;

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("es-GT") : "—";
}

function titleCase(value) {
  if (!value) return "Cerrado";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getEstadoBadge(estado) {
  if (estado === "activo") return "badge-green";
  if (estado === "puerperio") return "badge-blue";
  return "badge";
}

function getFppInfo(paciente) {
  const fppValue = paciente.embarazo_fpp || paciente.fpp;
  const furValue = paciente.embarazo_fur || paciente.fur;
  const fpp = fppValue
    ? new Date(fppValue)
    : furValue
      ? new Date(new Date(furValue).getTime() + 280 * MS_DAY)
      : null;

  if (!fpp) {
    return {
      label: "—",
      color: "var(--text-muted)",
      title: "Fecha probable de parto: sin dato",
      urgent: false,
    };
  }

  const daysRemaining = Math.ceil((fpp.getTime() - Date.now()) / MS_DAY);
  const weeksRemaining = Math.max(0, Math.ceil(daysRemaining / 7));
  const title = `${weeksRemaining} semanas para la fecha probable de parto`;

  if (weeksRemaining < 4) {
    return {
      label: formatDate(fpp),
      color: "var(--danger)",
      title,
      urgent: true,
    };
  }

  if (weeksRemaining < 8) {
    return {
      label: formatDate(fpp),
      color: "var(--warn)",
      title,
      urgent: false,
    };
  }

  return {
    label: formatDate(fpp),
    color: "var(--text)",
    title,
    urgent: false,
  };
}

const detailLabelStyle = {
  display: "block",
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0,
};

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [total, setTotal] = useState(0);
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [expandida, setExpandida] = useState(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState("");
  const navigate = useNavigate();
  const queryKey = JSON.stringify([buscar, pagina, limite]);
  const loading = loadedQueryKey !== queryKey;

  useEffect(() => {
    let cancelado = false;
    const currentQueryKey = JSON.stringify([buscar, pagina, limite]);

    api.get("/pacientes", { params: { buscar, pagina, limite } })
      .then(({ data }) => {
        if (!cancelado) {
          setPacientes(data.data);
          setTotal(data.total);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelado) setLoadedQueryKey(currentQueryKey);
      });

    return () => { cancelado = true; };
  }, [buscar, pagina, limite]);

  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const fin = Math.min(pagina * limite, total);

  return (
    <div className="patients-page">
      <div className="patients-header">
        <div>
          <h1>Pacientes</h1>
          <p>
            {total} paciente{total !== 1 ? "s" : ""} registrada{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => navigate("/nuevo")}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <UserPlus size={15} /> Nueva paciente
        </button>
      </div>

      <div className="card patients-search-card">
        <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          className="input-field"
          placeholder="Buscar por nombre, apellido, No. expediente o CUI..."
          value={buscar}
          onChange={(e) => { setBuscar(e.target.value); setPagina(1); }}
        />
      </div>

      <div className="card patients-table-card">
        {loading ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando...</div>
        ) : pacientes.length === 0 ? (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)" }}>
            No se encontraron pacientes.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>No. Expediente</th>
                  <th>Paciente</th>
                  <th>Estado</th>
                  <th>FUR</th>
                  <th>FPP (est.)</th>
                  <th aria-label="Detalle"></th>
                </tr>
              </thead>
              <tbody>
                {pacientes.map((p) => {
                  const fppInfo = getFppInfo(p);
                  const abierta = expandida === p.id;
                  const estado = p.embarazo_estado || "cerrado";

                  return (
                    <Fragment key={p.id}>
                      <tr style={{ cursor: "pointer" }} onClick={() => navigate(`/pacientes/${p.id}`)}>
                        <td>
                          <span className="badge badge-blue">{p.no_expediente}</span>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                            <strong style={{ color: "var(--text)", fontSize: "0.92rem" }}>{p.nombres || "—"}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>{p.apellidos || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                            <span className={`badge ${getEstadoBadge(estado)}`}>{titleCase(estado)}</span>
                            {p.tiene_riesgo && <span className="badge badge-red">Riesgo obstétrico</span>}
                          </div>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          {formatDate(p.embarazo_fur || p.fur)}
                        </td>
                        <td>
                          <span
                            title={fppInfo.title}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              color: fppInfo.color,
                              fontWeight: 700,
                              fontSize: "0.82rem",
                            }}>
                            {fppInfo.urgent && <AlertTriangle size={13} />}
                            {fppInfo.label}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            title={abierta ? "Ocultar detalle" : "Mostrar detalle"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandida(abierta ? null : p.id);
                            }}
                            style={{ padding: "0.4rem", minWidth: 34 }}>
                            {abierta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        </td>
                      </tr>
                      {abierta && (
                        <tr onClick={(e) => e.stopPropagation()}>
                          <td
                            colSpan={6}
                            className="patients-expanded-cell">
                            <div className="patients-detail-grid">
                              <div>
                                <span style={detailLabelStyle}>Municipio</span>
                                <strong style={{ color: "var(--text)", fontSize: "0.88rem" }}>{p.municipio || "—"}</strong>
                              </div>
                              <div>
                                <span style={detailLabelStyle}>Registrada</span>
                                <strong style={{ color: "var(--text)", fontSize: "0.88rem" }}>{formatDate(p.created_at)}</strong>
                              </div>
                              <div>
                                <span style={detailLabelStyle}>Comunidad</span>
                                <strong style={{ color: "var(--text)", fontSize: "0.88rem" }}>{p.comunidad || "—"}</strong>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="patients-footer">
            <span style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>
              Mostrando {inicio}-{fin} de {total} pacientes
            </span>
            <div className="patients-footer-actions">
              <select
                className="input-field"
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPagina(1);
                }}
                style={{ margin: 0, width: 92, padding: "0.5rem 0.65rem" }}>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <button className="btn-secondary" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}>
                <ChevronLeft size={15} /> Anterior
              </button>
              <span style={{ padding: "0.5rem 0.75rem", fontSize: "0.83rem", color: "var(--text-muted)" }}>
                {pagina} / {totalPaginas}
              </span>
              <button className="btn-secondary" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
                Siguiente <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
