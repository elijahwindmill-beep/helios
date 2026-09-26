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

type Vec = [number, number, number, number, number]; // mercator x, y, zoom, bearing (unwrapped), pitch

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
  const u2 = u * u;
  const u3 = u2 * u;
  return p1.map(
    (_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3),
  ) as Vec;
}

function cameraVecs(keys: Keyframe[]): Vec[] {
  const bearings = unwrapBearings(keys.map((k) => k.camera.bearing));
  return keys.map((k, i) => {
    const [x, y] = toMercator(k.camera.lng, k.camera.lat);
    return [x, y, k.camera.zoom, bearings[i], k.camera.pitch];
  });
}

function vecToCamera(v: Vec): CameraKey {
  const [lng, lat] = fromMercator(v[0], v[1]);
  return { lng, lat, zoom: v[2], bearing: ((v[3] % 360) + 360) % 360, pitch: Math.min(85, Math.max(0, v[4])) };
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
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const u = (t - k0.t) / (k1.t - k0.t);
  const e = ease(u, k0.easing);
  const sun = sunBetween(k0, k1, k0.sunEasing ? ease(u, k0.sunEasing) : e, timeZone);

  const v = cameraVecs(keys);
  let cam: Vec;
  if (clip.smoothCamera && keys.length >= 3 && k0.easing !== 'hold') {
    cam = catmullRom(v[Math.max(0, i - 1)], v[i], v[i + 1], v[Math.min(last, i + 2)], e);
  } else {
    cam = v[i].map((a, j) => a + (v[i + 1][j] - a) * e) as Vec;
  }
  return { sun, camera: vecToCamera(cam), layers, segment: i };
}
