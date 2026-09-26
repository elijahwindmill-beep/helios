import { ELEVATION, type ElevationProvider } from '../map/sources';

/**
 * The shadow code works in 256 px pieces whatever the service's tile size: a 512 px tile at
 * zoom z-1 holds the four 256 px pieces of zoom z.
 */
export const TILE_SIZE = 256;

export interface DemTile {
  /** TILE_SIZE² heights in metres, row 0 = north. */
  heights: Float32Array;
  /** False when the service had nothing this detailed here and a coarser tile was stretched. */
  native: boolean;
}

/** Terrarium PNG pixels to metres: height = R*256 + G + B/256 - 32768. */
export function decodeTerrarium(rgba: ArrayLike<number>, out = new Float32Array(rgba.length / 4)): Float32Array {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
  }
  return out;
}

/**
 * The 256 px piece (z, x, y) cut from a service tile (sz, sx, sy) of `size` px that contains
 * it, stretched (bilinear) when the service tile is coarser than the piece.
 */
export function cutPiece(src: Float32Array, size: number, z: number, x: number, y: number, sz: number, sx: number, sy: number): Float32Array {
  const out = new Float32Array(TILE_SIZE * TILE_SIZE);
  // Service-tile pixels per piece pixel, and where the piece's corner falls in the service tile.
  const k = size / TILE_SIZE / 2 ** (z - sz);
  const ox = (x / 2 ** (z - sz) - sx) * size;
  const oy = (y / 2 ** (z - sz) - sy) * size;
  if (k === 1) {
    for (let row = 0; row < TILE_SIZE; row++) out.set(src.subarray((oy + row) * size + ox, (oy + row) * size + ox + TILE_SIZE), row * TILE_SIZE);
    return out;
  }
  const clamp = (v: number) => Math.min(size - 1, Math.max(0, v));
  for (let row = 0; row < TILE_SIZE; row++) {
    const fy = oy + (row + 0.5) * k - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const r0 = clamp(y0) * size;
    const r1 = clamp(y0 + 1) * size;
    for (let col = 0; col < TILE_SIZE; col++) {
      const fx = ox + (col + 0.5) * k - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const c0 = clamp(x0);
      const c1 = clamp(x0 + 1);
      const top = src[r0 + c0] * (1 - tx) + src[r0 + c1] * tx;
      const bottom = src[r1 + c0] * (1 - tx) + src[r1 + c1] * tx;
      out[row * TILE_SIZE + col] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

export type DemTileLoader = (z: number, x: number, y: number, signal?: AbortSignal) => Promise<DemTile>;

let provider: ElevationProvider = ELEVATION.mapterhorn;

/** One service tile, decoded; null when the service has none (404: past local coverage). */
async function fetchServiceTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array | null> {
  const url = provider.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Elevation tile ${z}/${x}/${y} failed (${res.status})`);
  // No colour management or premultiplication: every channel is data, not colour.
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const size = bitmap.width;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeTerrarium(ctx.getImageData(0, 0, size, size).data);
}

// Decoded service tiles (a 512 px one is 1 MB), least recently used first.
const MAX_SERVICE_TILES = 48;
const serviceCache = new Map<string, Promise<Float32Array | null>>();

function serviceTile(z: number, x: number, y: number, signal?: AbortSignal) {
  return cached(serviceCache, MAX_SERVICE_TILES, `${provider.id}/${z}/${x}/${y}`, () => fetchServiceTile(z, x, y, signal));
}

/** How many zoom levels up to look for a coarser tile where the detailed one is missing. */
const MAX_FALLBACK = 8;

async function loadPiece(z: number, x: number, y: number, signal?: AbortSignal): Promise<DemTile> {
  const shift = Math.log2(provider.tileSize / TILE_SIZE);
  for (let up = 0; up <= MAX_FALLBACK && z - shift - up >= 0; up++) {
    const sz = z - shift - up;
    const sx = x >> (shift + up);
    const sy = y >> (shift + up);
    const src = await serviceTile(sz, sx, sy, signal);
    if (src) return { heights: cutPiece(src, provider.tileSize, z, x, y, sz, sx, sy), native: up === 0 };
  }
  throw new Error(`No elevation for ${z}/${x}/${y}`);
}

let loader: DemTileLoader = loadPiece;

/** Swap the tile source, e.g. for a synthetic DEM in tests. Clears the cache. */
export function setDemTileLoader(next: DemTileLoader | null) {
  loader = next ?? loadPiece;
  cache.clear();
}

/** Switches the elevation service for the shadows and heatmap. Clears the caches. */
export function setElevationProvider(p: ElevationProvider) {
  if (p === provider) return;
  provider = p;
  cache.clear();
  serviceCache.clear();
}

// Decoded 256 px pieces. 200 pieces is about 52 MB.
const MAX_TILES = 200;
const cache = new Map<string, Promise<DemTile>>();

/** LRU cache of promises; failures (and aborts) aren't kept. */
function cached<T>(map: Map<string, Promise<T>>, max: number, key: string, load: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit) {
    map.delete(key);
    map.set(key, hit);
    return hit;
  }
  const p = load();
  map.set(key, p);
  p.catch(() => map.get(key) === p && map.delete(key));
  while (map.size > max) map.delete(map.keys().next().value!);
  return p;
}

export async function getDemTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<DemTile> {
  const key = `${provider.id}/${z}/${x}/${y}`;
  try {
    return await cached(cache, MAX_TILES, key, () => loader(z, x, y, signal));
  } catch (err) {
    // A load this one was sharing was cancelled by its own requester: try again for ours.
    if ((err as Error).name === 'AbortError' && !signal?.aborted) return cached(cache, MAX_TILES, key, () => loader(z, x, y, signal));
    throw err;
  }
}
