import { gpx, kml } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { LngLat, Place, Route } from './model';

export interface Imported {
  routes: Array<Omit<Route, 'id' | 'color'>>;
  places: Array<Omit<Place, 'id'>>;
}

const lngLat = (p: Position): LngLat => [p[0], p[1]];

/** Routes (lines, polygon outlines) and places (points) from GeoJSON. */
export function fromGeoJSON(data: FeatureCollection | Feature | Geometry, fallbackName: string): Imported {
  const out: Imported = { routes: [], places: [] };
  const features: Feature[] =
    data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [{ type: 'Feature', properties: {}, geometry: data }];

  features.forEach((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = String(props.name ?? props.title ?? '').trim();
    const lines: LngLat[][] = [];
    const points: LngLat[] = [];
    const walk = (g: Geometry | null) => {
      if (!g) return;
      switch (g.type) {
        case 'Point':
          points.push(lngLat(g.coordinates));
          break;
        case 'MultiPoint':
          g.coordinates.forEach((p) => points.push(lngLat(p)));
          break;
        case 'LineString':
          lines.push(g.coordinates.map(lngLat));
          break;
        case 'MultiLineString':
          g.coordinates.forEach((l) => lines.push(l.map(lngLat)));
          break;
        case 'Polygon':
          g.coordinates.forEach((r) => lines.push(r.map(lngLat)));
          break;
        case 'MultiPolygon':
          g.coordinates.forEach((poly) => poly.forEach((r) => lines.push(r.map(lngLat))));
          break;
        case 'GeometryCollection':
          g.geometries.forEach(walk);
          break;
      }
    };
    walk(f.geometry);
    const usable = lines.filter((l) => l.length >= 2);
    if (usable.length) {
      const suffix = features.length > 1 ? ` ${i + 1}` : '';
      out.routes.push({ name: name || `${fallbackName}${suffix}`, lines: usable });
    }
    for (const [lng, lat] of points) {
      out.places.push({ name: name || 'Waypoint', notes: String(props.desc ?? props.description ?? '').trim(), lat, lng });
    }
  });
  return out;
}

/** Reads a GPX, KML or GeoJSON file's text. Throws with a plain message when it can't. */
export function parseRouteFile(fileName: string, text: string): Imported {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const base = fileName.replace(/\.[^.]+$/, '');
  if (ext === 'geojson' || ext === 'json') {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${fileName} isn't valid JSON`);
    }
    return fromGeoJSON(data as FeatureCollection, base);
  }
  if (ext === 'gpx' || ext === 'kml') {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(`${fileName} isn't valid ${ext.toUpperCase()}`);
    const fc = (ext === 'gpx' ? gpx(doc) : kml(doc)) as FeatureCollection;
    return fromGeoJSON(fc, base);
  }
  throw new Error(`${fileName}: use GPX, KML or GeoJSON`);
}
