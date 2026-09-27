import { create } from 'zustand';

/** The standing view (map/standView.ts): the camera at eye height on the ground, like Street View. */
interface StandState {
  /** In the standing view, or flying into it. */
  active: boolean;
  /** The figure is being dragged from its button onto the map. */
  dragging: boolean;
  /** The lens while standing: vertical field of view, degrees. */
  fov: number;
}

export const useStand = create<StandState>()(() => ({ active: false, dragging: false, fov: 36.87 }));

export const isStanding = () => useStand.getState().active;

/** Full-frame (36 × 24 mm) focal length for a vertical field of view, and back. */
export const fovToMm = (fov: number) => 12 / Math.tan((fov * Math.PI) / 360);
export const mmToFov = (mm: number) => (360 / Math.PI) * Math.atan(12 / mm);
