import { describe, expect, it } from 'vitest';
import { invert, multiply, pixelRay, raySphere, toScreen, transform } from '../../src/scene/projection';

// A simple perspective camera at (0, -10, 0) looking along +y, for checks.
function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
// View: world (x east, y north, z up) -> camera (x right, y up, z back), camera at y = -10.
const view = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, -10, 1];

describe('scene projection', () => {
  const m = multiply(perspective(Math.PI / 3, 1, 0.1, 100), view);

  it('projects the point straight ahead to the centre of the canvas', () => {
    expect(toScreen(transform(m, [0, 0, 0]), 200, 200)).toEqual([100, 100]);
  });

  it('drops points behind the camera', () => {
    expect(toScreen(transform(m, [0, -20, 0]), 200, 200)).toBeNull();
  });

  it('inverts, and a pixel ray passes back through the projected point', () => {
    const inv = invert(m)!;
    const p: [number, number, number] = [2, 5, 1.5];
    const [px, py] = toScreen(transform(m, p), 400, 300)!;
    const { origin, dir } = pixelRay(inv, px, py, 400, 300);
    // Distance from p to the ray.
    const v = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    const t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    const miss = Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t);
    expect(miss).toBeLessThan(1e-6);
  });

  it('finds near and far hits on a sphere', () => {
    const hits = raySphere([0, -10, 0], [0, 1, 0], 2);
    expect(hits.map((h) => h[1])).toEqual([-2, 2]);
    expect(raySphere([0, -10, 5], [0, 1, 0], 2)).toEqual([]);
  });
});
