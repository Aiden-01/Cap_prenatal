import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Info,
  Loader2,
  MapPinned,
  PlusCircle,
  RotateCcw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import api from "../api/axios";
import { useGlobalToast } from "../context/ToastContext";
import { getErrorMessage } from "../utils/errorMessage";

const EL_CHAL_CENTER = [16.4870, -89.6820];
const EL_CHAL_BOUNDS = [
  [16.30, -89.94],
  [16.70, -89.52],
];

const EMPTY_FORM = {
  nombre: "",
  territorio: "",
  sector: "",
  lat: "",
  lng: "",
};

const markerIcon = L.divIcon({
  className: "comunidades-map-marker",
  html: `<div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function parseCoordinate(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(7) : "";
}

function MiniMapEvents({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MiniMapView({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 13));
  }, [map, position]);

  return null;
}

function ComunidadModal({
  open,
  form,
  errors,
  saving,
  editing,
  onClose,
  onChange,
  onSubmit,
  onPickCoords,
}) {
  const lat = parseCoordinate(form.lat);
  const lng = parseCoordinate(form.lng);
  const position = lat !== null && lng !== null ? [lat, lng] : null;
  const mapCenter = position || EL_CHAL_CENTER;

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="card modal-card comunidades-modal">
        <div className="comunidades-modal-header">
          <div className="comunidades-modal-title">
            <div className="comunidades-modal-icon">
              <MapPinned size={18} />
            </div>
            <div>
              <h2>{editing ? "Editar comunidad" : "Nueva comunidad"}</h2>
              <p>Catálogo del mapa de riesgo de El Chal.</p>
            </div>
          </div>
          <button type="button" className="password-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="comunidades-modal-body">
          <div className="comunidades-form-grid">
            <div className="form-group comunidades-form-wide">
              <label className="input-label">Nombre de comunidad</label>
              <input
                className={`input-field ${errors.nombre ? "input-error" : ""}`}
                name="nombre"
                value={form.nombre}
                onChange={(event) => onChange("nombre", event.target.value)}
                maxLength={150}
                autoFocus
              />
              {errors.nombre && <div className="field-error-text">{errors.nombre}</div>}
            </div>

            <div className="form-group">
              <label className="input-label">Territorio</label>
              <select
                className={`input-field ${errors.territorio ? "input-error" : ""}`}
                name="territorio"
                value={form.territorio}
                onChange={(event) => onChange("territorio", event.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
              {errors.territorio && <div className="field-error-text">{errors.territorio}</div>}
            </div>

            <div className="form-group">
              <label className="input-label">Sector</label>
              <select
                className={`input-field ${errors.sector ? "input-error" : ""}`}
                name="sector"
                value={form.sector}
                onChange={(event) => onChange("sector", event.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
              {errors.sector && <div className="field-error-text">{errors.sector}</div>}
            </div>

            <div className="form-group">
              <label className="input-label">Latitud</label>
              <input
                className={`input-field ${errors.lat ? "input-error" : ""}`}
                name="lat"
                value={form.lat}
                onChange={(event) => onChange("lat", event.target.value)}
                inputMode="decimal"
              />
              {errors.lat && <div className="field-error-text">{errors.lat}</div>}
            </div>

            <div className="form-group">
              <label className="input-label">Longitud</label>
              <input
                className={`input-field ${errors.lng ? "input-error" : ""}`}
                name="lng"
                value={form.lng}
                onChange={(event) => onChange("lng", event.target.value)}
                inputMode="decimal"
              />
              {errors.lng && <div className="field-error-text">{errors.lng}</div>}
            </div>
          </div>

          <div className="comunidades-map-box">
            <MapContainer
              center={mapCenter}
              zoom={13}
              minZoom={10}
              maxZoom={18}
              maxBounds={EL_CHAL_BOUNDS}
              maxBoundsViscosity={1.0}
              scrollWheelZoom
              className="comunidades-mini-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MiniMapEvents onPick={onPickCoords} />
              <MiniMapView position={position} />
              {position && <Marker position={position} icon={markerIcon} />}
            </MapContainer>
          </div>
        </div>

        <div className="action-row">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDesactivar({ comunidad, loading, onCancel, onConfirm }) {
  if (!comunidad) return null;

  return (
    <div className="modal-backdrop">
      <div className="card modal-card">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div className="comunidades-confirm-icon">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--text)" }}>Desactivar comunidad</h2>
            <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)", fontSize: "0.86rem" }}>
              {comunidad.nombre}
            </p>
          </div>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.45 }}>
          Esta comunidad dejará de aparecer como activa para nuevas operaciones.
          Los expedientes históricos no se eliminarán.
        </p>
        <div className="action-row">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="spin" size={14} /> : <XCircle size={14} />}
            Desactivar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Comunidades() {
  const toast = useGlobalToast();
  const [comunidades, setComunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("activas");
  const [territorio, setTerritorio] = useState("todos");
  const [sector, setSector] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [confirmTarget, setConfirmTarget] = useState(null);

  const cargarComunidades = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/comunidades");
      setComunidades(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getErrorMessage(err, "Error al cargar comunidades."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarComunidades();
  }, []);

  const comunidadesFiltradas = useMemo(() => {
    const q = String(busqueda || "").trim().toLowerCase();
    return comunidades.filter((comunidad) => {
      const coincideNombre = !q || String(comunidad.nombre || "").toLowerCase().includes(q);
      const coincideEstado =
        estado === "todas" ||
        (estado === "activas" && comunidad.activo) ||
        (estado === "inactivas" && !comunidad.activo);
      const coincideTerritorio = territorio === "todos" || String(comunidad.territorio) === territorio;
      const coincideSector = sector === "todos" || comunidad.sector === sector;
      return coincideNombre && coincideEstado && coincideTerritorio && coincideSector;
    });
  }, [busqueda, comunidades, estado, sector, territorio]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const abrirNueva = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const abrirEditar = (comunidad) => {
    setEditing(comunidad);
    setForm({
      nombre: comunidad.nombre || "",
      territorio: String(comunidad.territorio || ""),
      sector: comunidad.sector || "",
      lat: String(comunidad.lat ?? ""),
      lng: String(comunidad.lng ?? ""),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const cerrarModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const validar = () => {
    const next = {};
    const lat = parseCoordinate(form.lat);
    const lng = parseCoordinate(form.lng);

    if (!form.nombre.trim()) next.nombre = "Nombre requerido";
    if (!form.territorio) next.territorio = "Territorio requerido";
    if (!form.sector) next.sector = "Sector requerido";
    if (form.lat === "") next.lat = "Latitud requerida";
    else if (lat === null) next.lat = "Latitud debe ser numérica";
    else if (lat < -90 || lat > 90) next.lat = "Latitud fuera de rango";
    if (form.lng === "") next.lng = "Longitud requerida";
    else if (lng === null) next.lng = "Longitud debe ser numérica";
    else if (lng < -180 || lng > 180) next.lng = "Longitud fuera de rango";

    setFormErrors(next);
    return Object.keys(next).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;

    const payload = {
      nombre: form.nombre.trim().replace(/\s+/g, " "),
      territorio: Number(form.territorio),
      sector: form.sector,
      lat: Number(form.lat),
      lng: Number(form.lng),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/comunidades/${editing.id}`, payload);
        toast("Comunidad actualizada correctamente", "success");
      } else {
        await api.post("/comunidades", payload);
        toast("Comunidad creada correctamente", "success");
      }
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setFormErrors({});
      await cargarComunidades();
    } catch (err) {
      toast(getErrorMessage(err, "Error al guardar comunidad"), "error");
    } finally {
      setSaving(false);
    }
  };

  const desactivar = async () => {
    if (!confirmTarget) return;
    setActionLoading(true);
    try {
      await api.patch(`/comunidades/${confirmTarget.id}/desactivar`);
      toast("Comunidad desactivada", "success");
      setConfirmTarget(null);
      await cargarComunidades();
    } catch (err) {
      toast(getErrorMessage(err, "No se puede desactivar esta comunidad porque tiene casos de riesgo activo asociados."), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const reactivar = async (comunidad) => {
    setActionLoading(true);
    try {
      await api.patch(`/comunidades/${comunidad.id}/reactivar`);
      toast("Comunidad reactivada", "success");
      await cargarComunidades();
    } catch (err) {
      toast(getErrorMessage(err, "Error al reactivar comunidad"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="comunidades-page">
      <style>{`
        .comunidades-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .comunidades-titlebar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .comunidades-titlebar h1 {
          margin: 0;
          color: var(--text);
          font-size: clamp(1.35rem, 2vw, 1.9rem);
          letter-spacing: 0;
        }

        .comunidades-titlebar p {
          margin: 0.3rem 0 0;
          color: var(--text-muted);
          font-size: 0.92rem;
        }

        .comunidades-notices {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
        }

        .comunidades-note {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          padding: 0.64rem 0.78rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-muted);
          background: color-mix(in srgb, var(--surface2) 62%, var(--surface));
          font-size: 0.82rem;
          line-height: 1.35;
        }

        .comunidades-note svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        .comunidades-note-info {
          border-color: color-mix(in srgb, var(--info) 34%, var(--border));
          background: color-mix(in srgb, var(--info-lt) 46%, var(--surface));
        }

        .comunidades-note-info svg {
          color: var(--info);
        }

        .comunidades-note-warning {
          border-color: color-mix(in srgb, var(--warn) 38%, var(--border));
          background: color-mix(in srgb, var(--warn-lt) 36%, var(--surface));
        }

        .comunidades-note-warning svg {
          color: var(--warn);
        }

        .comunidades-toolbar {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(130px, 180px));
          gap: 0.65rem;
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .comunidades-search {
          position: relative;
        }

        .comunidades-search svg {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .comunidades-search .input-field {
          padding-left: 2.2rem;
        }

        .comunidades-table-wrap {
          overflow-x: auto;
        }

        .comunidades-table {
          min-width: 1060px;
          table-layout: fixed;
        }

        .comunidades-table th {
          text-align: center;
          vertical-align: middle;
          white-space: normal;
        }

        .comunidades-table td {
          text-align: center;
          vertical-align: middle;
        }

        .comunidades-table td.comunidades-table__community {
          text-align: left;
        }

        .comunidades-table__community {
          width: 30%;
          min-width: 260px;
        }

        .comunidades-table__territory {
          width: 86px;
        }

        .comunidades-table__sector {
          width: 72px;
        }

        .comunidades-table__coords {
          width: 150px;
        }

        .comunidades-table__patients {
          width: 122px;
        }

        .comunidades-table__risk {
          width: 154px;
        }

        .comunidades-table__status {
          width: 96px;
        }

        .comunidades-table__actions {
          width: 210px;
          min-width: 210px;
        }

        .comunidades-coordinates {
          display: inline-grid;
          gap: 0.12rem;
          justify-items: center;
          min-width: 8.5rem;
          line-height: 1.2;
          font-variant-numeric: tabular-nums;
        }

        .comunidades-coordinate-primary {
          color: var(--text);
          font-weight: 650;
        }

        .comunidades-coordinate-secondary {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .comunidades-table__risk .badge,
        .comunidades-table__status .badge {
          justify-content: center;
        }

        .comunidades-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          justify-content: center;
          flex-wrap: nowrap;
        }

        .comunidades-actions .comunidades-action-button {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          height: 32px;
          padding: 0.34rem 0.58rem;
          border-radius: 7px;
          font-family: "DM Sans", sans-serif;
          font-size: 0.8rem;
          font-weight: 500;
          line-height: 1;
          gap: 0.32rem;
          white-space: nowrap;
          flex: 0 0 auto;
          box-shadow: none;
          cursor: pointer;
          transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.12s;
        }

        .comunidades-actions .comunidades-action-button svg {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
        }

        .comunidades-actions .comunidades-action-danger {
          background: color-mix(in srgb, var(--danger-lt) 82%, var(--surface));
          border: 1px solid color-mix(in srgb, var(--danger) 46%, var(--border));
          color: var(--danger);
          font-weight: 600;
        }

        .comunidades-actions .comunidades-action-danger:hover {
          background: var(--danger-lt);
          border-color: color-mix(in srgb, var(--danger) 68%, var(--border));
          color: var(--danger);
        }

        .comunidades-actions .comunidades-action-reactivate {
          color: var(--accent);
          border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
        }

        .comunidades-empty {
          padding: 2rem;
          text-align: center;
          color: var(--text-muted);
        }

        .comunidades-modal {
          width: min(760px, calc(100vw - 2rem));
        }

        .comunidades-modal-header,
        .comunidades-modal-title {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .comunidades-modal-header {
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .comunidades-modal-title h2 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
        }

        .comunidades-modal-title p {
          margin: 0.2rem 0 0;
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .comunidades-modal-icon,
        .comunidades-confirm-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: var(--primary-lt);
          color: var(--primary);
          flex: 0 0 auto;
        }

        .comunidades-confirm-icon {
          background: var(--warn-lt);
          color: var(--warn);
        }

        .comunidades-modal-body {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
          gap: 1rem;
        }

        .comunidades-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          align-content: start;
        }

        .comunidades-form-wide {
          grid-column: 1 / -1;
        }

        .comunidades-map-box {
          min-height: 320px;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--surface2);
        }

        .comunidades-mini-map {
          height: 100%;
          min-height: 320px;
          width: 100%;
        }

        .comunidades-map-marker div {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: var(--danger);
          border: 3px solid #fff;
          box-shadow: 0 10px 20px rgba(15,23,42,0.32);
        }

        @media (max-width: 900px) {
          .comunidades-titlebar {
            flex-direction: column;
          }

          .comunidades-toolbar {
            grid-template-columns: 1fr;
          }

          .comunidades-notices {
            grid-template-columns: 1fr;
          }

          .comunidades-modal-body {
            grid-template-columns: 1fr;
          }

          .comunidades-actions {
            justify-content: center;
            flex-wrap: wrap;
          }
        }
      `}</style>

      <div className="comunidades-titlebar">
        <div>
          <h1>Comunidades</h1>
          <p>Administración de comunidades utilizadas por el mapa de riesgo del municipio de El Chal.</p>
        </div>
        <button type="button" className="btn-primary" onClick={abrirNueva}>
          <PlusCircle size={15} />
          Nueva comunidad
        </button>
      </div>

      <div className="comunidades-notices">
        <div className="comunidades-note comunidades-note-info">
          <Info size={16} />
          <span>
            Aquí se administran solo las comunidades de El Chal que se muestran en el mapa de riesgo. Si una paciente viene de
            otro municipio, su comunidad puede escribirse manualmente y no aparecerá en el mapa.
          </span>
        </div>
        <div className="comunidades-note comunidades-note-warning">
          <AlertTriangle size={16} />
          <span>
            Antes de guardar una comunidad, revise bien su ubicación y sus coordenadas de latitud y longitud, porque esa
            información define dónde se mostrará en el mapa.
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="comunidades-toolbar">
          <div className="comunidades-search">
            <Search size={16} />
            <input
              className="input-field"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por comunidad"
            />
          </div>
          <select className="input-field" value={estado} onChange={(event) => setEstado(event.target.value)} aria-label="Filtrar por estado">
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
            <option value="todas">Todas</option>
          </select>
          <select className="input-field" value={territorio} onChange={(event) => setTerritorio(event.target.value)} aria-label="Filtrar por territorio">
            <option value="todos">Territorios</option>
            <option value="1">Territorio 1</option>
            <option value="2">Territorio 2</option>
            <option value="3">Territorio 3</option>
            <option value="4">Territorio 4</option>
          </select>
          <select className="input-field" value={sector} onChange={(event) => setSector(event.target.value)} aria-label="Filtrar por sector">
            <option value="todos">Sectores</option>
            <option value="A">Sector A</option>
            <option value="B">Sector B</option>
          </select>
        </div>

        {loading && (
          <div className="comunidades-empty">
            <Loader2 className="spin" size={18} /> Cargando comunidades...
          </div>
        )}

        {!loading && error && (
          <div className="comunidades-empty" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {!loading && !error && (
          <div className="comunidades-table-wrap">
            <table className="tabla comunidades-table">
              <thead>
                <tr>
                  <th className="comunidades-table__community">Comunidad</th>
                  <th className="comunidades-table__territory">Territorio</th>
                  <th className="comunidades-table__sector">Sector</th>
                  <th className="comunidades-table__coords">Coordenadas</th>
                  <th className="comunidades-table__patients">Pacientes asociados</th>
                  <th className="comunidades-table__risk">Riesgo activo</th>
                  <th className="comunidades-table__status">Estado</th>
                  <th className="comunidades-table__actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {comunidadesFiltradas.map((comunidad) => {
                  const riesgoActivo = Number(comunidad.total_riesgo_activo || 0) > 0;
                  return (
                    <tr key={comunidad.id}>
                      <td className="comunidades-table__community">
                        <strong>{comunidad.nombre}</strong>
                      </td>
                      <td className="comunidades-table__territory">{comunidad.territorio}</td>
                      <td className="comunidades-table__sector">{comunidad.sector}</td>
                      <td className="comunidades-table__coords">
                        <div className="comunidades-coordinates">
                          <div className="comunidades-coordinate-primary">{formatCoordinate(comunidad.lat)}</div>
                          <div className="comunidades-coordinate-secondary">{formatCoordinate(comunidad.lng)}</div>
                        </div>
                      </td>
                      <td className="comunidades-table__patients">{Number(comunidad.total_pacientes || 0)}</td>
                      <td className="comunidades-table__risk">
                        {riesgoActivo ? (
                          <span className="badge badge-red">
                            <AlertTriangle size={12} />
                            Riesgo activo
                          </span>
                        ) : (
                          <span className="badge badge-green">
                            <CheckCircle2 size={12} />
                            Sin riesgo activo
                          </span>
                        )}
                      </td>
                      <td className="comunidades-table__status">
                        {comunidad.activo ? (
                          <span className="badge badge-green">Activa</span>
                        ) : (
                          <span className="badge badge-orange">Inactiva</span>
                        )}
                      </td>
                      <td className="comunidades-table__actions">
                        <div className="comunidades-actions">
                          <button type="button" className="btn-secondary comunidades-action-button" onClick={() => abrirEditar(comunidad)}>
                            <Edit3 size={14} />
                            Editar
                          </button>
                          {comunidad.activo ? (
                            <button type="button" className="comunidades-action-button comunidades-action-danger" onClick={() => setConfirmTarget(comunidad)}>
                              <XCircle size={14} />
                              Desactivar
                            </button>
                          ) : (
                            <button type="button" className="btn-secondary comunidades-action-button comunidades-action-reactivate" onClick={() => reactivar(comunidad)} disabled={actionLoading}>
                              <RotateCcw size={14} />
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {comunidadesFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="comunidades-empty">No hay comunidades con los filtros seleccionados.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ComunidadModal
        open={modalOpen}
        form={form}
        errors={formErrors}
        saving={saving}
        editing={Boolean(editing)}
        onClose={cerrarModal}
        onChange={setField}
        onSubmit={guardar}
        onPickCoords={(lat, lng) => {
          setField("lat", lat.toFixed(7));
          setField("lng", lng.toFixed(7));
        }}
      />

      <ConfirmDesactivar
        comunidad={confirmTarget}
        loading={actionLoading}
        onCancel={() => !actionLoading && setConfirmTarget(null)}
        onConfirm={desactivar}
      />
    </div>
  );
}
