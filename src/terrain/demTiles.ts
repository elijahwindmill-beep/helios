import { TERRARIUM_URL } from '../map/sources';

export const TILE_SIZE = 256;

/** Terrarium PNG pixels to metres: height = R*256 + G + B/256 - 32768. */
export function decodeTerrarium(rgba: ArrayLike<number>, out = new Float32Array(rgba.length / 4)): Float32Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
  }
  return out;
}

export type DemTileLoader = (z: number, x: number, y: number, signal?: AbortSignal) => Promise<Float32Array>;

async function loadTerrarium(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array> {
  const url = TERRARIUM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Elevation tile ${z}/${x}/${y} failed (${res.status})`);
  // No colour management or premultiplication: every channel is data, not colour.
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
}

let loader: DemTileLoader = loadTerrarium;

/** Swap the tile source, e.g. for a synthetic DEM in tests. Clears the cache. */
export function setDemTileLoader(next: DemTileLoader | null) {
  loader = next ?? loadTerrarium;
  cache.clear();
}

// Decoded tiles, least recently used first. 200 tiles is about 52 MB.
const MAX_TILES = 200;
const cache = new Map<string, Promise<Float32Array>>();

export function getDemTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = loader(z, x, y, signal);
  cache.set(key, p);
  // Don't keep failures (or aborts) around.
  p.catch(() => cache.get(key) === p && cache.delete(key));
  while (cache.size > MAX_TILES) cache.delete(cache.keys().next().value!);
  return p;
}
