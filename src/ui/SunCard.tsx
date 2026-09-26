import { useState } from 'react';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { formatClock, formatDate, formatOffset } from '../sun/timezone';
import { DateSlider, NowButton, SeasonButtons, SolsticeButtons, TypedField, useTimeControls } from './timeControls';
import { WeatherRow } from './Weather';
import { ForecastStrip } from './ForecastStrip';

/** Phone layout: the viewed moment, sun angles, weather and the time and date controls in one card. */
export function SunCard() {
  const { time, timeZone, position, day, offset } = useSun();
  const fullDay = useApp((s) => s.fullDay);
  const { setTime, setFullDay } = useApp.getState();
  const { applyTime, applyDate } = useTimeControls();

  // Time slider: sunrise to sunset, or the whole local day.
  const hasSun = day.sunrise !== null && day.sunset !== null && day.sunset > day.sunrise;
  const tMin = !fullDay && hasSun ? day.sunrise! : day.dayStart;
  const tMax = !fullDay && hasSun ? day.sunset! : day.dayEnd - 60000;
  const below = position.elevation < 0;
  const [expanded, setExpanded] = useState(false);
  const clock = (ms: number | null) => (ms !== null ? formatClock(ms, timeZone) : '–');

  return (
    <section className="panel sun-card" aria-label="Sun and time">
      <div className="sun-card-top">
        <div className="sun-time">
          <TypedField className="mono sun-clock" label="Time" hint="Type a time, e.g. 06:47" value={formatClock(time, timeZone)} apply={applyTime} />
          <span className="sun-offset mono">{formatOffset(offset)}</span>
        </div>
        <TypedField
          className="sun-date"
          label="Date"
          hint="Type a date, e.g. 12 Oct 2026 or 12/10/2026"
          value={formatDate(time, timeZone)}
          apply={applyDate}
        />
        <button
          className="icon-button sun-expand"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide sun details' : 'Show sun details, forecast and date'}
          onClick={() => setExpanded(!expanded)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <SolsticeButtons />
      <WeatherRow />
      {!expanded && (
        <p className="sun-summary mono">
          {position.elevation.toFixed(1)}° · {position.azimuth.toFixed(1)}° · ↑{clock(day.sunrise)} ↓{clock(day.sunset)}
        </p>
      )}

      {expanded && (
        <>
          <dl className="sun-stats">
            <div>
              <dt>Sun height</dt>
              <dd className="mono">{position.elevation.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Azimuth</dt>
              <dd className="mono">{position.azimuth.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Sunrise</dt>
              <dd className="mono">{clock(day.sunrise)}</dd>
            </div>
            <div>
              <dt>Sunset</dt>
              <dd className="mono">{clock(day.sunset)}</dd>
            </div>
          </dl>
          {below && (
            <p className="sun-note">
              {day.polar === 'night' ? 'Polar night: the sun stays below the horizon all day.' : 'The sun is below the horizon.'}
            </p>
          )}
          {day.polar === 'day' && <p className="sun-note">Midnight sun: the sun never sets today.</p>}

          <ForecastStrip compact />

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
          <DateSlider />
          <div className="sun-actions">
            <NowButton />
            <button className="chip chip-small" aria-pressed={fullDay} onClick={() => setFullDay(!fullDay)} title="Time slider covers the whole day">
              24 h
            </button>
            <SeasonButtons />
          </div>
        </>
      )}
    </section>
  );
}
