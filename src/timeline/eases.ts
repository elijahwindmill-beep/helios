import type { Bezier, Easing } from './model';

/**
 * Ease curves: cubic Béziers from (0, 0) to (1, 1), like CSS cubic-bezier() and After Effects'
 * value graph. x is the share of time between two keyframes, y the share of the way.
 */

export const LINEAR: Bezier = [0, 0, 1, 1];
/** After Effects' Easy Ease: 33.33 % influence and zero speed at both keyframes (a smoothstep). */
export const EASY_EASE: Bezier = [1 / 3, 0, 2 / 3, 1];

/** Progress (0 at this keyframe, 1 at the next; beyond for overshoot) at time share x. */
export function bezierAt(c: Bezier, x: number): number {
  const [x1, y1, x2, y2] = c;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Solve x(t) = x for the curve parameter t: Newton steps, then bisection if they stall.
  const bx = (t: number) => ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  const dx = (t: number) => (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-7) break;
    const d = dx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  if (!(t >= 0 && t <= 1) || Math.abs(bx(t) - x) > 1e-6) {
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      if (bx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
}

/** Speed along the curve at time share x (1 = the average speed of a linear move). */
export function bezierSpeed(c: Bezier, x: number): number {
  const h = 1e-3;
  const a = Math.max(0, x - h);
  const b = Math.min(1, x + h);
  return (bezierAt(c, b) - bezierAt(c, a)) / (b - a);
}

export function ease(u: number, easing: Easing): number {
  if (easing === 'hold') return 0;
  return bezierAt(easing, Math.min(1, Math.max(0, u)));
}

/** Older saves wrote 'linear' and 'ease'; anything unreadable becomes Easy Ease. */
export function readEasing(v: unknown): Easing {
  if (v === 'hold') return 'hold';
  if (v === 'linear') return [...LINEAR];
  if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    const [x1, y1, x2, y2] = v as number[];
    return [Math.min(1, Math.max(0, x1)), y1, Math.min(1, Math.max(0, x2)), y2];
  }
  return [...EASY_EASE];
}

export type EaseGroup = 'in' | 'out' | 'inout';

export interface EasePreset {
  name: string;
  curve: Bezier;
}

/**
 * The usual families (easings.net's Bézier fits), as in AE Juice and Flow. "In" starts slow
 * and speeds up, "Out" arrives slowly, "In-Out" does both.
 */
export const EASE_PRESETS: Record<EaseGroup, EasePreset[]> = {
  in: [
    { name: 'Easy', curve: [1 / 3, 0, 1, 1] },
    { name: 'Sine', curve: [0.12, 0, 0.39, 0] },
    { name: 'Quad', curve: [0.11, 0, 0.5, 0] },
    { name: 'Cubic', curve: [0.32, 0, 0.67, 0] },
    { name: 'Quart', curve: [0.5, 0, 0.75, 0] },
    { name: 'Quint', curve: [0.64, 0, 0.78, 0] },
    { name: 'Expo', curve: [0.7, 0, 0.84, 0] },
    { name: 'Circ', curve: [0.55, 0, 1, 0.45] },
    { name: 'Back', curve: [0.36, 0, 0.66, -0.56] },
  ],
  out: [
    { name: 'Easy', curve: [0, 0, 2 / 3, 1] },
    { name: 'Sine', curve: [0.61, 1, 0.88, 1] },
    { name: 'Quad', curve: [0.5, 1, 0.89, 1] },
    { name: 'Cubic', curve: [0.33, 1, 0.68, 1] },
    { name: 'Quart', curve: [0.25, 1, 0.5, 1] },
    { name: 'Quint', curve: [0.22, 1, 0.36, 1] },
    { name: 'Expo', curve: [0.16, 1, 0.3, 1] },
    { name: 'Circ', curve: [0, 0.55, 0.45, 1] },
    { name: 'Back', curve: [0.34, 1.56, 0.64, 1] },
  ],
  inout: [
    { name: 'Easy', curve: EASY_EASE },
    { name: 'Sine', curve: [0.37, 0, 0.63, 1] },
    { name: 'Quad', curve: [0.45, 0, 0.55, 1] },
    { name: 'Cubic', curve: [0.65, 0, 0.35, 1] },
    { name: 'Quart', curve: [0.76, 0, 0.24, 1] },
    { name: 'Quint', curve: [0.83, 0, 0.17, 1] },
    { name: 'Expo', curve: [0.87, 0, 0.13, 1] },
    { name: 'Circ', curve: [0.85, 0, 0.15, 1] },
    { name: 'Back', curve: [0.68, -0.6, 0.32, 1.6] },
  ],
};

export function sameCurve(a: Easing, b: Easing): boolean {
  if (a === 'hold' || b === 'hold') return a === b;
  return a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
}

/** Name of a curve if it's one of the presets, e.g. "Cubic In-Out". */
export function presetName(e: Easing): string | null {
  if (e === 'hold') return 'Hold';
  if (sameCurve(e, LINEAR)) return 'Linear';
  for (const [group, list] of Object.entries(EASE_PRESETS) as Array<[EaseGroup, EasePreset[]]>) {
    const p = list.find((x) => sameCurve(x.curve, e));
    if (p) return p.name === 'Easy' && group === 'inout' ? 'Easy Ease' : `${p.name} ${group === 'inout' ? 'In-Out' : group === 'in' ? 'In' : 'Out'}`;
  }
  return null;
}

/**
 * How a keyframe looks on the timeline, like After Effects' icons: each side shows how the
 * curve leaves (right) or arrives (left) there. Linear ◆, eased ⧓, hold ■.
 */
export type KeyShape = 'linear' | 'eased' | 'hold';

/** A handle's slope; a handle pulled back onto its keyframe points at the other handle instead. */
function slope(dx: number, dy: number, fx: number, fy: number): number {
  if (Math.hypot(dx, dy) < 1e-3) [dx, dy] = [fx, fy];
  return dx < 1e-3 ? Infinity : dy / dx;
}

export function leavingShape(e: Easing): KeyShape {
  if (e === 'hold') return 'hold';
  const [x1, y1, x2, y2] = e;
  return Math.abs(slope(x1, y1, x2, y2) - 1) < 0.2 ? 'linear' : 'eased';
}

export function arrivingShape(e: Easing): KeyShape {
  if (e === 'hold') return 'hold';
  const [x1, y1, x2, y2] = e;
  return Math.abs(slope(1 - x2, 1 - y2, 1 - x1, 1 - y1) - 1) < 0.2 ? 'linear' : 'eased';
}
