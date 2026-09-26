import { useApp } from '../store/app';
import { useTimeline } from '../store/timeline';
import { getMap } from '../map/mapInstance';
import { snapCenterElevation } from '../map/steadyCamera';
import { timeZoneAt } from '../sun/timezone';
import type { Overlays } from '../map/style';
import { clipDuration, type CameraKey, type Keyframe } from './model';
import { evaluate, type Frame } from './interpolate';
import { EASY_EASE } from './eases';

/** The current view and sun, as a keyframe's content. */
export function captureNow(): Pick<Keyframe, 'sun' | 'camera'> {
  const map = getMap()!;
  const c = map.getCenter();
  const camera: CameraKey = { lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  return { sun: useApp.getState().time, camera };
}

/** Which layers a keyframe can switch. */
export const KEYED_LAYERS: Array<keyof Overlays> = ['shadows', 'sunPath', 'solstices', 'compass', 'contours', 'labels', 'lightColour', 'routes', 'places', 'photos', 'photoSpots', 'sunHours'];

export function currentLayers(): Record<string, boolean> {
  const o = useApp.getState().overlays;
  return Object.fromEntries(KEYED_LAYERS.map((k) => [k, o[k]]));
}

/** Puts the map, sun and layers where the clip is at time t. */
export function applyFrame(frame: Frame) {
  const app = useApp.getState();
  app.setTimeExact(frame.sun);
  if (frame.layers) app.setOverlays(frame.layers as Partial<Overlays>);
  const c = frame.camera;
  snapCenterElevation();
  getMap()?.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, bearing: c.bearing, pitch: c.pitch });
}

export function frameAt(t: number): Frame | null {
  const { pin } = useApp.getState();
  return evaluate(useTimeline.getState().activeClip(), t, timeZoneAt(pin.lat, pin.lng));
}

/** Moves the playhead and shows that moment. */
export function seek(t: number) {
  useTimeline.getState().setPlayhead(t);
  const f = frameAt(t);
  if (f) applyFrame(f);
}

let raf = 0;
/** Real-time preview playback. (Export steps frame by frame instead: timeline/exportVideo.ts.) */
export function startPlayback() {
  const tl = useTimeline.getState();
  const duration = clipDuration(tl.activeClip());
  if (tl.activeClip().keyframes.length < 2) return;
  const from = tl.playhead >= duration ? 0 : tl.playhead;
  let start = performance.now() - from * 1000;
  tl.setPlaying(true);
  cancelAnimationFrame(raf);
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
