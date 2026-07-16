import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Baby,
  CheckCircle,
  Clock3,
  Download,
  FileText,
  Loader2,
  MapPinned,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../utils/errorMessage";
import {
  getDefaultReportPeriod,
  getReportRiskLevel,
  REPORTES,
  safeDownloadFilename,
} from "../utils/reportes";

const REPORT_OPTIONS = [
  {
    id: REPORTES.PRIMER_CONTROL,
    title: "Captadas en primer control",
    description: "Reporte mensual principal",
    Icon: Users,
    principal: true,
  },
  {
    id: REPORTES.ACTIVOS,
    title: "Embarazos activos",
    description: "Fotografía actual",
    Icon: Activity,
  },
  {
    id: REPORTES.PROXIMAS_PARTO,
    title: "Próximas a dar a luz",
    description: "Siguientes 30 días",
    Icon: Baby,
  },
  {
    id: REPORTES.SIN_CONTROL,
    title: "Sin control reciente",
    description: "Más de 28 días",
    Icon: Clock3,
  },
  {
    id: REPORTES.RIESGO,
    title: "Riesgo obstétrico",
    description: "Ficha positiva",
    Icon: ShieldAlert,
  },
  {
    id: REPORTES.COMUNIDADES,
    title: "Resumen por comunidad",
    description: "Seguimiento territorial",
    Icon: MapPinned,
  },
];

const ENDPOINTS = {
  [REPORTES.PRIMER_CONTROL]: "/reportes/censo/primer-control",
  [REPORTES.ACTIVOS]: "/reportes/censo",
  [REPORTES.PROXIMAS_PARTO]: "/reportes/proximas-a-parir",
  [REPORTES.SIN_CONTROL]: "/reportes/sin-control-reciente",
  [REPORTES.RIESGO]: "/reportes/pacientes-riesgo",
  [REPORTES.COMUNIDADES]: "/reportes/resumen-comunidades",
};

function formatDateGt(value) {
  if (!value) return "—";
  const dateOnly = String(value).split("T")[0];
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString("es-GT");
}

function RiskBadge({ paciente, officialOnly = false }) {
  const level = officialOnly ? "alto" : getReportRiskLevel(paciente);
  if (level === "alto") {
    return <span className="badge badge-red"><AlertTriangle size={12} /> Alto</span>;
  }
  if (level === "medio") {
    return <span className="badge badge-yellow"><AlertTriangle size={12} /> Medio</span>;
  }
  return <span className="badge badge-green"><CheckCircle size={12} /> Bajo</span>;
}

function EmptyReport({ children }) {
  return <div className="empty reportes-empty">{children}</div>;
}

function ReportTable({ children }) {
  return <div className="tabla-wrapper reportes-tabla-wrapper"><table className="tabla reportes-tabla">{children}</table></div>;
}

