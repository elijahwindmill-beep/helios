import { create } from 'zustand';
import type { PhotoSpot } from '../layers/commons';

interface SpotsState {
  spots: PhotoSpot[];
  status: 'idle' | 'loading' | 'busy' | 'error';
  /** Spot shown in the viewer, and which way its camera faced (undefined while looking it up). */
  open: PhotoSpot | null;
  openHeading: number | null | undefined;
  set(patch: Partial<Omit<SpotsState, 'set'>>): void;
}

/** Wikimedia Commons photo spots around the view (not saved: they're fetched fresh). */
export const useSpots = create<SpotsState>()((set) => ({
  spots: [],
  status: 'idle',
  open: null,
  openHeading: undefined,
  set: (patch) => set(patch),
}));
