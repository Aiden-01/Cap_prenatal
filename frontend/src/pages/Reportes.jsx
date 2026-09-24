import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Baby,
  CheckCircle,
  Clock3,
  Download,
  Loader2,
  MapPinned,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../utils/errorMessage";
import ReportExportModal from "../components/ReportExportModal";
import { getReportExportConfig } from "../config/reportExportConfig";
import { useGlobalToast } from "../context/ToastContext";
import {
  getDefaultReportPeriod,
  getReportPeriodFromSearch,
  getReportQueryKey,
  getReportRecordCount,
  getReportRiskLevel,
  isReportExportAvailable,
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
  {
    id: REPORTES.CONTROLES_PRENATALES,
    title: "Controles prenatales",
    description: "Lista de controles prenatales registrados dentro de un rango de fechas.",
    Icon: Activity,
  },
];

const ENDPOINTS = {
  [REPORTES.PRIMER_CONTROL]: "/reportes/censo/primer-control",
  [REPORTES.ACTIVOS]: "/reportes/censo",
  [REPORTES.PROXIMAS_PARTO]: "/reportes/proximas-a-parir",
  [REPORTES.SIN_CONTROL]: "/reportes/sin-control-reciente",
  [REPORTES.RIESGO]: "/reportes/pacientes-riesgo",
  [REPORTES.COMUNIDADES]: "/reportes/resumen-comunidades",
  [REPORTES.CONTROLES_PRENATALES]: "/reportes/controles-prenatales",
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

function ControlesPrenatalesTable({ rows }) {
  return <ReportTable><thead><tr>
    <th>#</th><th>Expediente</th><th>Paciente</th><th>Comunidad</th>
    <th>Número de control</th><th>Fecha del control</th><th>Semanas de gestación</th>
    <th>Peso (kg)</th><th>Presión arterial</th><th>FCF</th><th>Presentación</th><th>Personal que atendió</th>
  </tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}>
    <td>{index + 1}</td><td>{row.no_expediente || "—"}</td><td>{row.paciente}</td>
    <td>{row.comunidad || "—"}</td><td>{row.numero_control}</td><td>{formatDateGt(row.fecha_control)}</td>
    <td>{row.semanas_gestacion ?? "—"}</td><td>{row.peso ?? "—"}</td>
    <td>{row.pa_sistolica != null && row.pa_diastolica != null ? `${row.pa_sistolica}/${row.pa_diastolica}` : "—"}</td>
    <td>{row.fcf ?? "—"}</td><td>{row.presentacion || "—"}</td><td>{row.personal_atiende || "—"}</td>
  </tr>)}</tbody></ReportTable>;
}

