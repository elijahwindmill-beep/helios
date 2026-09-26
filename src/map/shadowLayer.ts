import type { CanvasSource, Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { sunPosition } from '../sun/position';
import { ShadowRenderer } from '../terrain/shadowRenderer';
import { buildMosaic, clampBounds, expandBounds, planMosaic, rangeBounds, rangeContains, tileRangeFor, type Bounds, type Mosaic, type TileRange } from '../terrain/mosaic';
import { setElevationProvider } from '../terrain/demTiles';
import { ELEVATION } from './sources';
import { PERFORMANCE } from './performance';
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
/** Close-up shadows from detailed elevation, drawn over a hole left in the wide layer. */
const DETAIL_SOURCE = 'shadows-detail';

/** Below this map zoom the wide shadows are already as sharp as the screen shows them. */
const DETAIL_MIN_ZOOM = 12;
/** Nearby cliffs just outside the close-up area still shade it through the finer grid. */
const DETAIL_MARGIN_M = 400;
/** A close-up grid needs at least this share of tiles with real detail to be worth drawing. */
const DETAIL_MIN_NATIVE = 0.5;

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
  setElevationProvider(ELEVATION[useApp.getState().elevation]);
  // The renderer draws both passes; each is copied out to the canvas its map layer shows.
  const wideCanvas = document.createElement('canvas');
  const detailCanvas = document.createElement('canvas');
  let mosaic: Mosaic | null = null;
  let loading: { range: TileRange; abort: AbortController } | null = null;
  let detail: Mosaic | null = null;
  let detailLoading: { range: TileRange; abort: AbortController } | null = null;
  // Close-up grids that turned out to be mostly stretched coarse data: don't try them again.
  let thin: TileRange[] = [];
  let frame = 0;
  const pauses = new Map<string, () => void>();

  const corners = (r: TileRange): [[number, number], [number, number], [number, number], [number, number]] => {
    const b = rangeBounds(r);
    return [
      [b.west, b.north],
      [b.east, b.north],
      [b.east, b.south],
      [b.west, b.south],
    ];
  };

  const viewBounds = (): Bounds => {
    const b = map.getBounds();
    return { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() };
  };

  /**
   * Re-uploads a canvas source, then stops re-uploading it every frame. The 3D terrain drapes
   * raster layers from a cache that only refreshes a frame later, so play for two.
   */
  const refreshSource = (id: string) => {
    const source = map.getSource<CanvasSource>(id);
    if (!source) return;
    source.play();
    const previous = pauses.get(id);
    if (previous) map.off('render', previous);
    let frames = 0;
    const onRender = () => {
      if (++frames < 2) return map.triggerRepaint();
      map.off('render', onRender);
      source.pause();
      pauses.delete(id);
    };
    pauses.set(id, onRender);
    map.on('render', onRender);
    map.triggerRepaint();
  };

  const draw = () => {
    frame = 0;
    const s = useApp.getState();
    if (!mosaic || !s.overlays.shadows) return;
    const sun = sunPosition(s.time, s.pin.lat, s.pin.lng);
    const perf = PERFORMANCE[s.performance];
    const look = LOOK[s.base];
    const cool = s.overlays.lightColour ? 0.7 * Math.min(1, Math.max(0, (12 - sun.elevation) / 12)) : 0;
    const color = look.color.map((c, i) => c + (SKY_FILL[i] - c) * cool) as [number, number, number];
    const common = {
      azimuth: sun.azimuth,
      elevation: sun.elevationTrue,
      color,
      strength: look.strength,
      maxOutputSize: Math.min(perf.shadows.maxOutputSize, renderer.maxTextureSize),
      maxDistanceMeters: SHADOW_REACH_M,
    };
    let ms = 0;
    const close = detail && perf.detail ? detail : null;
    if (close) {
      ms += renderer.render({ ...common, steps: perf.detail!.steps, detail: true });
      renderer.copyTo(detailCanvas);
      refreshSource(DETAIL_SOURCE);
    }
    ms += renderer.render({ ...common, steps: perf.shadows.steps, hole: close });
    renderer.copyTo(wideCanvas);
    refreshSource(SOURCE);
    if (s.shadowStatus.state !== 'loading') s.setShadowStatus({ state: 'idle', renderMs: ms });
  };
  const requestDraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const addLayer = (id: string, canvas: HTMLCanvasElement, m: Mosaic) => {
    map.addSource(id, { type: 'canvas', canvas, coordinates: corners(m), animate: false });
    const o = useApp.getState().overlays;
    map.addLayer(
      {
        id,
        type: 'raster',
        source: id,
        layout: { visibility: o.shadows && !o.sunHours ? 'visible' : 'none' },
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
      },
      map.getLayer(beforeLayer) ? beforeLayer : undefined,
    );
  };

  /** Whether a tile range (of any finer zoom) lies inside a mosaic. */
  const inside = (r: TileRange, m: TileRange) => {
    const k = 2 ** (r.z - m.z);
    return r.x0 >= m.x0 * k && r.y0 >= m.y0 * k && r.x1 < (m.x1 + 1) * k && r.y1 < (m.y1 + 1) * k;
  };
  const intersect = (a: TileRange, m: TileRange): TileRange => {
    const k = 2 ** (a.z - m.z);
    return { z: a.z, x0: Math.max(a.x0, m.x0 * k), y0: Math.max(a.y0, m.y0 * k), x1: Math.min(a.x1, (m.x1 + 1) * k - 1), y1: Math.min(a.y1, (m.y1 + 1) * k - 1) };
  };

  const clearDetail = () => {
    detailLoading?.abort.abort();
    detailLoading = null;
    if (!detail) return;
    detail = null;
    renderer.setDetail(null);
    detailCanvas.width = detailCanvas.height = 1;
    detailCanvas.getContext('2d')!.clearRect(0, 0, 1, 1);
    refreshSource(DETAIL_SOURCE);
    requestDraw();
  };

  /** The close-up area: around the view centre, at the finest zoom that fits the budget. */
  const detailPlan = (): { build: TileRange; need: TileRange } | null => {
    const s = useApp.getState();
    const budget = PERFORMANCE[s.performance].detail;
    const top = ELEVATION[s.elevation].detailZoom;
    if (!budget || !top || !mosaic || !s.overlays.shadows || s.overlays.sunHours || map.getZoom() < DETAIL_MIN_ZOOM) return null;
    const c = map.getCenter();
    const center = { lng: c.lng, lat: c.lat };
    const box = expandBounds(clampBounds(viewBounds(), center, budget.halfSize), DETAIL_MARGIN_M);
    const maxTiles = Math.min(budget.maxTilesPerSide, Math.floor(renderer.maxTextureSize / 256));
    for (let z = top; z > mosaic.z; z--) {
      const build = intersect(tileRangeFor(box, z), mosaic);
      if (build.x1 < build.x0 || build.y1 < build.y0) return null;
      if (build.x1 - build.x0 >= maxTiles || build.y1 - build.y0 >= maxTiles) continue;
      const need = intersect(tileRangeFor(clampBounds(viewBounds(), center, budget.halfSize * 0.6), z), build);
      if (thin.some((t) => rangeContains(t, need))) continue;
      return { build, need };
    }
    return null;
  };

  const refreshDetail = async (): Promise<void> => {
    const plan = detailPlan();
    if (!plan) return clearDetail();
    if (detail && rangeContains(detail, plan.need)) return;
    if (detailLoading && rangeContains(detailLoading.range, plan.need)) return;
    detailLoading?.abort.abort();
    const abort = new AbortController();
    detailLoading = { range: plan.build, abort };
    try {
      const next = await buildMosaic(plan.build, abort.signal);
      if (abort.signal.aborted) return;
      detailLoading = null;
      const tiles = (next.x1 - next.x0 + 1) * (next.y1 - next.y0 + 1);
      if (next.nativeTiles / tiles < DETAIL_MIN_NATIVE) {
        // Nothing this detailed here: try a coarser close-up grid (it reuses the same downloads).
        thin = [...thin.slice(-23), next];
        return refreshDetail();
      }
      // The wide grid may have moved on while this loaded.
      if (!mosaic || !inside(next, mosaic)) return;
      detail = next;
      renderer.setDetail(next);
      const source = map.getSource<CanvasSource>(DETAIL_SOURCE);
      if (source) source.setCoordinates(corners(next));
      else addLayer(DETAIL_SOURCE, detailCanvas, next);
      requestDraw();
    } catch {
      // The close-up is optional; the wide shadows still show.
      if (!abort.signal.aborted) detailLoading = null;
    }
  };

  const refreshMosaic = async () => {
    const s = useApp.getState();
    if (!s.overlays.shadows && !s.overlays.sunHours) return;
    const perf = PERFORMANCE[s.performance];
    const center = map.getCenter();
    const plan = planMosaic(
      viewBounds(),
      { lng: center.lng, lat: center.lat },
      {
        maxTilesPerSide: Math.min(perf.shadows.maxTilesPerSide, Math.floor(renderer.maxTextureSize / 256)),
        maxZoom: perf.shadows.maxZoom,
        marginMeters: SHADOW_REACH_M,
        maxHalfSize: MAX_HALF_SIZE_M,
      },
    );
    if (mosaic && rangeContains(mosaic, plan.need)) return refreshDetail();
    // A wide grid on its way will look at the close-up area when it lands.
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
      if (detail && !inside(detail, next)) clearDetail();
      const source = map.getSource<CanvasSource>(SOURCE);
      if (source) source.setCoordinates(corners(next));
      else addLayer(SOURCE, wideCanvas, next);
      loading = null;
      useApp.getState().setShadowStatus({ state: 'idle' });
      draw();
      scheduleHours();
      void refreshDetail();
    } catch (err) {
      if (abort.signal.aborted) return;
      loading = null;
      useApp.getState().setShadowStatus({ state: 'error', message: (err as Error).message });
    }
  };

  /** Everything loaded is for the old settings: start over. */
  const reload = () => {
    loading?.abort.abort();
    loading = null;
    mosaic = null;
    clearDetail();
    thin = [];
    void refreshMosaic();
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
        hoursRenderer.render({ azimuth: sun.azimuth, elevation: sun.elevationTrue, color: [0, 0, 0], strength: 1, maxOutputSize: PERFORMANCE[s.performance].hoursSize, steps: 128, maxDistanceMeters: SHADOW_REACH_M });
        w = hoursRenderer.outW;
        h = hoursRenderer.outH;
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
    return (
      (o.shadows || o.sunHours) &&
      (moveTimer !== 0 || loading !== null || detailLoading !== null || frame !== 0 || pauses.size > 0 || hoursTimer !== 0 || useSunHours.getState().state === 'working')
    );
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
    if (!now.overlays.sunHours && prev.overlays.sunHours) {
      hoursJob++;
      void refreshDetail();
    }
    if (now.elevation !== prev.elevation) {
      setElevationProvider(ELEVATION[now.elevation]);
      reload();
    } else if (now.performance !== prev.performance) reload();
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
    (window as unknown as { __shadow: unknown }).__shadow = { renderer, getMosaic: () => mosaic, getDetail: () => detail, redraw: draw };
  }

  return () => {
    unsubscribe();
    map.off('moveend', onMoveEnd);
    clearTimeout(moveTimer);
    clearTimeout(hoursTimer);
    hoursJob++;
    cancelAnimationFrame(frame);
    for (const onRender of pauses.values()) map.off('render', onRender);
    loading?.abort.abort();
    detailLoading?.abort.abort();
  };
}
