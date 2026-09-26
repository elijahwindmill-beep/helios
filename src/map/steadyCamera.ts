import type { LngLat, Map as MlMap } from 'maplibre-gl';
import { EARTH_RADIUS } from './cameraMath';

/**
 * A steady camera over rough terrain. MapLibre normally pins the point at the screen centre
 * to the ground, so the camera rises and dips with every ridge and gully under it (and jumps
 * when finer elevation tiles arrive): wiggly on detailed LiDAR terrain. Instead the centre
 * sits at a smoothed ground level, the median height over a wide ring around the centre,
 * eased in over about half a second. Every camera change (gestures, jumpTo, easeTo) passes
 * through MapLibre's transformCameraUpdate hook, which applies it.
 */

/** Sample ring radius, in screen pixels at the centre. */
const RING_PX = 140;
const RING_POINTS = 12;
/** Easing time constant, ms. */
const TAU_MS = 450;
/** A change of ground level bigger than this (a jump elsewhere) is applied at once, metres. */
const SNAP_M = 400;

/** Median ground height around a centre, or null while no terrain has loaded there. */
function groundLevel(map: MlMap, c: LngLat, zoom: number): number | null {
  const mpp = (2 * Math.PI * EARTH_RADIUS * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const r = RING_PX * mpp;
  const dLat = (r / EARTH_RADIUS) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.05, Math.cos((c.lat * Math.PI) / 180));
  const heights: number[] = [];
  for (const k of [0, 0.5, 1]) {
    const n = k === 0 ? 1 : RING_POINTS;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const h = map.queryTerrainElevation([c.lng + Math.sin(a) * dLng * k, c.lat + Math.cos(a) * dLat * k]);
      if (h !== null && h !== undefined && Number.isFinite(h)) heights.push(h);
    }
  }
  if (!heights.length) return null;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

let snapNext = false;
/** The next camera change goes straight to the ground level (timeline playback and export: the same frame every time). */
export const snapCenterElevation = () => {
  snapNext = true;
};

export function installSteadyCamera(map: MlMap): () => void {
  map.setCenterClampedToGround(false);
  let current: number | null = null;
  let target: number | null = null;
  let frame = 0;
  let last = 0;
  // Straight onto the rendered transform: no move events every frame (layers reload on those).
  // (MapLibre 6 keeps `transform` out of its public types; fall back to the public call.)
  const transform = (map as unknown as { transform?: { setElevation?(e: number): void } }).transform;
  const setQuietly = (elevation: number) => {
    if (transform?.setElevation) {
      transform.setElevation(elevation);
      map.triggerRepaint();
    } else map.setCenterElevation(elevation);
  };

  const step = (now: number) => {
    frame = 0;
    if (current === null || target === null) return;
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    current += (target - current) * (1 - Math.exp(-dt / TAU_MS));
    if (Math.abs(target - current) < 0.05) current = target;
    setQuietly(current);
    if (current !== target) frame = requestAnimationFrame(step);
    else last = 0;
  };
  const ease = () => {
    if (!frame && current !== target) frame = requestAnimationFrame(step);
  };

  // Every camera change: keep the eased level, and aim it at the ground under the new centre.
  map.setTransformCameraUpdate((tr) => {
    const g = groundLevel(map, tr.center, tr.zoom);
    if (g === null) return {};
    if (snapNext || current === null || Math.abs(g - current) > SNAP_M) {
      snapNext = false;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      current = target = g;
    } else {
      target = g;
      ease();
    }
    return { elevation: current };
  });

  // Finer elevation tiles landing change the ground level without any camera change.
  const onIdle = () => {
    const g = groundLevel(map, map.getCenter(), map.getZoom());
    if (g === null) return;
    if (current === null) {
      current = target = g;
      setQuietly(g);
    } else {
      target = g;
      ease();
    }
  };
  map.on('idle', onIdle);
  onIdle();

  return () => {
    cancelAnimationFrame(frame);
    map.off('idle', onIdle);
    map.setTransformCameraUpdate(null);
    map.setCenterClampedToGround(true);
  };
}
