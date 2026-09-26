import { describe, expect, it } from 'vitest';
import { addLight, hoursColor, hoursPixels, HOURS_STOPS } from '../../src/terrain/sunHours';

describe('sun hours', () => {
  it('colours hours along the scale', () => {
    expect(hoursColor(0)).toEqual(HOURS_STOPS[0][1]);
    expect(hoursColor(20)).toEqual(HOURS_STOPS[HOURS_STOPS.length - 1][1]);
    expect(hoursColor(3)).toEqual([61, 129, 149]); // halfway between 2 h and 4 h
  });

  it('adds light where there is no shadow', () => {
    const total = new Float32Array(2);
    // Pixel 0 fully in shadow, pixel 1 fully lit; 10-minute steps.
    const mask = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 0]);
    for (let i = 0; i < 6; i++) addLight(total, mask, 1 / 6);
    expect(total[0]).toBeCloseTo(0, 6);
    expect(total[1]).toBeCloseTo(1, 6);
  });

  it('flips rows so north is at the top', () => {
    // 1 x 2 image: bottom row 0 h, top row 11 h.
    const px = hoursPixels(new Float32Array([0, 11]), 1, 2);
    expect(Array.from(px.slice(0, 3))).toEqual(HOURS_STOPS[HOURS_STOPS.length - 1][1]);
    expect(Array.from(px.slice(4, 7))).toEqual(HOURS_STOPS[0][1]);
  });
});
