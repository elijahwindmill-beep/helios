import { useMemo, useRef, useState } from 'react';
import { useNarrow } from './useMedia';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { seasons } from '../sun/times';
import { formatClock, formatDate, formatOffset, zonedParts, zonedToUtc } from '../sun/timezone';
import { parseDate, parseTime } from './parseInput';

const DAY = 86400000;

function dayOfYear(p: { year: number; month: number; day: number }): number {
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / DAY);
}
function daysInYear(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY);
}

/**
 * A value you can click and type over. Enter or leaving the field applies it; Escape or an
 * unreadable entry puts the old value back.
 */
function TypedField(props: { value: string; label: string; hint: string; className: string; apply(text: string): boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const draftRef = useRef<string | null>(null);
  const edit = (text: string | null) => {
    draftRef.current = text;
    setDraft(text);
    setInvalid(false);
  };
  return (
    <input
      className={`typed ${props.className}`}
      aria-label={props.label}
      title={props.hint}
      value={draft ?? props.value}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoComplete="off"
      enterKeyHint="done"
      onFocus={(e) => {
        edit(props.value);
        const input = e.currentTarget;
        setTimeout(() => input.select(), 0);
      }}
      onChange={(e) => edit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          edit(null);
          e.currentTarget.blur();
        } else if (e.key === 'Enter') {
          if (draftRef.current !== null && props.apply(draftRef.current)) {
            edit(null);
            e.currentTarget.blur();
          } else {
            setInvalid(true);
          }
        }
      }}
      onBlur={() => {
        if (draftRef.current !== null) props.apply(draftRef.current);
        edit(null);
      }}
    />
  );
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

  // Typed time keeps the date; typed date keeps the time.
  const applyTime = (text: string) => {
    const t = parseTime(text);
    if (!t) return false;
    setTime(zonedToUtc({ year: local.year, month: local.month, day: local.day, ...t }, timeZone));
    return true;
  };
  const applyDate = (text: string) => {
    const d = parseDate(text, year);
    if (!d) return false;
    setTime(zonedToUtc({ ...d, hour: local.hour, minute: local.minute }, timeZone));
    return true;
  };

  // Summer and winter swap south of the equator.
  const south = useApp((s) => s.pin.lat) < 0;
  const june = notches[1].index;
  const december = notches[3].index;
  const today = dayOfYear(local);
  const solstices = [
    { name: 'Summer', index: south ? december : june },
    { name: 'Winter', index: south ? june : december },
  ];

  const below = position.elevation < 0;
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState(false);
  const showDetails = !narrow || expanded;

  return (
    <section className="panel sun-card" aria-label="Sun and time">
      <div className="sun-card-top">
        <div className="sun-time">
          <TypedField
            className="mono sun-clock"
            label="Time"
            hint="Type a time, e.g. 06:47"
            value={formatClock(time, timeZone)}
            apply={applyTime}
          />
          <span className="sun-offset mono">{formatOffset(offset)}</span>
        </div>
        <TypedField
          className="sun-date"
          label="Date"
          hint="Type a date, e.g. 12 Oct 2026 or 12/10/2026"
          value={formatDate(time, timeZone)}
          apply={applyDate}
        />
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
      <div className="solstices">
        {solstices.map((sol) => (
          <button
            key={sol.name}
            className="chip chip-small"
            aria-pressed={today === sol.index}
            onClick={() => setDayOfYear(sol.index)}
            title={`Jump to the ${sol.name.toLowerCase()} solstice, keeping the time`}
          >
            {sol.name === 'Summer' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />
              </svg>
            )}
            {sol.name} solstice
          </button>
        ))}
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
