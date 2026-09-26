import { useApp } from '../store/app';
import { useLayers } from '../store/layers';
import { getMap } from '../map/mapInstance';
import { boundsOf, newId, type LngLat } from './model';
import { parseRouteFile } from './importRoutes';
import { isPhoto, readPhoto } from './photoFiles';
import { savePhotoBlob } from './photoBlobs';
import { timeZoneAt } from '../sun/timezone';

const ROUTE_FILE = /\.(gpx|kml|geojson|json)$/i;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Adds dropped or picked files to your layers, then frames what was added. */
export async function importFiles(files: File[]): Promise<void> {
  const layers = useLayers.getState();
  const app = useApp.getState();
  const points: LngLat[] = [];
  const problems: string[] = [];
  let routes = 0;
  let places = 0;
  let photos = 0;
  let unplaced = 0;

  for (const file of files) {
    try {
      if (ROUTE_FILE.test(file.name)) {
        const got = parseRouteFile(file.name, await file.text());
        if (!got.routes.length && !got.places.length) problems.push(`${file.name} has no lines or points`);
        layers.addRoutes(got.routes);
        layers.addPlaces(got.places);
        routes += got.routes.length;
        places += got.places.length;
        got.routes.forEach((r) => r.lines.forEach((l) => points.push(...l)));
        got.places.forEach((p) => points.push([p.lng, p.lat]));
      } else if (isPhoto(file)) {
        const info = await readPhoto(file, timeZoneAt(app.pin.lat, app.pin.lng));
        const id = newId();
        // Without GPS the photo starts at the sun pin; drag it into place.
        const at = info.gps ?? { lat: app.pin.lat, lng: app.pin.lng };
        if (!info.gps) unplaced++;
        await savePhotoBlob(id, file).catch(() => problems.push(`${file.name} couldn't be stored for viewing`));
        layers.addPhoto({ id, name: file.name.replace(/\.[^.]+$/, ''), ...at, fromGps: !!info.gps, takenAt: info.takenAt, thumb: info.thumb });
        photos++;
        points.push([at.lng, at.lat]);
      } else {
        problems.push(`${file.name}: use GPX, KML, GeoJSON or photos`);
      }
    } catch (err) {
      problems.push(err instanceof Error ? err.message : `${file.name} couldn't be read`);
    }
  }

  // Make sure what was added is switched on.
  const overlays = useApp.getState().overlays;
  if (routes && !overlays.routes) app.toggleOverlay('routes');
  if (places && !useApp.getState().overlays.places) app.toggleOverlay('places');
  if (photos && !useApp.getState().overlays.photos) app.toggleOverlay('photos');

  const added = [routes && plural(routes, 'route'), places && plural(places, 'place'), photos && plural(photos, 'photo')].filter(Boolean);
  const parts = [added.length ? `Added ${added.join(', ')}` : '', ...problems];
  if (unplaced) parts.push(`${plural(unplaced, 'photo')} had no location: placed at the pin, drag into place`);
  layers.setNotice(parts.filter(Boolean).join(' · ') || null);

  const b = boundsOf(points);
  const map = getMap();
  if (b && map) {
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 80, maxZoom: 15, duration: 1500 },
    );
  }
}
