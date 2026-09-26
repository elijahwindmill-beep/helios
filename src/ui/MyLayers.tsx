import { useRef } from 'react';
import { useApp } from '../store/app';
import { useLayers } from '../store/layers';
import { getMap } from '../map/mapInstance';
import { boundsOf, type LngLat } from '../layers/model';
import { importFiles } from '../layers/importFiles';
import { deletePhotoBlob } from '../layers/photoBlobs';

function frame(points: LngLat[]) {
  const map = getMap();
  const b = boundsOf(points);
  if (!map || !b) return;
  if (b[0] === b[2] && b[1] === b[3]) map.flyTo({ center: [b[0], b[1]], zoom: Math.max(map.getZoom(), 14), duration: 1500 });
  else map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, maxZoom: 15, duration: 1500 });
}

const FrameIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </svg>
);

/** Layer panel section for your own routes, places and photos. */
export function MyLayers() {
  const routes = useLayers((s) => s.routes);
  const places = useLayers((s) => s.places);
  const photos = useLayers((s) => s.photos);
  const drawing = useLayers((s) => s.draft !== null);
  const L = useLayers.getState();
  const fileInput = useRef<HTMLInputElement>(null);

  const addPlaceAtPin = () => {
    const { pin, overlays, toggleOverlay } = useApp.getState();
    L.addPlaces([{ name: pin.name || `Place ${places.length + 1}`, notes: '', lat: pin.lat, lng: pin.lng }]);
    if (!overlays.places) toggleOverlay('places');
  };
  const draw = () => {
    if (drawing) return L.finishDraft();
    L.startDraft();
    if (!useApp.getState().overlays.routes) useApp.getState().toggleOverlay('routes');
    // On phones the sheet covers the map; get it out of the way.
    useApp.getState().setLayersOpen(false);
  };

  return (
    <section className="my-layers" aria-label="Your layers">
      <h2 className="eyebrow">Your layers</h2>
      <div className="my-actions">
        <button className="chip chip-small" onClick={() => fileInput.current?.click()}>
          Import…
        </button>
        <button className="chip chip-small" aria-pressed={drawing} onClick={draw}>
          {drawing ? 'Finish route' : 'Draw route'}
        </button>
        <button className="chip chip-small" onClick={addPlaceAtPin} title="Save the sun pin's spot as a place">
          Place at pin
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept=".gpx,.kml,.geojson,.json,image/jpeg,image/heic,image/heif,.heic,.jpg,.jpeg"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void importFiles(files);
        }}
      />
      {!routes.length && !places.length && !photos.length && (
        <p className="my-hint">GPX, KML or GeoJSON routes and geotagged photos. You can also drop them on the map.</p>
      )}

      {routes.length > 0 && (
        <ul className="my-list" aria-label="Routes">
          {routes.map((r) => (
            <li key={r.id}>
              <input
                type="color"
                className="route-color"
                value={r.color}
                aria-label={`Colour of ${r.name}`}
                onChange={(e) => L.updateRoute(r.id, { color: e.target.value })}
              />
              <input className="row-name" value={r.name} aria-label="Route name" onChange={(e) => L.updateRoute(r.id, { name: e.target.value })} />
              <button className="row-button" aria-label={`Show ${r.name}`} onClick={() => frame(r.lines.flat())}>
                <FrameIcon />
              </button>
              <button className="row-button" aria-label={`Delete ${r.name}`} onClick={() => L.removeRoute(r.id)}>
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {places.length > 0 && (
        <ul className="my-list" aria-label="Places">
          {places.map((p) => (
            <li key={p.id} className="my-place">
              <span className="place-dot" aria-hidden="true" />
              <input className="row-name" value={p.name} aria-label="Place name" onChange={(e) => L.updatePlace(p.id, { name: e.target.value })} />
              <button className="row-button" aria-label={`Show ${p.name}`} onClick={() => frame([[p.lng, p.lat]])}>
                <FrameIcon />
              </button>
              <button className="row-button" aria-label={`Delete ${p.name}`} onClick={() => L.removePlace(p.id)}>
                <DeleteIcon />
              </button>
              <textarea
                className="row-notes"
                rows={1}
                placeholder="Notes"
                aria-label={`Notes for ${p.name}`}
                value={p.notes}
                onChange={(e) => L.updatePlace(p.id, { notes: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <ul className="my-list" aria-label="Photos">
          {photos.map((p) => (
            <li key={p.id}>
              <button className="row-thumb" aria-label={`Open ${p.name}`} onClick={() => L.setOpenPhoto(p.id)}>
                {p.thumb ? <img src={p.thumb} alt="" /> : <span aria-hidden="true">?</span>}
              </button>
              <span className="row-label" title={p.fromGps ? 'Placed from the photo GPS' : 'No GPS in the file: placed by hand'}>
                {p.name}
                {!p.fromGps && <span className="muted"> · by hand</span>}
              </span>
              <button className="row-button" aria-label={`Show ${p.name}`} onClick={() => frame([[p.lng, p.lat]])}>
                <FrameIcon />
              </button>
              <button
                className="row-button"
                aria-label={`Delete ${p.name}`}
                onClick={() => {
                  L.removePhoto(p.id);
                  void deletePhotoBlob(p.id).catch(() => {});
                }}
              >
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
