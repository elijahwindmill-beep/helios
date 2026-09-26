import { useState, type ReactNode } from 'react';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { formatClock, formatDate } from '../sun/timezone';
import type { Sky } from '../weather/metno';
import { useWeather } from '../weather/useWeather';

const SOURCE = 'https://api.met.no/';

/** Line icons for the sky, drawn to match the rest of the UI. */
export function SkyIcon({ sky, size = 16 }: { sky: Sky; size?: number }) {
  const cloud = <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z" />;
  const smallCloud = <path d="M9 19h8a3.2 3.2 0 0 0 .4-6.36A4.8 4.8 0 0 0 8.6 11.6 3.4 3.4 0 0 0 9 19z" />;
  const paths: Record<Sky, ReactNode> = {
    clear: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </>
    ),
    fair: (
      <>
        <circle cx="9" cy="9" r="3.5" />
        <path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1" />
        {smallCloud}
      </>
    ),
    partly: (
      <>
        <path d="M6.5 11.5A4 4 0 0 1 13.4 7" />
        <path d="M8.5 2.5v1.5M2.5 8.5H4M4.2 4.2l1 1" />
        {smallCloud}
      </>
    ),
    overcast: cloud,
    fog: <path d="M4 9h16M3 13h18M5 17h14" />,
    rain: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.6 4.2 4.2 0 0 0 7 15z" />
        <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
      </>
    ),
    sleet: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.6 4.2 4.2 0 0 0 7 15z" />
        <path d="M9 18l-1 3M16 18l-1 3" />
        <circle cx="12.5" cy="19.5" r="0.6" />
      </>
    ),
    snow: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.6 4.2 4.2 0 0 0 7 15z" />
        <circle cx="9" cy="19" r="0.6" />
        <circle cx="12.5" cy="20.5" r="0.6" />
        <circle cx="16" cy="19" r="0.6" />
      </>
    ),
    thunder: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.6 4.2 4.2 0 0 0 7 15z" />
        <path d="M12.5 15l-2 3.5h3l-2 3.5" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[sky]}
    </svg>
  );
}

/** One line in the sun card: the forecast at the pin for the viewed moment. */
export function WeatherRow() {
  const w = useWeather();
  const { timeZone } = useSun();
  let body: ReactNode;
  let title = 'Weather forecast from MET Norway';
  if (w.status === 'loading') body = <span className="muted">Loading forecast…</span>;
  else if (w.status === 'error') body = <span className="muted">Forecast unavailable</span>;
  else if (w.kind === 'past') body = <span className="muted">No forecast for past times</span>;
  else if (w.kind === 'beyond') body = <span className="muted">No forecast yet · up to {formatDate(w.until - 1, timeZone).replace(/ \d{4}$/, '')}</span>;
  else if (w.kind === 'none') body = <span className="muted">No forecast here</span>;
  else {
    const e = w.entry;
    title = `Forecast for ${formatClock(e.time, timeZone)}–${formatClock(e.time + e.span, timeZone)} from MET Norway`;
    body = (
      <>
        <SkyIcon sky={w.assessment.sky} />
        <span className="weather-sky">{w.assessment.label}</span>
        <span className="mono">
          {Math.round(e.temperature)}° · {Math.round(e.wind * 3.6)} km/h{e.precipitation ? ` · ${e.precipitation} mm` : ''}
        </span>
      </>
    );
  }
  return (
    <div className="weather-row" title={title}>
      {body}
      <a className="weather-credit" href={SOURCE} target="_blank" rel="noreferrer">
        MET Norway
      </a>
    </div>
  );
}

/** Floating note at the top when the forecast is poor for light and shadows. */
export function WeatherWarning() {
  const w = useWeather();
  const { timeZone } = useSun();
  const pin = useApp((s) => s.pin);
  const time = useApp((s) => s.time);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  if (w.status !== 'ok' || w.kind !== 'ok' || !w.assessment.warning) return null;
  const id = `${pin.lat.toFixed(2)},${pin.lng.toFixed(2)}|${w.entry.time}|${w.assessment.warning}`;
  if (dismissed.has(id)) return null;
  const [first, ...rest] = w.assessment.warning.split(' · ');
  const text = [`${first} at ${formatClock(time, timeZone)}`, ...rest].join(' · ');
  return (
    <div className="weather-warning" role="status">
      <SkyIcon sky={w.assessment.sky} />
      <span>{text}</span>
      <button aria-label="Dismiss weather warning" onClick={() => setDismissed(new Set(dismissed).add(id))}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
