import type { CanvasSource, Map as MlMap } from 'maplibre-gl';
import { useApp, type ShadowQuality } from '../store/app';
import { sunPosition } from '../sun/position';
import { ShadowRenderer } from '../terrain/shadowRenderer';
import { buildMosaic, planMosaic, rangeBounds, rangeContains, type Mosaic, type TileRange } from '../terrain/mosaic';
import type { BaseLayer } from './style';

const SOURCE = 'shadows';
export const SHADOW_LAYER = 'shadows';

const QUALITY: Record<ShadowQuality, { maxTilesPerSide: number; maxZoom: number; maxOutputSize: number; steps: number }> = {
  low: { maxTilesPerSide: 8, maxZoom: 12, maxOutputSize: 1024, steps: 96 },
  medium: { maxTilesPerSide: 10, maxZoom: 12, maxOutputSize: 2048, steps: 160 },
  high: { maxTilesPerSide: 14, maxZoom: 13, maxOutputSize: 3072, steps: 256 },
};

/** Mountains further away than this don't cast shadows into the view (and aren't loaded). */
const SHADOW_REACH_M = 12000;
/** Largest distance from the view centre that still gets shadows. */
const MAX_HALF_SIZE_M = 30000;

// Shadow colour and opacity per base. Paper uses the brief's slate.
const LOOK: Record<BaseLayer, { color: [number, number, number]; strength: number }> = {
  paper: { color: [0x3b / 255, 0x4a / 255, 0x5a / 255], strength: 0.42 },
  terrain: { color: [0x3b / 255, 0x4a / 255, 0x5a / 255], strength: 0.45 },
  satellite: { color: [0.04, 0.07, 0.12], strength: 0.55 },
};

/**
 * Terrain shadows: loads elevation for the view plus a margin, ray-marches it toward the
 * sun on the GPU, and drapes the result on the 3D terrain as a canvas raster layer.
 */
export function installShadowLayer(map: MlMap, beforeLayer: string): () => void {
  let renderer: ShadowRenderer;
  try {
    renderer = new ShadowRenderer();
  } catch (err) {
    useApp.getState().setShadowStatus({ state: 'error', message: (err as Error).message });
    return () => {};
  }
  let mosaic: Mosaic | null = null;
  let loading: { range: TileRange; abort: AbortController } | null = null;
  let frame = 0;
  let pendingPause: () => void = () => {};

  const corners = (r: TileRange): [[number, number], [number, number], [number, number], [number, number]] => {
    const b = rangeBounds(r);
    return [
      [b.west, b.north],
      [b.east, b.north],
      [b.east, b.south],
      [b.west, b.south],
    ];
  };

  const draw = () => {
    frame = 0;
    const s = useApp.getState();
    if (!mosaic || !s.overlays.shadows) return;
    const sun = sunPosition(s.time, s.pin.lat, s.pin.lng);
    const q = QUALITY[s.shadowQuality];
    const look = LOOK[s.base];
    const ms = renderer.render({
      azimuth: sun.azimuth,
      elevation: sun.elevationTrue,
      color: look.color,
      strength: look.strength,
      maxOutputSize: Math.min(q.maxOutputSize, renderer.maxTextureSize),
      steps: q.steps,
      maxDistanceMeters: SHADOW_REACH_M,
    });
    const source = map.getSource<CanvasSource>(SOURCE);
    if (source) {
      // Re-upload the canvas, then stop re-uploading every frame. The 3D terrain drapes
      // raster layers from a cache that only refreshes a frame later, so play for two.
      source.play();
      let frames = 0;
      const onRender = () => {
        if (++frames < 2) return map.triggerRepaint();
        map.off('render', onRender);
        source.pause();
      };
      map.off('render', pendingPause);
      pendingPause = onRender;
      map.on('render', onRender);
    }
    if (s.shadowStatus.state !== 'loading') s.setShadowStatus({ state: 'idle', renderMs: ms });
  };
  const requestDraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const refreshMosaic = async () => {
    const s = useApp.getState();
    if (!s.overlays.shadows) return;
    const q = QUALITY[s.shadowQuality];
    const b = map.getBounds();
    const center = map.getCenter();
    const plan = planMosaic(
      { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() },
      { lng: center.lng, lat: center.lat },
      {
        maxTilesPerSide: Math.min(q.maxTilesPerSide, Math.floor(renderer.maxTextureSize / 256)),
        maxZoom: q.maxZoom,
        marginMeters: SHADOW_REACH_M,
        maxHalfSize: MAX_HALF_SIZE_M,
      },
    );
    if (mosaic && rangeContains(mosaic, plan.need)) return;
    if (loading && rangeContains(loading.range, plan.need)) return;
    loading?.abort.abort();
    const abort = new AbortController();
    loading = { range: plan.build, abort };
    s.setShadowStatus({ state: 'loading' });
    try {
      const next = await buildMosaic(plan.build, abort.signal);
      if (abort.signal.aborted) return;
      mosaic = next;
      renderer.setMosaic(next);
      const source = map.getSource<CanvasSource>(SOURCE);
      if (source) source.setCoordinates(corners(next));
      else addLayer(next);
      loading = null;
      useApp.getState().setShadowStatus({ state: 'idle' });
      draw();
    } catch (err) {
      if (abort.signal.aborted) return;
      loading = null;
      useApp.getState().setShadowStatus({ state: 'error', message: (err as Error).message });
    }
  };

  const addLayer = (m: Mosaic) => {
    map.addSource(SOURCE, { type: 'canvas', canvas: renderer.canvas, coordinates: corners(m), animate: false });
    map.addLayer(
      {
        id: SHADOW_LAYER,
        type: 'raster',
        source: SOURCE,
        layout: { visibility: useApp.getState().overlays.shadows ? 'visible' : 'none' },
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
      },
      map.getLayer(beforeLayer) ? beforeLayer : undefined,
    );
  };

  // Hillshade lit from the real sun, so relief shading agrees with the cast shadows.
  const lightHillshade = () => {
    const s = useApp.getState();
    const sun = sunPosition(s.time, s.pin.lat, s.pin.lng);
    for (const id of ['paper-hillshade', 'terrain-hillshade']) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, 'hillshade-illumination-anchor', 'map');
      map.setPaintProperty(id, 'hillshade-illumination-direction', sun.azimuth);
      map.setPaintProperty(id, 'hillshade-illumination-altitude', Math.max(5, sun.elevationTrue));
    }
  };

  let moveTimer = 0;
  const onMoveEnd = () => {
    clearTimeout(moveTimer);
    moveTimer = window.setTimeout(refreshMosaic, 250);
  };
  map.on('moveend', onMoveEnd);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.time !== prev.time || now.pin !== prev.pin) {
      lightHillshade();
      requestDraw();
    }
    if (now.base !== prev.base) requestDraw();
    if (now.shadowQuality !== prev.shadowQuality) {
      mosaic = null;
      refreshMosaic();
    }
    if (now.overlays.shadows !== prev.overlays.shadows) {
      if (now.overlays.shadows) {
        refreshMosaic();
        requestDraw();
      }
    }
  });

  lightHillshade();
  refreshMosaic();
  // Handy for checking the shadow maths from the browser console during development.
  if (import.meta.env.DEV) {
    (window as unknown as { __shadow: unknown }).__shadow = { renderer, getMosaic: () => mosaic, redraw: draw };
  }

  return () => {
    unsubscribe();
    map.off('moveend', onMoveEnd);
    clearTimeout(moveTimer);
    cancelAnimationFrame(frame);
    map.off('render', pendingPause);
    loading?.abort.abort();
  };
}
