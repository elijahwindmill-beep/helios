import { describe, expect, it } from 'vitest';
import { sunPosition } from '../../src/sun/position';
import { angularDistance, solveDateTime, solveTimeOnDay } from '../../src/sun/solver';
import { startOfZonedDay, zonedToUtc } from '../../src/sun/timezone';

const SECEDA = { lat: 46.60068, lng: 11.72598 };
const TZ = 'Europe/Rome';

function yearDayStarts(year: number): number[] {
  const out: number[] = [];
  for (let d = 0; d <= 366; d++) {
    const dt = new Date(Date.UTC(year, 0, 1 + d));
    out.push(zonedToUtc({ year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), hour: 0, minute: 0 }, TZ));
  }
  return out;
}

const skyAt = (t: number) => {
  const s = sunPosition(t, SECEDA.lat, SECEDA.lng);
  return { azimuth: s.azimuth, elevation: s.elevationTrue };
};

describe('inverse sun solver', () => {
  it('measures angles between sky directions', () => {
    expect(angularDistance({ azimuth: 0, elevation: 0 }, { azimuth: 90, elevation: 0 })).toBeCloseTo(90);
    expect(angularDistance({ azimuth: 10, elevation: 90 }, { azimuth: 200, elevation: 90 })).toBeCloseTo(0);
  });

  it('dragging along the day finds the time: round trip under 0.1°', () => {
    const dayStart = startOfZonedDay(Date.UTC(2026, 8, 26, 10), TZ);
    const dayEnd = startOfZonedDay(dayStart + 26 * 3600000, TZ);
    for (const [hh, mm] of [
      [7, 30],
      [10, 6],
      [13, 21],
      [18, 40],
    ]) {
      const t = Date.UTC(2026, 8, 26, hh - 2, mm, 17);
      const s = solveTimeOnDay(SECEDA.lat, SECEDA.lng, dayStart, dayEnd, skyAt(t));
      expect(s.error).toBeLessThan(0.1);
      expect(Math.abs(s.time - t)).toBeLessThan(60000);
    }
  });

  it('shift-dragging anywhere in the sky finds a date and time: round trip under 0.1°', () => {
    const starts = yearDayStarts(2026);
    // Spread over the year, including near the solstices where the path barely moves.
    for (const t of [
      Date.UTC(2026, 0, 14, 9, 12),
      Date.UTC(2026, 3, 2, 14, 45),
      Date.UTC(2026, 5, 19, 6, 30),
      Date.UTC(2026, 7, 8, 16, 5),
      Date.UTC(2026, 11, 20, 11, 50),
    ]) {
      const target = skyAt(t);
      const s = solveDateTime(SECEDA.lat, SECEDA.lng, starts, target, t);
      expect(angularDistance(skyAt(s.time), target)).toBeLessThan(0.1);
    }
  });

  it('a point the sun never reaches gives the nearest reachable moment', () => {
    // Straight up: never reached at 46.6°N. Best is summer-solstice noon, ~66.9° high.
    const s = solveDateTime(SECEDA.lat, SECEDA.lng, yearDayStarts(2026), { azimuth: 180, elevation: 89 });
    const best = skyAt(s.time);
    expect(best.elevation).toBeGreaterThan(66.5);
    expect(new Date(s.time).getUTCMonth()).toBe(5);
  });
});
