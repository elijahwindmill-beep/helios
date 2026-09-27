import { LngLat, type Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { isStanding, mmToFov, useStand } from '../store/stand';
import { useTimeline } from '../store/timeline';
import { cameraEye } from './camera';
import { cameraPosition, EARTH_RADIUS, EYE_HEIGHT_M, viewForEye, type Eye } from './cameraMath';

/**
 * The standing view: drop the figure on the map (like Google Maps' Pegman) and the camera
 * stands there at eye height, so the shadows, the sun and the ridges are seen the way a person
 * on that spot sees them. Drag to look around, W A S D to walk, Q and E to turn, double-click
 * the ground to walk there, scroll to change the lens, Esc to leave.
 *
 * MapLibre has no free camera, but its camera sits a fixed distance behind a centre point, so
 * the centre goes in the air a little way ahead along the line of sight (cameraMath.viewForEye).
 */

/** How far ahead the centre point sits. Doesn't change the picture: see viewForEye. */
export const AHEAD_M = 40;
/** Looking up to 60° above the horizon, down to 50° below. */
export const STAND_MAX_PITCH = 150;
const MIN_PITCH = 40;
const LEVEL_PITCH = 88;
/** Lens range: 14 mm to 100 mm full-frame equivalent (vertical field of view). */
export const FOV_MIN = mmToFov(100);
export const FOV_MAX = mmToFov(14);
/** Walking and running (Shift), metres per second; turning, degrees per second. */
const WALK = 6;
const RUN = 30;
const TURN = 70;
const DOUBLE_MS = 320;
const DOUBLE_PX = 30;
const CLICK_PX = 5;

const HANDLERS = ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'keyboard', 'boxZoom'] as const;

let map: MlMap | null = null;
let saved: {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  elevation: number;
  fov: number;
  maxPitch: number;
  handlers: Array<(typeof HANDLERS)[number]>;
} | null = null;
let anim = 0;
/** Eye height over the ground, metres: a person, unless typed otherwise in the camera readout. */
let eyeHeight = EYE_HEIGHT_M;

/**
 * The view last put, which MapLibre must keep. Its own ground check samples the terrain a
 * little differently from the drawn surface and, on steep ground, would tip the view away (it
 * changes pitch and zoom to lift the camera). Here the eye is kept above the drawn surface
 * instead, so while standing every camera change is held to it (installStandView), and so is
 * a keyframe's placement during playback.
 */
let putting = false;
let wanted: { center: LngLat; zoom: number; bearing: number; pitch: number; elevation: number } | null = null;

const clampPitch = (p: number) => Math.min(STAND_MAX_PITCH, Math.max(MIN_PITCH, p));

/** Puts the camera at an eye. `ahead` only matters for tile detail while flying in or out. */
function put(m: MlMap, eye: Eye, ahead = AHEAD_M) {
  const g = ground(m, eye.lng, eye.lat);
  const e = g !== null && eye.altitude < g + 0.3 ? { ...eye, altitude: g + eyeHeight } : eye;
  const v = viewForEye(e, m.getVerticalFieldOfView(), m.getCanvas().clientHeight, ahead);
  // A LngLat, not an array: MapLibre's camera hook passes it straight to setCenter.
  wanted = { center: new LngLat(v.lng, v.lat), zoom: v.zoom, bearing: v.bearing, pitch: v.pitch, elevation: v.elevation };
  putting = true;
  try {
    m.jumpTo(wanted);
  } finally {
    putting = false;
  }
}

/** Places the camera for a keyframe made in the standing view (timeline playback and export). */
export function putEye(m: MlMap, eye: Eye) {
  if (eye.pitch > m.getMaxPitch()) m.setMaxPitch(STAND_MAX_PITCH);
  put(m, eye);
}

