import { describe, expect, it } from 'vitest';
import { ecefToGeodetic, enuAxes, geodeticToEcef, MercatorFrame, mercatorY } from '../../src/map/earthFrame';
import { EARTH_RADIUS } from '../../src/map/cameraMath';

describe('earth frames', () => {
  it('round-trips latitude, longitude and ellipsoid height through Earth-centred metres', () => {
    for (const [lat, lng, h] of [
      [46.60068, 11.72598, 2500],
      [-49.2715, -73.0431, 3400],
      [0, 179.9, -30],
      [89.5, 45, 0],
    ]) {
      const [x, y, z] = geodeticToEcef(lat, lng, h);
      const g = ecefToGeodetic(x, y, z);
      expect(g.lat).toBeCloseTo(lat, 9);
      expect(g.lng).toBeCloseTo(lng, 9);
      expect(g.height).toBeCloseTo(h, 3);
    }
  });

  it('gives east, north and up at a place', () => {
    const { east, north, up } = enuAxes(0, 0);
    expect(east).toEqual([-0, 1, 0]);
    expect(north.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([-0, -0, 1]);
    expect(up).toEqual([1, 0, 0]);
  });

  it('matches Web Mercator', () => {
    expect(mercatorY(0)).toBeCloseTo(0.5, 12);
    expect(mercatorY(85.0511287798)).toBeCloseTo(0, 6);
  });

  it('keeps a local frame in metres near its origin', () => {
    const f = new MercatorFrame(46.6, 11.7);
    const out = new Float32Array(3);
    // 0.01° of longitude east on MapLibre's sphere.
    f.write(46.6, 11.71, 100, out, 0);
    const metres = (0.01 * Math.PI * EARTH_RADIUS * Math.cos((46.6 * Math.PI) / 180)) / 180;
    expect(out[0]).toBeCloseTo(metres, 2);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(100, 4);
    // North is negative y.
    f.write(46.61, 11.7, 0, out, 0);
    expect(out[1]).toBeLessThan(-1100);
    // Back to world pixels at zoom 10: the origin itself.
    const m = f.matrix(512 * 2 ** 10);
    expect(m[12]).toBeCloseTo(f.ox * 512 * 1024, 6);
    expect(m[0] * metres).toBeCloseTo((0.01 / 360) * 512 * 1024, 6);
  });
});
