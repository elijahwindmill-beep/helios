import { useEffect, useRef } from 'react';
import { Map as MlMap, Marker, addProtocol, setWorkerUrl, type VectorTileSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
import { useApp } from '../store/app';
import { INITIAL_VIEW } from '../config';
import { ELEVATION, ELEVATION_ORDER, IMAGERY, type ElevationId } from './sources';
import { basePaint, buildStyle, demSources, layerVisibility, satelliteSource, skyFor } from './style';
import { PERFORMANCE } from './performance';
import { installCameraControls } from './controls';
import { installTouchControls } from './touchControls';
import { readCamera } from './camera';
import { setMap } from './mapInstance';
import { installShadowLayer } from './shadowLayer';
import { installGoogle3d } from './google3d';
import { installSteadyCamera } from './steadyCamera';

const STEADY_CAMERA = false;
import { installSunScene } from '../scene/sunScene';
import { installLightColour } from '../scene/lightColour';
import { installUserLayers } from '../layers/userLayers';
import { installLens } from '../scene/lens';
import { installPhotoSpots } from '../layers/photoSpots';
import { useLayers } from '../store/layers';
import { writeTimeToUrl } from '../store/urlTime';
import { COMPACT_QUERY } from '../ui/useMedia';

// MapLibre 6 looks for its worker next to its own bundle, which Vite moves. The
// helios-maplibre-worker plugin in vite.config.ts serves the original files here instead.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

// One DEM cache per elevation service for contour generation, decoded in a worker.
const CONTOUR_TILES = Object.fromEntries(
  ELEVATION_ORDER.map((id) => {
    const p = ELEVATION[id];
    const dem = new mlcontour.DemSource({ id: `contour-${id}`, url: p.url, encoding: p.encoding, maxzoom: p.contourMaxzoom, worker: true });
    dem.setupMaplibre({ addProtocol });
    const url = dem.contourProtocolUrl({
      // zoom: [minor, major] spacing in metres
      thresholds: { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 15: [10, 50] },
      elevationKey: 'ele',
      levelKey: 'level',
      contourLayer: 'contours',
    });
    return [id, url];
  }),
) as Record<ElevationId, string>;

const pixelRatio = () => Math.min(window.devicePixelRatio || 1, PERFORMANCE[useApp.getState().performance].maxPixelRatio);

/**
 * The view in the page link (#map=zoom/lat/lng/bearing/pitch), read once at startup.
 * MapLibre reads it too, but removing a map (React StrictMode mounts twice in dev) also
 * deletes it from the URL, so the second map would lose it.
 */
const LINKED_VIEW = (() => {
  const v = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('map');
  const n = v?.split('/').map(Number);
  if (!n || n.length < 3 || n.some((x) => !Number.isFinite(x))) return null;
  return { zoom: n[0], center: [n[2], n[1]] as [number, number], bearing: n[3] ?? 0, pitch: n[4] ?? 0 };
})();

function makePinElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pin';
  el.innerHTML = '<div class="pin-head"></div><div class="pin-label"></div>';
  return el;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = useApp.getState();
    const map = new MlMap({
      container: containerRef.current!,
      style: buildStyle({
        base: s.base,
        overlays: s.overlays,
        imagery: IMAGERY[s.imagery],
        imageryKey: s.maptilerKey,
        elevation: ELEVATION[s.elevation],
        contourTilesUrl: CONTOUR_TILES[s.elevation],
      }),
      ...INITIAL_VIEW,
      ...LINKED_VIEW,
      maxPitch: 85,
      hash: 'map',
      attributionControl: { compact: true },
      maplibreLogo: false,
      canvasContextAttributes: { preserveDrawingBuffer: false, antialias: true },
      pixelRatio: pixelRatio(),
    });
    setMap(map);

    // Past its LiDAR coverage the detailed elevation service answers 404 and MapLibre keeps the
    // coarser parent tile, as intended: keep those expected misses out of the console.
    map.on('error', (e) => {
      const err = e.error as { status?: number } | undefined;
      const sourceId = (e as { sourceId?: string }).sourceId ?? '';
      if (err?.status === 404 && sourceId.startsWith('dem-')) return;
      console.error(e.error);
    });

    const pin = new Marker({ element: makePinElement(), anchor: 'bottom', draggable: true })
      .setLngLat([s.pin.lng, s.pin.lat])
      .addTo(map);
    const setPinLabel = (name: string) => {
      const label = pin.getElement().querySelector('.pin-label')!;
      label.textContent = name;
      (label as HTMLElement).hidden = !name;
    };
    setPinLabel(s.pin.name);
    pin.on('dragend', () => {
      const ll = pin.getLngLat();
      useApp.getState().setPin({ lat: ll.lat, lng: ll.lng, name: '' });
    });

    // Double-click or double-tap moves the pin, or finishes a route being drawn.
    const movePin = (ll: { lat: number; lng: number }) => {
      if (useLayers.getState().draft) return useLayers.getState().finishDraft();
      useApp.getState().setPin({ lat: ll.lat, lng: ll.lng, name: '' });
    };
    const removeMouse = installCameraControls(map, { onDoubleClick: movePin });
    const removeTouch = installTouchControls(map, { onDoubleTap: movePin });
    const removeControls = () => {
      removeMouse();
      removeTouch();
    };

    // Live readout, at most once per frame.
    let raf = 0;
    const publishCamera = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        useApp.getState().setCamera(readCamera(map));
      });
    };
    map.on('move', publishCamera);
    map.on('idle', publishCamera);
    map.once('load', publishCamera);

    // MapLibre opens the credits box on first load; on phones it would cover the map buttons.
    // Start it collapsed there (it stays one tap away on the (i) button), as MapLibre itself
    // does after the first drag.
    // It re-opens as sources load, so keep collapsing it until the viewer opens it themselves.
    const collapseAttribution = () => {
      if (!window.matchMedia(COMPACT_QUERY).matches) return;
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    };
    map.on('idle', collapseAttribution);
    map.once('load', () => {
      map
        .getContainer()
        .querySelector('.maplibregl-ctrl-attrib-button')
        ?.addEventListener('click', () => map.off('idle', collapseAttribution), { once: true });
    });

    let removeShadows = () => {};
    let removeScene = () => {};
    let removeLight = () => {};
    let removeUser = () => {};
    let removeLens = () => {};
    let removeSpots = () => {};
    let removeGoogle = () => {};
    let removeSteady = () => {};
    map.once('load', () => {
      // Steady camera: off until it works with MapLibre's drag and scroll gestures.
      if (STEADY_CAMERA) removeSteady = installSteadyCamera(map);
      removeShadows = installShadowLayer(map, 'contour-minor');
      // Under the labels so they keep their colour.
      removeLight = installLightColour(map, 'contour-label');
      // Google 3D tiles (optional): under the golden-hour colour, so they take it too.
      removeGoogle = installGoogle3d(map, 'light-colour');
      // Above the light colour and contours, under the labels: routes keep their own colours.
      removeUser = installUserLayers(map, 'contour-label');
      removeSpots = installPhotoSpots(map, 'contour-label');
      // Last layer, so it sees the whole finished frame.
      removeLens = installLens(map);
      removeScene = installSunScene(map);
    });
    writeTimeToUrl(s.time);

    // Store -> map. The style is built once; switching bases only flips layer visibility,
    // so later custom layers (shadows, sun) survive a base change.
    // (Not map.isStyleLoaded(): that is false whenever tiles are still loading, and 'load'
    // only fires once, so changes made then would be lost.)
    let styleReady = false;
    map.once('load', () => (styleReady = true));
    const whenReady = (fn: () => void) => (styleReady ? fn() : map.once('load', fn));
    const unsubscribe = useApp.subscribe((now, prev) => {
      if (now.time !== prev.time) writeTimeToUrl(now.time);
      if (now.pin !== prev.pin) {
        pin.setLngLat([now.pin.lng, now.pin.lat]);
        setPinLabel(now.pin.name);
      }
      if (now.base !== prev.base || now.overlays !== prev.overlays) whenReady(applyLayers);
      if (now.imagery !== prev.imagery || now.maptilerKey !== prev.maptilerKey) whenReady(swapImagery);
      if (now.elevation !== prev.elevation) whenReady(swapElevation);
      if (now.performance !== prev.performance) map.setPixelRatio(pixelRatio());
    });

    function applyLayers() {
      const { base, overlays } = useApp.getState();
      for (const [id, on] of Object.entries(layerVisibility(base, overlays))) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
      for (const [layer, prop, value] of basePaint(base)) {
        if (map.getLayer(layer)) map.setPaintProperty(layer, prop as Parameters<MlMap["setPaintProperty"]>[1], value as string);
      }
      map.setSky(skyFor(base));
    }

    function swapImagery() {
      const { imagery, maptilerKey } = useApp.getState();
      const provider = IMAGERY[imagery];
      if (provider.needsKey && !maptilerKey) return;
      const layer = map.getStyle().layers.find((l) => l.id === 'satellite');
      const layerIndex = map.getStyle().layers.findIndex((l) => l.id === 'satellite');
      const beforeId = map.getStyle().layers[layerIndex + 1]?.id;
      map.removeLayer('satellite');
      map.removeSource('satellite');
      map.addSource('satellite', satelliteSource(provider, maptilerKey));
      map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: layer?.layout }, beforeId);
    }

    function swapElevation() {
      const p = ELEVATION[useApp.getState().elevation];
      const style = map.getStyle();
      const hillshades = style.layers.filter((l) => 'source' in l && l.source === 'dem-hillshade');
      const next = hillshades.map((l) => style.layers[style.layers.indexOf(l) + 1]?.id);
      map.setTerrain(null);
      for (const l of hillshades) map.removeLayer(l.id);
      map.removeSource('dem-hillshade');
      map.removeSource('dem-terrain');
      for (const [id, spec] of Object.entries(demSources(p))) map.addSource(id, spec);
      // Back to front, so each layer's original neighbour above it is already back.
      for (let i = hillshades.length - 1; i >= 0; i--) map.addLayer(hillshades[i], next[i]);
      map.setTerrain({ source: 'dem-terrain', exaggeration: 1 });
      map.getSource<VectorTileSource>('contours')?.setTiles([CONTOUR_TILES[useApp.getState().elevation]]);
    }

    return () => {
      unsubscribe();
      removeShadows();
      removeScene();
      removeLight();
      removeUser();
      removeLens();
      removeSpots();
      removeGoogle();
      removeSteady();
      removeControls();
      cancelAnimationFrame(raf);
      setMap(null);
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="map" role="application" aria-label="3D terrain map" />;
}
