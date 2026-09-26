import { useRef, useState } from 'react';
import type { Bezier, Easing } from '../timeline/model';
import { bezierSpeed, EASE_PRESETS, LINEAR, presetName, sameCurve, type EaseGroup } from '../timeline/eases';
import { TypedField } from './timeControls';

// Graph size in SVG units (it scales to the panel). y shows -0.5 to 1.5 so overshoot fits.
const W = 272;
const H = 112;
const SPEED_H = 30;
const PAD = 12;
const Y_MIN = -0.5;
const Y_MAX = 1.5;
const gx = (x: number) => PAD + x * (W - 2 * PAD);
const gy = (y: number) => PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (H - 2 * PAD);

const GROUPS: Array<{ id: EaseGroup; label: string; hint: string }> = [
  { id: 'in', label: 'In', hint: 'Starts slow, speeds up' },
  { id: 'out', label: 'Out', hint: 'Arrives slowly' },
  { id: 'inout', label: 'In-Out', hint: 'Slow at both keyframes' },
];

/** A small drawing of a curve, for the preset buttons. */
function Thumb({ c }: { c: Easing }) {
  const s = 22;
  const x = (v: number) => 3 + v * (s - 6);
  const y = (v: number) => 3 + ((1.25 - v) / 1.5) * (s - 6);
  const d = c === 'hold' ? `M${x(0)} ${y(0)} H${x(1)} V${y(1)}` : `M${x(0)} ${y(0)} C${x(c[0])} ${y(c[1])} ${x(c[2])} ${y(c[3])} ${x(1)} ${y(1)}`;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

/** Handle slope as a speed relative to a steady move: 1× is linear, 0× starts or stops dead. */
const speedAt = (dx: number, dy: number) => (dx < 1e-3 ? '∞' : `${(Math.round((dy / dx) * 10) / 10).toFixed(1)}×`);

/**
 * The ease between two keyframes, like After Effects' graph editor with AE Juice / Flow style
 * presets: drag the two handles (Shift keeps a handle flat, so it starts or stops dead), type
 * the four numbers, or pick a preset. The speed graph under it shows the velocity.
 */
export function EaseEditor({ value, onChange }: { value: Easing; onChange(e: Easing): void }) {
  const [group, setGroup] = useState<EaseGroup>(() => {
    if (value === 'hold') return 'inout';
    return (Object.keys(EASE_PRESETS) as EaseGroup[]).find((g) => EASE_PRESETS[g].some((p) => sameCurve(p.curve, value))) ?? 'inout';
  });
  const svg = useRef<SVGSVGElement>(null);
  const hold = value === 'hold';
  const c: Bezier = hold ? LINEAR : value;

  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    if (hold) return;
    e.preventDefault();
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = svg.current!.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * W;
      const sy = ((ev.clientY - r.top) / r.height) * (H + SPEED_H);
      const x = Math.round(Math.min(1, Math.max(0, (sx - PAD) / (W - 2 * PAD))) * 100) / 100;
      let y = Math.round(Math.min(2, Math.max(-1, Y_MAX - ((sy - PAD) / (H - 2 * PAD)) * (Y_MAX - Y_MIN))) * 100) / 100;
      if (ev.shiftKey) y = which === 0 ? 0 : 1;
      const next = [...c] as Bezier;
      next[which * 2] = x;
      next[which * 2 + 1] = y;
      onChange(next);
    };
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move as EventListener);
    target.addEventListener('pointerup', up);
  };

  // Speed (velocity) under the curve, scaled to its peak.
  const samples = Array.from({ length: 61 }, (_, i) => i / 60);
  const speeds = hold ? samples.map(() => 0) : samples.map((x) => Math.abs(bezierSpeed(c, x)));
  const peak = Math.max(1.5, ...speeds);
  const sy = (v: number) => H + SPEED_H - 4 - (v / peak) * (SPEED_H - 12);
  const speedPath = `M${gx(0)} ${sy(0)} ` + samples.map((x, i) => `L${gx(x)} ${sy(speeds[i])}`).join(' ') + ` L${gx(1)} ${sy(0)} Z`;

  const name = presetName(value);
  const apply = (text: string) => {
    const n = text.replace(/cubic-bezier|[()]/gi, '').split(/[\s,;]+/).filter(Boolean).map((v) => Number(v.replace(',', '.')));
    if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return false;
    onChange([Math.min(1, Math.max(0, n[0])), n[1], Math.min(1, Math.max(0, n[2])), n[3]]);
    return true;
  };

  return (
    <div className="ease-editor">
      <svg ref={svg} className="ease-graph" viewBox={`0 0 ${W} ${H + SPEED_H}`} role="img" aria-label={`Ease curve: ${name ?? 'custom'}`}>
        <rect className="ease-box" x={gx(0)} y={gy(1)} width={gx(1) - gx(0)} height={gy(0) - gy(1)} />
        <line className="ease-grid" x1={gx(0.5)} x2={gx(0.5)} y1={gy(1)} y2={gy(0)} />
        <line className="ease-grid" x1={gx(0)} x2={gx(1)} y1={gy(0.5)} y2={gy(0.5)} />
        <line className="ease-divider" x1={gx(0)} x2={gx(1)} y1={H} y2={H} />
        <path className="ease-speed" d={speedPath} />
        <text className="ease-axis" x={gx(0)} y={H + 10}>
          SPEED
        </text>
        {hold ? (
          <path className="ease-curve" d={`M${gx(0)} ${gy(0)} H${gx(1)} V${gy(1)}`} />
        ) : (
          <>
            <line className="ease-arm" x1={gx(0)} y1={gy(0)} x2={gx(c[0])} y2={gy(c[1])} />
            <line className="ease-arm" x1={gx(1)} y1={gy(1)} x2={gx(c[2])} y2={gy(c[3])} />
            <path className="ease-curve" d={`M${gx(0)} ${gy(0)} C${gx(c[0])} ${gy(c[1])} ${gx(c[2])} ${gy(c[3])} ${gx(1)} ${gy(1)}`} />
            {([0, 1] as const).map((i) => (
              <g key={i} className="ease-handle" onPointerDown={drag(i)}>
                <circle r="13" cx={gx(c[i * 2])} cy={gy(c[i * 2 + 1])} fill="transparent" />
                <circle r="5" cx={gx(c[i * 2])} cy={gy(c[i * 2 + 1])} />
              </g>
            ))}
          </>
        )}
        <circle className="ease-end" cx={gx(0)} cy={gy(0)} r="3" />
        <circle className="ease-end" cx={gx(1)} cy={gy(1)} r="3" />
      </svg>

      <div className="ease-readout">
        <span className="ease-name">{name ?? 'Custom'}</span>
        {!hold && (
          <span className="muted">
            leaves {speedAt(c[0], c[1])} · {Math.round(c[0] * 100)}% · arrives {speedAt(1 - c[2], 1 - c[3])} · {Math.round((1 - c[2]) * 100)}%
          </span>
        )}
      </div>
      {!hold && (
        <TypedField
          className="insp-input mono ease-numbers"
          label="Ease curve as four numbers"
          hint="cubic-bezier numbers: x1, y1, x2, y2 (x from 0 to 1)"
          value={c.map(fmt).join(', ')}
          apply={apply}
        />
      )}

      <div className="segmented segmented-small ease-groups" role="group" aria-label="Preset type">
        {GROUPS.map((g) => (
          <button key={g.id} aria-pressed={group === g.id} title={g.hint} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="ease-presets">
        {EASE_PRESETS[group].map((p) => (
          <button key={p.name} className="ease-preset" aria-pressed={sameCurve(p.curve, value)} onClick={() => onChange([...p.curve])} title={`${p.name} ${GROUPS.find((g) => g.id === group)!.label}`}>
            <Thumb c={p.curve} />
            <span>{p.name}</span>
          </button>
        ))}
        <button className="ease-preset" aria-pressed={sameCurve(LINEAR, value)} onClick={() => onChange([...LINEAR])} title="Steady speed">
          <Thumb c={LINEAR} />
          <span>Linear</span>
        </button>
        <button className="ease-preset" aria-pressed={hold} onClick={() => onChange('hold')} title="Stay put, then cut to the next keyframe">
          <Thumb c="hold" />
          <span>Hold</span>
        </button>
      </div>
    </div>
  );
}