function SummaryCards({ values }) {
  if (!values) return null;
  const cards = [
    ["Total", values.total, "blue"],
    ["Riesgo alto", values.riesgo_alto, "red"],
    ["Riesgo medio", values.riesgo_medio, "yellow"],
    ["Riesgo bajo", values.riesgo_bajo, "green"],
  ];
  return (
    <div className="reportes-summary-grid">
      {cards.map(([label, value, variant]) => (
        <div className={`reportes-summary-item is-${variant}`} key={label}>
          <span>{label}</span><strong>{value ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function CensoTable({ pacientes, primerControl }) {
  return (
    <ReportTable>
      <thead><tr>
        <th>#</th><th>Expediente</th><th>CUI</th><th>Nombre completo</th><th>Edad</th>
        <th>Etnia</th><th>Comunidad</th><th>FUR</th><th>FPP</th>
        {primerControl && <th>Primer control</th>}
        <th>Sem.</th><th>Gestas</th><th>Partos</th><th>Abortos</th><th>Riesgo</th><th>Estado</th>
      </tr></thead>
      <tbody>{pacientes.map((p, index) => (
        <tr key={`${p.id}-${p.numero_embarazo || 1}`}>
          <td>{index + 1}</td><td>{p.no_expediente || "—"}</td><td>{p.cui || "—"}</td>
          <td>{p.nombre_completo}</td><td>{p.edad ?? "—"}</td><td>{p.etnia || "—"}</td>
          <td>{p.comunidad || "—"}</td><td>{formatDateGt(p.fur)}</td><td>{formatDateGt(p.fpp)}</td>
          {primerControl && <td>{formatDateGt(p.fecha_primer_control)}</td>}
          <td>{p.semanas_gestacion ?? "—"}</td><td>{p.gestas ?? "—"}</td>
          <td>{p.partos ?? "—"}</td><td>{p.abortos ?? "—"}</td><td><RiskBadge paciente={p} /></td>
          <td><span className="badge badge-blue">{p.estado_embarazo || "activo"}</span></td>
        </tr>
      ))}</tbody>
    </ReportTable>
  );
}

function ProximasPartoTable({ rows }) {
  return (
    <ReportTable><thead><tr>
      <th>#</th><th>Paciente</th><th>Expediente</th><th>Comunidad</th><th>FPP</th>
      <th>Días restantes</th><th>Semanas actuales</th><th>Riesgo</th>
    </tr></thead><tbody>{rows.map((p, index) => (
      <tr key={p.id}><td>{index + 1}</td><td>{p.nombre}</td><td>{p.no_expediente || "—"}</td>
        <td>{p.comunidad || "—"}</td><td>{formatDateGt(p.fpp)}</td><td>{p.dias_restantes}</td>
        <td>{p.semanas_actuales ?? "—"}</td><td><RiskBadge paciente={p} /></td></tr>
    ))}</tbody></ReportTable>
  );
}

function SinControlTable({ rows, never }) {
  return (
    <div className="reportes-subsection">
      <div className="reportes-subsection-title">
        <h4>{never ? "Nunca han tenido control" : "Control atrasado"}</h4>
        <span className={`badge badge-${never ? "red" : "yellow"}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? <EmptyReport>No hay casos en esta categoría.</EmptyReport> : (
        <ReportTable><thead><tr>
          <th>#</th><th>Paciente</th><th>Expediente</th><th>Comunidad</th>
          <th>Último control</th><th>Días sin control</th><th>FPP</th><th>Riesgo</th>
        </tr></thead><tbody>{rows.map((p, index) => (
          <tr key={p.id}><td>{index + 1}</td><td>{p.nombre}</td><td>{p.no_expediente || "—"}</td>
            <td>{p.comunidad || "—"}</td><td>{formatDateGt(p.ultimo_control_fecha)}</td>
            <td>{p.dias_sin_control ?? "Sin controles"}</td><td>{formatDateGt(p.fpp)}</td>
            <td><RiskBadge paciente={p} /></td></tr>
        ))}</tbody></ReportTable>
      )}
    </div>
  );
}

function RiesgoTable({ rows }) {
  return (
    <ReportTable><thead><tr>
      <th>#</th><th>Paciente</th><th>Expediente</th><th>Edad</th><th>Comunidad</th>
      <th>FPP</th><th>Semanas actuales</th><th>Evaluación de riesgo</th><th>Riesgo</th>
    </tr></thead><tbody>{rows.map((p, index) => (
      <tr key={p.id}><td>{index + 1}</td><td>{p.nombre}</td><td>{p.no_expediente || "—"}</td>
        <td>{p.edad ?? "—"}</td><td>{p.comunidad || "—"}</td><td>{formatDateGt(p.fpp)}</td>
        <td>{p.semanas_actuales ?? "—"}</td><td>{formatDateGt(p.fecha_evaluacion_riesgo)}</td>
        <td><RiskBadge paciente={p} officialOnly /></td></tr>
    ))}</tbody></ReportTable>
  );
}

function ComunidadesTable({ resultado }) {
  const rows = resultado.comunidades || [];
  return (
    <ReportTable><thead><tr>
      <th>Comunidad</th><th>Territorio</th><th>Sector</th><th>Embarazos activos</th>
      <th>Con riesgo</th><th>Próximas a parir</th><th>Sin control reciente</th>
    </tr></thead><tbody>
      {rows.map((row) => (
        <tr key={`${row.comunidad}-${row.territorio || "sin"}`}><td>{row.comunidad}</td>
          <td>{row.territorio ?? "—"}</td><td>{row.sector || "—"}</td>
          <td>{row.embarazos_activos}</td><td>{row.con_riesgo}</td>
          <td>{row.proximas_a_parir}</td><td>{row.sin_control_reciente}</td></tr>
      ))}
      <tr className="reportes-total-row"><td colSpan="3">Totales generales</td>
        <td>{resultado.totales?.embarazos_activos ?? 0}</td><td>{resultado.totales?.con_riesgo ?? 0}</td>
        <td>{resultado.totales?.proximas_a_parir ?? 0}</td>
        <td>{resultado.totales?.sin_control_reciente ?? 0}</td></tr>
    </tbody></ReportTable>
  );
}

export default function Reportes() {
  const initialPeriod = getDefaultReportPeriod();
  const [desde, setDesde] = useState(initialPeriod.desde);
  const [hasta, setHasta] = useState(initialPeriod.hasta);
  const [reporteActivo, setReporteActivo] = useState(REPORTES.PRIMER_CONTROL);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const requestRef = useRef(null);
  const { usuario } = useAuth();
  const canExport = Boolean(usuario?.permisos?.includes("reportes.exportar"));

  useEffect(() => () => requestRef.current?.abort(), []);

  const seleccionarReporte = (tipo) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setReporteActivo(tipo);
    setResultado(null);
    setLoading(false);
    setError("");
    setFieldErrors({});
  };

  const validatePeriod = () => {
    if (!desde || !hasta) return "Selecciona las fechas desde y hasta.";
    if (desde > hasta) return "La fecha 'Desde' no puede ser mayor que 'Hasta'.";
    return "";
  };

  const cargar = async () => {
    if (loading) return;
    if (reporteActivo === REPORTES.PRIMER_CONTROL) {
      const validation = validatePeriod();
      if (validation) {
        setError(validation);
        setFieldErrors({ desde: validation, hasta: validation });
        return;
      }
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setResultado(null);
    setError("");
    setFieldErrors({});

    try {
      const config = { signal: controller.signal };
      if (reporteActivo === REPORTES.PRIMER_CONTROL) config.params = { desde, hasta };
      const { data } = await api.get(ENDPOINTS[reporteActivo], config);
      if (requestRef.current === controller) setResultado(data);
    } catch (err) {
      if (err.code === "ERR_CANCELED") return;
      const details = err.response?.data?.details || [];
      const nextFieldErrors = Object.fromEntries(
        details.filter((detail) => ["desde", "hasta"].includes(detail.campo))
          .map((detail) => [detail.campo, detail.mensaje])
      );
      setFieldErrors(nextFieldErrors);
      setError(getErrorMessage(err, "No fue posible generar el reporte."));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  const exportar = async (formato) => {
    if (!canExport || !resultado || reporteActivo !== REPORTES.PRIMER_CONTROL || downloading) return;
    setDownloading(formato);
    setError("");
    try {
      const extension = formato === "pdf" ? "pdf" : "xlsx";
      const response = await api.get(`/reportes/censo/primer-control/${formato}`, {
        params: { desde, hasta },
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: formato === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const fallback = `censo_primer_control_${desde}_${hasta}.${extension}`;
      const filename = safeDownloadFilename(response.headers["content-disposition"], fallback);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err, `No fue posible descargar el archivo ${formato.toUpperCase()}.`));
    } finally {
      setDownloading("");
    }
  };

  const selected = REPORT_OPTIONS.find((option) => option.id === reporteActivo);
  const isPrimerControl = reporteActivo === REPORTES.PRIMER_CONTROL;
  const rows = Array.isArray(resultado) ? resultado : [];
  const nuncaControl = rows.filter((row) => row.estado_seguimiento === "nunca_control");
  const controlAtrasado = rows.filter((row) => row.estado_seguimiento === "control_atrasado");

  return (
    <div className="reportes-page">
      <div className="reportes-titlebar">
        <div>
          <span className="reportes-kicker">CAP El Chal · Seguimiento nominal</span>
          <h1>Reportes de atención prenatal</h1>
          <p>Información operativa para dar seguimiento a las embarazadas atendidas por el CAP El Chal.</p>
        </div>
      </div>

      <div className="reportes-option-grid" role="tablist" aria-label="Tipos de reporte">
        {REPORT_OPTIONS.map(({ id, title, description, Icon, principal }) => (
          <button key={id} type="button" role="tab" aria-selected={reporteActivo === id}
            className={`reportes-option ${reporteActivo === id ? "is-active" : ""}`}
            onClick={() => seleccionarReporte(id)}>
            <Icon size={18} /><span><strong>{title}</strong><small>{description}</small></span>
            {principal && <em>Principal</em>}
          </button>
        ))}
      </div>

      <div className="card reportes-filter-card">
        <div className="reportes-section-heading">
          <div><span className="reportes-kicker">Reporte seleccionado</span><h2>{selected.title}</h2>
            <p>{isPrimerControl
              ? "Embarazadas cuyo primer control prenatal fue registrado dentro del período seleccionado."
              : selected.description}</p></div>
          {!isPrimerControl && <span className="reportes-periodo">Hora de Guatemala</span>}
        </div>

        <div className="reportes-filtros">
          {isPrimerControl && <>
            <div className="form-group"><label className="input-label" htmlFor="reporte-desde">Desde</label>
              <input id="reporte-desde" type="date" className={`input-field ${fieldErrors.desde ? "input-error" : ""}`}
                value={desde} onChange={(event) => { setDesde(event.target.value); setFieldErrors({}); }} />
              {fieldErrors.desde && <div className="field-error-text">{fieldErrors.desde}</div>}</div>
            <div className="form-group"><label className="input-label" htmlFor="reporte-hasta">Hasta</label>
              <input id="reporte-hasta" type="date" className={`input-field ${fieldErrors.hasta ? "input-error" : ""}`}
                value={hasta} onChange={(event) => { setHasta(event.target.value); setFieldErrors({}); }} />
              {fieldErrors.hasta && <div className="field-error-text">{fieldErrors.hasta}</div>}</div>
          </>}
          <button className="btn-primary" onClick={cargar} disabled={loading}>
            {loading ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
            {loading ? "Consultando..." : "Generar reporte"}
          </button>
          {isPrimerControl && resultado && canExport && <>
            <button className="btn-secondary btn-download" onClick={() => exportar("excel")}
              disabled={Boolean(downloading) || loading}>
              {downloading === "excel" ? <Loader2 className="spin" size={15} /> : <Download size={15} />} Excel
            </button>
            <button className="btn-secondary btn-download" onClick={() => exportar("pdf")}
              disabled={Boolean(downloading) || loading}>
              {downloading === "pdf" ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} PDF
            </button>
          </>}
        </div>
        {isPrimerControl && !canExport && (
          <p className="reportes-permission-note">La consulta está disponible. La exportación requiere el permiso reportes.exportar.</p>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>

      {resultado && <div className="card reportes-censo-card">
        <div className="card-header reportes-card-header"><div><h3>{selected.title}</h3>
          <p>{isPrimerControl ? `${formatDateGt(desde)} al ${formatDateGt(hasta)}` : "Estado al momento de la consulta"}</p></div>
          <span className="badge badge-blue">
            {Array.isArray(resultado) ? resultado.length : resultado.total ?? resultado.totales?.embarazos_activos ?? 0} registros
          </span></div>

        {isPrimerControl && <>
          <SummaryCards values={resultado.indicadores} />
          {resultado.total === 0 ? <EmptyReport>No se encontraron primeros controles en este período.</EmptyReport>
            : <CensoTable pacientes={resultado.pacientes} primerControl />}
        </>}
        {reporteActivo === REPORTES.ACTIVOS && <>
          <SummaryCards values={resultado.indicadores} />
          <p className="reportes-context-note">Este censo refleja embarazos activos hoy; el modelo no reconstruye estados históricos.</p>
          {resultado.total === 0 ? <EmptyReport>No hay embarazos activos.</EmptyReport>
            : <CensoTable pacientes={resultado.pacientes} primerControl={false} />}
        </>}
        {reporteActivo === REPORTES.PROXIMAS_PARTO && (rows.length
          ? <ProximasPartoTable rows={rows} /> : <EmptyReport>No hay FPP dentro de los próximos 30 días.</EmptyReport>)}
        {reporteActivo === REPORTES.SIN_CONTROL && <>
          <SinControlTable rows={nuncaControl} never />
          <SinControlTable rows={controlAtrasado} never={false} />
        </>}
        {reporteActivo === REPORTES.RIESGO && (rows.length
          ? <RiesgoTable rows={rows} /> : <EmptyReport>No hay embarazos activos con ficha de riesgo positiva.</EmptyReport>)}
        {reporteActivo === REPORTES.COMUNIDADES && (resultado.comunidades?.length
          ? <ComunidadesTable resultado={resultado} /> : <EmptyReport>No hay embarazos activos para resumir.</EmptyReport>)}
      </div>}
    </div>
  );
}
