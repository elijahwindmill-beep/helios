import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ROUTE_COLORS, newId, type LngLat, type Photo, type Place, type Route } from '../layers/model';

interface LayersState {
  routes: Route[];
  places: Place[];
  photos: Photo[];
  /** Points of the route being drawn, or null when not drawing. */
  draft: LngLat[] | null;
  /** Photo shown in the viewer. */
  openPhoto: string | null;
  /** Short message after an import, shown briefly. */
  notice: string | null;

  addRoutes(routes: Array<Omit<Route, 'id' | 'color'>>): void;
  updateRoute(id: string, patch: Partial<Omit<Route, 'id'>>): void;
  removeRoute(id: string): void;
  addPlaces(places: Array<Omit<Place, 'id'>>): void;
  updatePlace(id: string, patch: Partial<Omit<Place, 'id'>>): void;
  removePlace(id: string): void;
  addPhoto(photo: Photo): void;
  updatePhoto(id: string, patch: Partial<Omit<Photo, 'id'>>): void;
  removePhoto(id: string): void;

  startDraft(): void;
  addDraftPoint(p: LngLat): void;
  undoDraftPoint(): void;
  /** Saves the drawn route (if it has two or more points) and stops drawing. */
  finishDraft(): void;
  cancelDraft(): void;

  setOpenPhoto(id: string | null): void;
  setNotice(text: string | null): void;
}

// Points closer than this (degrees, about 1 m) are the same click: a double-click to finish adds two.
const SAME_POINT = 1e-5;

export const useLayers = create<LayersState>()(
  persist(
    (set, get) => ({
      routes: [],
      places: [],
      photos: [],
      draft: null,
      openPhoto: null,
      notice: null,

      addRoutes: (routes) =>
        set((s) => ({
          routes: [
            ...s.routes,
            ...routes.map((r, i) => ({ ...r, id: newId(), color: ROUTE_COLORS[(s.routes.length + i) % ROUTE_COLORS.length] })),
          ],
        })),
      updateRoute: (id, patch) => set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRoute: (id) => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
      addPlaces: (places) => set((s) => ({ places: [...s.places, ...places.map((p) => ({ ...p, id: newId() }))] })),
      updatePlace: (id, patch) => set((s) => ({ places: s.places.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePlace: (id) => set((s) => ({ places: s.places.filter((p) => p.id !== id) })),
      addPhoto: (photo) => set((s) => ({ photos: [...s.photos, photo] })),
      updatePhoto: (id, patch) => set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removePhoto: (id) => set((s) => ({ photos: s.photos.filter((p) => p.id !== id), openPhoto: s.openPhoto === id ? null : s.openPhoto })),

      startDraft: () => set({ draft: [] }),
      addDraftPoint: (p) =>
        set((s) => {
          if (!s.draft) return {};
          const last = s.draft[s.draft.length - 1];
          if (last && Math.abs(last[0] - p[0]) < SAME_POINT && Math.abs(last[1] - p[1]) < SAME_POINT) return {};
          return { draft: [...s.draft, p] };
        }),
      undoDraftPoint: () => set((s) => (s.draft ? { draft: s.draft.slice(0, -1) } : {})),
      finishDraft: () => {
        const { draft, routes } = get();
        if (draft && draft.length >= 2) get().addRoutes([{ name: `Route ${routes.length + 1}`, lines: [draft] }]);
        set({ draft: null });
      },
      cancelDraft: () => set({ draft: null }),

      setOpenPhoto: (openPhoto) => set({ openPhoto }),
      setNotice: (notice) => set({ notice }),
    }),
    {
      name: 'helios.layers',
      version: 1,
      partialize: (s) => ({ routes: s.routes, places: s.places, photos: s.photos }),
    },
  ),
);
