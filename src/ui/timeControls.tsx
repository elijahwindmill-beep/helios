import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { seasons } from '../sun/times';
import { zonedParts, zonedToUtc } from '../sun/timezone';
import { parseDate, parseTime } from './parseInput';

// Time and date controls shared by the top bar, the sun chart and the phone sun card.

const DAY = 86400000;

export function dayOfYear(p: { year: number; month: number; day: number }): number {
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / DAY);
}
function daysInYear(year: number): number {
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY);
}

/**
 * A value you can click and type over. Enter or leaving the field applies it; Escape or an
 * unreadable entry puts the old value back.
 */
export function TypedField(props: { value: string; label: string; hint: string; className: string; apply(text: string): boolean }) {
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

/** Jumping around the calendar while keeping the local time of day. */
export function useTimeControls() {
  const { time, timeZone } = useSun();
  const setTime = useApp((s) => s.setTime);
  const south = useApp((s) => s.pin.lat) < 0;
  const local = zonedParts(time, timeZone);
  const year = local.year;
  const yearDays = daysInYear(year);
  const notches = useMemo(() => {
    const s = seasons(year);
    return [
      { label: 'March equinox', short: 'Mar', ms: s.marchEquinox },
      { label: 'June solstice', short: 'Jun', ms: s.juneSolstice },
      { label: 'September equinox', short: 'Sep', ms: s.septemberEquinox },
      { label: 'December solstice', short: 'Dec', ms: s.decemberSolstice },
    ].map((n) => ({ ...n, index: dayOfYear(zonedParts(n.ms, timeZone)) }));
  }, [year, timeZone]);

  const setDate = (d: { year: number; month: number; day: number }) =>
    setTime(zonedToUtc({ ...d, hour: local.hour, minute: local.minute }, timeZone));
  const setDayOfYear = (index: number) => {
    const d = new Date(Date.UTC(year, 0, 1) + index * DAY);
    setDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
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
    setDate(d);
    return true;
  };
  // Summer and winter swap south of the equator.
  const solstices = [
    { name: 'Summer', index: south ? notches[3].index : notches[1].index },
    { name: 'Winter', index: south ? notches[1].index : notches[3].index },
  ];
  return { local, year, yearDays, notches, today: dayOfYear(local), solstices, setDate, setDayOfYear, applyTime, applyDate };
}

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </svg>
);
const SnowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />
  </svg>
);

export function SolsticeButtons({ className = 'solstices' }: { className?: string }) {
  const { solstices, today, setDayOfYear } = useTimeControls();
  return (
    <div className={className}>
      {solstices.map((sol) => (
        <button
          key={sol.name}
          className="chip chip-small"
          aria-pressed={today === sol.index}
          onClick={() => setDayOfYear(sol.index)}
          title={`Jump to the ${sol.name.toLowerCase()} solstice, keeping the time`}
        >
          {sol.name === 'Summer' ? <SunIcon /> : <SnowIcon />}
          {sol.name} solstice
        </button>
      ))}
    </div>
  );
}

export function NowButton() {
  return (
    <button className="chip chip-small" onClick={() => useApp.getState().setTime(Date.now())}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
      Now
    </button>
  );
}

/** Day of the year, with marks at the equinoxes and solstices. */
export function DateSlider() {
  const { yearDays, today, notches, setDayOfYear } = useTimeControls();
  return (
    <div className="slider-row">
      <span className="slider-end mono">Jan</span>
      <div className="date-slider">
        <input
          type="range"
          className="range range-date"
          aria-label="Date"
          min={0}
          max={yearDays - 1}
          step={1}
          value={today}
          onChange={(e) => setDayOfYear(Number(e.target.value))}
        />
        <div className="notches" aria-hidden="true">
          {notches.map((n) => (
            <span key={n.label} className="notch" style={{ left: `${(n.index / (yearDays - 1)) * 100}%` }} title={n.label} />
          ))}
        </div>
      </div>
      <span className="slider-end mono">Dec</span>
    </div>
  );
}

export function SeasonButtons() {
  const { notches, setDayOfYear } = useTimeControls();
  return (
    <span className="sun-seasons">
      {notches.map((n) => (
        <button key={n.label} className="season" onClick={() => setDayOfYear(n.index)} title={`Jump to the ${n.label}`}>
          {n.short}
        </button>
      ))}
    </span>
  );
}
