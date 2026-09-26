import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BaseLayer, Overlays } from '../map/style';
import type { ImageryId } from '../map/sources';
import type { CameraState } from '../map/cameraMath';
import { SECEDA } from '../config';

export interface Pin {
  lat: number;
  lng: number;
  name: string;
}

interface AppState {
  base: BaseLayer;
  overlays: Overlays;
  imagery: ImageryId;
  maptilerKey: string;
  pin: Pin;
  camera: CameraState | null;
  aboutOpen: boolean;
  setBase(base: BaseLayer): void;
  toggleOverlay(key: keyof Overlays): void;
  setImagery(id: ImageryId): void;
  setMaptilerKey(key: string): void;
  setPin(pin: Pin): void;
  setCamera(camera: CameraState): void;
  setAboutOpen(open: boolean): void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      base: 'paper',
      overlays: { contours: true, labels: true },
      imagery: 'esri',
      maptilerKey: import.meta.env.VITE_MAPTILER_KEY ?? '',
      pin: SECEDA,
      camera: null,
      aboutOpen: false,
      setBase: (base) => set({ base }),
      toggleOverlay: (key) => set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
      setImagery: (imagery) => set({ imagery }),
      setMaptilerKey: (maptilerKey) => set({ maptilerKey }),
      setPin: (pin) => set({ pin }),
      setCamera: (camera) => set({ camera }),
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    }),
    {
      name: 'helios.settings',
      version: 1,
      // Only viewer preferences persist here; projects get their own save in phase 5.
      partialize: (s) => ({
        base: s.base,
        overlays: s.overlays,
        imagery: s.imagery,
        maptilerKey: s.maptilerKey,
        pin: s.pin,
      }),
    },
  ),
);
