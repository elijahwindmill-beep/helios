import { useMemo } from 'react';
import { useApp } from '../store/app';
import { sunPosition } from './position';
import { dayTimes, type DayTimes } from './times';
import { timeZoneAt, utcOffsetMinutes, zonedParts } from './timezone';

// dayTimes scans a whole day, so cache it per place and local date.
const dayCache = new Map<string, DayTimes>();

export function dayTimesCached(ms: number, lat: number, lng: number, timeZone: string): DayTimes {
  const p = zonedParts(ms, timeZone);
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${timeZone},${p.year}-${p.month}-${p.day}`;
  let d = dayCache.get(key);
  if (!d) {
    d = dayTimes(ms, lat, lng, timeZone);
    dayCache.set(key, d);
    if (dayCache.size > 400) dayCache.delete(dayCache.keys().next().value!);
  }
  return d;
}

/** Sun state at the pin for the viewed moment. */
export function useSun() {
  const pin = useApp((s) => s.pin);
  const time = useApp((s) => s.time);
  const timeZone = useMemo(() => timeZoneAt(pin.lat, pin.lng), [pin.lat, pin.lng]);
  const position = sunPosition(time, pin.lat, pin.lng);
  const day = dayTimesCached(time, pin.lat, pin.lng, timeZone);
  const offset = utcOffsetMinutes(time, timeZone);
  return { pin, time, timeZone, position, day, offset };
}
