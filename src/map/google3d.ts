import type { Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { useGoogle3d } from '../store/google3d';

/**
 * Switches the optional Google Photorealistic 3D Tiles on and off. The renderer (three.js and
 * 3d-tiles-renderer, about 1 MB) only downloads the first time they're switched on.
 * In development, ?tileset=<url> loads any 3D Tiles set instead (no key), for testing.
 */
const DEV_TILESET = import.meta.env.DEV ? new URLSearchParams(location.search).get('tileset') : null;

export function installGoogle3d(map: MlMap, beforeLayer: string): () => void {
  let remove: (() => void) | null = null;
  let activeKey: string | null = null;
  let busy = false;
  let disposed = false;
  // A key that failed to load the renderer isn't retried until something changes.
  let failed: string | null = null;

  const sync = async () => {
    if (busy || disposed) return;
    const s = useApp.getState();
    const key = s.googleKey.trim();
    const want = s.overlays.google3d && (key !== '' || DEV_TILESET !== null);
    if (remove && (!want || key !== activeKey)) {
      remove();
      remove = null;
      useGoogle3d.setState({ status: 'off', message: '', credits: '' });
    }
    if (!want || remove || failed === key) return;
    busy = true;
    useGoogle3d.setState({ status: 'loading', message: '' });
    try {
      const { addGoogleTiles } = await import('./google3dLayer');
      if (!disposed) {
        remove = await addGoogleTiles(map, beforeLayer, DEV_TILESET ? { url: DEV_TILESET } : { key });
        activeKey = key;
      }
    } catch (err) {
      failed = key;
      useGoogle3d.setState({ status: 'error', message: (err as Error).message });
    } finally {
      busy = false;
    }
    // Settings may have changed while it loaded.
    void sync();
  };

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.overlays.google3d !== prev.overlays.google3d || now.googleKey !== prev.googleKey) {
      failed = null;
      void sync();
    }
  });
  void sync();
  return () => {
    disposed = true;
    unsubscribe();
    remove?.();
  };
}
