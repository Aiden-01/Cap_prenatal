import { useId, useState } from "react";
import { TileLayer } from "react-leaflet";
import "./map-base-layer-control.css";

const DEFAULT_BASE_LAYER_ID = "streets";
const MAX_BASE_LAYER_ZOOM = 19;

const MAP_BASE_LAYERS = Object.freeze({
  streets: {
    label: "Calles",
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  satellite: {
    label: "Satélite",
    maxNativeZoom: 18,
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
});
const BASE_LAYER_IDS = Object.keys(MAP_BASE_LAYERS);

function stopMapInteraction(event) {
  event.stopPropagation();
}

export default function MapBaseLayerControl() {
  const groupName = useId();
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_BASE_LAYER_ID);
  const activeLayer = MAP_BASE_LAYERS[activeLayerId];

  const handleLayerKeyDown = (event) => {
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    if (!backward && !forward) return;

    event.preventDefault();
    event.stopPropagation();
    const currentIndex = BASE_LAYER_IDS.indexOf(event.currentTarget.value);
    const offset = backward ? -1 : 1;
    const nextIndex = (currentIndex + offset + BASE_LAYER_IDS.length) % BASE_LAYER_IDS.length;
    const nextLayerId = BASE_LAYER_IDS[nextIndex];
    const group = event.currentTarget.closest("fieldset");

    setActiveLayerId(nextLayerId);
    requestAnimationFrame(() => {
      group?.querySelector(`input[value="${nextLayerId}"]`)?.focus();
    });
  };

  return (
    <>
      <TileLayer
        key={activeLayerId}
        attribution={activeLayer.attribution}
        maxNativeZoom={activeLayer.maxNativeZoom}
        maxZoom={MAX_BASE_LAYER_ZOOM}
        url={activeLayer.url}
      />

      <fieldset
        className="map-base-layer-control leaflet-control"
        onClick={stopMapInteraction}
        onDoubleClick={stopMapInteraction}
        onPointerDown={stopMapInteraction}
        onWheel={stopMapInteraction}
      >
        <legend>Tipo de mapa</legend>
        {Object.entries(MAP_BASE_LAYERS).map(([layerId, layer]) => (
          <label
            key={layerId}
            className={`map-base-layer-control__option ${activeLayerId === layerId ? "is-active" : ""}`}
          >
            <input
              type="radio"
              name={groupName}
              value={layerId}
              checked={activeLayerId === layerId}
              onChange={() => setActiveLayerId(layerId)}
              onKeyDown={handleLayerKeyDown}
            />
            <span>{layer.label}</span>
          </label>
        ))}
      </fieldset>
    </>
  );
}
