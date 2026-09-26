import { solarCoordinates, sunPosition } from './position';
import { startOfZonedDay } from './timezone';

/** Standard sunrise/sunset: sun centre 0.833° below the horizon (refraction + half disk). */
export const HORIZON_STANDARD = -0.833;
/** Geometric: sun centre exactly on the flat horizon, as Shadowmap's ring badges show. */
export const HORIZON_GEOMETRIC = 0;

export interface DayTimes {
  /** Local midnight that starts the day, UTC ms. */
  dayStart: number;
  /** Next local midnight (23 or 25 h later on DST change days). */
  dayEnd: number;
  sunrise: number | null;
  sunset: number | null;
  solarNoon: number;
  /** When the sun never rises or never sets on this day. */
  polar: 'day' | 'night' | null;
}

/** Finds when elevationTrue crosses `horizon` between a and b (one crossing assumed). */
function crossing(a: number, b: number, lat: number, lng: number, horizon: number): number {
  const f = (t: number) => sunPosition(t, lat, lng).elevationTrue - horizon;
  let fa = f(a);
  for (let i = 0; i < 40 && b - a > 500; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

/**
 * Sunrise, sunset and solar noon for the local day containing `ms`.
 * Found by scanning the day in 10 minute steps, then bisecting, so it works at any
 * latitude and on DST change days.
 */
export function dayTimes(
  ms: number,
  lat: number,
  lng: number,
  timeZone: string,
  horizon = HORIZON_STANDARD,
): DayTimes {
  const dayStart = startOfZonedDay(ms, timeZone);
  const dayEnd = startOfZonedDay(dayStart + 26 * 3600000, timeZone);
  const step = 10 * 60000;
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let noon = dayStart;
  let best = -Infinity;
  let prevT = dayStart;
  let prev = sunPosition(dayStart, lat, lng).elevationTrue - horizon;
  for (let t = dayStart + step; t <= dayEnd; t += step) {
    const now = sunPosition(t, lat, lng).elevationTrue;
    if (now > best) {
      best = now;
      noon = t;
    }
    const v = now - horizon;
    if (prev < 0 && v >= 0 && sunrise === null) sunrise = crossing(prevT, t, lat, lng, horizon);
    if (prev >= 0 && v < 0) sunset = crossing(prevT, t, lat, lng, horizon);
    prev = v;
    prevT = t;
  }
  // Refine noon (highest sun) around the best scan sample.
  let a = noon - step;
  let b = noon + step;
  const g = (Math.sqrt(5) - 1) / 2;
  const el = (t: number) => sunPosition(t, lat, lng).elevationTrue;
  while (b - a > 1000) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (el(c) > el(d)) b = d;
    else a = c;
  }
  const solarNoon = (a + b) / 2;

  let polar: DayTimes['polar'] = null;
  if (sunrise === null && sunset === null) polar = best > horizon ? 'day' : 'night';
  return { dayStart, dayEnd, sunrise, sunset, solarNoon, polar };
}

/** Solstices and equinoxes of a year (UTC ms), from the sun's declination. */
export function seasons(year: number): { marchEquinox: number; juneSolstice: number; septemberEquinox: number; decemberSolstice: number } {
  const dec = (t: number) => solarCoordinates(t).declination;
  const zero = (a: number, b: number) => {
    let fa = dec(a);
    for (let i = 0; i < 50 && b - a > 1000; i++) {
      const m = (a + b) / 2;
      if (Math.sign(dec(m)) === Math.sign(fa)) {
        a = m;
        fa = dec(m);
      } else b = m;
    }
    return (a + b) / 2;
  };
  // Golden-section search for the extreme declination.
  const extreme = (a: number, b: number, sign: 1 | -1) => {
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 60 && b - a > 60000; i++) {
      const c = b - g * (b - a);
      const d = a + g * (b - a);
      if (sign * dec(c) > sign * dec(d)) b = d;
      else a = c;
    }
    return (a + b) / 2;
  };
  const d = (m: number, day: number) => Date.UTC(year, m, day);
  return {
    marchEquinox: zero(d(2, 10), d(2, 30)),
    juneSolstice: extreme(d(5, 10), d(5, 30), 1),
    septemberEquinox: zero(d(8, 15), d(9, 1)),
    decemberSolstice: extreme(d(11, 10), d(11, 31), -1),
  };
}