export default function Reportes() {
  const initialPeriod = typeof window === "undefined"
    ? getDefaultReportPeriod()
    : getReportPeriodFromSearch(window.location.search);
  const [desde, setDesde] = useState(initialPeriod.desde);
  const [hasta, setHasta] = useState(initialPeriod.hasta);
  const [reporteActivo, setReporteActivo] = useState(REPORTES.PRIMER_CONTROL);
  const hasDateFilter = [REPORTES.PRIMER_CONTROL, REPORTES.CONTROLES_PRENATALES].includes(reporteActivo);
  const [resultado, setResultado] = useState(null);
  const [generatedQueryKey, setGeneratedQueryKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const requestRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const { usuario } = useAuth();
  const toast = useGlobalToast();
  const hasExportPermission = Boolean(usuario?.permisos?.includes("reportes.exportar"));
  const currentQueryKey = getReportQueryKey(reporteActivo, { desde, hasta });
  const recordCount = getReportRecordCount(reporteActivo, resultado);
  const exportAvailable = isReportExportAvailable({
    hasPermission: hasExportPermission,
    loading,
    reportId: reporteActivo,
    resultado,
    generatedQueryKey,
    currentQueryKey,
  });
  const generatedEmptyReport = resultado !== null
    && generatedQueryKey === currentQueryKey
    && recordCount === 0;

  useEffect(() => () => {
    requestRef.current?.abort();
    window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showExportNotice = (message) => {
    window.clearTimeout(noticeTimerRef.current);
    setExportNotice({ message, id: Date.now() });
    noticeTimerRef.current = window.setTimeout(() => setExportNotice(null), 3200);
  };

  const seleccionarReporte = (tipo) => {
    requestRef.current?.abort();
    requestRef.current = null;
    setReporteActivo(tipo);
    setResultado(null);
    setGeneratedQueryKey("");
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
    if (hasDateFilter) {
      const validation = validatePeriod();
      if (validation) {
        setError(validation);
        setFieldErrors({ desde: validation, hasta: validation });
        return;
      }
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    const requestQueryKey = currentQueryKey;
    requestRef.current = controller;
    setLoading(true);
    setResultado(null);
    setGeneratedQueryKey("");
    setError("");
    setFieldErrors({});

    try {
      const config = { signal: controller.signal };
      if (hasDateFilter) config.params = { desde, hasta };
      const { data } = await api.get(ENDPOINTS[reporteActivo], config);
      if (requestRef.current === controller) {
        setResultado(data);
        setGeneratedQueryKey(requestQueryKey);
        if (getReportRecordCount(reporteActivo, data) === 0) {
          showExportNotice("No hay datos para exportar con los filtros actuales.");
        }
      }
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

  const exportar = async (formato, columnas) => {
    if (!exportAvailable || downloading) return;
    setDownloading(formato);
    setError("");
    try {
      const extension = formato === "pdf" ? "pdf" : "xlsx";
      const exportConfig = getReportExportConfig(reporteActivo);
      const response = await api.get(`${exportConfig.endpoint}/${formato}`, {
        params: {
          ...(hasDateFilter ? { desde, hasta } : {}),
          columnas: columnas.join(","),
        },
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: formato === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const fallback = `reporte_${new Date().toISOString().slice(0, 10)}.${extension}`;
      const filename = safeDownloadFilename(response.headers["content-disposition"], fallback);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportOpen(false);
      toast(`${exportConfig.title} exportado correctamente`, "success");
    } catch (err) {
      let message = `No fue posible descargar el archivo ${formato.toUpperCase()}.`;
      if (err.response?.data instanceof Blob) {
        try {
          const body = JSON.parse(await err.response.data.text());
          message = body.message || message;
        } catch { /* La respuesta no contiene JSON. */ }
      } else {
        message = getErrorMessage(err, message);
      }
      toast(message, "error");
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
          {!hasDateFilter && <span className="reportes-periodo">Hora de Guatemala</span>}
        </div>

        <div className="reportes-filtros">
          {hasDateFilter && <>
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
          {hasExportPermission && <span onPointerDownCapture={() => {
            if (generatedEmptyReport) showExportNotice("No es posible exportar porque no existen datos.");
          }}>
            <button className="btn-secondary btn-download"
              onClick={() => { if (exportAvailable) setExportOpen(true); }}
              disabled={!exportAvailable || Boolean(downloading)}
              title={!exportAvailable ? "Genera un reporte con al menos un registro antes de exportar." : undefined}>
              <Download size={15} /> Exportar
            </button>
          </span>}
        </div>
        {!hasExportPermission && (
          <p className="reportes-permission-note">La consulta está disponible. La exportación requiere el permiso reportes.exportar.</p>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>

      {resultado && <div className="card reportes-censo-card">
        <div className="card-header reportes-card-header"><div><h3>{selected.title}</h3>
          <p>{hasDateFilter ? `${formatDateGt(desde)} al ${formatDateGt(hasta)}` : "Estado al momento de la consulta"}</p></div>
          <span className="badge badge-blue">
            {recordCount} registros
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
        {reporteActivo === REPORTES.CONTROLES_PRENATALES && (resultado.controles?.length
          ? <ControlesPrenatalesTable rows={resultado.controles} /> : <EmptyReport>No se encontraron controles prenatales en este período.</EmptyReport>)}
      </div>}
      {exportOpen && <ReportExportModal config={getReportExportConfig(reporteActivo)}
        busy={Boolean(downloading)} onClose={() => setExportOpen(false)} onExport={exportar} />}
      {exportNotice && <div className="reportes-export-notice-layer" aria-live="assertive">
        <div key={exportNotice.id} className="reportes-export-notice" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <div><strong>Exportación no disponible</strong><span>{exportNotice.message}</span></div>
        </div>
      </div>}
    </div>
  );
}
