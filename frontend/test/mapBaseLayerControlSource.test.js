import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("el selector compartido ofrece Calles por defecto y Satélite con atribuciones", async () => {
  const control = await source("src/components/MapBaseLayerControl.jsx");

  assert.match(control, /DEFAULT_BASE_LAYER_ID\s*=\s*["']streets["']/);
  assert.match(control, /MAX_BASE_LAYER_ZOOM\s*=\s*19/);
  assert.match(control, /maxZoom=\{MAX_BASE_LAYER_ZOOM\}/);
  assert.match(control, /streets:\s*\{[\s\S]*?maxNativeZoom:\s*19/);
  assert.match(control, /satellite:\s*\{[\s\S]*?maxNativeZoom:\s*18/);
  assert.match(control, /maxNativeZoom=\{activeLayer\.maxNativeZoom\}/);
  assert.match(control, /label:\s*["']Calles["']/);
  assert.match(control, /tile\.openstreetmap\.org/);
  assert.match(control, /label:\s*["']Satélite["']/);
  assert.match(control, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(control, /Esri, Maxar, Earthstar Geographics/);
});

test("el selector usa un grupo de opciones de radio accesible", async () => {
  const control = await source("src/components/MapBaseLayerControl.jsx");

  assert.match(control, /<fieldset/);
  assert.match(control, /<legend>Tipo de mapa<\/legend>/);
  assert.match(control, /role="radiogroup"/);
  assert.match(control, /role="radio"/);
  assert.match(control, /aria-checked=\{activeLayerId === layerId\}/);
  assert.match(control, /tabIndex=\{activeLayerId === layerId \? 0 : -1\}/);
  assert.match(control, /ArrowLeft/);
  assert.match(control, /ArrowRight/);
  assert.match(control, /onKeyDown=\{handleLayerKeyDown\}/);
});

test("el selector captura el clic antes de Leaflet y selecciona la capa explícitamente", async () => {
  const control = await source("src/components/MapBaseLayerControl.jsx");

  assert.match(control, /controlRef/);
  assert.match(control, /event\.target\.closest\?\.\("\[data-map-layer-id\]"\)/);
  assert.match(control, /event\.preventDefault\(\)/);
  assert.match(control, /event\.stopPropagation\(\)/);
  assert.match(control, /setActiveLayerId\(nextLayerId\)/);
  assert.match(control, /selectionEvents\s*=\s*\["pointerdown", "mousedown", "touchstart", "click"\]/);
  assert.match(control, /control\.addEventListener\(eventName, selectLayer/);
  assert.match(control, /control\.removeEventListener\(eventName, selectLayer\)/);
  assert.match(control, /ref=\{controlRef\}/);
  assert.match(control, /data-map-layer-id=\{layerId\}/);
});

test("Mapa de Riesgo y los dos mapas de Comunidades reutilizan el selector", async () => {
  const [riskMap, communityMaps] = await Promise.all([
    source("src/pages/MapaRiesgo.jsx"),
    source("src/components/ComunidadesMaps.jsx"),
  ]);

  assert.match(riskMap, /import MapBaseLayerControl/);
  assert.equal((riskMap.match(/<MapBaseLayerControl\s*\/>/g) || []).length, 1);
  assert.match(communityMaps, /import MapBaseLayerControl/);
  assert.equal((communityMaps.match(/<MapBaseLayerControl\s*\/>/g) || []).length, 2);
  assert.doesNotMatch(`${riskMap}\n${communityMaps}`, /tile\.openstreetmap\.org/);
});

test("el selector de coordenadas permite expandir el mapa sin perder su estado", async () => {
  const [communityPage, communityMaps] = await Promise.all([
    source("src/pages/Comunidades.jsx"),
    source("src/components/ComunidadesMaps.jsx"),
  ]);

  assert.match(communityPage, /Maximize2/);
  assert.match(communityPage, /Minimize2/);
  assert.match(communityPage, /aria-pressed=\{mapExpanded\}/);
  assert.match(communityPage, /expanded=\{mapExpanded\}/);
  assert.match(communityPage, /comunidades-map-box\.is-expanded/);
  assert.match(communityMaps, /function MiniMapResize/);
  assert.match(communityMaps, /invalidateSize\(\{ animate: false, pan: true \}\)/);
  assert.match(communityMaps, /useMemo/);
});
