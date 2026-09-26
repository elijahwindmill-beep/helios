import { describe, expect, it } from 'vitest';
import { sunPosition } from '../../src/sun/position';
import { dayTimes, HORIZON_GEOMETRIC, seasons } from '../../src/sun/times';
import {
  formatClock,
  formatOffset,
  startOfZonedDay,
  timeZoneAt,
  utcOffsetMinutes,
  zonedParts,
  zonedToUtc,
} from '../../src/sun/timezone';

// Acceptance values from the brief: Shadowmap at Seceda on 26 Sep 2026, UTC+2.
const SECEDA = { lat: 46.60068, lng: 11.72598 };
const at = (hh: number, mm: number) => Date.UTC(2026, 8, 26, hh - 2, mm);

describe('sun position at Seceda, 26 Sep 2026 (matches Shadowmap within 1°)', () => {
  it('10:06 local: elevation 28.4°, azimuth 127.2°', () => {
    const s = sunPosition(at(10, 6), SECEDA.lat, SECEDA.lng);
    expect(Math.abs(s.elevation - 28.4)).toBeLessThan(1);
    expect(Math.abs(s.azimuth - 127.2)).toBeLessThan(1);
  });

  it('13:21 local: elevation 42.1°, azimuth 185.6°', () => {
    const s = sunPosition(at(13, 21), SECEDA.lat, SECEDA.lng);
    expect(Math.abs(s.elevation - 42.1)).toBeLessThan(1);
    expect(Math.abs(s.azimuth - 185.6)).toBeLessThan(1);
  });

  it('sun on the flat horizon at about 07:08 and 19:02, like the ring badges', () => {
    // Geometric crossing is 07:09 / 18:58. Shadowmap's sunset badge sits ~3.5 min later than
    // pure geometry while its sunrise badge matches, so it uses a slightly different horizon
    // convention there. The brief allows convention differences; noted in README.
    const t = dayTimes(at(12, 0), SECEDA.lat, SECEDA.lng, 'Europe/Rome', HORIZON_GEOMETRIC);
    expect(Math.abs(t.sunrise! - at(7, 8))).toBeLessThan(2 * 60000);
    expect(Math.abs(t.sunset! - at(19, 2))).toBeLessThan(4 * 60000);
  });

  it('standard sunrise and sunset about 07:05 and 19:05, like the time slider ends', () => {
    const t = dayTimes(at(12, 0), SECEDA.lat, SECEDA.lng, 'Europe/Rome');
    expect(Math.abs(t.sunrise! - at(7, 5))).toBeLessThan(2 * 60000);
    expect(Math.abs(t.sunset! - at(19, 5))).toBeLessThan(2 * 60000);
    expect(t.solarNoon).toBeGreaterThan(t.sunrise!);
    expect(t.solarNoon).toBeLessThan(t.sunset!);
  });
});

describe('sun position sanity', () => {
  it('equinox noon on the equator is nearly overhead', () => {
    const t = dayTimes(Date.UTC(2026, 2, 20, 12), 0, 0, 'UTC');
    expect(sunPosition(t.solarNoon, 0, 0).elevationTrue).toBeGreaterThan(89);
  });

  it('polar night and midnight sun are reported', () => {
    expect(dayTimes(Date.UTC(2026, 11, 21, 12), 78.2, 15.6, 'UTC').polar).toBe('night');
    expect(dayTimes(Date.UTC(2026, 5, 21, 12), 78.2, 15.6, 'UTC').polar).toBe('day');
  });

  it('finds 2026 solstices and equinoxes on the right days', () => {
    const s = seasons(2026);
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    expect(day(s.marchEquinox)).toBe('2026-03-20');
    expect(day(s.juneSolstice)).toBe('2026-06-21');
    expect(day(s.septemberEquinox)).toBe('2026-09-23');
    expect(day(s.decemberSolstice)).toBe('2026-12-21');
  });
});

describe('timezones', () => {
  it('looks up the zone from coordinates', () => {
    expect(timeZoneAt(SECEDA.lat, SECEDA.lng)).toBe('Europe/Rome');
    expect(timeZoneAt(40.7, -74)).toBe('America/New_York');
  });

  it('converts between wall clock and UTC across DST', () => {
    expect(utcOffsetMinutes(at(10, 6), 'Europe/Rome')).toBe(120);
    expect(utcOffsetMinutes(Date.UTC(2026, 0, 15), 'Europe/Rome')).toBe(60);
    expect(formatOffset(120)).toBe('UTC+2');
    expect(formatOffset(-330)).toBe('UTC−5:30');
    const ms = zonedToUtc({ year: 2026, month: 9, day: 26, hour: 10, minute: 6 }, 'Europe/Rome');
    expect(ms).toBe(at(10, 6));
    expect(formatClock(ms, 'Europe/Rome')).toBe('10:06');
    expect(zonedParts(ms, 'Europe/Rome')).toMatchObject({ month: 9, day: 26, hour: 10, minute: 6 });
  });

  it('local midnight is right on DST change days', () => {
    // 25 Oct 2026: clocks go back in Italy, so the day is 25 hours long.
    const start = startOfZonedDay(Date.UTC(2026, 9, 25, 12), 'Europe/Rome');
    expect(formatClock(start, 'Europe/Rome')).toBe('00:00');
    const t = dayTimes(start, SECEDA.lat, SECEDA.lng, 'Europe/Rome');
    expect(t.dayEnd - t.dayStart).toBe(25 * 3600000);
  });
});

describe('golden and blue hour', () => {
  it('Seceda, 26 Sep 2026', async () => {
    const { lightWindows } = await import('../../src/sun/dayCache');
    const w = lightWindows(Date.parse('2026-09-26T10:00:00Z'), 46.60068, 11.72598, 'Europe/Rome');
    const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
    // Evening golden hour: sun from 6° down to the horizon; blue hour: 4° to 6° below.
    expect(w.golden.evening!.map(hm)).toEqual(['16:23', '17:03']); // 18:23 to 19:03 local
    expect(w.blue.evening!.map(hm)).toEqual(['17:21', '17:33']); // 19:21 to 19:33 local
    expect(w.golden.morning![0]).toBeLessThan(w.golden.morning![1]);
    expect(w.blue.morning![1]).toBeLessThan(w.golden.morning![0]);
  });
});