const ground = (m: MlMap, lng: number, lat: number): number | null => {
  const h = m.queryTerrainElevation([lng, lat]);
  return typeof h === 'number' && Number.isFinite(h) ? h : null;
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

/**
 * Moves the eye from one place to another. `follow` keeps it at eye height over the ground
 * (walking); otherwise it travels in a straight line (flying in or out).
 */
function travel(m: MlMap, from: Eye, to: Eye, ms: number, opts: { follow?: boolean; land?: boolean; fov?: [number, number] } = {}): Promise<void> {
  cancelAnimationFrame(anim);
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = smooth(t);
      const lat = from.lat + (to.lat - from.lat) * e;
      const lng = from.lng + (to.lng - from.lng) * e;
      // Finer elevation tiles may land on the way: aim at the ground as it is now.
      const target = opts.land ? (ground(m, to.lng, to.lat) ?? to.altitude - eyeHeight) + eyeHeight : to.altitude;
      let altitude = from.altitude + (target - from.altitude) * e;
      if (opts.follow) altitude = (ground(m, lng, lat) ?? altitude - eyeHeight) + eyeHeight;
      if (opts.fov) m.setVerticalFieldOfView(opts.fov[0] + (opts.fov[1] - opts.fov[0]) * e);
      // High up, a far-off centre keeps MapLibre from loading its finest tiles everywhere.
      const above = altitude - (ground(m, lng, lat) ?? to.altitude);
      put(m, { lat, lng, altitude, bearing: lerpAngle(from.bearing, to.bearing, e), pitch: from.pitch + (to.pitch - from.pitch) * e }, Math.max(AHEAD_M, above * 2));
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        resolve();
      }
    };
    anim = requestAnimationFrame(step);
  });
}

/** Stands at a spot (the pin if none is given), or walks there if already standing. */
export async function enterStandView(at?: { lng: number; lat: number }) {
  const m = map;
  if (!m) return;
  if (isStanding()) {
    if (at) walkTo(at);
    return;
  }
  const app = useApp.getState();
  const spot = at ?? app.pin;
  if (at) app.setPin({ lat: at.lat, lng: at.lng, name: '' });
  const h = ground(m, spot.lng, spot.lat) ?? m.getCenterElevation();
  eyeHeight = EYE_HEIGHT_M;

  saved = {
    center: m.getCenter(),
    zoom: m.getZoom(),
    pitch: m.getPitch(),
    bearing: m.getBearing(),
    elevation: m.getCenterElevation(),
    fov: m.getVerticalFieldOfView(),
    maxPitch: m.getMaxPitch(),
    handlers: HANDLERS.filter((k) => m[k].isEnabled()),
  };
  for (const k of HANDLERS) m[k].disable();
  m.stop();
  m.setCenterClampedToGround(false);
  m.setMaxPitch(STAND_MAX_PITCH);
  m.getCanvas().style.touchAction = 'none';
  useStand.setState({ active: true, fov: m.getVerticalFieldOfView() });

  const from = cameraEye(m);
  const to: Eye = { lat: spot.lat, lng: spot.lng, altitude: h + eyeHeight, bearing: from.bearing, pitch: LEVEL_PITCH };
  const d = Math.hypot((from.lat - to.lat) * 111000, (from.lng - to.lng) * 111000 * Math.cos((to.lat * Math.PI) / 180), from.altitude - to.altitude);
  await travel(m, from, to, Math.min(2600, Math.max(900, 700 + d * 0.25)), { land: true });
}

export async function leaveStandView() {
  const m = map;
  if (!m || !isStanding() || !saved) return;
  const back = saved;
  saved = null;
  const cam = cameraPosition({
    lat: back.center.lat,
    lng: back.center.lng,
    zoom: back.zoom,
    pitch: back.pitch,
    bearing: back.bearing,
    centerElevation: back.elevation,
    fov: back.fov,
    viewportHeight: m.getCanvas().clientHeight,
  });
  await travel(m, cameraEye(m), { ...cam, bearing: back.bearing, pitch: back.pitch }, 1200, { fov: [m.getVerticalFieldOfView(), back.fov] });
  m.setVerticalFieldOfView(back.fov);
  wanted = null;
  m.jumpTo({ center: back.center, zoom: back.zoom, pitch: back.pitch, bearing: back.bearing, elevation: back.elevation });
  m.setMaxPitch(back.maxPitch);
  m.setCenterClampedToGround(true);
  for (const k of back.handlers) m[k].enable();
  m.getCanvas().style.touchAction = '';
  useStand.setState({ active: false });
}

