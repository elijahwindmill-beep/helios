import { useEffect, useRef } from 'react';
import { useTimeline } from '../store/timeline';
import { clipDuration } from '../timeline/model';
import { cancelExport, runExport, useExport, type ExportOptions } from '../timeline/exportVideo';
import { timecode } from './Timeline';

const SIZES: Array<{ h: ExportOptions['height']; label: string }> = [
  { h: 720, label: '720p' },
  { h: 1080, label: '1080p' },
  { h: 2160, label: '4K' },
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

  return (
    <>
      <dialog ref={ref} className="panel export-dialog" onClose={() => ex.phase !== 'rendering' && ex.close()}>
        {ex.phase === 'dialog' && (
          <>
            <h2 className="title">Export “{clip.name}”</h2>
            <p className="muted">
              {timecode(duration)} · {frames} frames · MP4 (H.264). Every frame waits for the map and shadows to finish drawing, so it takes longer than the clip, but the video
              is smooth.
            </p>
            <span className="hud-label">Size</span>
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
            <p className="muted export-note">
              The map, shadows, sun scene and lens look are in the video; pins and photo markers aren't. Google 3D tiles are left out too: Google allows them only in short
              promotional clips.
            </p>
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
          <span className="mono">
            Frame {ex.frame} / {ex.total}
          </span>
          <button className="chip chip-small" onClick={cancelExport}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
