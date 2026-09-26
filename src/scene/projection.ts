// Small 4x4 matrix helpers (column-major, like WebGL and MapLibre) for projecting the
// sun scene and turning a pointer back into a 3D ray.

export type Mat4 = ArrayLike<number>;
export type Vec3 = [number, number, number];
export interface Clip {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function multiply(a: Mat4, b: Mat4): Float64Array {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function transform(m: Mat4, p: Vec3): Clip {
  const [x, y, z] = p;
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
    w: m[3] * x + m[7] * y + m[11] * z + m[15],
  };
}

export function invert(m: Mat4): Float64Array | null {
  const a = Array.from(m);
  const inv = new Float64Array(16);
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (!det) return null;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

/**
 * Where a local-frame point lands on the canvas, in CSS pixels. null when it is behind
 * the camera.
 */
export function toScreen(c: Clip, width: number, height: number): [number, number] | null {
  if (c.w <= 1e-9) return null;
  return [((c.x / c.w + 1) / 2) * width, ((1 - c.y / c.w) / 2) * height];
}

/**
 * Ray from the camera through a canvas pixel, in the local frame of `inverse`
 * (the inverse of local-to-clip).
 */
export function pixelRay(inverse: Mat4, px: number, py: number, width: number, height: number): { origin: Vec3; dir: Vec3 } {
  const x = (px / width) * 2 - 1;
  const y = 1 - (py / height) * 2;
  const un = (z: number): Vec3 => {
    const c = transform(inverse, [x, y, z]);
    return [c.x / c.w, c.y / c.w, c.z / c.w];
  };
  const near = un(-1);
  const far = un(1);
  const d: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const len = Math.hypot(...d);
  return { origin: near, dir: [d[0] / len, d[1] / len, d[2] / len] };
}

/** Both points where a ray meets a sphere around the origin (none, or near then far). */
export function raySphere(origin: Vec3, dir: Vec3, radius: number): Vec3[] {
  const b = origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2];
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [-b - s, -b + s]
    .filter((t) => t > 0)
    .map((t) => [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t] as Vec3);
}
