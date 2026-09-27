import { useRef } from 'react';
import { enterStandView, FOV_MAX, FOV_MIN, leaveStandView, setStandFov } from '../map/standView';
import { getMap } from '../map/mapInstance';
import { fovToMm, mmToFov, useStand } from '../store/stand';
import { useTouchDevice } from './useMedia';

/** A standing person, the figure you drop on the map. */
export function Figure({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4.5" r="2.2" />
      <path d="M8.5 21l1-7.5-1.5-.5.8-4.5h5.4l.8 4.5-1.5.5 1 7.5" />
    </svg>
  );
}

const DRAG_PX = 6;

/**
 * The figure button: drag it onto the map to stand there, like Google Maps' Pegman, or click it
 * to stand at the pin (and again to leave).
 */
export function StandButton() {
  const active = useStand((s) => s.active);
  const ghost = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const button = e.currentTarget;
    button.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_PX) {
        dragging = true;
        useStand.setState({ dragging: true });
        const g = document.createElement('div');
        g.className = 'stand-ghost';
        g.innerHTML = button.querySelector('svg')!.outerHTML;
        document.body.appendChild(g);
        ghost.current = g;
      }
      if (ghost.current) ghost.current.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    };
    const up = (ev: PointerEvent) => {
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', up);
      ghost.current?.remove();
      ghost.current = null;
      useStand.setState({ dragging: false });
      if (!dragging) {
        if (ev.type === 'pointerup') void (useStand.getState().active ? leaveStandView() : enterStandView());
        return;
      }
      const map = getMap();
      if (!map || ev.type !== 'pointerup') return;
      // Dropped on the map (not on a panel over it): stand on the ground there.
      const canvas = map.getCanvas();
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      if (under !== canvas && !canvas.parentElement?.contains(under)) return;
      const r = canvas.getBoundingClientRect();
      void enterStandView(map.unproject([ev.clientX - r.left, ev.clientY - r.top]));
    };
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
  };

  return (
    <button
      className="icon-button stand-button"
      aria-label={active ? 'Leave the standing view' : 'Standing view'}
      aria-pressed={active}
      title={active ? 'Leave the standing view (Esc)' : 'Standing view: drag the figure onto the map to stand there, or click to stand at the pin'}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void (active ? leaveStandView() : enterStandView());
        }
      }}
    >
      <Figure />
    </button>
  );
}

/** Shown while standing: how to move, the lens, and the way out. */
export function StandBar() {
  const active = useStand((s) => s.active);
  const dragging = useStand((s) => s.dragging);
  const fov = useStand((s) => s.fov);
  const touch = useTouchDevice();
  if (dragging) {
    return (
      <div className="panel draw-bar stand-bar" role="status">
        <span className="draw-hint">Drop the figure where you want to stand</span>
      </div>
    );
  }
  if (!active) return null;
  const mm = fovToMm(fov);
  // The slider runs on a log scale of focal length, like a zoom ring.
  const toSlider = (f: number) => Math.log(fovToMm(f));
  return (
    <div className="panel draw-bar stand-bar" role="toolbar" aria-label="Standing view">
      <span className="draw-hint">{touch ? 'Drag to look · double-tap to walk' : 'Drag to look · W A S D walk · Q E turn · double-click to walk there'}</span>
      <label className="stand-lens" title="Lens: field of view (full-frame focal length)">
        <span className="readout-label">Lens</span>
        <input
          type="range"
          min={toSlider(FOV_MAX)}
          max={toSlider(FOV_MIN)}
          step={0.01}
          value={Math.log(mm)}
          onChange={(e) => setStandFov(mmToFov(Math.exp(Number(e.target.value))))}
          aria-valuetext={`${Math.round(mm)} millimetre, ${Math.round(fov)} degrees`}
        />
        <span className="stand-lens-value mono">
          {Math.round(mm)} mm · {Math.round(fov)}°
        </span>
      </label>
      <button className="chip chip-small" onClick={() => void leaveStandView()}>
        Leave{touch ? '' : ' (Esc)'}
      </button>
    </div>
  );
}
