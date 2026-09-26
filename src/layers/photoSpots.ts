import { Marker, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useApp } from '../store/app';
import { useSpots } from '../store/spots';
import { CommonsBusy, fetchHeading, fetchSpots, type PhotoSpot } from './commons';

const CONE = 'spot-cone';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
/** Fetch again once the view centre moves this far (metres). */
const REFETCH_M = 2500;

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = 111320;
  return Math.hypot((a.lat - b.lat) * k, (a.lng - b.lng) * k * Math.cos((a.lat * Math.PI) / 180));
}

/** A 60° wedge on the ground showing where the camera looked, 600 m long. */
function cone(s: PhotoSpot, heading: number): FeatureCollection {
  const pts: Array<[number, number]> = [[s.lng, s.lat]];
  const k = 111320;
  for (let a = heading - 30; a <= heading + 30; a += 5) {
    const r = (a * Math.PI) / 180;
    pts.push([s.lng + (Math.sin(r) * 600) / (k * Math.cos((s.lat * Math.PI) / 180)), s.lat + (Math.cos(r) * 600) / k]);
  }
  pts.push([s.lng, s.lat]);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }] };
}

function spotElement(s: PhotoSpot): HTMLElement {
  const el = document.createElement('button');
  el.className = 'spot-marker';
  el.setAttribute('aria-label', `Photo spot: ${s.title}`);
  el.title = `${s.title} · ${s.artist}`;
  const img = document.createElement('img');
  img.src = s.thumb;
  img.alt = '';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  el.append(img);
  return el;
}

/** Geotagged Wikimedia Commons photos around the view, each where the camera stood. */
export function installPhotoSpots(map: MlMap, beforeLayer: string): () => void {
  map.addSource(CONE, { type: 'geojson', data: EMPTY });
  map.addLayer(
    { id: CONE, type: 'fill', source: CONE, paint: { 'fill-color': '#f5a623', 'fill-opacity': 0.28, 'fill-outline-color': '#ffd58a' } },
    beforeLayer,
  );

  const markers = new Map<number, Marker>();
  let last: { lat: number; lng: number } | null = null;
  let pending: { lat: number; lng: number } | null = null;
  let busyUntil = 0;
  let abort: AbortController | null = null;

  const sync = () => {
    const on = useApp.getState().overlays.photoSpots;
    const spots = on ? useSpots.getState().spots : [];
    const keep = new Set(spots.map((s) => s.id));
    for (const [id, m] of markers) if (!keep.has(id)) (m.remove(), markers.delete(id));
    for (const s of spots) {
      if (markers.has(s.id)) continue;
      const el = spotElement(s);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        useSpots.getState().set({ open: s, openHeading: undefined });
        fetchHeading(s.id)
          .catch(() => null)
          .then((h) => {
            if (useSpots.getState().open?.id === s.id) useSpots.getState().set({ openHeading: h });
          });
      });
      markers.set(s.id, new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map));
    }
  };

  const load = async (force = false) => {
    if (!useApp.getState().overlays.photoSpots) return;
    const c = map.getCenter();
    const here = { lat: c.lat, lng: c.lng };
    if (!force && last && metres(last, here) < REFETCH_M) return;
    // Already fetching for about here: let it finish.
    if (pending && metres(pending, here) < REFETCH_M) return;
    if (Date.now() < busyUntil) return;
    abort?.abort();
    abort = new AbortController();
    useSpots.getState().set({ status: 'loading' });
    pending = here;
    try {
      const spots = await fetchSpots(here.lat, here.lng, 10000, abort.signal);
      last = here;
      pending = null;
      useSpots.getState().set({ spots, status: 'idle' });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      pending = null;
      // Commons' search is sometimes overloaded for a moment: wait, then try on the next move.
      busyUntil = Date.now() + 15000;
      useSpots.getState().set({ status: err instanceof CommonsBusy ? 'busy' : 'error' });
    }
  };

  const onMoveEnd = () => void load();
  map.on('moveend', onMoveEnd);
  void load(true);

  const offSpots = useSpots.subscribe((now, prev) => {
    if (now.spots !== prev.spots) sync();
    if (now.open !== prev.open || now.openHeading !== prev.openHeading) {
      const data = now.open && typeof now.openHeading === 'number' ? cone(now.open, now.openHeading) : EMPTY;
      map.getSource<GeoJSONSource>(CONE)?.setData(data);
    }
  });
  const offApp = useApp.subscribe((now, prev) => {
    if (now.overlays.photoSpots === prev.overlays.photoSpots) return;
    sync();
    if (now.overlays.photoSpots) void load(true);
    map.setLayoutProperty(CONE, 'visibility', now.overlays.photoSpots ? 'visible' : 'none');
  });

  return () => {
    offSpots();
    offApp();
    abort?.abort();
    map.off('moveend', onMoveEnd);
    for (const m of markers.values()) m.remove();
  };
}
