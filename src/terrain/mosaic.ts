import { EARTH_RADIUS } from '../map/cameraMath';
import { getDemTile, TILE_SIZE } from './demTiles';

/** A rectangle of whole DEM tiles at one zoom. x1/y1 are inclusive. */
export interface TileRange {
  z: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Heights for a TileRange stitched into one grid, row 0 = north edge. */
export interface Mosaic extends TileRange {
  width: number;
  height: number;
  heights: Float32Array;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const RAD = Math.PI / 180;

export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}
export function latToTileY(lat: number, z: number): number {
  const s = Math.sin(lat * RAD);
  return ((1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2) * 2 ** z;
}
export function tileXToLng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return Math.atan(Math.sinh(n)) / RAD;
}

/** Metres per mosaic pixel at a latitude. */
export function metersPerPixel(lat: number, z: number): number {
  return (2 * Math.PI * EARTH_RADIUS * Math.cos(lat * RAD)) / (TILE_SIZE * 2 ** z);
}

/** Grows (or shrinks, if negative) bounds by a distance in metres. */
export function expandBounds(b: Bounds, meters: number): Bounds {
  const midLat = (b.north + b.south) / 2;
  const dLat = meters / (EARTH_RADIUS * RAD);
  const dLng = dLat / Math.max(0.05, Math.cos(midLat * RAD));
  return {
    west: b.west - dLng,
    east: b.east + dLng,
    south: Math.max(-85, b.south - dLat),
    north: Math.min(85, b.north + dLat),
  };
}

/** Clamps bounds to a square of `halfSize` metres around a point. */
export function clampBounds(b: Bounds, center: { lng: number; lat: number }, halfSize: number): Bounds {
  const box = expandBounds({ west: center.lng, east: center.lng, south: center.lat, north: center.lat }, halfSize);
  return {
    west: Math.max(b.west, box.west),
    east: Math.min(b.east, box.east),
    south: Math.max(b.south, box.south),
    north: Math.min(b.north, box.north),
  };
}

export function tileRangeFor(b: Bounds, z: number): TileRange {
  const max = 2 ** z - 1;
  return {
    z,
    x0: Math.max(0, Math.floor(lngToTileX(b.west, z))),
    x1: Math.min(max, Math.floor(lngToTileX(b.east, z))),
    y0: Math.max(0, Math.floor(latToTileY(b.north, z))),
    y1: Math.min(max, Math.floor(latToTileY(b.south, z))),
  };
}

export function rangeContains(outer: TileRange, inner: TileRange): boolean {
  return (
    outer.z === inner.z &&
    inner.x0 >= outer.x0 &&
    inner.x1 <= outer.x1 &&
    inner.y0 >= outer.y0 &&
    inner.y1 <= outer.y1
  );
}

export function rangeBounds(r: TileRange): Bounds {
  return {
    west: tileXToLng(r.x0, r.z),
    east: tileXToLng(r.x1 + 1, r.z),
    north: tileYToLat(r.y0, r.z),
    south: tileYToLat(r.y1 + 1, r.z),
  };
}

export interface MosaicPlan {
  /** Tiles to fetch: the visible area plus a margin for mountains that cast shadows into it. */
  build: TileRange;
  /** The part that must be covered; if a new view still fits inside the current mosaic, keep it. */
  need: TileRange;
}

/**
 * Picks the most detailed zoom whose tile grid for the view (plus shadow margin) fits in
 * `maxTilesPerSide`. Terrarium data in the Alps is ~30 m, which z12 (~26 m/px) already matches.
 */
export function planMosaic(
  view: Bounds,
  center: { lng: number; lat: number },
  opts: { maxTilesPerSide: number; maxZoom: number; marginMeters: number; maxHalfSize: number },
): MosaicPlan {
  const visible = clampBounds(view, center, opts.maxHalfSize);
  const withMargin = expandBounds(visible, opts.marginMeters);
  for (let z = opts.maxZoom; z >= 6; z--) {
    const build = tileRangeFor(withMargin, z);
    if (build.x1 - build.x0 < opts.maxTilesPerSide && build.y1 - build.y0 < opts.maxTilesPerSide) {
      return { build, need: tileRangeFor(expandBounds(visible, opts.marginMeters / 4), z) };
    }
  }
  const build = tileRangeFor(withMargin, 6);
  return { build, need: build };
}

/** Fetches and stitches the tiles of a range. Missing tiles become sea level (0 m). */
export async function buildMosaic(r: TileRange, signal?: AbortSignal): Promise<Mosaic> {
  const tilesX = r.x1 - r.x0 + 1;
  const tilesY = r.y1 - r.y0 + 1;
  const width = tilesX * TILE_SIZE;
  const height = tilesY * TILE_SIZE;
  const heights = new Float32Array(width * height);
  const jobs: Promise<void>[] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      jobs.push(
        getDemTile(r.z, r.x0 + tx, r.y0 + ty, signal).then(
          (tile) => {
            for (let row = 0; row < TILE_SIZE; row++) {
              heights.set(
                tile.subarray(row * TILE_SIZE, (row + 1) * TILE_SIZE),
                (ty * TILE_SIZE + row) * width + tx * TILE_SIZE,
              );
            }
          },
          (err) => {
            if (signal?.aborted) throw err;
          },
        ),
      );
    }
  }
  await Promise.all(jobs);
  return { ...r, width, height, heights };
}
