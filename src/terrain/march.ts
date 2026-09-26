// The shadow test, shared by the GPU shader (shadowRenderer.ts mirrors this file line
// for line) and a CPU reference used in tests.
//
// For every ground point, walk toward the sun over the height grid and track the steepest
// angle up to any terrain seen on the way (the local horizon toward the sun). If that
// horizon is above the sun, the point is in shadow.

import { EARTH_RADIUS } from '../map/cameraMath';

/** Half the sun's apparent diameter, as a tangent: shadow edges blur over this angle. */
export const PENUMBRA_TAN = Math.tan((0.267 * Math.PI) / 180);
/** Earth curvature minus typical refraction (k = 0.13): distant peaks sit lower by d²·C. */
export const CURVATURE = (1 - 0.13) / (2 * EARTH_RADIUS);

export interface MarchSettings {
  /** Samples along each ray. */
  steps: number;
  /** First step, in grid pixels. Small, so a slope facing away from the sun shades itself. */
  firstStep: number;
  /** Longest ray, in grid pixels. Steps grow geometrically from firstStep to this. */
  maxDistance: number;
}

export function stepGrowth(s: MarchSettings): number {
  return Math.pow(s.maxDistance / s.firstStep, 1 / Math.max(1, s.steps - 1));
}

/** Direction toward the sun in grid pixels (x east, y south) for an azimuth from north. */
export function sunDirection(azimuthDeg: number): [number, number] {
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a), -Math.cos(a)];
}

/** Bilinear height at continuous pixel coordinates (pixel centres at +0.5). */
export function sampleHeight(dem: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const cx = (v: number) => Math.min(w - 1, Math.max(0, v));
  const cy = (v: number) => Math.min(h - 1, Math.max(0, v));
  const a = dem[cy(iy) * w + cx(ix)];
  const b = dem[cy(iy) * w + cx(ix + 1)];
  const c = dem[cy(iy + 1) * w + cx(ix)];
  const d = dem[cy(iy + 1) * w + cx(ix + 1)];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Shadow amount (0 = full sun, 1 = full shadow) at grid point (x, y).
 * `metersPerPixel` is the grid spacing at that point.
 */
export function shadowAt(
  dem: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  sun: { azimuth: number; elevation: number },
  metersPerPixel: number,
  s: MarchSettings,
): number {
  const tanEl = Math.tan((sun.elevation * Math.PI) / 180);
  if (sun.elevation <= 0) return 1;
  const [dx, dy] = sunDirection(sun.azimuth);
  const growth = stepGrowth(s);
  const h0 = sampleHeight(dem, w, h, x, y);
  let best = -1e9;
  let d = s.firstStep;
  for (let i = 0; i < s.steps && d <= s.maxDistance; i++) {
    const qx = x + dx * d;
    const qy = y + dy * d;
    if (qx < 0 || qy < 0 || qx > w || qy > h) break;
    const dm = d * metersPerPixel;
    const hq = sampleHeight(dem, w, h, qx, qy) - dm * dm * CURVATURE;
    best = Math.max(best, (hq - h0) / dm);
    d *= growth;
  }
  return smoothstep(-PENUMBRA_TAN, PENUMBRA_TAN, best - tanEl);
}
