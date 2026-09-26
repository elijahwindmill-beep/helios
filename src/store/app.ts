import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BaseLayer, Overlays } from '../map/style';
import type { ImageryId } from '../map/sources';
import type { CameraState } from '../map/cameraMath';
import { SECEDA } from '../config';
import { readTimeFromUrl } from './urlTime';

export interface Pin {
  lat: number;
  lng: number;
  name: string;
}

export type ShadowQuality = 'low' | 'medium' | 'high';

export interface Hud {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

interface AppState {
  base: BaseLayer;
  overlays: Overlays;
  imagery: ImageryId;
  maptilerKey: string;
  pin: Pin;
  camera: CameraState | null;
  aboutOpen: boolean;
  /** The moment being viewed, UTC ms. Shown in the pin's local timezone. */
  time: number;
  /** Time slider spans the whole day instead of sunrise to sunset. */
  fullDay: boolean;
  shadowQuality: ShadowQuality;
  /** 0–1, how strong the lens look is when it's on. */
  lensStrength: number;
  /** Which groups of controls are shown; hiding them all gives a clear map. Not saved. */
  hud: Hud;
  /** Loading state of the shadow layer, for the UI. */
  shadowStatus: { state: 'idle' | 'loading' | 'error'; message?: string; renderMs?: number };
  /** Phone layout: the layer panel is a bottom sheet that opens on demand. */
  layersOpen: boolean;
  tutorialOpen: boolean;
  /** Set once the tutorial has been closed, so it doesn't pop up again. */
  tutorialSeen: boolean;
  setBase(base: BaseLayer): void;
  toggleOverlay(key: keyof Overlays): void;
  setImagery(id: ImageryId): void;
  setMaptilerKey(key: string): void;
  setPin(pin: Pin): void;
  setCamera(camera: CameraState): void;
  setAboutOpen(open: boolean): void;
  setTime(ms: number): void;
  /** Exact moment, not rounded to the minute: timeline playback and export. */
  setTimeExact(ms: number): void;
  setFullDay(on: boolean): void;
  setShadowQuality(q: ShadowQuality): void;
  setLensStrength(v: number): void;
  setHud(patch: Partial<Hud>): void;
  /** Sets several layer switches at once (timeline keyframes). */
  setOverlays(patch: Partial<Overlays>): void;
  /** Hides every group, or shows them all again if they're all hidden. */
  toggleHud(): void;
  setShadowStatus(s: AppState['shadowStatus']): void;
  setLayersOpen(open: boolean): void;
  openTutorial(): void;
  closeTutorial(): void;
}

const DEFAULT_OVERLAYS: Overlays = {
  shadows: true,
  sunPath: true,
  solstices: true,
  compass: true,
  contours: true,
  labels: true,
  lightColour: true,
  routes: true,
  places: true,
  photos: true,
  lens: true,
  photoSpots: true,
  sunHours: false,
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      base: 'paper',
      overlays: DEFAULT_OVERLAYS,
      imagery: 'esri',
      maptilerKey: import.meta.env.VITE_MAPTILER_KEY ?? '',
      pin: SECEDA,
      camera: null,
      aboutOpen: false,
      time: readTimeFromUrl() ?? Date.now(),
      fullDay: false,
      shadowQuality: 'medium',
      lensStrength: 1,
      hud: { left: true, right: true, top: true, bottom: true },
      shadowStatus: { state: 'idle' },
      layersOpen: false,
      tutorialOpen: false,
      tutorialSeen: false,
      setBase: (base) => set({ base }),
      toggleOverlay: (key) => set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
      setImagery: (imagery) => set({ imagery }),
      setMaptilerKey: (maptilerKey) => set({ maptilerKey }),
      setPin: (pin) => set({ pin }),
      setCamera: (camera) => set({ camera }),
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),
      setTime: (time) => set({ time: Math.round(time / 60000) * 60000 }),
      setTimeExact: (time) => set({ time }),
      setFullDay: (fullDay) => set({ fullDay }),
      setShadowQuality: (shadowQuality) => set({ shadowQuality }),
      setLensStrength: (lensStrength) => set({ lensStrength: Math.min(1, Math.max(0, lensStrength)) }),
      setHud: (patch) => set((s) => ({ hud: { ...s.hud, ...patch } })),
      setOverlays: (patch) =>
        set((s) => (Object.entries(patch).every(([k, v]) => s.overlays[k as keyof Overlays] === v) ? {} : { overlays: { ...s.overlays, ...patch } })),
      toggleHud: () =>
        set((s) => {
          const anyShown = Object.values(s.hud).some(Boolean);
          return { hud: { left: !anyShown, right: !anyShown, top: !anyShown, bottom: !anyShown } };
        }),
      setShadowStatus: (shadowStatus) => set({ shadowStatus }),
      setLayersOpen: (layersOpen) => set({ layersOpen }),
      openTutorial: () => set({ tutorialOpen: true, layersOpen: false }),
      closeTutorial: () => set({ tutorialOpen: false, tutorialSeen: true }),
    }),
    {
      name: 'helios.settings',
      version: 2,
      // Only viewer preferences persist here; projects get their own save in phase 5.
      // Time is not saved: every visit starts at "now" unless the link carries a time.
      partialize: (s) => ({
        base: s.base,
        overlays: s.overlays,
        imagery: s.imagery,
        maptilerKey: s.maptilerKey,
        pin: s.pin,
        fullDay: s.fullDay,
        shadowQuality: s.shadowQuality,
        lensStrength: s.lensStrength,
        tutorialSeen: s.tutorialSeen,
      }),
      // Overlays saved by an older version lack newer keys; fill them with defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, overlays: { ...DEFAULT_OVERLAYS, ...p.overlays } };
      },
      migrate: (state) => state as AppState,
    },
  ),
);

// Handy for driving the app from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { __app: typeof useApp }).__app = useApp;
