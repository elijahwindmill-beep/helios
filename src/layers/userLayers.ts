import { Marker, Popup, type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useApp } from '../store/app';
import { useLayers } from '../store/layers';
import type { Photo, Place } from './model';

const ROUTES = 'user-routes';
const DRAFT = 'route-draft';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function routeData(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: useLayers.getState().routes.map((r) => ({
      type: 'Feature',
      properties: { id: r.id, name: r.name, color: r.color },
      geometry: { type: 'MultiLineString', coordinates: r.lines },
    })),
  };
}

function draftData(): FeatureCollection {
  const d = useLayers.getState().draft ?? [];
  return {
    type: 'FeatureCollection',
    features: [
      ...(d.length >= 2 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: d } }] : []),
      ...d.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
    ],
  };
}

function placeElement(p: Place): HTMLElement {
  const el = document.createElement('div');
  el.className = 'place-marker';
  el.innerHTML = '<span class="place-dot"></span><span class="place-name"></span>';
  el.querySelector('.place-name')!.textContent = p.name;
  el.setAttribute('aria-label', `Place: ${p.name}`);
  return el;
}

function photoElement(p: Photo): HTMLElement {
  const el = document.createElement('button');
  el.className = 'photo-marker';
  el.setAttribute('aria-label', `Photo: ${p.name}`);
  if (p.thumb) {
    const img = document.createElement('img');
    img.src = p.thumb;
    img.alt = '';
    el.append(img);
  } else {
    el.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M9 6l1.5-2h3L15 6"/></svg>';
  }
  return el;
}

/** Place popup: name, notes, and a button to move the sun pin there. */
function placePopup(p: Place): HTMLElement {
  const box = document.createElement('div');
  box.className = 'place-popup';
  const h = document.createElement('strong');
  h.textContent = p.name;
  box.append(h);
  if (p.notes) {
    const notes = document.createElement('p');
    notes.textContent = p.notes;
    box.append(notes);
  }
  const btn = document.createElement('button');
  btn.className = 'chip chip-small';
  btn.textContent = 'Move sun pin here';
  btn.onclick = () => useApp.getState().setPin({ lat: p.lat, lng: p.lng, name: p.name });
  box.append(btn);
  return box;
}

/**
 * Draws your routes, places and photos on the map and handles drawing a new route
 * (click to add points, double-click, Enter or Done to finish).
 */
export function installUserLayers(map: MlMap, beforeLayer: string): () => void {
  map.addSource(ROUTES, { type: 'geojson', data: routeData() });
  map.addSource(DRAFT, { type: 'geojson', data: EMPTY });
  map.addLayer(
    {
      id: 'user-routes-casing',
      type: 'line',
      source: ROUTES,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': 'rgba(251,250,247,0.85)', 'line-width': 6 },
    },
    beforeLayer,
  );
  map.addLayer(
    {
      id: 'user-routes',
      type: 'line',
      source: ROUTES,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
    },
    beforeLayer,
  );
  map.addLayer(
    {
      id: 'route-draft-line',
      type: 'line',
      source: DRAFT,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#5B8DEF', 'line-width': 3, 'line-dasharray': [2, 1.5] },
    },
    beforeLayer,
  );
  map.addLayer(
    {
      id: 'route-draft-points',
      type: 'circle',
      source: DRAFT,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 4.5, 'circle-color': '#FBFAF7', 'circle-stroke-color': '#5B8DEF', 'circle-stroke-width': 2 },
    },
    beforeLayer,
  );

  const placeMarkers = new Map<string, { marker: Marker; place: Place }>();
  const photoMarkers = new Map<string, { marker: Marker; photo: Photo }>();

  const syncPlaces = () => {
    const show = useApp.getState().overlays.places;
    const places = show ? useLayers.getState().places : [];
    const keep = new Set(places.map((p) => p.id));
    for (const [id, m] of placeMarkers) if (!keep.has(id)) (m.marker.remove(), placeMarkers.delete(id));
    for (const p of places) {
      const have = placeMarkers.get(p.id);
      if (have?.place === p) continue;
      have?.marker.remove();
      const marker = new Marker({ element: placeElement(p), anchor: 'left', offset: [-7, 0], draggable: true })
        .setLngLat([p.lng, p.lat])
        .setPopup(new Popup({ offset: 14, closeButton: true, maxWidth: '240px' }).setDOMContent(placePopup(p)))
        .addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        useLayers.getState().updatePlace(p.id, { lat: ll.lat, lng: ll.lng });
      });
      placeMarkers.set(p.id, { marker, place: p });
    }
  };

  const syncPhotos = () => {
    const show = useApp.getState().overlays.photos;
    const photos = show ? useLayers.getState().photos : [];
    const keep = new Set(photos.map((p) => p.id));
    for (const [id, m] of photoMarkers) if (!keep.has(id)) (m.marker.remove(), photoMarkers.delete(id));
    for (const p of photos) {
      const have = photoMarkers.get(p.id);
      if (have?.photo === p) continue;
      have?.marker.remove();
      const el = photoElement(p);
      const marker = new Marker({ element: el, draggable: true }).setLngLat([p.lng, p.lat]).addTo(map);
      let dragged = false;
      marker.on('dragstart', () => (dragged = true));
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        useLayers.getState().updatePhoto(p.id, { lat: ll.lat, lng: ll.lng });
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dragged) return void (dragged = false);
        useLayers.getState().setOpenPhoto(p.id);
      });
      photoMarkers.set(p.id, { marker, photo: p });
    }
  };

  const syncRoutes = () => {
    map.getSource<GeoJSONSource>(ROUTES)?.setData(routeData());
    const vis = useApp.getState().overlays.routes ? 'visible' : 'none';
    for (const id of ['user-routes-casing', 'user-routes']) map.setLayoutProperty(id, 'visibility', vis);
  };

  const syncDraft = () => {
    map.getSource<GeoJSONSource>(DRAFT)?.setData(useLayers.getState().draft ? draftData() : EMPTY);
    map.getCanvas().style.cursor = useLayers.getState().draft ? 'crosshair' : '';
  };

  syncRoutes();
  syncPlaces();
  syncPhotos();

  const onClick = (e: MapMouseEvent) => {
    if (useLayers.getState().draft) useLayers.getState().addDraftPoint([e.lngLat.lng, e.lngLat.lat]);
  };
  map.on('click', onClick);

  const offLayers = useLayers.subscribe((now, prev) => {
    if (now.routes !== prev.routes) syncRoutes();
    if (now.places !== prev.places) syncPlaces();
    if (now.photos !== prev.photos) syncPhotos();
    if (now.draft !== prev.draft) syncDraft();
  });
  const offApp = useApp.subscribe((now, prev) => {
    if (now.overlays === prev.overlays) return;
    if (now.overlays.routes !== prev.overlays.routes) syncRoutes();
    if (now.overlays.places !== prev.overlays.places) syncPlaces();
    if (now.overlays.photos !== prev.overlays.photos) syncPhotos();
  });

  return () => {
    offLayers();
    offApp();
    map.off('click', onClick);
    for (const m of placeMarkers.values()) m.marker.remove();
    for (const m of photoMarkers.values()) m.marker.remove();
  };
}
