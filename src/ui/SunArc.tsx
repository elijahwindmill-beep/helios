import { useRef } from 'react';
import { useApp } from '../store/app';
import { useSun } from '../sun/useSun';
import { formatClock } from '../sun/timezone';

// Sun-arc scrubber (mockup C): the day from sunrise (left) to sunset (right) as an arc.
// Drag the sun along it to change the time.
const W = 440;
const H = 124;
const CX = W / 2;
const CY = 100;
const RX = 190;
const RY = 78;

function pointAt(f: number): [number, number] {
  const theta = Math.PI * (1 - f);
  return [CX + RX * Math.cos(theta), CY - RY * Math.sin(theta)];
}

function arcPath(f0: number, f1: number): string {
  const [x0, y0] = pointAt(f0);
  const [x1, y1] = pointAt(f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${RX} ${RY} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export function SunArc() {
  const { time, timeZone, position, day } = useSun();
  const setTime = useApp((s) => s.setTime);
  const svgRef = useRef<SVGSVGElement>(null);

  const rise = day.sunrise ?? day.dayStart;
  const set = day.sunset ?? day.dayEnd;
  const span = Math.max(60000, set - rise);
  const raw = (time - rise) / span;
  const f = Math.min(1, Math.max(0, raw));
  const night = raw < 0 || raw > 1;
  const [sx, sy] = pointAt(f);

  const hours: number[] = [];
  for (let t = Math.ceil(rise / 3600000) * 3600000; t < set; t += 3600000) hours.push((t - rise) / span);

  const fromPointer = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const theta = Math.atan2(Math.max(0, (CY - y) / RY), (x - CX) / RX);
    setTime(rise + (1 - theta / Math.PI) * span);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 30 : 5) * 60000;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = time + step;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = time - step;
    if (e.key === 'Home') next = rise;
    if (e.key === 'End') next = set;
    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      setTime(next);
    }
  };

  return (
    <section className="panel sun-arc" aria-label="Sun arc">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={0}
        aria-label="Time of day along the sun's arc"
        aria-valuemin={rise}
        aria-valuemax={set}
        aria-valuenow={time}
        aria-valuetext={formatClock(time, timeZone)}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) fromPointer(e);
        }}
        onPointerUp={fromPointer}
      >
        <path d={arcPath(0, 1)} className="arc-track" />
        {!night && f > 0.001 && <path d={arcPath(0, f)} className="arc-done" />}
        {hours.map((h) => {
          const [x, y] = pointAt(h);
          return <circle key={h} cx={x} cy={y} r={1.8} className="arc-hour" />;
        })}
        <circle cx={pointAt(0)[0]} cy={pointAt(0)[1]} r={5} className="arc-end" />
        <circle cx={pointAt(1)[0]} cy={pointAt(1)[1]} r={5} className="arc-end" />
        <text x={pointAt(0)[0]} y={CY + 20} className="arc-label" textAnchor="middle">
          {day.sunrise !== null ? formatClock(day.sunrise, timeZone) : '00:00'}
        </text>
        <text x={pointAt(1)[0]} y={CY + 20} className="arc-label" textAnchor="middle">
          {day.sunset !== null ? formatClock(day.sunset, timeZone) : '24:00'}
        </text>
        <circle cx={sx} cy={sy} r={16} className="arc-glow" />
        <circle cx={sx} cy={sy} r={11} className={night ? 'arc-sun arc-sun-night' : 'arc-sun'} />
        <text x={CX} y={CY - 4} className="arc-now" textAnchor="middle">
          {formatClock(time, timeZone)}
        </text>
        <text x={CX} y={CY + 14} className="arc-sub" textAnchor="middle">
          {night ? 'sun below horizon' : `${position.elevation.toFixed(1)}° · ${position.azimuth.toFixed(1)}°`}
        </text>
      </svg>
    </section>
  );
}
