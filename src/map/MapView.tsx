import { useEffect, useRef } from 'react';
import { Map as MlMap, Marker, addProtocol, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
import { useApp } from '../store/app';
import { INITIAL_VIEW } from '../config';
import { IMAGERY, TERRARIUM_URL } from './sources';
import { basePaint, buildStyle, layerVisibility, satelliteSource, skyFor } from './style';
import { installCameraControls } from './controls';
import { readCamera } from './camera';
import { setMap } from './mapInstance';
import { installShadowLayer } from './shadowLayer';
import { writeTimeToUrl } from '../store/urlTime';

// MapLibre 6 looks for its worker next to its own bundle, which Vite moves. The
// helios-maplibre-worker plugin in vite.config.ts serves the original files here instead.
setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`);

// One shared DEM cache for contour generation, decoded in a worker.
const demSource = new mlcontour.DemSource({
  url: TERRARIUM_URL,
  encoding: 'terrarium',
  maxzoom: 13,
  worker: true,
});
demSource.setupMaplibre({ addProtocol });
const CONTOUR_TILES = demSource.contourProtocolUrl({
  // zoom: [minor, major] spacing in metres
  thresholds: { 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 15: [10, 50] },
  elevationKey: 'ele',
  levelKey: 'level',
  contourLayer: 'contours',
});

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
        contourTilesUrl: CONTOUR_TILES,
      }),
      ...INITIAL_VIEW,
      maxPitch: 85,
      hash: 'map',
      attributionControl: { compact: true },
      maplibreLogo: false,
      canvasContextAttributes: { preserveDrawingBuffer: false, antialias: true },
    });
    setMap(map);

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

    const removeControls = installCameraControls(map, {
      onDoubleClick: (ll) => useApp.getState().setPin({ lat: ll.lat, lng: ll.lng, name: '' }),
    });

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

    let removeShadows = () => {};
    map.once('load', () => {
      removeShadows = installShadowLayer(map, 'contour-minor');
    });
    writeTimeToUrl(s.time);

    // Store -> map. The style is built once; switching bases only flips layer visibility,
    // so later custom layers (shadows, sun) survive a base change.
    const unsubscribe = useApp.subscribe((now, prev) => {
      if (now.time !== prev.time) writeTimeToUrl(now.time);
      if (now.pin !== prev.pin) {
        pin.setLngLat([now.pin.lng, now.pin.lat]);
        setPinLabel(now.pin.name);
      }
      const whenReady = (fn: () => void) => (map.isStyleLoaded() ? fn() : map.once('load', fn));
      if (now.base !== prev.base || now.overlays !== prev.overlays) whenReady(applyLayers);
      if (now.imagery !== prev.imagery || now.maptilerKey !== prev.maptilerKey) whenReady(swapImagery);
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

    return () => {
      unsubscribe();
      removeShadows();
      removeControls();
      cancelAnimationFrame(raf);
      setMap(null);
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="map" role="application" aria-label="3D terrain map" />;
}
