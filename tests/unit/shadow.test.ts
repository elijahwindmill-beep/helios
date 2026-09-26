import { describe, expect, it } from 'vitest';
import { shadowAt, type MarchSettings } from '../../src/terrain/march';
import { decodeTerrarium } from '../../src/terrain/demTiles';
import { planMosaic, rangeContains, metersPerPixel } from '../../src/terrain/mosaic';

const W = 400;
const H = 100;
const MPP = 10; // metres per grid pixel
const march: MarchSettings = { steps: 400, firstStep: 0.7, maxDistance: 300 };

/** Flat ground with a 200 m tall, 4 px thick north-south wall at x = 300. */
function wallDem(height = 200) {
  const dem = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 298; x < 302; x++) dem[y * W + x] = height;
  return dem;
}

describe('terrain shadow geometry', () => {
  it('a wall casts a shadow of length height / tan(elevation)', () => {
    const dem = wallDem();
    const sun = { azimuth: 90, elevation: 30 }; // sun in the east, shadow falls west
    const length = 200 / Math.tan(Math.PI / 6) / MPP; // 34.6 px
    const at = (px: number) => shadowAt(dem, W, H, 298 - px, 50, sun, MPP, march);
    expect(at(length - 4)).toBe(1);
    expect(at(length + 4)).toBe(0);
    // East of the wall, facing the sun: lit.
    expect(shadowAt(dem, W, H, 320, 50, sun, MPP, march)).toBe(0);
  });

  it('a lower sun makes a longer shadow', () => {
    const dem = wallDem();
    const low = { azimuth: 90, elevation: 10 };
    const length = 200 / Math.tan((10 * Math.PI) / 180) / MPP; // 113 px
    expect(shadowAt(dem, W, H, 298 - (length - 6), 50, low, MPP, march)).toBe(1);
    expect(shadowAt(dem, W, H, 298 - (length + 6), 50, low, MPP, march)).toBe(0);
  });

  it('the edge is soft over the width of the sun disk, not a hard step', () => {
    const dem = wallDem();
    const sun = { azimuth: 90, elevation: 30 };
    const edge = 200 / Math.tan(Math.PI / 6) / MPP;
    // The blur zone is under a pixel wide here, so scan across the edge finely.
    const values: number[] = [];
    for (let d = edge - 2; d <= edge + 2; d += 0.02) values.push(shadowAt(dem, W, H, 298 - d, 50, sun, MPP, march));
    expect(values.some((v) => v > 0.05 && v < 0.95)).toBe(true);
    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(0);
  });

  it('a slope facing away from the sun, steeper than the sun, shades itself', () => {
    // Ground rising toward the east at 45° (10 m per 10 m pixel) faces west.
    const risingEast = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) risingEast[y * W + x] = x * 10;
    expect(shadowAt(risingEast, W, H, 100, 50, { azimuth: 270, elevation: 30 }, MPP, march)).toBe(0); // sun in the west: lit
    expect(shadowAt(risingEast, W, H, 100, 50, { azimuth: 90, elevation: 30 }, MPP, march)).toBe(1); // sun east, 30° < 45°: shaded
    expect(shadowAt(risingEast, W, H, 100, 50, { azimuth: 90, elevation: 60 }, MPP, march)).toBe(0); // sun east, 60° > 45°: lit
  });

  it('everything is in shadow once the sun is down', () => {
    expect(shadowAt(new Float32Array(W * H), W, H, 10, 10, { azimuth: 90, elevation: -1 }, MPP, march)).toBe(1);
  });
});

describe('elevation tiles', () => {
  it('decodes Terrarium pixels to metres', () => {
    const px = [128, 0, 0, 255, 129, 2, 128, 255, 0, 0, 0, 255];
    expect(Array.from(decodeTerrarium(px))).toEqual([0, 258.5, -32768]);
  });

  it('plans a detailed mosaic for a close view and a coarser one for a wide view', () => {
    const center = { lng: 11.72598, lat: 46.60068 };
    const opts = { maxTilesPerSide: 10, maxZoom: 12, marginMeters: 10000, maxHalfSize: 30000 };
    const close = planMosaic({ west: 11.7, east: 11.75, south: 46.58, north: 46.62 }, center, opts);
    expect(close.build.z).toBe(12);
    expect(rangeContains(close.build, close.need)).toBe(true);
    const wide = planMosaic({ west: 10.5, east: 13, south: 46, north: 47.2 }, center, opts);
    expect(wide.build.z).toBeLessThan(12);
    expect(wide.build.x1 - wide.build.x0).toBeLessThan(10);
  });

  it('z12 grid spacing in the Dolomites is about 26 m', () => {
    expect(metersPerPixel(46.6, 12)).toBeGreaterThan(25);
    expect(metersPerPixel(46.6, 12)).toBeLessThan(28);
  });
});
