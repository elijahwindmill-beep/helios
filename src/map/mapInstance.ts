import type { Map as MlMap } from 'maplibre-gl';

// The single live map, for UI buttons that need to move the camera.
let current: MlMap | null = null;

export function setMap(map: MlMap | null) {
  current = map;
  // Handy for poking at the map from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { __map: MlMap | null }).__map = map;
}

export function getMap(): MlMap | null {
  return current;
}
