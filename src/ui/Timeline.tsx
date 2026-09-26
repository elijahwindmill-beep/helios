import { useEffect, useRef } from 'react';
import { useTimeline } from '../store/timeline';
import { useSun } from '../sun/useSun';
import { formatClock, formatDate, zonedParts } from '../sun/timezone';
import { clipDuration, type Keyframe } from '../timeline/model';
import { addKeyframeHere, frameAt, seek, stopPlayback, togglePlayback } from '../timeline/runtime';
import { openProjectFile, saveProjectFile } from '../timeline/projectFile';
import { useExport } from '../timeline/exportVideo';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function timecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Ruler step giving roughly ten labels across. */
function rulerStep(span: number): number {
  return [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => span / s <= 12) ?? 600;
}

const Icon = ({ d, fill = false }: { d: string; fill?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * The keyframe timeline (like mockup B): transport, clip blocks, and tracks for the sun
 * time, camera and layers, with draggable keyframe diamonds and a playhead.
 */
export function Timeline() {
  const open = useTimeline((s) => s.open);
  const project = useTimeline((s) => s.project);
  const playhead = useTimeline((s) => s.playhead);
  const playing = useTimeline((s) => s.playing);
  const loop = useTimeline((s) => s.loop);
  const selected = useTimeline((s) => s.selected);
  const TL = useTimeline.getState();
  const clip = project.clips.find((c) => c.id === project.activeClip) ?? project.clips[0];
  const { timeZone } = useSun();
  const tracks = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Other panels sit above the timeline: publish its height as --tl-h.
  useEffect(() => {
    const el = panel.current;
    const root = document.documentElement;
    if (!open || !el) {
      root.style.removeProperty('--tl-h');
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty('--tl-h', `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--tl-h');
    };
  }, [open]);
  const exporting = useExport((s) => s.phase !== 'idle');

  const duration = clipDuration(clip);
  const span = Math.max(10, Math.ceil(duration * 1.15 + 2));
  const step = rulerStep(span);
  const pct = (t: number) => `${(t / span) * 100}%`;
  const keys = clip.keyframes;

  // Keyboard: Space plays, K adds a keyframe, arrows step, Delete removes the selected one.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return;
      const s = useTimeline.getState();
      let handled = true;
      if (e.key === ' ') togglePlayback();
      else if (e.key.toLowerCase() === 'k') addKeyframeHere();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        stopPlayback();
        seek(Math.max(0, s.playhead + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 1)));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) s.deleteKeyframe(s.selected);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  const tAt = (clientX: number, fine: boolean) => {
    const r = tracks.current!.getBoundingClientRect();
    const t = Math.min(span, Math.max(0, ((clientX - r.left) / r.width) * span));
    return fine ? Math.round(t * 10) / 10 : Math.round(t);
  };
  const scrub = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    stopPlayback();
    // The playhead scrubs freely, in tenths of a second.
    const move = (x: number) => seek(tAt(x, true));
    move(e.clientX);
    const target = e.currentTarget as HTMLElement;
    const onMove = (ev: PointerEvent) => move(ev.clientX);
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };
  const dragKey = (k: Keyframe) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    TL.select(k.id);
    const target = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      // Snap to whole seconds; hold Alt for tenths.
      TL.updateKeyframe(k.id, { t: tAt(ev.clientX, ev.altKey) });
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      if (!moved) seek(k.t);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  const idx = keys.findIndex((k) => k.id === selected);
  const prevKey = [...keys].reverse().find((k) => k.t < playhead - 0.05);
  const nextKey = keys.find((k) => k.t > playhead + 0.05);
  const sunLabel = (k: Keyframe, i: number) => {
    const p = zonedParts(k.sun, timeZone);
    const q = i > 0 ? zonedParts(keys[i - 1].sun, timeZone) : null;
    const sameDay = q && q.year === p.year && q.month === p.month && q.day === p.day;
    return sameDay || (!q && keys.every((x) => zonedParts(x.sun, timeZone).day === p.day)) ? formatClock(k.sun, timeZone) : `${formatDate(k.sun, timeZone).replace(/ \d{4}$/, '')} ${formatClock(k.sun, timeZone)}`;
  };
  const boundary = frameAt(playhead);

  return (
    <section ref={panel} className="panel timeline" aria-label="Timeline">
      <div className="tl-transport">
        <input className="tl-clip-name" value={clip.name} aria-label="Clip name" onChange={(e) => TL.renameClip(clip.id, e.target.value)} />
        <button className="tl-button" aria-label="Previous keyframe" disabled={!prevKey} onClick={() => prevKey && seek(prevKey.t)}>
          <Icon d="M6 5v14M18 6l-9 6 9 6z" />
        </button>
        <button className="tl-button tl-play" aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} disabled={keys.length < 2} onClick={togglePlayback}>
          {playing ? <Icon d="M8 5v14M16 5v14" /> : <Icon d="M7 5l12 7-12 7z" fill />}
        </button>
        <button className="tl-button" aria-label="Next keyframe" disabled={!nextKey} onClick={() => nextKey && seek(nextKey.t)}>
          <Icon d="M18 5v14M6 6l9 6-9 6z" />
        </button>
        <button className="tl-button" aria-label="Loop" aria-pressed={loop} onClick={() => TL.setLoop(!loop)}>
          <Icon d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />
        </button>
        <span className="tl-timecode mono">
          {timecode(playhead)} <span className="muted">/ {timecode(duration)}</span>
        </span>
        <span className="tl-sep" />
        <button className="chip chip-small" onClick={addKeyframeHere} title="Capture the current view and sun at the playhead (K)">
          ◇ Add keyframe
        </button>
        <button
          className="chip chip-small"
          disabled={!boundary || !keys.some((k) => k.t < playhead - 0.05) || !keys.some((k) => k.t > playhead + 0.05)}
          onClick={() => boundary && TL.splitClip({ id: '', t: playhead, sun: boundary.sun, camera: boundary.camera, easing: keys[boundary.segment]?.easing ?? 'ease', sunMode: keys[boundary.segment]?.sunMode ?? 'continuous', loops: 0 })}
          title="Cut this clip in two at the playhead"
        >
          Split clip
        </button>
        <label className="tl-check" title="Curve the camera smoothly through the keyframes">
          <input type="checkbox" checked={clip.smoothCamera} onChange={(e) => TL.setSmooth(e.target.checked)} />
          Smooth camera
        </label>
        <span className="tl-spacer" />
        <button className="chip chip-small" onClick={() => void openProjectFile()} title="Open a project saved as .json">
          Open…
        </button>
        <button className="chip chip-small" onClick={saveProjectFile} title="Save the project (clips, keyframes, your layers, settings) as .json">
          Save project
        </button>
        <button className="chip chip-small chip-primary" disabled={keys.length < 2 || exporting} onClick={() => useExport.getState().openDialog()}>
          Export video
        </button>
        <button className="tl-button" aria-label="Close timeline" onClick={() => TL.setOpen(false)}>
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>

      <div className="tl-body">
        <div className="tl-labels">
          <span />
          <span className="hud-label">Clips</span>
          <span className="hud-label">Sun time</span>
          <span className="hud-label">Camera</span>
          <span className="hud-label">Layers</span>
        </div>
        <div className="tl-tracks" ref={tracks} onPointerDown={scrub}>
          <div className="tl-ruler">
            {Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step).map((t) => (
              <span key={t} className="tl-tick" style={{ left: pct(t) }}>
                {timecode(t).replace(/\.0$/, '')}
              </span>
            ))}
          </div>
          <div className="tl-row tl-clips" onPointerDown={(e) => e.stopPropagation()}>
            {project.clips.map((c) => (
              <button key={c.id} className="tl-clip" aria-pressed={c.id === clip.id} onClick={() => TL.selectClip(c.id)}>
                {c.name} · {timecode(clipDuration(c)).replace(/\.0$/, '')}
              </button>
            ))}
            <button className="tl-clip tl-clip-add" onClick={TL.addClip} aria-label="New clip">
              + Clip
            </button>
          </div>
          <div className="tl-row">
            {keys.slice(0, -1).map((k, i) => (
              <span key={k.id} className="tl-segment" data-mode={k.sunMode} data-easing={k.easing} style={{ left: pct(k.t), width: pct(keys[i + 1].t - k.t) }} />
            ))}
            {keys.map((k, i) => (
              <button key={k.id} className="tl-key" aria-pressed={k.id === selected} style={{ left: pct(k.t) }} onPointerDown={dragKey(k)} aria-label={`Keyframe ${i + 1} at ${timecode(k.t)}`}>
                <span className="tl-key-label">{sunLabel(k, i)}</span>
              </button>
            ))}
          </div>
          <div className="tl-row">
            {keys.map((k, i) => (
              <button key={k.id} className="tl-key tl-key-cam" aria-pressed={k.id === selected} style={{ left: pct(k.t) }} onPointerDown={dragKey(k)} aria-label={`Camera keyframe ${i + 1}`} />
            ))}
          </div>
          <div className="tl-row">
            {keys
              .filter((k) => k.layers)
              .map((k) => (
                <button key={k.id} className="tl-key tl-key-layers" aria-pressed={k.id === selected} style={{ left: pct(k.t) }} onPointerDown={dragKey(k)} aria-label="Layer keyframe" />
              ))}
          </div>
          <div className="tl-playhead" style={{ left: pct(playhead) }} />
          {!keys.length && <p className="tl-empty">Move the map and set the sun, then press ◇ Add keyframe (K). Move the playhead, change the view, add another.</p>}
        </div>
      </div>
      {idx >= 0 && <span className="sr-only">Keyframe {idx + 1} selected</span>}
    </section>
  );
}
