import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { geoidAt, GEOID_COLS, GEOID_ROWS } from '../../src/map/geoid';

const grid = new Int8Array(readFileSync(new URL('../../public/egm96-1deg.bin', import.meta.url)));

describe('EGM96 geoid grid', () => {
  it('has one value per whole degree', () => {
    expect(grid.length).toBe(GEOID_ROWS * GEOID_COLS);
  });

  it('matches published geoid heights to about a metre', () => {
    // Full-resolution EGM96 (15′): Seceda 49.9 m, the Indian Ocean low about -106 m near
    // 4.7°N 78.8°E, New Guinea high about 85 m near 8°S 147°E.
    expect(geoidAt(grid, 46.60068, 11.72598)).toBeCloseTo(49.9, -0.5);
    expect(geoidAt(grid, 4.7, 78.8)).toBeLessThan(-100);
    expect(geoidAt(grid, -8, 147)).toBeGreaterThan(70);
  });

  it('wraps across the date line and clamps at the poles', () => {
    expect(geoidAt(grid, 10, 179.5)).toBeCloseTo((geoidAt(grid, 10, 179) + geoidAt(grid, 10, -180)) / 2, 5);
    expect(Number.isFinite(geoidAt(grid, 90, 0))).toBe(true);
    expect(Number.isFinite(geoidAt(grid, -90, 0))).toBe(true);
  });
});
