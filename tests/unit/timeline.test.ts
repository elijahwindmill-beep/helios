import { describe, expect, it } from 'vitest';
import { evaluate, fromMercator, toMercator, unwrapBearings } from '../../src/timeline/interpolate';
import type { Clip, Keyframe } from '../../src/timeline/model';
import { zonedParts } from '../../src/sun/timezone';

const TZ = 'Europe/Rome';
const cam = { lng: 11.72598, lat: 46.60068, zoom: 13.4, bearing: 20, pitch: 62 };
const key = (t: number, sun: string, extra: Partial<Keyframe> = {}): Keyframe => ({
  id: String(t),
  t,
  sun: Date.parse(sun),
  camera: cam,
  easing: [0, 0, 1, 1],
  sunMode: 'continuous',
  loops: 0,
  ...extra,
});
const clip = (keyframes: Keyframe[], smoothCamera = false): Clip => ({ id: 'c', name: 'Test', keyframes, smoothCamera });
const local = (ms: number) => zonedParts(ms, TZ);

describe('timeline interpolation', () => {
  it('two keyframes a year apart play as a year lapse', () => {
    const c = clip([key(0, '2026-03-21T09:00:00Z'), key(10, '2027-03-21T09:00:00Z')]);
    const mid = evaluate(c, 5, TZ)!;
    const p = local(mid.sun);
    // Halfway through the year: around 20 Sep.
    expect(p.month).toBe(9);
    expect(Math.abs(p.day - 20)).toBeLessThanOrEqual(1);
    expect(evaluate(c, 10, TZ)!.sun).toBe(Date.parse('2027-03-21T09:00:00Z'));
  });

  it('a day lapse holds 10:00 while the date advances', () => {
    const c = clip([key(0, '2026-06-01T08:00:00Z', { sunMode: 'daylapse' }), key(30, '2026-06-30T08:00:00Z')]);
    const seen = new Set<string>();
    for (let t = 0; t < 30; t += 0.25) {
      const p = local(evaluate(c, t, TZ)!.sun);
      expect([p.hour, p.minute]).toEqual([10, 0]);
      seen.add(`${p.month}-${p.day}`);
    }
    expect(seen.size).toBe(29); // every day of June except the last
  });

  it('a day lapse can loop the time of day', () => {
    const c = clip([key(0, '2026-06-01T05:00:00Z', { sunMode: 'daylapse', loops: 2 }), key(10, '2026-06-11T17:00:00Z')]);
    const hour = (t: number) => local(evaluate(c, t, TZ)!.sun).hour;
    expect(hour(0)).toBe(7);
    expect(hour(4.9)).toBeGreaterThanOrEqual(18);
    expect(hour(5)).toBe(7); // second sweep starts over
  });

  it('a same-day segment sweeps dawn to dusk', () => {
    const c = clip([key(0, '2026-09-26T05:04:00Z'), key(20, '2026-09-26T17:03:00Z')]);
    const hours = [0, 5, 10, 15, 20].map((t) => local(evaluate(c, t, TZ)!.sun).hour);
    expect(hours).toEqual([7, 10, 13, 16, 19]);
  });

  it('ease and hold', () => {
    const c = clip([key(0, '2026-09-26T08:00:00Z', { easing: [1 / 3, 0, 2 / 3, 1] }), key(10, '2026-09-26T10:00:00Z', { easing: 'hold' }), key(20, '2026-09-26T12:00:00Z')]);
    const at = (t: number) => (evaluate(c, t, TZ)!.sun - Date.parse('2026-09-26T08:00:00Z')) / 3600000;
    expect(at(1)).toBeLessThan(0.2); // slow start
    expect(at(5)).toBeCloseTo(1, 5);
    expect(at(15)).toBeCloseTo(2, 5); // held
  });

  it('is deterministic', () => {
    const c = clip([key(0, '2026-03-21T09:00:00Z'), key(7, '2026-05-02T13:00:00Z', { camera: { ...cam, bearing: 300, zoom: 15 } }), key(12, '2026-07-01T09:00:00Z')], true);
    for (const t of [0.4, 3.3, 8.8, 11.9]) expect(evaluate(c, t, TZ)).toEqual(evaluate(c, t, TZ));
  });

  it('camera: mercator round trip, shortest bearing, keyframes hit exactly', () => {
    const [lng, lat] = fromMercator(...toMercator(11.72598, 46.60068));
    expect(lng).toBeCloseTo(11.72598, 9);
    expect(lat).toBeCloseTo(46.60068, 9);
    expect(unwrapBearings([350, 10, 340])).toEqual([350, 370, 340]);
    const c = clip([key(0, '2026-09-26T08:00:00Z', { camera: { ...cam, bearing: 350 } }), key(10, '2026-09-26T09:00:00Z', { camera: { ...cam, bearing: 10, zoom: 15 } })]);
    const mid = evaluate(c, 5, TZ)!.camera;
    expect(mid.bearing).toBeCloseTo(0, 6); // through north, not round the long way
    expect(mid.zoom).toBeCloseTo(14.2, 6);
    const s = clip([key(0, 'x', { sun: 0 }), key(5, 'x', { sun: 0, camera: { ...cam, lng: 11.8 } }), key(10, 'x', { sun: 0, camera: { ...cam, lat: 46.7 } })], true);
    expect(evaluate(s, 5, TZ)!.camera.lng).toBeCloseTo(11.8, 9);
  });

  it('layer switches carry forward from their keyframe', () => {
    const c = clip([key(0, '2026-09-26T08:00:00Z', { layers: { routes: false } }), key(5, '2026-09-26T09:00:00Z', { layers: { routes: true, photos: false } }), key(10, '2026-09-26T10:00:00Z')]);
    expect(evaluate(c, 2, TZ)!.layers).toEqual({ routes: false });
    expect(evaluate(c, 7, TZ)!.layers).toEqual({ routes: true, photos: false });
  });
});

describe('project files', async () => {
  const { parseProjectFile } = await import('../../src/timeline/projectFormat');
  const good = {
    helios: 1,
    savedAt: '2026-09-26T12:00:00Z',
    project: { version: 1, activeClip: 'a', clips: [{ id: 'a', name: 'Ridge', smoothCamera: true, keyframes: [key(5, '2026-09-26T08:00:00Z'), key(0, '2026-09-26T06:00:00Z', { easing: 'bogus' as never })] }] },
    layers: { routes: [], places: [], photos: [] },
    settings: { base: 'satellite', overlays: {}, imagery: 'esri', lensStrength: 1, pin: { lat: 46.6, lng: 11.7, name: '' } },
  };
  it('round trips, sorting keyframes and fixing unknown values', () => {
    const p = parseProjectFile(JSON.stringify(good));
    expect(p.project.clips[0].keyframes.map((k) => k.t)).toEqual([0, 5]);
    expect(p.project.clips[0].keyframes[0].easing).toEqual([1 / 3, 0, 2 / 3, 1]);
  });
  it('says plainly what is wrong', () => {
    expect(() => parseProjectFile('{')).toThrow("isn't valid JSON");
    expect(() => parseProjectFile('{"helios":2}')).toThrow("isn't a Helios project");
    const broken = structuredClone(good);
    broken.project.clips[0].keyframes[0].camera = { ...cam, lat: Number.NaN };
    expect(() => parseProjectFile(JSON.stringify(broken).replace('null', '"x"'))).toThrow('damaged');
  });
});
