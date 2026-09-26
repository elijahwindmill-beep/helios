import { HORIZON_STANDARD, dayTimes, type DayTimes } from './times';
import { zonedParts } from './timezone';

// dayTimes scans a whole day, so cache it per place and local date.
const dayCache = new Map<string, DayTimes>();

/** `horizon` other than the standard one finds when the sun crosses that height instead (golden and blue hour). */
export function dayTimesCached(ms: number, lat: number, lng: number, timeZone: string, horizon = HORIZON_STANDARD): DayTimes {
  const p = zonedParts(ms, timeZone);
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${timeZone},${p.year}-${p.month}-${p.day},${horizon}`;
  let d = dayCache.get(key);
  if (!d) {
    d = dayTimes(ms, lat, lng, timeZone, horizon);
    dayCache.set(key, d);
    if (dayCache.size > 400) dayCache.delete(dayCache.keys().next().value!);
  }
  return d;
}

/** Golden hour: sun between the horizon and 6° up. Blue hour: 4° to 6° below. */
export const GOLDEN_TOP = 6;
export const BLUE_TOP = -4;
export const BLUE_BOTTOM = -6;

export interface LightWindows {
  golden: { morning: [number, number] | null; evening: [number, number] | null };
  blue: { morning: [number, number] | null; evening: [number, number] | null };
}

/** Morning and evening golden and blue hours for the local day containing `ms`. */
export function lightWindows(ms: number, lat: number, lng: number, timeZone: string): LightWindows {
  const at = (h: number) => dayTimesCached(ms, lat, lng, timeZone, h);
  const horizon = at(HORIZON_STANDARD);
  const golden = at(GOLDEN_TOP);
  const blueTop = at(BLUE_TOP);
  const blueBottom = at(BLUE_BOTTOM);
  const span = (a: number | null, b: number | null): [number, number] | null => (a !== null && b !== null && b > a ? [a, b] : null);
  return {
    golden: { morning: span(horizon.sunrise, golden.sunrise), evening: span(golden.sunset, horizon.sunset) },
    blue: { morning: span(blueBottom.sunrise, blueTop.sunrise), evening: span(blueTop.sunset, blueBottom.sunset) },
  };
}
