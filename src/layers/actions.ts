import { useApp } from '../store/app';
import { useLayers } from '../store/layers';

/** Starts drawing a route, or finishes the one being drawn. */
export function toggleDrawing() {
  const L = useLayers.getState();
  if (L.draft) return L.finishDraft();
  L.startDraft();
  const app = useApp.getState();
  if (!app.overlays.routes) app.toggleOverlay('routes');
  // On phones the sheet covers the map; get it out of the way.
  app.setLayersOpen(false);
}

/** Saves the sun pin's spot as a place. */
export function addPlaceAtPin() {
  const { pin, overlays, toggleOverlay } = useApp.getState();
  const L = useLayers.getState();
  L.addPlaces([{ name: pin.name || `Place ${L.places.length + 1}`, notes: '', lat: pin.lat, lng: pin.lng }]);
  if (!overlays.places) toggleOverlay('places');
}

export const IMPORT_ACCEPT = '.gpx,.kml,.geojson,.json,image/jpeg,image/heic,image/heif,.heic,.jpg,.jpeg';
