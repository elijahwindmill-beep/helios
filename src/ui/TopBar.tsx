import { useEffect, useState } from 'react';
import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';
import { lightWindows, useSun } from '../sun/useSun';
import { formatClock, formatDate, formatOffset } from '../sun/timezone';
import { useWeather } from '../weather/useWeather';
import { Logo } from './Logo';
import { NowButton, TypedField, useTimeControls } from './timeControls';

/** Ground height at the pin from the terrain, once it has loaded. */
function usePinElevation(): number | null {
  const pin = useApp((s) => s.pin);
  const [elevation, setElevation] = useState<number | null>(null);
  useEffect(() => {
    const map = getMap();
    if (!map) return;
    const read = () => {
      const e = map.queryTerrainElevation([pin.lng, pin.lat]);
      setElevation(e === null || e === undefined ? null : e);
    };
    read();
    map.on('idle', read);
    return () => void map.off('idle', read);
  }, [pin.lat, pin.lng]);
  return elevation;
}

const hm = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

/**
 * Desktop top bar: where you are, the sun at the viewed moment like a resource bar,
 * and the time and date (click to type).
 */
export function TopBar() {
  const { pin, time, timeZone, position, day, offset } = useSun();
  const elevation = usePinElevation();
  const w = useWeather();
  const { applyTime, applyDate } = useTimeControls();
  const lw = lightWindows(time, pin.lat, pin.lng, timeZone);
  const clock = (ms: number | null | undefined) => (ms != null ? formatClock(ms, timeZone) : '–');
  const place = pin.name || `${Math.abs(pin.lat).toFixed(4)}°${pin.lat >= 0 ? 'N' : 'S'} ${Math.abs(pin.lng).toFixed(4)}°${pin.lng >= 0 ? 'E' : 'W'}`;
  const air = w.status === 'ok' && w.kind === 'ok' ? `${Math.round(w.entry.temperature)}° · ${Math.round(w.entry.wind * 3.6)} km/h` : '–';

  const stats = [
    { k: 'Sun height', v: `${position.elevation.toFixed(1)}°`, tone: 'accent' },
    { k: 'Azimuth', v: `${position.azimuth.toFixed(1)}°` },
    { k: 'Sunrise', v: clock(day.sunrise) },
    { k: 'Sunset', v: clock(day.sunset) },
    { k: 'Golden hour', v: clock(lw.golden.evening?.[0]), tone: 'gold' },
    { k: 'Daylight', v: day.sunrise !== null && day.sunset !== null ? hm(day.sunset - day.sunrise) : day.polar === 'day' ? '24 h' : '0 h' },
    { k: 'Air · wind', v: air },
  ];

  return (
    <header className="panel top-bar" aria-label="Sun and time">
      <div className="brand">
        <Logo height={24} />
      </div>
      <div className="top-cell top-place">
        <span className="hud-label">Location</span>
        <span className="hud-value" title={`${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}>
          {place}
          {elevation !== null && <span className="hud-unit"> · {Math.round(elevation)} m</span>}
        </span>
      </div>
      <div className="top-stats">
        {stats.map((s, i) => (
          <div key={s.k} className="top-cell" data-priority={i < 4 ? 1 : i < 6 ? 2 : 3}>
            <span className="hud-label">{s.k}</span>
            <span className="hud-value" data-tone={s.tone}>
              {s.v}
            </span>
          </div>
        ))}
      </div>
      <div className="top-when">
        <div className="top-date">
          <span className="hud-label">Date · {formatOffset(offset)}</span>
          <TypedField className="hud-value top-date-input" label="Date" hint="Type a date, e.g. 12 Oct 2026 or 12/10/2026" value={formatDate(time, timeZone)} apply={applyDate} />
        </div>
        <TypedField className="top-time" label="Time" hint="Type a time, e.g. 06:47" value={formatClock(time, timeZone)} apply={applyTime} />
        <NowButton />
      </div>
    </header>
  );
}
