import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Search,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import api from "../api/axios";
import { isValidPregnancyId } from "../utils/pregnancyState";

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const MS_DAY = 86400000;

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("es-GT") : "—";
}

function titleCase(value) {
  if (!value) return "Sin embarazo";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getEstadoBadge(estado) {
  if (estado === "activo") return "badge-green";
  if (estado === "puerperio") return "badge-blue";
  return "badge";
}

function getPatientInitials(paciente) {
  const words = [paciente.nombres, paciente.apellidos]
    .filter(Boolean)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "P";
}

function getFppInfo(paciente) {
  if (!isValidPregnancyId(paciente.embarazo_id)) {
    return {
      label: "—",
      color: "var(--text-muted)",
      title: "Sin embarazo registrado",
      urgent: false,
    };
  }
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

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [total, setTotal] = useState(0);
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);
  const [expandida, setExpandida] = useState(null);
  const [openingPatient, setOpeningPatient] = useState(null);
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

  useEffect(() => {
    if (!openingPatient) return undefined;

    const navigationTimer = window.setTimeout(() => {
      navigate(`/pacientes/${openingPatient.id}`);
    }, 1050);

    return () => window.clearTimeout(navigationTimer);
  }, [navigate, openingPatient]);

  const openPatientFile = (patient, patientName) => {
    if (openingPatient) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      navigate(`/pacientes/${patient.id}`);
      return;
    }

    setOpeningPatient({
      id: patient.id,
      name: patientName,
      initials: getPatientInitials(patient),
      fileNumber: patient.no_expediente || "Sin número",
    });
  };

  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const fin = Math.min(pagina * limite, total);
  const visibleStats = pacientes.reduce((stats, paciente) => {
    const hasEmbarazo = isValidPregnancyId(paciente.embarazo_id);
    const estado = hasEmbarazo ? (paciente.embarazo_estado || "sin embarazo") : "sin embarazo";
    if (estado === "activo") stats.activas += 1;
    if (paciente.tiene_riesgo) stats.riesgo += 1;
    if (getFppInfo(paciente).urgent) stats.proximas += 1;
    return stats;
  }, { activas: 0, riesgo: 0, proximas: 0 });

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

      <div className="card patients-census-tools">
        <div className="patients-census-intro">
          <span className="patients-census-kicker"><UsersRound size={15} /> Censo clínico</span>
          <strong>Una lectura rápida antes de abrir el expediente</strong>
          <p>Identifica seguimiento, riesgo y proximidad a la FPP sin perder el contexto de cada paciente.</p>
        </div>

        <label className="patients-search-field">
          <Search size={17} aria-hidden="true" />
          <input
            className="input-field"
            aria-label="Buscar pacientes"
            placeholder="Buscar nombre, expediente o CUI..."
            value={buscar}
            onChange={(e) => { setBuscar(e.target.value); setPagina(1); }}
          />
          {buscar && <span>{pacientes.length} resultado{pacientes.length !== 1 ? "s" : ""}</span>}
        </label>

        <div className="patients-live-summary" aria-label="Resumen de pacientes visibles">
          <div>
            <span>En esta vista</span>
            <strong>{pacientes.length}</strong>
          </div>
          <div>
            <span>Embarazo activo</span>
            <strong>{visibleStats.activas}</strong>
          </div>
          <div className="is-risk">
            <span>Con riesgo</span>
            <strong>{visibleStats.riesgo}</strong>
          </div>
          <div className="is-near">
            <span>FPP cercana</span>
            <strong>{visibleStats.proximas}</strong>
          </div>
        </div>
      </div>

      <section className="card patients-board" aria-label="Listado de pacientes">
        {loading ? (
          <div className="patient-card-grid" aria-label="Cargando pacientes">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="patient-card-skeleton" aria-hidden="true" />
            ))}
          </div>
        ) : pacientes.length === 0 ? (
          <div className="patients-empty-state">
            <span><Search size={22} /></span>
            <strong>No se encontraron pacientes</strong>
            <p>Prueba con otro nombre, número de expediente o CUI.</p>
          </div>
        ) : (
          <div className="patient-card-grid" role="list">
            {pacientes.map((p, index) => {
              const hasEmbarazo = isValidPregnancyId(p.embarazo_id);
              const fppInfo = getFppInfo(p);
              const abierta = expandida === p.id;
              const estado = hasEmbarazo ? (p.embarazo_estado || "sin embarazo") : "sin embarazo";
              const fur = formatDate(hasEmbarazo ? (p.embarazo_fur || p.fur) : null);
              const nombreCompleto = `${p.nombres || ""} ${p.apellidos || ""}`.trim() || "Paciente sin nombre";
              const ubicacion = p.comunidad || p.municipio || "Ubicación sin registrar";
              const detailsId = `patient-details-${p.id}`;

              return (
                <article
                  key={p.id}
                  role="listitem"
                  className={`patient-orbit-card ${p.tiene_riesgo ? "is-risk" : ""} ${fppInfo.urgent ? "is-urgent" : ""} ${abierta ? "is-open" : ""} ${openingPatient?.id === p.id ? "is-launching" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}>
                  <button
                    type="button"
                    className="patient-orbit-main"
                    onClick={() => openPatientFile(p, nombreCompleto)}
                    disabled={Boolean(openingPatient)}
                    aria-label={`Abrir expediente de ${nombreCompleto}`}>
                    <span className="patient-orbit-heading">
                      <span className="patient-orbit-avatar" aria-hidden="true">{getPatientInitials(p)}</span>
                      <span className="patient-orbit-identity">
                        <small>Expediente {p.no_expediente || "sin número"}</small>
                        <strong>{p.nombres || "—"}</strong>
                        <span>{p.apellidos || "—"}</span>
                      </span>
                      <span className="patient-orbit-open">Abrir <ArrowUpRight size={15} /></span>
                    </span>

                    <span className="patient-orbit-badges">
                      <span className={`badge ${getEstadoBadge(estado)}`}>{titleCase(estado)}</span>
                      {p.tiene_riesgo && <span className="badge badge-red"><ShieldAlert size={12} /> Riesgo obstétrico</span>}
                    </span>

                    <span className="patient-orbit-path">
                      <span className="patient-orbit-date">
                        <CalendarDays size={16} aria-hidden="true" />
                        <span><small>FUR</small><strong>{fur}</strong></span>
                      </span>
                      <span className="patient-orbit-line" aria-hidden="true"><span /></span>
                      <span className={`patient-orbit-date is-fpp ${fppInfo.urgent ? "is-urgent" : ""}`} title={fppInfo.title}>
                        {fppInfo.urgent ? <AlertTriangle size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}
                        <span><small>FPP estimada</small><strong style={{ color: fppInfo.color }}>{fppInfo.label}</strong></span>
                      </span>
                    </span>

                    <span className="patient-orbit-location">
                      <span><MapPin size={14} aria-hidden="true" /> {ubicacion}</span>
                      <span>{fppInfo.title}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="patient-orbit-more"
                    aria-expanded={abierta}
                    aria-controls={detailsId}
                    onClick={() => setExpandida(abierta ? null : p.id)}>
                    <span>{abierta ? "Ocultar datos" : "Más datos"}</span>
                    {abierta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {abierta && (
                    <div id={detailsId} className="patient-orbit-details">
                      <div>
                        <span>Municipio</span>
                        <strong>{p.municipio || "—"}</strong>
                      </div>
                      <div>
                        <span>Comunidad</span>
                        <strong>{p.comunidad || "—"}</strong>
                      </div>
                      <div>
                        <span>Registrada</span>
                        <strong>{formatDate(p.created_at)}</strong>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {total > 0 && (
          <div className="patients-footer">
            <span className="patients-footer-count">
              Mostrando {inicio}-{fin} de {total} pacientes
            </span>
            <div className="patients-footer-actions">
              <label className="patients-page-size">
                <span>Por página</span>
                <select
                  className="input-field"
                  value={limite}
                  onChange={(e) => {
                    setLimite(Number(e.target.value));
                    setPagina(1);
                  }}>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <button className="btn-secondary" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}>
                <ChevronLeft size={15} /> Anterior
              </button>
              <span className="patients-page-indicator">
                {pagina} / {totalPaginas}
              </span>
              <button className="btn-secondary" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
                Siguiente <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

      {openingPatient && (
        <div
          className="patient-file-transition"
          role="status"
          aria-live="assertive"
          aria-label={`Abriendo expediente de ${openingPatient.name}`}>
          <div className="patient-file-transition__veil" aria-hidden="true" />
          <div className="patient-file-transition__scene">
            <div className="patient-file-transition__art" aria-hidden="true">
              <div className="patient-file-transition__folder-back">
                <div className="patient-file-transition__sheet">
                  <span className="patient-file-transition__seal">CAP</span>
                  <strong>{openingPatient.initials}</strong>
                  <span className="patient-file-transition__sheet-line is-long" />
                  <span className="patient-file-transition__sheet-line" />
                  <span className="patient-file-transition__sheet-line is-short" />
                </div>
                <div className="patient-file-transition__folder-front">
                  <span>EXPEDIENTE</span>
                </div>
              </div>
            </div>
            <span className="patient-file-transition__kicker">Expediente clínico</span>
            <strong>{openingPatient.name}</strong>
            <small>{openingPatient.fileNumber}</small>
          </div>
        </div>
      )}
    </div>
  );
}
