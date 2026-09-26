import { describe, expect, it } from 'vitest';
import { liftAt, liftEnvelope, type Lift } from '../../src/timeline/clearance';

describe('terrain clearance', () => {
  it('lifts smoothly around a close pass, never below what each moment needs', () => {
    const need = [0, 0, 0, 0, 0, 20, 5, 0, 0, 0, 0];
    const lift = liftEnvelope(need, 3);
    need.forEach((n, i) => expect(lift[i]).toBeGreaterThanOrEqual(n));
    // Rises before the pass and eases back after it, without steps.
    expect(lift[3]).toBeGreaterThan(0);
    expect(lift[4]).toBeGreaterThan(lift[3]);
    expect(lift[7]).toBeLessThan(lift[6]);
    expect(lift[0]).toBe(0);
    expect(lift[10]).toBe(0);
  });

  it('interpolates between samples', () => {
    const l = { samples: [0, 10, 20] } as Lift;
    expect(liftAt(l, 0.05)).toBeCloseTo(5, 9);
    expect(liftAt(l, 5)).toBe(20);
  });
});
