/** Hours of direct sun in a day, as a colour: deep blue (none) through teal and green to amber and orange (all day). */
export const HOURS_STOPS: Array<[hours: number, rgb: [number, number, number]]> = [
  [0, [27, 42, 74]],
  [2, [59, 91, 138]],
  [4, [63, 167, 160]],
  [6, [156, 207, 107]],
  [8, [245, 197, 66]],
  [11, [255, 138, 61]],
];

export function hoursColor(h: number): [number, number, number] {
  const stops = HOURS_STOPS;
  if (h <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [h1, c1] = stops[i];
    if (h <= h1) {
      const [h0, c0] = stops[i - 1];
      const f = (h - h0) / (h1 - h0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * f)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

/** Adds one sun position's light to the running total: lit share of each pixel × the step, in hours. */
export function addLight(total: Float32Array, rgbaBottomUp: Uint8Array, stepHours: number) {
  for (let i = 0; i < total.length; i++) total[i] += (1 - rgbaBottomUp[i * 4 + 3] / 255) * stepHours;
}

/** The totals as a top-down image (the renderer reads bottom row first), semi-transparent. */
export function hoursPixels(total: Float32Array, width: number, height: number, alpha = 170): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let row = 0; row < height; row++) {
    const src = (height - 1 - row) * width;
    for (let col = 0; col < width; col++) {
      const [r, g, b] = hoursColor(total[src + col]);
      const o = (row * width + col) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = alpha;
    }
  }
  return out;
}
