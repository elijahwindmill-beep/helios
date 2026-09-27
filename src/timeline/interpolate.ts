import { zonedParts, zonedToUtc } from '../sun/timezone';
import type { CameraKey, Clip, Keyframe } from './model';
import { ease } from './eases';

export { ease };

// Everything here is a pure function of (clip, playback time): the same frame every time,
// which the video export relies on.

const DAY = 86400000;

/** Web Mercator, 0..1 across and down. */
export function toMercator(lng: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}
export function fromMercator(x: number, y: number): [number, number] {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [x * 360 - 180, lat];
}

/** Bearings made continuous, so each step turns the short way round. */
export function unwrapBearings(bearings: number[]): number[] {
  const out: number[] = [];
  for (const b of bearings) {
    if (!out.length) out.push(b);
    else {
      const prev = out[out.length - 1];
      const d = ((((b - prev) % 360) + 540) % 360) - 180;
      out.push(prev + d);
    }
  }
  return out;
}

type Vec = [number, number, number, number, number, number]; // mercator x, y, zoom, bearing (unwrapped), pitch, pivot elevation (NaN if unknown)

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
  const u2 = u * u;
  const u3 = u2 * u;
  return p1.map(
    (_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3),
  ) as Vec;
}

function cameraVecs(keys: Keyframe[]): Vec[] {
  const bearings = unwrapBearings(keys.map((k) => k.camera.bearing));
  // The pivot height only means something if every keyframe has one.
  const heights = keys.every((k) => typeof k.camera.elevation === 'number');
  return keys.map((k, i) => {
    const [x, y] = toMercator(k.camera.lng, k.camera.lat);
    return [x, y, k.camera.zoom, bearings[i], k.camera.pitch, heights ? k.camera.elevation! : NaN];
  });
}

function vecToCamera(v: Vec): CameraKey {
  const [lng, lat] = fromMercator(v[0], v[1]);
  const cam: CameraKey = { lng, lat, zoom: v[2], bearing: ((v[3] % 360) + 360) % 360, pitch: Math.min(150, Math.max(0, v[4])) };
  if (Number.isFinite(v[5])) cam.elevation = v[5];
  return cam;
}

/** The run a segment belongs to: from the stop at or before it to the next stop (pass-through keyframes between). */
export function runAround(keys: Keyframe[], segment: number): [number, number] {
  let a = segment;
  while (a > 0 && keys[a].through) a--;
  let b = segment + 1;
  while (b < keys.length - 1 && keys[b].through) b++;
  return [a, b];
}

/**
 * Monotone cubic (Fritsch–Carlson) through (xs[i], ys[i]), straight lines beyond the ends. Maps
 * time to keyframe index smoothly, so the speed carries on through pass-through keyframes.
 */
export function monotone(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x0, k) => (ys[k + 1] - ys[k]) / Math.max(1e-9, xs[k + 1] - x0));
  const m = xs.map((_, k) => (k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2));
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[k] = tau * a * d[k];
      m[k + 1] = tau * b * d[k];
    }
  }
  if (x <= xs[0]) return ys[0] + (x - xs[0]) * m[0];
  if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * m[n - 1];
  let k = 0;
  while (xs[k + 1] < x) k++;
  const h = xs[k + 1] - xs[k];
  const s = (x - xs[k]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * ys[k] + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * ys[k + 1] + (s3 - s2) * h * m[k + 1];
}

