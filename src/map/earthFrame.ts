import { EARTH_RADIUS } from './cameraMath';

// Pure conversions between Earth-centred coordinates (what 3D tiles use) and MapLibre's
// Web Mercator world (what the map, terrain and sun scene use), for map/google3dLayer.ts.

// WGS84 ellipsoid.
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const B = A * (1 - F);
const EP2 = (A * A - B * B) / (B * B);
const RAD = Math.PI / 180;

/** MapLibre's circumference (a sphere of its EARTH_RADIUS). */
const CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;

export interface Geodetic {
  lat: number;
  lng: number;
  /** Height above the WGS84 ellipsoid, metres. */
  height: number;
}

/** Earth-centred, Earth-fixed metres to latitude, longitude and ellipsoid height (Bowring, sub-mm near the ground). */
export function ecefToGeodetic(x: number, y: number, z: number, out: Geodetic = { lat: 0, lng: 0, height: 0 }): Geodetic {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * A, p * B);
  const st = Math.sin(th);
  const ct = Math.cos(th);
  const lat = Math.atan2(z + EP2 * B * st * st * st, p - E2 * A * ct * ct * ct);
  const sl = Math.sin(lat);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  const cl = Math.cos(lat);
  out.lat = lat / RAD;
  out.lng = Math.atan2(y, x) / RAD;
  out.height = Math.abs(cl) > 1e-10 ? p / cl - n : Math.abs(z) - B;
  return out;
}

export function geodeticToEcef(lat: number, lng: number, height: number): [number, number, number] {
  const sl = Math.sin(lat * RAD);
  const cl = Math.cos(lat * RAD);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  return [(n + height) * cl * Math.cos(lng * RAD), (n + height) * cl * Math.sin(lng * RAD), (n * (1 - E2) + height) * sl];
}

/** East, north and up unit vectors at a place, in Earth-centred axes. */
export function enuAxes(lat: number, lng: number): { east: [number, number, number]; north: [number, number, number]; up: [number, number, number] } {
  const sl = Math.sin(lat * RAD);
  const cl = Math.cos(lat * RAD);
  const so = Math.sin(lng * RAD);
  const co = Math.cos(lng * RAD);
  return { east: [-so, co, 0], north: [-sl * co, -sl * so, cl], up: [cl * co, cl * so, sl] };
}

export const mercatorX = (lng: number) => (180 + lng) / 360;
export const mercatorY = (lat: number) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))) / 360;

/**
 * A local frame near a fixed origin, in roughly metres: x east, y south (like Web Mercator),
 * z metres above sea level. Vertices stored in it keep float32 precision; `k` scales x and y
 * back to Mercator units (0–1 across the world).
 */
export class MercatorFrame {
  readonly ox: number;
  readonly oy: number;
  /** World units per local unit (a metre at the origin's latitude). */
  readonly k: number;

  constructor(originLat: number, originLng: number) {
    this.ox = mercatorX(originLng);
    this.oy = mercatorY(originLat);
    this.k = 1 / (CIRCUMFERENCE * Math.cos(originLat * RAD));
  }

  /** Writes the local position of a place at `altitude` metres above sea level into out[i..i+2]. */
  write(lat: number, lng: number, altitude: number, out: Float32Array | number[], i: number) {
    out[i] = (mercatorX(lng) - this.ox) / this.k;
    out[i + 1] = (mercatorY(lat) - this.oy) / this.k;
    out[i + 2] = altitude;
  }

  /**
   * Local → MapLibre 6's custom-layer world (column-major 4x4): x and y in world pixels at the
   * current zoom (Mercator × worldSize), z in metres, as in scene/sunScene.ts.
   */
  matrix(worldSize: number): number[] {
    const s = this.k * worldSize;
    return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, this.ox * worldSize, this.oy * worldSize, 0, 1];
  }
}
