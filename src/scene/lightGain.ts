/**
 * Light colour through the day, as a per-channel gain on the scene: neutral at high sun,
 * warming through golden hour to sunset, then the blue of blue hour and dim night.
 */

type Key = [elevation: number, kelvin: number, brightness: number, strength: number];

// Sun elevation (apparent, degrees) → colour temperature of the light, exposure, and how far
// the gains go toward that colour (1 would be a raw, uncorrected look). Screen values are
// gamma-encoded, so a brightness of 0.5 already looks much darker than half.
const KEYS: Key[] = [
  [-18, 15000, 0.35, 0.9],
  [-12, 15000, 0.42, 1],
  [-8, 14000, 0.55, 1],
  [-6, 12500, 0.66, 1],
  [-4, 10000, 0.74, 0.95],
  [-2, 3800, 0.8, 0.8],
  [0, 2500, 0.88, 0.75],
  [2, 2900, 0.93, 0.75],
  [6, 3700, 0.97, 0.75],
  [12, 4700, 1, 0.75],
  [25, 5800, 1, 0.75],
];

/** Blackbody colour of `kelvin`, 0..1 per channel (Tanner Helland's fit). */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return [c(r), c(g), c(b)];
}

const NEUTRAL = kelvinToRgb(5800);

/** Per-channel multiplier for the scene at this sun elevation. [1, 1, 1] means unchanged. */
export function lightGain(elevation: number): [number, number, number] {
  const last = KEYS[KEYS.length - 1];
  let [, kelvin, brightness, strength] = elevation <= KEYS[0][0] ? KEYS[0] : last;
  if (elevation > KEYS[0][0] && elevation < last[0]) {
    const i = KEYS.findIndex((k) => k[0] > elevation);
    const [e0, k0, b0, s0] = KEYS[i - 1];
    const [e1, k1, b1, s1] = KEYS[i];
    const f = (elevation - e0) / (e1 - e0);
    // Mireds (1e6 / K) interpolate the way colour temperature looks.
    kelvin = 1e6 / (1e6 / k0 + (1e6 / k1 - 1e6 / k0) * f);
    brightness = b0 + (b1 - b0) * f;
    strength = s0 + (s1 - s0) * f;
  }
  const rgb = kelvinToRgb(kelvin);
  const raw = rgb.map((v, i) => v / NEUTRAL[i]);
  const peak = Math.max(...raw);
  return raw.map((v) => (1 - strength + (strength * v) / peak) * brightness) as [number, number, number];
}