/** Sun moment between two keyframes at eased progress e. */
export function sunBetween(k0: Keyframe, k1: Keyframe, e: number, timeZone: string): number {
  if (k0.sunMode === 'continuous') return k0.sun + (k1.sun - k0.sun) * e;
  // Day lapse: the date steps a whole day at a time; the time of day holds or sweeps.
  const p0 = zonedParts(k0.sun, timeZone);
  const p1 = zonedParts(k1.sun, timeZone);
  const days = Math.round((Date.UTC(p1.year, p1.month - 1, p1.day) - Date.UTC(p0.year, p0.month - 1, p0.day)) / DAY);
  const dayIndex = Math.min(Math.abs(days), Math.floor(e * Math.abs(days) + 1e-9)) * Math.sign(days);
  const tod0 = p0.hour * 60 + p0.minute + p0.second / 60;
  const tod1 = p1.hour * 60 + p1.minute + p1.second / 60;
  const f = k0.loops > 0 ? (e * k0.loops) % 1 : e;
  const tod = tod0 + (tod1 - tod0) * f;
  const d = new Date(Date.UTC(p0.year, p0.month - 1, p0.day) + dayIndex * DAY);
  const minutes = Math.floor(tod);
  return zonedToUtc(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
      second: Math.round((tod - minutes) * 60),
    },
    timeZone,
  );
}

export interface Frame {
  sun: number;
  camera: CameraKey;
  /** Layer switches in force (merged from all keyframes up to now), or null if none set any. */
  layers: Record<string, boolean> | null;
  /** Index of the keyframe the frame is at or after. */
  segment: number;
}

/** The clip's state at playback time t (seconds). `timeZone` is the pin's, for day lapses. */
export function evaluate(clip: Clip, t: number, timeZone: string): Frame | null {
  const keys = clip.keyframes;
  if (!keys.length) return null;
  let layers: Record<string, boolean> | null = null;
  for (const k of keys) {
    if (k.t > t) break;
    if (k.layers) layers = { ...(layers ?? {}), ...k.layers };
  }
  if (keys.length === 1 || t <= keys[0].t) return { sun: keys[0].sun, camera: keys[0].camera, layers: layers ?? keys[0].layers ?? null, segment: 0 };
  const last = keys.length - 1;
  if (t >= keys[last].t) return { sun: keys[last].sun, camera: keys[last].camera, layers, segment: last };

  let i = 0;
  while (keys[i + 1].t <= t) i++;
  // The ease spans the run from the stop before to the stop after; pass-through keyframes
  // between only shape the path, reached about when their times say.
  const [a, b] = runAround(keys, i);
  const A = keys[a];
  const B = keys[b];
  const u = (t - A.t) / (B.t - A.t);
  const xs = keys.slice(a, b + 1).map((k) => k.t);
  const ys = xs.map((_, j) => a + j);
  /** Eased progress → position along the run: a keyframe index plus a fraction. */
  const at = (e: number): [number, number] => {
    const p = b === a + 1 ? a + e : monotone(xs, ys, A.t + e * (B.t - A.t));
    const seg = Math.min(b - 1, Math.max(a, Math.floor(p)));
    return [seg, p - seg];
  };

  const e = ease(u, A.easing);
  const [seg, f] = at(e);
  const [sunSeg, sunF] = A.sunEasing ? at(ease(u, A.sunEasing)) : [seg, f];
  const sun = sunBetween(keys[sunSeg], keys[sunSeg + 1], sunF, timeZone);

  const v = cameraVecs(keys);
  let cam: Vec;
  if (clip.smoothCamera && keys.length >= 3 && A.easing !== 'hold') {
    cam = catmullRom(v[Math.max(0, seg - 1)], v[seg], v[seg + 1], v[Math.min(last, seg + 2)], f);
  } else {
    cam = v[seg].map((x, j) => x + (v[seg + 1][j] - x) * f) as Vec;
  }
  const camera = vecToCamera(cam);
  const e0 = keys[seg].camera.eye;
  const e1 = keys[seg + 1].camera.eye;
  if (e0 && e1) {
    camera.eye = { lat: e0.lat + (e1.lat - e0.lat) * f, lng: e0.lng + (e1.lng - e0.lng) * f, altitude: e0.altitude + (e1.altitude - e0.altitude) * f };
  }
  return { sun, camera, layers, segment: i };
}
