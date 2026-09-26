import { useMemo } from 'react';
import { useApp } from '../store/app';
import { sunPosition } from './position';
import { timeZoneAt, utcOffsetMinutes } from './timezone';
import { dayTimesCached } from './dayCache';

export { dayTimesCached, lightWindows, type LightWindows } from './dayCache';

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
