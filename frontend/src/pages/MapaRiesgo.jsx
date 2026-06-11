import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import { AlertTriangle, Loader2, MapPin, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import api from "../api/axios";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const EL_CHAL_CENTER = [16.4870, -89.6820];
const EL_CHAL_BOUNDS = [
  [16.30, -89.94],
  [16.70, -89.52],
];

function createCommunityIcon(totalRiesgo) {
  const hasRisk = Number(totalRiesgo) > 0;
  const background = hasRisk ? "#991b1b" : "rgba(100,116,139,0.72)";
  const label = hasRisk ? totalRiesgo : "";

  return L.divIcon({
    className: "mapa-riesgo-marker",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${background};
        color: #fff;
        border: 2px solid #fff;
        box-shadow: 0 10px 22px rgba(15,23,42,0.28);
        font-size: 0.82rem;
        font-weight: 800;
        line-height: 1;
      ">${label}</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export default function MapaRiesgo() {
  const navigate = useNavigate();
  const [comunidades, setComunidades] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    api.get("/mapa/riesgo")
      .then(({ data }) => {
        if (!alive) return;
        setComunidades(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.error || "Error al cargar el mapa de riesgo.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const totalRiesgo = useMemo(
    () => comunidades.reduce((total, comunidad) => total + Number(comunidad.total_riesgo || 0), 0),
    [comunidades]
  );

  const pacientesRiesgo = selected?.pacientes_riesgo || [];

  return (
    <div className="mapa-riesgo-page">
      <style>{`
        .mapa-riesgo-page {
          min-height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .mapa-riesgo-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
        }

        .mapa-riesgo-header h1 {
          margin: 0;
          color: var(--text);
          font-size: clamp(1.35rem, 2vw, 1.9rem);
          letter-spacing: 0;
        }

        .mapa-riesgo-header p {
          margin: 0.25rem 0 0;
          color: var(--text-muted);
          font-size: 0.92rem;
        }

        .mapa-riesgo-stat {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          min-height: 38px;
          padding: 0.48rem 0.75rem;
          border-radius: 8px;
          background: color-mix(in srgb, #991b1b 12%, var(--surface));
          border: 1px solid color-mix(in srgb, #991b1b 28%, var(--border));
          color: var(--text);
          font-weight: 700;
          white-space: nowrap;
        }

        .mapa-riesgo-map-shell {
          position: relative;
          flex: 1;
          min-height: 620px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface);
        }

        .mapa-riesgo-map {
          height: 100%;
          min-height: 620px;
          width: 100%;
        }

        .mapa-riesgo-loading,
        .mapa-riesgo-error {
          position: absolute;
          top: 1rem;
          left: 1rem;
          z-index: 180;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          max-width: min(420px, calc(100% - 2rem));
          padding: 0.65rem 0.8rem;
          border-radius: 8px;
          background: var(--card, var(--surface));
          border: 1px solid var(--card-border, var(--border));
          color: var(--text);
          box-shadow: 0 14px 32px rgba(15,23,42,0.16);
        }

        .mapa-riesgo-error {
          color: #fca5a5;
        }

        .mapa-riesgo-drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: min(360px, 100vw);
          height: 100vh;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          background: var(--card, var(--surface));
          border-left: 1px solid var(--card-border, var(--border));
          box-shadow: -18px 0 42px rgba(15,23,42,0.28);
          color: var(--text);
        }

        .mapa-riesgo-drawer-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem;
          border-bottom: 1px solid var(--card-border, var(--border));
        }

        .mapa-riesgo-drawer-header h2 {
          margin: 0;
          color: var(--text);
          font-size: 1rem;
          letter-spacing: 0;
        }

        .mapa-riesgo-drawer-header p {
          margin: 0.25rem 0 0;
          color: var(--text-muted);
          font-size: 0.84rem;
        }

        .mapa-riesgo-close {
          flex: 0 0 34px;
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--card-border, var(--border));
          border-radius: 8px;
          background: transparent;
          color: var(--text);
          cursor: pointer;
        }

        .mapa-riesgo-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 0.85rem;
        }

        .mapa-riesgo-patient {
          width: 100%;
          display: block;
          text-align: left;
          padding: 0.75rem;
          margin-bottom: 0.55rem;
          border: 1px solid var(--card-border, var(--border));
          border-radius: 8px;
          background: color-mix(in srgb, var(--primary-lt) 22%, var(--surface));
          color: var(--text);
          cursor: pointer;
        }

        .mapa-riesgo-patient:hover {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
          background: color-mix(in srgb, var(--primary-lt) 48%, var(--surface));
        }

        .mapa-riesgo-patient strong,
        .mapa-riesgo-patient span {
          display: block;
          overflow-wrap: anywhere;
        }

        .mapa-riesgo-patient span {
          margin-top: 0.2rem;
          color: var(--text-muted);
          font-size: 0.82rem;
        }

        .mapa-riesgo-empty {
          padding: 1rem;
          border: 1px dashed var(--card-border, var(--border));
          border-radius: 8px;
          color: var(--text-muted);
          background: color-mix(in srgb, var(--surface2) 50%, transparent);
        }

        .leaflet-container {
          background: var(--surface2);
          font-family: inherit;
        }

        @media (max-width: 720px) {
          .mapa-riesgo-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .mapa-riesgo-map-shell,
          .mapa-riesgo-map {
            min-height: 560px;
          }
        }
      `}</style>

      <div className="mapa-riesgo-header">
        <div>
          <h1>Mapa de Riesgo Obstétrico</h1>
          <p>Comunidades del CAP El Chal con embarazadas de riesgo activo.</p>
        </div>
        <div className="mapa-riesgo-stat">
          <AlertTriangle size={17} />
          {totalRiesgo} en riesgo
        </div>
      </div>

      <div className="mapa-riesgo-map-shell">
        {loading && (
          <div className="mapa-riesgo-loading">
            <Loader2 className="spin" size={16} />
            Cargando comunidades...
          </div>
        )}

        {error && (
          <div className="mapa-riesgo-error">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <MapContainer
          center={EL_CHAL_CENTER}
          zoom={11}
          minZoom={10}
          maxZoom={19}
          maxBounds={EL_CHAL_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom
          className="mapa-riesgo-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {comunidades.map((comunidad) => (
            <Marker
              key={comunidad.id}
              position={[Number(comunidad.lat), Number(comunidad.lng)]}
              icon={createCommunityIcon(comunidad.total_riesgo)}
              eventHandlers={{
                click: () => setSelected(comunidad),
              }}
            />
          ))}
        </MapContainer>
      </div>

      {selected && (
        <aside className="mapa-riesgo-drawer" aria-label="Detalle de comunidad">
          <div className="mapa-riesgo-drawer-header">
            <div>
              <h2>{selected.nombre}</h2>
              <p>Territorio {selected.territorio} · Sector {selected.sector}</p>
            </div>
            <button
              type="button"
              className="mapa-riesgo-close"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mapa-riesgo-drawer-body">
            {pacientesRiesgo.length > 0 ? (
              pacientesRiesgo.map((paciente) => (
                <button
                  key={`${paciente.paciente_id}-${paciente.embarazo_id || "sin-embarazo"}`}
                  type="button"
                  className="mapa-riesgo-patient"
                  onClick={() => navigate(`/pacientes/${paciente.paciente_id}`)}
                >
                  <strong>{paciente.nombre || "Paciente sin nombre"}</strong>
                  <span>No. expediente: {paciente.expediente || "—"}</span>
                </button>
              ))
            ) : (
              <div className="mapa-riesgo-empty">
                Sin embarazadas con riesgo actualmente
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
