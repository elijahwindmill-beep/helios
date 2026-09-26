/** Your own map content: routes, places and photos. Coordinates are [lng, lat] like GeoJSON. */

export type LngLat = [number, number];

export interface Route {
  id: string;
  name: string;
  color: string;
  /** One or more lines (a GPX file can hold several tracks or segments). */
  lines: LngLat[][];
}

export interface Place {
  id: string;
  name: string;
  notes: string;
  lat: number;
  lng: number;
}

export interface Photo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** False when the file had no GPS and it was placed by hand. */
  fromGps: boolean;
  /** When it was taken, UTC ms, if the file says. */
  takenAt: number | null;
  /** Small square JPEG as a data URL for the map marker; null if the browser can't decode the file. */
  thumb: string | null;
}

/** Route colours, picked in turn. The first is the brief's route blue. */
export const ROUTE_COLORS = ['#5B8DEF', '#E4572E', '#2BA84A', '#9B5DE5', '#F15BB5', '#00A6D6', '#E8A317'];

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Bounding box [west, south, east, north] of some points, or null if there are none. */
export function boundsOf(points: LngLat[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}
