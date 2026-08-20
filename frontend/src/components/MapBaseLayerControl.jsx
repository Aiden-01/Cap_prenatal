import { useEffect, useRef, useState } from "react";
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

export default function MapBaseLayerControl() {
  const controlRef = useRef(null);
  const [activeLayerId, setActiveLayerId] = useState(DEFAULT_BASE_LAYER_ID);
  const activeLayer = MAP_BASE_LAYERS[activeLayerId];

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return undefined;

    const selectLayer = (event) => {
      const option = event.target.closest?.("[data-map-layer-id]");
      const nextLayerId = option?.dataset.mapLayerId;
      if (!MAP_BASE_LAYERS[nextLayerId]) return;

      event.preventDefault();
      event.stopPropagation();
      setActiveLayerId(nextLayerId);
      option.focus({ preventScroll: true });
    };
    const stopMapInteraction = (event) => event.stopPropagation();
    const selectionEvents = ["pointerdown", "mousedown", "touchstart", "click"];
    const isolatedEvents = ["dblclick", "contextmenu", "wheel"];

    selectionEvents.forEach((eventName) => control.addEventListener(eventName, selectLayer, { passive: false }));
    isolatedEvents.forEach((eventName) => control.addEventListener(eventName, stopMapInteraction));

    return () => {
      selectionEvents.forEach((eventName) => control.removeEventListener(eventName, selectLayer));
      isolatedEvents.forEach((eventName) => control.removeEventListener(eventName, stopMapInteraction));
    };
  }, []);

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
    const group = event.currentTarget.closest('[role="radiogroup"]');

    setActiveLayerId(nextLayerId);
    requestAnimationFrame(() => {
      group?.querySelector(`[data-map-layer-id="${nextLayerId}"]`)?.focus();
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
        ref={controlRef}
        className="map-base-layer-control leaflet-control"
        role="radiogroup"
        aria-label="Tipo de mapa"
      >
        <legend>Tipo de mapa</legend>
        {Object.entries(MAP_BASE_LAYERS).map(([layerId, layer]) => (
          <button
            type="button"
            role="radio"
            aria-checked={activeLayerId === layerId}
            tabIndex={activeLayerId === layerId ? 0 : -1}
            value={layerId}
            key={layerId}
            data-map-layer-id={layerId}
            className={`map-base-layer-control__option ${activeLayerId === layerId ? "is-active" : ""}`}
            onClick={() => setActiveLayerId(layerId)}
            onKeyDown={handleLayerKeyDown}
          >
            <span>{layer.label}</span>
          </button>
        ))}
      </fieldset>
    </>
  );
}
