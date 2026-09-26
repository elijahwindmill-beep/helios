// Pure camera helpers (no MapLibre import) so they can be unit tested.

export interface CameraState {
  lat: number;
  lng: number;
  /** Camera height above the ground directly below it, metres. */
  height: number;
  /** Camera altitude above sea level, metres. */
  altitude: number;
  bearing: number;
  pitch: number;
  zoom: number;
}

/** MapLibre's earth radius and tile size, so our numbers match its renderer exactly. */
export const EARTH_RADIUS = 6371008.8;
const TILE_SIZE = 512;

export interface ViewParams {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
  /** Ground elevation at the view centre, metres. */
  centerElevation: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Map canvas height in CSS pixels. */
  viewportHeight: number;
}

/**
 * Where the camera is, from the public view parameters. Same model as MapLibre's
 * transform: the camera sits `cameraToCenterDistance` pixels from the view centre,
 * tilted back by `pitch`, facing `bearing`.
 */
export function cameraPosition(v: ViewParams): { lat: number; lng: number; altitude: number } {
  const rad = Math.PI / 180;
  const cameraToCenterPx = (0.5 * v.viewportHeight) / Math.tan((v.fov * rad) / 2);
  const worldSize = TILE_SIZE * 2 ** v.zoom;
  const metersPerPx = (2 * Math.PI * EARTH_RADIUS * Math.cos(v.lat * rad)) / worldSize;
  const distance = cameraToCenterPx * metersPerPx;
  const altitude = v.centerElevation + distance * Math.cos(v.pitch * rad);
  // The camera sits behind the centre, opposite to where it faces.
  const ground = distance * Math.sin(v.pitch * rad);
  const north = -ground * Math.cos(v.bearing * rad);
  const east = -ground * Math.sin(v.bearing * rad);
  return {
    lat: v.lat + north / EARTH_RADIUS / rad,
    lng: v.lng + east / (EARTH_RADIUS * Math.cos(v.lat * rad)) / rad,
    altitude,
  };
}

/** Bearing in [0, 360). */
export function normalizeBearing(deg: number): number {
  const b = deg % 360;
  return b < 0 ? b + 360 : b;
}

/**
 * Zoom that puts the camera at `targetHeight` given it is now at `currentHeight`.
 * With a fixed centre and pitch, camera distance halves with every zoom level.
 */
export function zoomForHeight(currentZoom: number, currentHeight: number, targetHeight: number): number {
  if (!(currentHeight > 0) || !(targetHeight > 0)) return currentZoom;
  return currentZoom + Math.log2(currentHeight / targetHeight);
}

export function formatHeight(m: number): string {
  if (!Number.isFinite(m)) return '–';
  if (Math.abs(m) >= 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/**
 * Parses a typed number for a readout field. Accepts "46.6", "46,6", "46.6°", "1.2 km", "850 m".
 * Returns null when the text is not a number.
 */
export function parseReadoutNumber(text: string): number | null {
  const t = text.trim().toLowerCase().replace('°', '').replace(/\s+/g, ' ');
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(km|m)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return m[2] === 'km' ? n * 1000 : n;
}

/** Parses "46.60068, 11.72598" (lat, lng) as pasted from Google Maps. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
