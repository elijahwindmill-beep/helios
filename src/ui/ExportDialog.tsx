import { useEffect, useRef } from 'react';
import { useTimeline } from '../store/timeline';
import { clipDuration } from '../timeline/model';
import { cancelExport, exportSize, runExport, useExport, type ExportOptions } from '../timeline/exportVideo';
import { timecode } from './Timeline';

const SIZES: Array<{ h: ExportOptions['height']; label: string }> = [
  { h: 720, label: '720p' },
  { h: 1080, label: '1080p' },
  { h: 2160, label: '4K' },
];
const ASPECTS: Array<{ a: ExportOptions['aspect']; title: string }> = [
  { a: '16:9', title: 'Widescreen' },
  { a: '9:16', title: 'Vertical: Reels, Shorts, TikTok' },
  { a: '1:1', title: 'Square' },
  { a: '4:3', title: 'Classic' },
  { a: '3:2', title: 'Photo (full-frame sensor shape)' },
];
const RATES: ExportOptions['fps'][] = [24, 30, 60];

/** Export settings, then progress while frames render, then the saved file. */
export function ExportDialog() {
  const ex = useExport();
  const clip = useTimeline((s) => s.project.clips.find((c) => c.id === s.project.activeClip) ?? s.project.clips[0]);
  const ref = useRef<HTMLDialogElement>(null);
  const modal = ex.phase === 'dialog' || ex.phase === 'done' || ex.phase === 'error';
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (modal && !d.open) d.showModal();
    if (!modal && d.open) d.close();
  }, [modal]);

  const duration = clipDuration(clip);
  const frames = Math.round(duration * ex.options.fps) + 1;
  const o = ex.options;
  const sunOnly = o.contents === 'sun';
  const px = exportSize(o);

  return (
    <>
      <dialog ref={ref} className="panel export-dialog" onClose={() => ex.phase !== 'rendering' && ex.close()}>
        {ex.phase === 'dialog' && (
          <>
            <h2 className="title">Export “{clip.name}”</h2>
            <p className="muted">
              {timecode(duration)} · {frames} frames · {sunOnly ? 'ProRes 4444 with alpha (.mov)' : 'MP4 (H.264)'}.{' '}
              {sunOnly ? 'Frames are drawn one at a time, so the video is smooth however long it takes.' : 'Every frame waits for the map and shadows to finish drawing, so it takes longer than the clip, but the video is smooth.'}
            </p>
            <span className="hud-label">Contents</span>
            <div className="segmented" role="group" aria-label="Contents">
              <button aria-pressed={!sunOnly} onClick={() => ex.setOptions({ contents: 'full' })} title="The map, shadows, sun scene and lens look, as on screen">
                Map and sun
              </button>
              <button aria-pressed={sunOnly} onClick={() => ex.setOptions({ contents: 'sun' })} title="The sun, its paths, the compass ring and labels over transparency">
                Sun path only
              </button>
            </div>
            {sunOnly && (
              <p className="muted export-note">
                The sun scene alone over a transparent background, as ProRes 4444 with alpha, ready to lay over your footage in Resolve. The encoder (about 32 MB) loads from
                jsDelivr the first time.
              </p>
            )}
            <span className="hud-label">Aspect ratio</span>
            <div className="segmented" role="group" aria-label="Aspect ratio">
              {ASPECTS.map((s) => (
                <button key={s.a} aria-pressed={o.aspect === s.a} title={s.title} onClick={() => ex.setOptions({ aspect: s.a })}>
                  {s.a}
                </button>
              ))}
            </div>
            {o.aspect !== '16:9' && (
              <p className="muted export-note">The centre of the view, cropped to {o.aspect}: keep what matters near the middle of the screen.</p>
            )}
            <span className="hud-label">
              Size <span className="mono export-px">{px.width} × {px.height}</span>
            </span>
            <div className="segmented" role="group" aria-label="Size">
              {SIZES.map((s) => (
                <button key={s.h} aria-pressed={ex.options.height === s.h} onClick={() => ex.setOptions({ height: s.h })}>
                  {s.label}
                </button>
              ))}
            </div>
            <span className="hud-label">Frame rate</span>
            <div className="segmented" role="group" aria-label="Frame rate">
              {RATES.map((r) => (
                <button key={r} aria-pressed={ex.options.fps === r} onClick={() => ex.setOptions({ fps: r })}>
                  {r} fps
                </button>
              ))}
            </div>
            <button className="toggle export-blur" aria-pressed={o.motionBlur} onClick={() => ex.setOptions({ motionBlur: !o.motionBlur })}>
              <span className="toggle-label">Motion blur</span>
              <span className="switch" aria-hidden="true">
                <span className="knob" />
              </span>
            </button>
            {o.motionBlur && (
              <div className="export-blur-settings">
                <label className="export-slider">
                  <span className="hud-label">Shutter angle</span>
                  <input type="range" className="range" min={10} max={360} step={5} value={o.shutter} onChange={(e) => ex.setOptions({ shutter: Number(e.target.value) })} />
                  <span className="mono">{o.shutter}°</span>
                </label>
                <label className="export-slider">
                  <span className="hud-label">Samples</span>
                  <input type="range" className="range" min={2} max={30} step={1} value={o.samples} onChange={(e) => ex.setOptions({ samples: Number(e.target.value) })} />
                  <span className="mono">{o.samples}</span>
                </label>
                <p className="muted export-note">
                  Each frame blends {o.samples} moments across {Math.round((o.shutter / 360) * (1000 / o.fps))} ms (180° is the film look), so the export takes about{' '}
                  {o.samples}× as long.
                </p>
              </div>
            )}
            {!sunOnly && (
              <p className="muted export-note">
                The map, shadows, sun scene and lens look are in the video; pins and photo markers aren't. Google 3D tiles are left out too: Google allows them only in short
                promotional clips.
              </p>
            )}
            <div className="export-actions">
              <button className="chip" onClick={ex.close}>
                Cancel
              </button>
              <button className="chip chip-primary" onClick={() => void runExport()}>
                Export
              </button>
            </div>
          </>
        )}
        {ex.phase === 'done' && (
          <>
            <h2 className="title">Video saved</h2>
            <p>
              {ex.filename} · {ex.message}
            </p>
            <div className="export-actions">
              {ex.url && (
                <a className="chip" href={ex.url} download={ex.filename}>
                  Download again
                </a>
              )}
              <button className="chip chip-primary" onClick={ex.close}>
                Done
              </button>
            </div>
          </>
        )}
        {ex.phase === 'error' && (
          <>
            <h2 className="title">Export didn't work</h2>
            <p>{ex.message}</p>
            <div className="export-actions">
              <button className="chip chip-primary" onClick={ex.close}>
                Close
              </button>
            </div>
          </>
        )}
      </dialog>
      {ex.phase === 'rendering' && (
        <div className="panel export-progress" role="status">
          <span className="hud-label">Exporting {ex.filename}</span>
          <div className="export-bar">
            <span style={{ width: `${(ex.frame / Math.max(1, ex.total)) * 100}%` }} />
          </div>
          <span className="mono">{ex.message || `Frame ${ex.frame} / ${ex.total}`}</span>
          <button className="chip chip-small" onClick={cancelExport}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
