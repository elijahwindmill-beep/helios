import { useState, type ReactNode } from 'react';
import { lightWindows, useSun } from '../sun/useSun';
import { formatClock, formatDate } from '../sun/timezone';
import { useWeather } from '../weather/useWeather';
import { SkyIcon } from './Weather';

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

interface Alert {
  id: string;
  tone: 'warn' | 'gold' | 'blue' | 'info';
  icon: ReactNode;
  title: string;
  text: string;
  dismissible?: boolean;
}

/**
 * Right-hand stack (desktop): the weather at the viewed moment (a warning when the light
 * will be poor), and the day's golden and blue hours.
 */
export function Alerts() {
  const w = useWeather();
  const { time, timeZone, pin } = useSun();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const clock = (ms: number) => formatClock(ms, timeZone);
  const range = (r: [number, number] | null) => (r ? `${clock(r[0])}–${clock(r[1])}` : '–');
  const lw = lightWindows(time, pin.lat, pin.lng, timeZone);
  const day = formatDate(time, timeZone).replace(/ \d{4}$/, '');
  const at = clock(time);

  const alerts: Alert[] = [];
  if (w.status === 'ok' && w.kind === 'ok') {
    const e = w.entry;
    const details = `${Math.round(e.temperature)}° · wind ${Math.round(e.wind * 3.6)} km/h${e.precipitation ? ` · ${e.precipitation} mm` : ''}`;
    const [first, ...rest] = (w.assessment.warning ?? '').split(' · ');
    alerts.push(
      w.assessment.warning
        ? {
            id: `w|${pin.lat.toFixed(2)},${pin.lng.toFixed(2)}|${e.time}|${w.assessment.warning}`,
            tone: 'warn',
            icon: <SkyIcon sky={w.assessment.sky} size={18} />,
            title: `${first} · ${at}`,
            text: [...rest.map((r) => r[0].toUpperCase() + r.slice(1)), details].join('. '),
            dismissible: true,
          }
        : { id: 'w', tone: 'info', icon: <SkyIcon sky={w.assessment.sky} size={18} />, title: `${w.assessment.label} · ${at}`, text: details },
    );
  } else {
    const text =
      w.status === 'loading' ? 'Loading forecast…' : w.status === 'error' ? 'Forecast unavailable right now' : w.kind === 'past' ? 'No forecast for past times' : w.kind === 'beyond' ? `No forecast yet: it reaches ${formatDate(w.until - 1, timeZone).replace(/ \d{4}$/, '')}` : 'No forecast here';
    alerts.push({ id: 'w', tone: 'info', icon: <SkyIcon sky="partly" size={18} />, title: `Weather · ${day}`, text });
  }
  alerts.push({
    id: 'gold',
    tone: 'gold',
    icon: <SkyIcon sky="clear" size={18} />,
    title: `Golden hour · ${day}`,
    text: `Morning ${range(lw.golden.morning)} · evening ${range(lw.golden.evening)}`,
  });
  alerts.push({
    id: 'blue',
    tone: 'blue',
    icon: <MoonIcon />,
    title: `Blue hour · ${day}`,
    text: `Morning ${range(lw.blue.morning)} · evening ${range(lw.blue.evening)}`,
  });
  const visible = alerts.filter((a) => !dismissed.has(a.id));

  return (
    <section className="panel alerts" aria-label="Alerts">
      <div className="alerts-head">
        <span className="hud-label">Alerts</span>
        {visible.some((a) => a.tone === 'warn') && <span className="alerts-badge">!</span>}
      </div>
      {visible.map((a) => (
        <div key={a.id} className="alert" data-tone={a.tone} role={a.tone === 'warn' ? 'status' : undefined}>
          <span className="alert-icon">{a.icon}</span>
          <div className="alert-body">
            <span className="hud-label alert-title">{a.title}</span>
            <span className="alert-text">{a.text}</span>
          </div>
          {a.dismissible && (
            <button className="alert-close" aria-label="Dismiss warning" onClick={() => setDismissed(new Set(dismissed).add(a.id))}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <a className="hud-label alerts-credit" href="https://api.met.no/" target="_blank" rel="noreferrer">
        Weather: MET Norway
      </a>
    </section>
  );
}
