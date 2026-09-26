import { describe, expect, it } from 'vitest';
import { kelvinToRgb, lightGain } from '../../src/scene/lightGain';

describe('light colour', () => {
  it('blackbody colours run from orange to blue', () => {
    const [r1, g1, b1] = kelvinToRgb(2500);
    expect(r1).toBe(1);
    expect(b1).toBeLessThan(g1);
    const [r2, , b2] = kelvinToRgb(12000);
    expect(b2).toBe(1);
    expect(r2).toBeLessThan(b2);
  });

  it('leaves high sun untouched', () => {
    for (const e of [25, 45, 70]) lightGain(e).forEach((v) => expect(v).toBeCloseTo(1, 3));
  });

  it('warms through golden hour, most at sunset', () => {
    const warmth = (e: number) => {
      const [r, , b] = lightGain(e);
      return r / b;
    };
    expect(warmth(12)).toBeGreaterThan(1.05);
    expect(warmth(4)).toBeGreaterThan(warmth(12));
    expect(warmth(0)).toBeGreaterThan(warmth(4));
    expect(warmth(0)).toBeLessThan(3); // warm, not a red filter
  });

  it('turns blue and darker in blue hour and night', () => {
    const [r, , b] = lightGain(-5);
    expect(b).toBeGreaterThan(r);
    const night = lightGain(-15);
    expect(Math.max(...night)).toBeLessThan(0.45);
    expect(Math.max(...lightGain(-5))).toBeGreaterThan(Math.max(...night));
  });

  it('changes smoothly with elevation', () => {
    for (let e = -20; e < 30; e += 0.25) {
      const a = lightGain(e);
      const b = lightGain(e + 0.25);
      a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(0.08));
    }
  });
});
