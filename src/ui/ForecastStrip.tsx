import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { zonedParts } from '../sun/timezone';
import { useForecastDays } from '../weather/useWeather';
import { SkyIcon } from './Weather';
import { useTimeControls } from './timeControls';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The next nine days at the pin: sky, high temperature, how good the light is for
 * filming, and flags like "OVERCAST AM". Pick a day to jump to it (the time stays).
 */
export function ForecastStrip({ compact = false }: { compact?: boolean }) {
  const { status, days } = useForecastDays(9);
  const { time, timeZone } = useSun();
  const pinName = useApp((s) => s.pin.name);
  const { setDate } = useTimeControls();
  const viewed = zonedParts(time, timeZone);
  const shown = days.filter((d) => d.summary);

  return (
    <section className={`panel forecast${compact ? ' forecast-compact' : ''}`} aria-label="Forecast">
      <div className="forecast-head">
        <span className="hud-label">Forecast{pinName ? ` · ${pinName}` : ''}</span>
        <a className="hud-label forecast-credit" href="https://api.met.no/" target="_blank" rel="noreferrer">
          MET Norway
        </a>
      </div>
      {status === 'error' && <p className="forecast-empty">Forecast unavailable right now.</p>}
      {status !== 'error' && !shown.length && <p className="forecast-empty">Loading forecast…</p>}
      {shown.length > 0 && (
        <div className="forecast-days">
          {days.map((d, i) => {
            const s = d.summary;
            if (!s) return null;
            const p = zonedParts(d.noon, timeZone);
            const selected = p.year === viewed.year && p.month === viewed.month && p.day === viewed.day;
            const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
            return (
              <button
                key={d.start}
                className="forecast-day"
                aria-pressed={selected}
                data-note={s.note ? 'yes' : undefined}
                title={`${weekday} ${p.day}: ${Math.round(s.tempMin)}° to ${Math.round(s.tempMax)}°, light ${s.light}%${s.note ? `, ${s.note.toLowerCase()}` : ''}`}
                onClick={() => setDate(p)}
              >
                <span className="hud-label">{i === 0 ? 'Today' : `${weekday} ${p.day}`}</span>
                <SkyIcon sky={s.sky} size={20} />
                <span className="hud-value">{Math.round(s.tempMax)}°</span>
                <span className="light-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(4, s.light)}%` }} data-poor={s.light < 40 || undefined} />
                </span>
                <span className="forecast-note">{s.note ?? ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
