import { useApp } from '../store/app';
import { useTimeline } from '../store/timeline';
import type { Map as MlMap } from 'maplibre-gl';
import { getMap } from '../map/mapInstance';
import { snapCenterElevation } from '../map/steadyCamera';
import { timeZoneAt } from '../sun/timezone';
import type { Overlays } from '../map/style';
import { clipDuration, type CameraKey, type Keyframe } from './model';
import { evaluate, type Frame } from './interpolate';
import { computeLift, liftAt, type Lift } from './clearance';
import { EASY_EASE } from './eases';

/** The current view and sun, as a keyframe's content. */
export function captureNow(): Pick<Keyframe, 'sun' | 'camera'> {
  const map = getMap()!;
  const c = map.getCenter();
  const camera: CameraKey = { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), elevation: map.getCenterElevation() };
  return { sun: useApp.getState().time, camera };
}

/** Which layers a keyframe can switch. */
export const KEYED_LAYERS: Array<keyof Overlays> = ['shadows', 'sunPath', 'solstices', 'compass', 'contours', 'labels', 'lightColour', 'routes', 'places', 'photos', 'photoSpots', 'sunHours'];

export function currentLayers(): Record<string, boolean> {
  const o = useApp.getState().overlays;
  return Object.fromEntries(KEYED_LAYERS.map((k) => [k, o[k]]));
}

/**
 * Keeps MapLibre from re-pinning the view to the ground under the centre (a jump when playback
 * stops) until the viewer moves the map themselves; then the usual behaviour returns.
 */
let holding = false;
function holdPivot(map: MlMap) {
  if (holding) return;
  holding = true;
  map.setCenterClampedToGround(false);
  const release = (e: { originalEvent?: unknown }) => {
    if (!e.originalEvent) return;
    map.off('movestart', release);
    map.setCenterClampedToGround(true);
    holding = false;
  };
  map.on('movestart', release);
}

/** Puts the map, sun and layers where the clip is at time t. */
export function applyFrame(frame: Frame) {
  const app = useApp.getState();
  app.setTimeExact(frame.sun);
  if (frame.layers) app.setOverlays(frame.layers as Partial<Overlays>);
  const c = frame.camera;
  snapCenterElevation();
  const map = getMap();
  if (!map) return;
  // With the pivot height from the keyframes the camera glides; without it MapLibre would put
  // the pivot on the ground under the centre every frame, and the camera would ride each bump.
  if (c.elevation !== undefined) holdPivot(map);
  map.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, bearing: c.bearing, pitch: c.pitch, ...(c.elevation !== undefined ? { elevation: c.elevation } : {}) });
}

export function frameAt(t: number): Frame | null {
  const { pin } = useApp.getState();
  const clip = useTimeline.getState().activeClip();
  const f = evaluate(clip, t, timeZoneAt(pin.lat, pin.lng));
  // Raised where the path would run into the ground (timeline/clearance.ts).
  if (f && f.camera.elevation !== undefined && lift && lift.clip === clip && lift.viewportHeight === getMap()?.getCanvas().clientHeight) {
    f.camera.elevation += liftAt(lift, t);
  }
  return f;
}

let lift: Lift | null = null;
let lifting: Promise<void> | null = null;
/** Makes sure the terrain clearance for the active clip (at this map size) is worked out. */
export function ensureLift(): Promise<void> {
  const map = getMap();
  const clip = useTimeline.getState().activeClip();
  if (!map || clip.keyframes.length < 2) return Promise.resolve();
  const vh = map.getCanvas().clientHeight;
  if (lift && lift.clip === clip && lift.viewportHeight === vh) return Promise.resolve();
  const { pin } = useApp.getState();
  const job = computeLift(clip, timeZoneAt(pin.lat, pin.lng), map.getVerticalFieldOfView(), vh).then((l) => {
    lift = l;
    if (lifting === job) lifting = null;
  });
  lifting = job;
  return job;
}

/**
 * Keyframes made before the pivot height was stored get it now: the ground under their
 * centre, which is what MapLibre pivoted on when they were set. Needs that terrain loaded.
 */
export function fillPivotHeights() {
  const map = getMap();
  const tl = useTimeline.getState();
  if (!map) return;
  for (const k of tl.activeClip().keyframes) {
    if (k.camera.elevation !== undefined) continue;
    const h = map.queryTerrainElevation([k.camera.lng, k.camera.lat]);
    if (typeof h === 'number' && Number.isFinite(h)) tl.updateKeyframe(k.id, { camera: { ...k.camera, elevation: h } });
  }
}

/** Moves the playhead and shows that moment. */
export function seek(t: number) {
  const tl = useTimeline.getState();
  if (!tl.playing) {
    if (tl.activeClip().keyframes.some((k) => k.camera.elevation === undefined)) fillPivotHeights();
    // Scrubbing: work out the clearance in the background, then show this moment with it.
    const before = lift;
    void ensureLift().then(() => {
      if (lift !== before && !useTimeline.getState().playing && useTimeline.getState().playhead === t) {
        const f = frameAt(t);
        if (f) applyFrame(f);
      }
    });
  }
  tl.setPlayhead(t);
  const f = frameAt(t);
  if (f) applyFrame(f);
}

let raf = 0;
/** Real-time preview playback. (Export steps frame by frame instead: timeline/exportVideo.ts.) */
export function startPlayback() {
  const tl = useTimeline.getState();
  const duration = clipDuration(tl.activeClip());
  if (tl.activeClip().keyframes.length < 2) return;
  fillPivotHeights();
  const from = tl.playhead >= duration ? 0 : tl.playhead;
  tl.setPlaying(true);
  cancelAnimationFrame(raf);
  // Check the path against the terrain first (a moment, once per edit), then play.
  void ensureLift().then(() => {
    if (!useTimeline.getState().playing) return;
    run(from, duration);
  });
}

function run(from: number, duration: number) {
  let start = performance.now() - from * 1000;
  const tick = (now: number) => {
    const s = useTimeline.getState();
    if (!s.playing) return;
    let t = (now - start) / 1000;
    if (t >= duration) {
      if (s.loop) {
        start = now;
        t = 0;
      } else {
        seek(duration);
        s.setPlaying(false);
        return;
      }
    }
    seek(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function stopPlayback() {
  cancelAnimationFrame(raf);
  useTimeline.getState().setPlaying(false);
}

export function togglePlayback() {
  if (useTimeline.getState().playing) stopPlayback();
  else startPlayback();
}

/** Captures the current view and sun as a keyframe at the playhead. */
export function addKeyframeHere() {
  const tl = useTimeline.getState();
  const clip = tl.activeClip();
  const prev = [...clip.keyframes].reverse().find((k) => k.t <= tl.playhead);
  tl.addKeyframe({
    t: Math.round(tl.playhead * 10) / 10,
    ...captureNow(),
    easing: prev?.easing ?? [...EASY_EASE],
    sunEasing: prev?.sunEasing,
    sunMode: prev?.sunMode ?? 'continuous',
    loops: 0,
  });
}
