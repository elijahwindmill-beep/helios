import type { CanvasSource, Map as MlMap } from 'maplibre-gl';
import { useApp, type ShadowQuality } from '../store/app';
import { sunPosition } from '../sun/position';
import { ShadowRenderer } from '../terrain/shadowRenderer';
import { buildMosaic, planMosaic, rangeBounds, rangeContains, type Mosaic, type TileRange } from '../terrain/mosaic';
import type { BaseLayer } from './style';
import { useSunHours } from '../store/sunHours';
import { dayTimesCached } from '../sun/dayCache';
import { timeZoneAt } from '../sun/timezone';
import { addLight, hoursPixels } from '../terrain/sunHours';

const HOURS_SOURCE = 'sun-hours';
/** Sun positions sampled across the day for the heatmap. */
const HOURS_STEP_MS = 10 * 60000;

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

// Low sun: shadows are lit by the blue sky, not the sun, so they cool as sunlit ground warms.
const SKY_FILL: [number, number, number] = [0.12, 0.26, 0.62];

/**
 * Terrain shadows: loads elevation for the view plus a margin, ray-marches it toward the
 * sun on the GPU, and drapes the result on the 3D terrain as a canvas raster layer.
 */
// For the video export: true while the shadows are still catching up with the view or time.
let busy = () => false;
export const shadowsBusy = () => busy();

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
  let pausing = false;

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
    const cool = s.overlays.lightColour ? 0.7 * Math.min(1, Math.max(0, (12 - sun.elevation) / 12)) : 0;
    const color = look.color.map((c, i) => c + (SKY_FILL[i] - c) * cool) as [number, number, number];
    const ms = renderer.render({
      azimuth: sun.azimuth,
      elevation: sun.elevationTrue,
      color,
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
      pausing = true;
      let frames = 0;
      const onRender = () => {
        if (++frames < 2) return map.triggerRepaint();
        map.off('render', onRender);
        source.pause();
        pausing = false;
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
    if (!s.overlays.shadows && !s.overlays.sunHours) return;
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
      hoursMosaic = null;
      const source = map.getSource<CanvasSource>(SOURCE);
      if (source) source.setCoordinates(corners(next));
      else addLayer(next);
      loading = null;
      useApp.getState().setShadowStatus({ state: 'idle' });
      draw();
      scheduleHours();
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
        layout: { visibility: useApp.getState().overlays.shadows && !useApp.getState().overlays.sunHours ? 'visible' : 'none' },
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

  // ---- Hours of direct sun: the day's shadow masks added up, in its own renderer ----
  let hoursRenderer: ShadowRenderer | null = null;
  let hoursMosaic: Mosaic | null = null;
  let hoursJob = 0;
  let hoursTimer = 0;
  let hoursDay = '';
  const hoursCanvas = document.createElement('canvas');

  const computeHours = async () => {
    const s = useApp.getState();
    const m = mosaic;
    if (!s.overlays.sunHours || !m) return;
    const job = ++hoursJob;
    const { lat, lng } = s.pin;
    const day = dayTimesCached(s.time, lat, lng, timeZoneAt(lat, lng));
    hoursDay = `${day.dayStart},${lat.toFixed(4)},${lng.toFixed(4)}`;
    useSunHours.setState({ state: 'working', progress: 0 });
    try {
      hoursRenderer ??= new ShadowRenderer();
      if (hoursMosaic !== m) {
        hoursRenderer.setMosaic(m);
        hoursMosaic = m;
      }
    } catch {
      useSunHours.setState({ state: 'idle' });
      return;
    }
    const start = day.polar === 'day' ? day.dayStart : (day.sunrise ?? day.dayStart);
    const end = day.polar === 'day' ? day.dayEnd : (day.sunset ?? day.dayStart);
    let total: Float32Array | null = null;
    let w = 0;
    let h = 0;
    for (let t = start + HOURS_STEP_MS / 2; t < end; t += HOURS_STEP_MS) {
      const sun = sunPosition(t, lat, lng);
      if (sun.elevationTrue > 0) {
        hoursRenderer.render({ azimuth: sun.azimuth, elevation: sun.elevationTrue, color: [0, 0, 0], strength: 1, maxOutputSize: 1024, steps: 128, maxDistanceMeters: SHADOW_REACH_M });
        w = hoursRenderer.canvas.width;
        h = hoursRenderer.canvas.height;
        total ??= new Float32Array(w * h);
        addLight(total, hoursRenderer.readMask(), Math.min(HOURS_STEP_MS, end - t + HOURS_STEP_MS / 2) / 3600000);
      }
      useSunHours.setState({ progress: (t - start) / Math.max(1, end - start) });
      // Let the page breathe between samples; stop if a newer job started.
      await new Promise((r) => setTimeout(r, 0));
      if (job !== hoursJob) return;
    }
    if (!total) {
      w = h = 1;
      total = new Float32Array(1);
    }
    hoursCanvas.width = w;
    hoursCanvas.height = h;
    hoursCanvas.getContext('2d')!.putImageData(new ImageData(hoursPixels(total, w, h), w, h), 0, 0);
    let max = 0;
    for (const v of total) if (v > max) max = v;
    const source = map.getSource<CanvasSource>(HOURS_SOURCE);
    if (source) source.setCoordinates(corners(m));
    else {
      map.addSource(HOURS_SOURCE, { type: 'canvas', canvas: hoursCanvas, coordinates: corners(m), animate: false });
      map.addLayer(
        { id: HOURS_SOURCE, type: 'raster', source: HOURS_SOURCE, layout: { visibility: 'visible' }, paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.72 } },
        map.getLayer(beforeLayer) ? beforeLayer : undefined,
      );
    }
    const src = map.getSource<CanvasSource>(HOURS_SOURCE)!;
    src.play();
    let frames = 0;
    const onRender = () => {
      if (++frames < 2) return map.triggerRepaint();
      map.off('render', onRender);
      src.pause();
    };
    map.on('render', onRender);
    map.triggerRepaint();
    useSunHours.setState({ state: 'idle', progress: 1, max });
  };
  const scheduleHours = () => {
    clearTimeout(hoursTimer);
    hoursTimer = window.setTimeout(() => {
      hoursTimer = 0;
      void computeHours();
    }, 300);
  };

  let moveTimer = 0;
  const onMoveEnd = () => {
    clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => {
      moveTimer = 0;
      void refreshMosaic();
    }, 250);
  };
  busy = () => {
    const o = useApp.getState().overlays;
    return (o.shadows || o.sunHours) && (moveTimer !== 0 || loading !== null || frame !== 0 || pausing || hoursTimer !== 0 || useSunHours.getState().state === 'working');
  };
  map.on('moveend', onMoveEnd);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.time !== prev.time || now.pin !== prev.pin) {
      lightHillshade();
      requestDraw();
    }
    if (now.base !== prev.base || now.overlays.lightColour !== prev.overlays.lightColour) requestDraw();
    if (now.overlays.sunHours && (!prev.overlays.sunHours || now.pin !== prev.pin || now.time !== prev.time)) {
      const d = dayTimesCached(now.time, now.pin.lat, now.pin.lng, timeZoneAt(now.pin.lat, now.pin.lng));
      const key = `${d.dayStart},${now.pin.lat.toFixed(4)},${now.pin.lng.toFixed(4)}`;
      if (!prev.overlays.sunHours || key !== hoursDay) {
        if (!mosaic) refreshMosaic();
        scheduleHours();
      }
    }
    if (!now.overlays.sunHours && prev.overlays.sunHours) hoursJob++;
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
    clearTimeout(hoursTimer);
    hoursJob++;
    cancelAnimationFrame(frame);
    map.off('render', pendingPause);
    loading?.abort.abort();
  };
}
