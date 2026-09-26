import { useMemo, useState } from 'react';
import { useNarrow } from './useMedia';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { seasons } from '../sun/times';
import { formatClock, formatDate, formatOffset, zonedParts, zonedToUtc } from '../sun/timezone';

const DAY = 86400000;

function dayOfYear(p: { year: number; month: number; day: number }): number {
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / DAY);
}
function daysInYear(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY);
}

/** Top-right card: the viewed moment, sun angles, and the time and date sliders. */
export function SunCard() {
  const { time, timeZone, position, day, offset } = useSun();
  const fullDay = useApp((s) => s.fullDay);
  const { setTime, setFullDay } = useApp.getState();
  const local = zonedParts(time, timeZone);

  // Time slider: sunrise to sunset, or the whole local day.
  const hasSun = day.sunrise !== null && day.sunset !== null && day.sunset > day.sunrise;
  const tMin = !fullDay && hasSun ? day.sunrise! : day.dayStart;
  const tMax = !fullDay && hasSun ? day.sunset! : day.dayEnd - 60000;

  // Date slider: day of the year, keeping the local time of day.
  const year = local.year;
  const yearDays = daysInYear(year);
  const notches = useMemo(() => {
    const s = seasons(year);
    return [
      { label: 'March equinox', ms: s.marchEquinox },
      { label: 'June solstice', ms: s.juneSolstice },
      { label: 'September equinox', ms: s.septemberEquinox },
      { label: 'December solstice', ms: s.decemberSolstice },
    ].map((n) => ({ ...n, index: dayOfYear(zonedParts(n.ms, timeZone)) }));
  }, [year, timeZone]);

  const setDayOfYear = (index: number) => {
    const d = new Date(Date.UTC(year, 0, 1) + index * DAY);
    setTime(
      zonedToUtc(
        { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: local.hour, minute: local.minute },
        timeZone,
      ),
    );
  };

  const below = position.elevation < 0;
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(false);
  const showDetails = !narrow || expanded;

  return (
    <section className="panel sun-card" aria-label="Sun and time">
      <div className="sun-card-top">
        <div className="sun-time">
          <span className="mono sun-clock">{formatClock(time, timeZone)}</span>
          <span className="sun-offset mono">{formatOffset(offset)}</span>
        </div>
        <span className="sun-date">{formatDate(time, timeZone)}</span>
        {narrow && (
          <button
            className="icon-button sun-expand"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide sun details' : 'Show sun details and date'}
            onClick={() => setExpanded(!expanded)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
      {narrow && !expanded && (
        <p className="sun-summary mono">
          {position.elevation.toFixed(1)}° · {position.azimuth.toFixed(1)}° · ↑{day.sunrise !== null ? formatClock(day.sunrise, timeZone) : '–'} ↓
          {day.sunset !== null ? formatClock(day.sunset, timeZone) : '–'}
        </p>
      )}

      {showDetails && (
      <>
      <dl className="sun-stats">
        <div>
          <dt>Elevation</dt>
          <dd className="mono">{position.elevation.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Azimuth</dt>
          <dd className="mono">{position.azimuth.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Sunrise</dt>
          <dd className="mono">{day.sunrise !== null ? formatClock(day.sunrise, timeZone) : '–'}</dd>
        </div>
        <div>
          <dt>Sunset</dt>
          <dd className="mono">{day.sunset !== null ? formatClock(day.sunset, timeZone) : '–'}</dd>
        </div>
      </dl>
      {below && (
        <p className="sun-note">
          {day.polar === 'night' ? 'Polar night: the sun stays below the horizon all day.' : 'The sun is below the horizon.'}
        </p>
      )}
      {day.polar === 'day' && <p className="sun-note">Midnight sun: the sun never sets today.</p>}

      <label className="slider-row">
        <span className="slider-end mono">{formatClock(tMin, timeZone)}</span>
        <input
          type="range"
          className="range range-time"
          aria-label="Time of day"
          min={tMin}
          max={tMax}
          step={60000}
          value={Math.min(tMax, Math.max(tMin, time))}
          onChange={(e) => setTime(Number(e.target.value))}
        />
        <span className="slider-end mono">{formatClock(tMax + (fullDay || !hasSun ? 60000 : 0), timeZone).replace('00:00', '24:00')}</span>
      </label>

      <div className="slider-row">
        <span className="slider-end mono">01/01</span>
        <div className="date-slider">
          <input
            type="range"
            className="range range-date"
            aria-label="Date"
            min={0}
            max={yearDays - 1}
            step={1}
            value={dayOfYear(local)}
            onChange={(e) => setDayOfYear(Number(e.target.value))}
          />
          <div className="notches" aria-hidden="true">
            {notches.map((n) => (
              <span key={n.label} className="notch" style={{ left: `${(n.index / (yearDays - 1)) * 100}%` }} title={n.label} />
            ))}
          </div>
        </div>
        <span className="slider-end mono">31/12</span>
      </div>

      <div className="sun-actions">
        <button className="chip" onClick={() => setTime(Date.now())}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          Now
        </button>
        <button className="chip" aria-pressed={fullDay} onClick={() => setFullDay(!fullDay)} title="Time slider covers the whole day">
          24 h
        </button>
        <span className="sun-seasons">
          {notches.map((n) => (
            <button key={n.label} className="season" onClick={() => setDayOfYear(n.index)} title={`Jump to the ${n.label}`}>
              {n.label.split(' ')[0].slice(0, 3)}
            </button>
          ))}
        </span>
      </div>
      </>
      )}
    </section>
  );
}
