import type { Map as MlMap } from 'maplibre-gl';
import { isStanding } from '../store/stand';
import { cameraPosition, normalizeBearing, zoomForHeight, type CameraState, type Eye } from './cameraMath';

/** Reads the live camera. Height is measured to the ground directly under the camera. */
export function readCamera(map: MlMap): CameraState {
  const center = map.getCenter();
  const centerElevation = map.getCenterElevation();
  const cam = cameraPosition({
    lat: center.lat,
    lng: center.lng,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    centerElevation,
    fov: map.getVerticalFieldOfView(),
    viewportHeight: map.getCanvas().clientHeight,
  });
  // Terrain under the camera may not be loaded (camera far outside the view);
  // fall back to the ground at the view centre.
  const below = map.queryTerrainElevation([cam.lng, cam.lat]);
  const ground = below ?? centerElevation;
  // In the standing view the view centre is in the air ahead: report where the viewer stands.
  const at = isStanding() ? cam : center;
  return {
    lat: at.lat,
    lng: at.lng,
    height: cam.altitude - ground,
    altitude: cam.altitude,
    bearing: normalizeBearing(map.getBearing()),
    pitch: map.getPitch(),
    zoom: map.getZoom(),
  };
}

/** Moves the camera to a typed height above ground, keeping centre, bearing and pitch. */
export function setCameraHeight(map: MlMap, target: number) {
  // Only the part of the altitude above the view centre scales with zoom, and the ground
  // under the camera shifts as it moves, so refine a few times.
  for (let i = 0; i < 5; i++) {
    const now = readCamera(map);
    if (Math.abs(now.height - target) < 1) break;
    const centerElevation = map.getCenterElevation();
    const groundBelow = now.altitude - now.height;
    const above = now.altitude - centerElevation;
    const wanted = target + groundBelow - centerElevation;
    if (!(above > 0) || !(wanted > 0)) break;
    map.jumpTo({ zoom: zoomForHeight(map.getZoom(), above, wanted) });
  }
}

/** Where the camera itself is and which way it looks. */
export function cameraEye(map: MlMap): Eye {
  const center = map.getCenter();
  const cam = cameraPosition({
    lat: center.lat,
    lng: center.lng,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    centerElevation: map.getCenterElevation(),
    fov: map.getVerticalFieldOfView(),
    viewportHeight: map.getCanvas().clientHeight,
  });
  return { ...cam, bearing: map.getBearing(), pitch: map.getPitch() };
}