/** Changes the lens while standing, keeping the eye where it is. */
export function setStandFov(fov: number) {
  const m = map;
  if (!m || !isStanding() || anim) return;
  const eye = cameraEye(m);
  const f = Math.min(FOV_MAX, Math.max(FOV_MIN, fov));
  m.setVerticalFieldOfView(f);
  put(m, eye);
  useStand.setState({ fov: f });
}

/**
 * Typed into the camera readout while standing: the spot, the eye height over the ground
 * (a tripod, a wall, a balcony), or which way to look.
 */
export function adjustStand(patch: { lat?: number; lng?: number; height?: number; bearing?: number; pitch?: number }) {
  const m = map;
  if (!m || !isStanding() || anim) return;
  const eye = { ...cameraEye(m), ...(patch.lat !== undefined ? { lat: patch.lat } : {}), ...(patch.lng !== undefined ? { lng: patch.lng } : {}) };
  if (patch.height !== undefined) eyeHeight = Math.min(500, Math.max(0.3, patch.height));
  if (patch.bearing !== undefined) eye.bearing = patch.bearing;
  if (patch.pitch !== undefined) eye.pitch = clampPitch(patch.pitch);
  const h = ground(m, eye.lng, eye.lat);
  if (h === null) return;
  if (patch.lat !== undefined || patch.lng !== undefined) useApp.getState().setPin({ lat: eye.lat, lng: eye.lng, name: '' });
  put(m, { ...eye, altitude: h + eyeHeight });
}

/** Walks (glides over the ground) to a spot, keeping the direction of view. */
function walkTo(at: { lng: number; lat: number }) {
  const m = map;
  if (!m) return;
  const from = cameraEye(m);
  const h = ground(m, at.lng, at.lat);
  if (h === null) return;
  const d = Math.hypot((from.lat - at.lat) * 111000, (from.lng - at.lng) * 111000 * Math.cos((at.lat * Math.PI) / 180));
  if (d > 5000) return;
  useApp.getState().setPin({ lat: at.lat, lng: at.lng, name: '' });
  void travel(m, from, { ...from, lat: at.lat, lng: at.lng, altitude: h + eyeHeight }, Math.min(2500, Math.max(400, 300 + d * 3)), { follow: true });
}

