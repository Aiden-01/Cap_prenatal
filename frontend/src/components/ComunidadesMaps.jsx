import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const EL_CHAL_CENTER = [16.4870, -89.6820];
const EL_CHAL_BOUNDS = [
  [16.30, -89.94],
  [16.70, -89.52],
];

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

function OverviewMapView({ comunidades, visible }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return undefined;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    const positions = comunidades
      .map((item) => [parseCoordinate(item.lat), parseCoordinate(item.lng)])
      .filter(([lat, lng]) => lat !== null && lng !== null);
    if (positions.length === 1) map.setView(positions[0], 13);
    if (positions.length > 1) map.fitBounds(positions, { padding: [36, 36], maxZoom: 13 });
    return () => cancelAnimationFrame(frame);
  }, [comunidades, map, visible]);

  return null;
}

function overviewMarkerIcon(hasRisk, selected) {
  return L.divIcon({
    className: "comunidades-overview-marker",
    html: `<div class="${hasRisk ? "has-risk" : ""} ${selected ? "is-selected" : ""}"><span></span></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });
}

export function ComunidadMiniMap({ lat, lng, onPickCoords }) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  const position = parsedLat !== null && parsedLng !== null ? [parsedLat, parsedLng] : null;

  return (
    <MapContainer
      center={position || EL_CHAL_CENTER}
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
  );
}

export function ComunidadesOverviewMap({ comunidades, selectedCommunity, onSelect, visible }) {
  return (
    <MapContainer
      center={EL_CHAL_CENTER}
      zoom={11}
      minZoom={10}
      maxZoom={18}
      maxBounds={EL_CHAL_BOUNDS}
      maxBoundsViscosity={1.0}
      scrollWheelZoom
      className="comunidades-overview-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <OverviewMapView comunidades={comunidades} visible={visible} />
      {comunidades.map((comunidad) => (
        <Marker
          key={comunidad.id}
          position={[Number(comunidad.lat), Number(comunidad.lng)]}
          icon={overviewMarkerIcon(
            Number(comunidad.total_riesgo_activo || 0) > 0,
            comunidad.id === selectedCommunity?.id,
          )}
          eventHandlers={{ click: () => onSelect(comunidad.id) }}
        />
      ))}
    </MapContainer>
  );
}
