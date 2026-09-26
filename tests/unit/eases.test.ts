import { describe, expect, it } from 'vitest';
import { arrivingShape, bezierAt, bezierSpeed, EASE_PRESETS, EASY_EASE, ease, leavingShape, LINEAR, presetName, readEasing } from '../../src/timeline/eases';

describe('ease curves', () => {
  it('linear is a straight line and Easy Ease is a smoothstep', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
      expect(bezierAt(LINEAR, x)).toBeCloseTo(x, 6);
      expect(bezierAt(EASY_EASE, x)).toBeCloseTo(x * x * (3 - 2 * x), 6);
    }
  });

  it('every preset runs from 0 to 1, in order, and Back overshoots', () => {
    for (const list of Object.values(EASE_PRESETS)) {
      for (const p of list) {
        expect(bezierAt(p.curve, 0)).toBe(0);
        expect(bezierAt(p.curve, 1)).toBe(1);
        if (p.name !== 'Back') {
          let prev = -1e-9;
          for (let x = 0; x <= 1; x += 0.05) {
            const y = bezierAt(p.curve, x);
            expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
            prev = y;
          }
        }
      }
    }
    expect(Math.min(...Array.from({ length: 50 }, (_, i) => bezierAt(EASE_PRESETS.in[8].curve, i / 50)))).toBeLessThan(-0.05);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => bezierAt(EASE_PRESETS.out[8].curve, i / 50)))).toBeGreaterThan(1.05);
  });

  it('In starts slow and Out arrives slowly', () => {
    const quadIn = EASE_PRESETS.in[2].curve;
    const quadOut = EASE_PRESETS.out[2].curve;
    expect(bezierSpeed(quadIn, 0.02)).toBeLessThan(0.3);
    expect(bezierSpeed(quadIn, 0.98)).toBeGreaterThan(1.5);
    expect(bezierSpeed(quadOut, 0.98)).toBeLessThan(0.3);
  });

  it('hold stays until the next keyframe', () => {
    expect(ease(0.99, 'hold')).toBe(0);
  });

  it('reads older saves and names presets', () => {
    expect(readEasing('linear')).toEqual(LINEAR);
    expect(readEasing('ease')).toEqual(EASY_EASE);
    expect(readEasing('hold')).toBe('hold');
    expect(readEasing([2, 0.5, -1, 1])).toEqual([1, 0.5, 0, 1]);
    expect(presetName(EASY_EASE)).toBe('Easy Ease');
    expect(presetName([0.65, 0, 0.35, 1])).toBe('Cubic In-Out');
    expect(presetName([0.2, 0.9, 0.4, 0.1])).toBeNull();
  });

  it('shapes keyframe icons like After Effects', () => {
    expect(leavingShape(LINEAR)).toBe('linear');
    expect(leavingShape(EASY_EASE)).toBe('eased');
    expect(arrivingShape(EASE_PRESETS.in[1].curve)).toBe('eased');
    expect(leavingShape('hold')).toBe('hold');
  });
});