export function installStandView(m: MlMap): () => void {
  map = m;
  const canvas = m.getCanvas();
  // (The steady camera, off for now, would need to share this hook.)
  m.setTransformCameraUpdate(() => (wanted && (putting || isStanding()) ? wanted : {}));

  // Drag to look around: the scene follows the pointer, like Street View.
  let look: { x: number; y: number; eye: Eye; id: number } | null = null;
  let lastUp: { x: number; y: number; t: number } | null = null;
  let downAt: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (!isStanding() || anim || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    look = { x: e.clientX, y: e.clientY, eye: cameraEye(m), id: e.pointerId };
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (!look || e.pointerId !== look.id) return;
    const perPx = m.getVerticalFieldOfView() / canvas.clientHeight;
    put(m, { ...look.eye, bearing: look.eye.bearing - (e.clientX - look.x) * perPx, pitch: clampPitch(look.eye.pitch + (e.clientY - look.y) * perPx) });
  };
  const onUp = (e: PointerEvent) => {
    if (!look || e.pointerId !== look.id) return;
    look = null;
    const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : Infinity;
    downAt = null;
    if (moved > CLICK_PX || e.button !== 0) return;
    // Double-click or double-tap: walk there.
    const now = performance.now();
    if (lastUp && now - lastUp.t < DOUBLE_MS && Math.hypot(e.clientX - lastUp.x, e.clientY - lastUp.y) < DOUBLE_PX) {
      lastUp = null;
      const r = canvas.getBoundingClientRect();
      walkTo(m.unproject([e.clientX - r.left, e.clientY - r.top]));
    } else lastUp = { x: e.clientX, y: e.clientY, t: now };
  };
  const onContextMenu = (e: Event) => {
    if (isStanding()) e.preventDefault();
  };

  // Scroll: a longer or wider lens.
  const onWheel = (e: WheelEvent) => {
    if (!isStanding()) return;
    e.preventDefault();
    e.stopPropagation();
    if (anim) return;
    setStandFov(m.getVerticalFieldOfView() * Math.exp(e.deltaY * 0.0015));
  };

  // W A S D walk, Q E turn, Shift runs, Esc leaves.
  const held = new Set<string>();
  let walking = 0;
  let last = 0;
  const walkStep = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!held.size || !isStanding()) {
      walking = 0;
      return;
    }
    walking = requestAnimationFrame(walkStep);
    if (anim) return;
    const eye = cameraEye(m);
    const speed = (held.has('shift') ? RUN : WALK) * dt;
    const fwd = (held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0);
    const side = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
    const turn = (held.has('e') ? 1 : 0) - (held.has('q') ? 1 : 0);
    const b = (eye.bearing * Math.PI) / 180;
    const north = (fwd * Math.cos(b) - side * Math.sin(b)) * speed;
    const east = (fwd * Math.sin(b) + side * Math.cos(b)) * speed;
    const lat = eye.lat + (north / EARTH_RADIUS) * (180 / Math.PI);
    const lng = eye.lng + (east / (EARTH_RADIUS * Math.cos((eye.lat * Math.PI) / 180))) * (180 / Math.PI);
    const h = ground(m, lng, lat);
    put(m, { ...eye, lat, lng, altitude: h === null ? eye.altitude : h + eyeHeight, bearing: eye.bearing + turn * TURN * dt });
  };
  const typing = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!isStanding() || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      void leaveStandView();
      return;
    }
    if (k === 'shift') held.add('shift');
    if (!'wasdqe'.includes(k) || k.length !== 1) return;
    e.preventDefault();
    held.add(k);
    if (!walking) {
      last = performance.now();
      walking = requestAnimationFrame(walkStep);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.key.toLowerCase());
    if (e.key === 'Shift') held.delete('shift');
  };
  const onBlur = () => held.clear();

  // Finer elevation tiles arriving move the ground a little: keep the eye at eye height.
  const onIdle = () => {
    if (!isStanding() || anim || look || held.size || useTimeline.getState().playing) return;
    const eye = cameraEye(m);
    const h = ground(m, eye.lng, eye.lat);
    if (h !== null && Math.abs(h + eyeHeight - eye.altitude) > 0.15) put(m, { ...eye, altitude: h + eyeHeight });
  };

  canvas.addEventListener('pointerdown', onDown, true);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  m.getContainer().addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  m.on('idle', onIdle);

  return () => {
    cancelAnimationFrame(anim);
    cancelAnimationFrame(walking);
    anim = 0;
    canvas.removeEventListener('pointerdown', onDown, true);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    m.getContainer().removeEventListener('wheel', onWheel, true);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    m.off('idle', onIdle);
    m.setTransformCameraUpdate(null);
    wanted = null;
    if (map === m) map = null;
    saved = null;
    useStand.setState({ active: false, dragging: false });
  };
}

// Handy for driving the standing view from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __stand: unknown }).__stand = { enter: enterStandView, leave: leaveStandView, state: () => ({ saved, wanted, anim, hasMap: !!map }), put: (e: Eye) => map && put(map, e), eye: () => map && cameraEye(map) };
