// Inverse sun: given where the sun should be in the sky, find when it is there.
// Used when the sun is dragged in the 3D view.

import { sunPosition } from './position';

export interface SkyDirection {
  azimuth: number;
  /** Geometric elevation, degrees. */
  elevation: number;
}

const RAD = Math.PI / 180;

/** Unit vector (east, north, up) for a sky direction. */
export function skyVector(azimuth: number, elevation: number): [number, number, number] {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/** Angle between two sky directions, degrees. */
export function angularDistance(a: SkyDirection, b: SkyDirection): number {
  const [x1, y1, z1] = skyVector(a.azimuth, a.elevation);
  const [x2, y2, z2] = skyVector(b.azimuth, b.elevation);
  const dot = Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2));
  return Math.acos(dot) / RAD;
}

function distanceAt(t: number, lat: number, lng: number, target: SkyDirection): number {
  const s = sunPosition(t, lat, lng);
  return angularDistance({ azimuth: s.azimuth, elevation: s.elevationTrue }, target);
}

/** Golden-section refinement of the closest time within [a, b]. */
function refine(a: number, b: number, f: (t: number) => number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > 1000) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

export interface Solution {
  time: number;
  /** Degrees between the target and where the sun really is at `time`. */
  error: number;
}

/** Closest moment within one day (dayStart..dayEnd, UTC ms) to the target direction. */
export function solveTimeOnDay(
  lat: number,
  lng: number,
  dayStart: number,
  dayEnd: number,
  target: SkyDirection,
  stepMinutes = 5,
): Solution {
  const f = (t: number) => distanceAt(t, lat, lng, target);
  const step = stepMinutes * 60000;
  let best = dayStart;
  let bestD = Infinity;
  for (let t = dayStart; t <= dayEnd; t += step) {
    const d = f(t);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  const time = refine(Math.max(dayStart, best - step), Math.min(dayEnd, best + step), f);
  return { time, error: f(time) };
}

/**
 * Closest date and time within a year to the target direction. `dayStarts` are the local
 * midnights of each day (so days follow the place's timezone). The sun passes most sky
 * points on two dates a year; this returns whichever is closer to `prefer` among near-ties.
 */
export function solveDateTime(
  lat: number,
  lng: number,
  dayStarts: number[],
  target: SkyDirection,
  prefer?: number,
): Solution {
  // Every day: best 20-minute sample, refined to the second. Comparing coarse samples alone
  // ranks days by sampling luck (the sun moves 5° in 20 min, the path only ~0.4° per day).
  const f = (t: number) => distanceAt(t, lat, lng, target);
  const step = 20 * 60000;
  const perDay: Solution[] = [];
  for (let i = 0; i < dayStarts.length - 1; i++) {
    let best = dayStarts[i];
    let bestD = Infinity;
    for (let t = dayStarts[i]; t < dayStarts[i + 1]; t += step) {
      const d = f(t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const time = refine(Math.max(dayStarts[i], best - step), Math.min(dayStarts[i + 1], best + step), f);
    perDay.push({ time, error: f(time) });
  }
  perDay.sort((a, b) => a.error - b.error);
  let result: Solution | null = null;
  for (const s of perDay.slice(0, 6)) {
    const better =
      !result ||
      s.error < result.error - 0.05 ||
      (Math.abs(s.error - result.error) <= 0.05 && prefer !== undefined && Math.abs(s.time - prefer) < Math.abs(result.time - prefer));
    if (better) result = s;
  }
  return result!;
}
