import { useRef } from 'react';
import { useApp } from '../store/app';
import { lightWindows, useSun } from '../sun/useSun';
import { sunPosition } from '../sun/position';
import { formatClock, formatDate } from '../sun/timezone';
import { DateSlider, SeasonButtons, SolsticeButtons } from './timeControls';

// The day as a chart, like Apple Weather's sun chart: time across, sun height up, the
// horizon as a line. Golden and blue hours are marked on the curve. Drag to change the time.
const W = 512;
const PLOT_H = 104;
const H = 122;

const hm = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

export function SunChart({ withControls = false }: { withControls?: boolean }) {
  const { pin, time, timeZone, position, day } = useSun();
  const setTime = useApp((s) => s.setTime);
  const svgRef = useRef<SVGSVGElement>(null);

  const { dayStart, dayEnd } = day;
  const span = dayEnd - dayStart;
  // Fixed scale per latitude, so the curve's height means the same all year.
  const maxEl = Math.min(90, 90 - Math.abs(pin.lat) + 23.44);
  const minEl = -maxEl * 0.45;
  const hz = (maxEl / (maxEl - minEl)) * PLOT_H;
  const X = (t: number) => ((t - dayStart) / span) * W;
  const Y = (el: number) => hz - (el / (maxEl - minEl)) * PLOT_H;

  const samples: Array<[number, number]> = [];
  for (let i = 0; i <= 144; i++) {
    const t = dayStart + (span * i) / 144;
    samples.push([t, sunPosition(t, pin.lat, pin.lng).elevation]);
  }
  const path = (from: number, to: number) => {
    const pts = samples.filter(([t]) => t >= from && t <= to);
    const all: Array<[number, number]> = [[from, sunPosition(from, pin.lat, pin.lng).elevation], ...pts, [to, sunPosition(to, pin.lat, pin.lng).elevation]];
    return all.map(([t, el], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(el).toFixed(1)}`).join(' ');
  };
  const curve = path(dayStart, dayEnd);
  const lw = lightWindows(time, pin.lat, pin.lng, timeZone);
  const segments = [
    ...[lw.golden.morning, lw.golden.evening].filter(Boolean).map((r) => ({ d: path(r![0], r![1]), kind: 'gold' })),
    ...[lw.blue.morning, lw.blue.evening].filter(Boolean).map((r) => ({ d: path(r![0], r![1]), kind: 'blue' })),
  ];
  const hours = [6, 12, 18].map((h) => dayStart + h * 3600000).filter((t) => t < dayEnd);
  const sx = X(Math.min(dayEnd, Math.max(dayStart, time)));
  const sy = Y(position.elevation);
  const below = position.elevation < 0;

  const status =
    day.sunrise !== null && time < day.sunrise
      ? `Sunrise in ${hm(day.sunrise - time)}`
      : day.sunset !== null && time < day.sunset
        ? `Daylight left ${hm(day.sunset - time)}`
        : day.polar === 'day'
          ? 'Sun up all day'
          : 'After sunset';

  const fromPointer = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setTime(dayStart + f * (span - 60000));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 30 : 5) * 60000;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = time + step;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = time - step;
    if (e.key === 'Home') next = day.sunrise ?? dayStart;
    if (e.key === 'End') next = day.sunset ?? dayEnd - 60000;
    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      setTime(Math.min(dayEnd - 60000, Math.max(dayStart, next)));
    }
  };

  return (
    <section className="panel sun-chart" aria-label="Sun through the day">
      <div className="chart-head">
        <span className="hud-label">Sun · {formatDate(time, timeZone).replace(/ \d{4}$/, '')}</span>
        <span className="hud-label">{status}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="slider"
        tabIndex={0}
        aria-label="Time of day"
        aria-valuemin={dayStart}
        aria-valuemax={dayEnd}
        aria-valuenow={time}
        aria-valuetext={`${formatClock(time, timeZone)}, sun ${position.elevation.toFixed(1)}° high`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) fromPointer(e);
        }}
      >
        <defs>
          <clipPath id="chart-above">
            <rect x="0" y="0" width={W} height={hz} />
          </clipPath>
          <clipPath id="chart-below">
            <rect x="0" y={hz} width={W} height={PLOT_H} />
          </clipPath>
          <linearGradient id="chart-day" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6d8fb8" stopOpacity="0.45" />
            <stop offset="1" stopColor="#2d4a73" stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="chart-sun">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={hz} rx="6" fill="url(#chart-day)" />
        {hours.map((t) => (
          <g key={t}>
            <line x1={X(t)} y1="0" x2={X(t)} y2={PLOT_H} className="chart-hour" />
            <text x={X(t) + 4} y={H - 3} className="chart-hour-label">
              {formatClock(t, timeZone).slice(0, 2)}
            </text>
          </g>
        ))}
        <line x1="0" y1={hz} x2={W} y2={hz} className="chart-horizon" />
        <path d={curve} className="chart-curve chart-curve-below" clipPath="url(#chart-below)" />
        <path d={curve} className="chart-curve" clipPath="url(#chart-above)" />
        {segments.map((s, i) => (
          <path key={i} d={s.d} className={`chart-band chart-band-${s.kind}`} />
        ))}
        <line x1={sx} y1="0" x2={sx} y2={PLOT_H} className="chart-now" />
        <circle cx={sx} cy={sy} r={16} fill="url(#chart-sun)" opacity={below ? 0.35 : 1} />
        <circle cx={sx} cy={sy} r={5} className={below ? 'chart-sun chart-sun-night' : 'chart-sun'} />
        <text x={Math.min(W - 40, Math.max(2, sx + 8))} y="12" className="chart-time">
          {formatClock(time, timeZone)}
        </text>
      </svg>
      {withControls && (
        <div className="chart-controls">
          <DateSlider />
          <div className="chart-buttons">
            <SolsticeButtons className="chart-solstices" />
            <SeasonButtons />
          </div>
        </div>
      )}
    </section>
  );
}
