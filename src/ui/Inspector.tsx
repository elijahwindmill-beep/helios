import { useTimeline } from '../store/timeline';
import { useSun } from '../sun/useSun';
import { formatClock, formatDate, zonedParts, zonedToUtc } from '../sun/timezone';
import { useState } from 'react';
import type { CameraKey, Easing, SunMode } from '../timeline/model';
import { EaseEditor } from './EaseEditor';
import { captureNow, currentLayers, seek } from '../timeline/runtime';
import { parseDate, parseTime } from './parseInput';
import { TypedField } from './timeControls';
import { timecode } from './Timeline';

const CAMERA_FIELDS: Array<{ k: keyof CameraKey; label: string; digits: number }> = [
  { k: 'lat', label: 'Latitude', digits: 5 },
  { k: 'lng', label: 'Longitude', digits: 5 },
  { k: 'zoom', label: 'Zoom', digits: 2 },
  { k: 'bearing', label: 'Heading', digits: 1 },
  { k: 'pitch', label: 'Tilt', digits: 1 },
];

/** The selected keyframe: its sun moment, camera, easing and layer switches, all editable. */
export function Inspector() {
  const open = useTimeline((s) => s.open);
  const selected = useTimeline((s) => s.selected);
  const clip = useTimeline((s) => s.project.clips.find((c) => c.id === s.project.activeClip) ?? s.project.clips[0]);
  const clipboard = useTimeline((s) => s.easeClipboard);
  const [sunTab, setEditSun] = useState(false);
  const { timeZone } = useSun();
  const TL = useTimeline.getState();
  const i = clip.keyframes.findIndex((k) => k.id === selected);
  if (!open || i < 0) return null;
  const k = clip.keyframes[i];
  const isLast = i === clip.keyframes.length - 1;
  const p = zonedParts(k.sun, timeZone);
  const set = (patch: Parameters<typeof TL.updateKeyframe>[1]) => TL.updateKeyframe(k.id, patch);
  const editSun = sunTab && !!k.sunEasing;
  const curve: Easing = editSun ? k.sunEasing! : k.easing;
  const setCurve = (e: Easing) => set(editSun ? { sunEasing: e } : { easing: e });

  const applyTime = (text: string) => {
    const t = parseTime(text);
    if (!t) return false;
    set({ sun: zonedToUtc({ year: p.year, month: p.month, day: p.day, ...t }, timeZone) });
    return true;
  };
  const applyDate = (text: string) => {
    const d = parseDate(text, p.year);
    if (!d) return false;
    set({ sun: zonedToUtc({ ...d, hour: p.hour, minute: p.minute }, timeZone) });
    return true;
  };
  const applyAt = (text: string) => {
    const v = Number(text.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return false;
    set({ t: Math.round(v * 10) / 10 });
    return true;
  };

  return (
    <aside className="panel inspector" aria-label="Keyframe">
      <div className="insp-head">
        <span className="hud-label">
          Keyframe {i + 1} of {clip.keyframes.length}
        </span>
        <TypedField className="hud-value insp-at" label="Keyframe time, seconds" hint="Seconds from the clip start" value={timecode(k.t)} apply={(s) => applyAt(s.includes(':') ? String(Number(s.split(':')[0]) * 60 + Number(s.split(':')[1])) : s)} />
      </div>

      <h3 className="hud-label insp-section">Sun</h3>
      <div className="insp-grid">
        <label className="insp-field">
          <span className="insp-label">Time</span>
          <TypedField className="insp-input mono" label="Keyframe sun time" hint="e.g. 06:47" value={formatClock(k.sun, timeZone)} apply={applyTime} />
        </label>
        <label className="insp-field">
          <span className="insp-label">Date</span>
          <TypedField className="insp-input" label="Keyframe sun date" hint="e.g. 12 Oct 2026" value={formatDate(k.sun, timeZone)} apply={applyDate} />
        </label>
      </div>
      {!isLast && (
        <>
          <span className="insp-label">Sun to the next keyframe</span>
          <div className="segmented segmented-small" role="group" aria-label="Sun mode">
            {(
              [
                ['continuous', 'Continuous'],
                ['daylapse', 'Day lapse'],
              ] as Array<[SunMode, string]>
            ).map(([m, label]) => (
              <button key={m} aria-pressed={k.sunMode === m} onClick={() => set({ sunMode: m })} title={m === 'continuous' ? 'Glide the exact moment (day sweeps, year lapses)' : 'Step the date day by day, holding the time of day'}>
                {label}
              </button>
            ))}
          </div>
          {k.sunMode === 'daylapse' && (
            <label className="insp-field insp-inline">
              <span className="insp-label">Time-of-day sweeps</span>
              <input
                className="insp-input mono"
                type="number"
                min={0}
                max={50}
                value={k.loops}
                onChange={(e) => set({ loops: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
            </label>
          )}
        </>
      )}

      <h3 className="hud-label insp-section">Camera</h3>
      <div className="insp-grid insp-grid-3">
        {CAMERA_FIELDS.map((f) => (
          <label key={f.k} className="insp-field">
            <span className="insp-label">{f.label}</span>
            <TypedField
              className="insp-input mono"
              label={`Keyframe ${f.label.toLowerCase()}`}
              hint={f.label}
              value={k.camera[f.k].toFixed(f.digits)}
              apply={(s) => {
                const v = Number(s.replace(',', '.').replace('°', ''));
                if (!Number.isFinite(v)) return false;
                set({ camera: { ...k.camera, [f.k]: v } });
                return true;
              }}
            />
          </label>
        ))}
      </div>

      {!isLast && (
        <>
          <div className="insp-ease-head">
            <h3 className="hud-label insp-section">Ease to next</h3>
            <div className="insp-ease-tools">
              <button className="chip chip-small" onClick={() => TL.copyEase(curve)} title="Copy this ease">
                Copy
              </button>
              <button className="chip chip-small" disabled={!clipboard} onClick={() => clipboard && setCurve(clipboard)} title="Paste the copied ease here">
                Paste
              </button>
              <button className="chip chip-small" onClick={() => TL.easeAll(curve, editSun ? 'sun' : 'camera')} title={`Use this ease on every keyframe's ${editSun ? 'sun' : 'camera'}`}>
                To all
              </button>
            </div>
          </div>
          <label className="insp-check">
            <input type="checkbox" checked={!!k.sunEasing} onChange={(e) => set({ sunEasing: e.target.checked ? k.easing : undefined })} />
            Sun has its own ease (e.g. steady time under a camera ease)
          </label>
          {k.sunEasing && (
            <div className="segmented segmented-small" role="group" aria-label="Ease for">
              <button aria-pressed={!editSun} onClick={() => setEditSun(false)}>
                Camera
              </button>
              <button aria-pressed={editSun} onClick={() => setEditSun(true)}>
                Sun
              </button>
            </div>
          )}
          <EaseEditor key={`${k.id}-${editSun}`} value={curve} onChange={setCurve} />
        </>
      )}

      <label className="toggle insp-layers">
        <span className="toggle-label">Switch layers here{k.layers ? ` (${Object.values(k.layers).filter(Boolean).length} on)` : ''}</span>
        <input type="checkbox" checked={!!k.layers} onChange={(e) => set({ layers: e.target.checked ? currentLayers() : undefined })} />
      </label>

      <div className="insp-actions">
        <button className="chip chip-small" onClick={() => set({ ...captureNow(), ...(k.layers ? { layers: currentLayers() } : {}) })} title="Use the current view, sun and layers">
          Set from view
        </button>
        <button className="chip chip-small" onClick={() => seek(k.t)}>
          Go to
        </button>
        <button className="chip chip-small insp-delete" onClick={() => TL.deleteKeyframe(k.id)}>
          Delete
        </button>
      </div>
    </aside>
  );
}
