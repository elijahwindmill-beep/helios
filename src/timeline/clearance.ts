import { cameraPosition } from '../map/cameraMath';
import { getDemTile, TILE_SIZE } from '../terrain/demTiles';
import { latToTileY, lngToTileX } from '../terrain/mosaic';
import { evaluate } from './interpolate';
import type { Clip } from './model';

/**
 * Terrain clearance for keyframed camera moves. Between keyframes a low camera can pass
 * through a ridge or a hummock; MapLibre then shoves it up out of the ground frame by frame,
 * so it rides every bump. Instead the whole path is checked against the elevation data first,
 * and wherever it comes too close to the ground the camera is raised on a smooth swell that
 * starts early and eases back, the same on every playback and in the export.
 */

/** How close the camera may come to the ground, metres. */
export const CLEARANCE_M = 30;
/** Samples per second along the clip. */
const RATE = 10;
/** The swell reaches this far either side of a close pass, seconds. */
const REACH_S = 1.2;
/** Elevation detail used for the check (256 px tiles: about 1.6 m at 46°N). */
const GROUND_ZOOM = 15;

/**
 * Smooth lift from the lift each sample needs: every close pass raises its neighbours on a
 * raised-cosine bell, and the highest bell wins, so the camera is up in time and comes down gently.
 */
export function liftEnvelope(need: number[], reach: number): number[] {
  const out = new Array<number>(need.length).fill(0);
  const w = Math.max(1, Math.round(reach));
  need.forEach((n, j) => {
    if (n <= 0) return;
    for (let i = Math.max(0, j - w); i <= Math.min(need.length - 1, j + w); i++) {
      const bell = 0.5 * (1 + Math.cos((Math.PI * (i - j)) / (w + 1)));
      out[i] = Math.max(out[i], n * bell);
    }
  });
  // The bells' shoulders can dip under a neighbouring need: never below the need itself.
  return out.map((v, i) => Math.max(v, need[i]));
}

/** Ground height from the elevation tiles (the same data the terrain uses). */
async function groundAt(lat: number, lng: number): Promise<number | null> {
  const fx = lngToTileX(lng, GROUND_ZOOM);
  const fy = latToTileY(lat, GROUND_ZOOM);
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  try {
    const { heights } = await getDemTile(GROUND_ZOOM, x, y);
    const px = Math.min(TILE_SIZE - 1, Math.max(0, (fx - x) * TILE_SIZE - 0.5));
    const py = Math.min(TILE_SIZE - 1, Math.max(0, (fy - y) * TILE_SIZE - 0.5));
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(TILE_SIZE - 1, x0 + 1);
    const y1 = Math.min(TILE_SIZE - 1, y0 + 1);
    const tx = px - x0;
    const ty = py - y0;
    const h = (r: number, c: number) => heights[r * TILE_SIZE + c];
    return (h(y0, x0) * (1 - tx) + h(y0, x1) * tx) * (1 - ty) + (h(y1, x0) * (1 - tx) + h(y1, x1) * tx) * ty;
  } catch {
    return null;
  }
}

export interface Lift {
  clip: Clip;
  viewportHeight: number;
  /** Metres to raise the pivot, one value per 1/RATE s. */
  samples: number[];
}

/** Checks a clip's camera path against the ground, for a map `viewportHeight` CSS px tall. */
export async function computeLift(clip: Clip, timeZone: string, fov: number, viewportHeight: number): Promise<Lift> {
  const duration = Math.max(0, ...clip.keyframes.map((k) => k.t));
  const n = Math.floor(duration * RATE) + 1;
  const need = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const f = evaluate(clip, i / RATE, timeZone);
      if (!f || f.camera.elevation === undefined) return 0;
      const c = f.camera;
      const cam = cameraPosition({ lat: c.lat, lng: c.lng, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, centerElevation: c.elevation!, fov, viewportHeight });
      const ground = await groundAt(cam.lat, cam.lng);
      return ground === null ? 0 : Math.max(0, ground + CLEARANCE_M - cam.altitude);
    }),
  );
  return { clip, viewportHeight, samples: liftEnvelope(need, REACH_S * RATE) };
}

/** Lift at playback time t, metres. */
export function liftAt(lift: Lift, t: number): number {
  const s = lift.samples;
  if (!s.length) return 0;
  const x = Math.min(s.length - 1, Math.max(0, t * RATE));
  const i = Math.floor(x);
  const j = Math.min(s.length - 1, i + 1);
  return s[i] + (s[j] - s[i]) * (x - i);
}
