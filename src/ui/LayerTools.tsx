import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/app';
import { useLayers } from '../store/layers';
import { importFiles } from '../layers/importFiles';
import { loadPhotoBlob } from '../layers/photoBlobs';
import { formatClock, formatDate, timeZoneAt, zonedParts, zonedToUtc } from '../sun/timezone';
import { useSpots } from '../store/spots';
import { useTouchDevice } from './useMedia';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Drop GPX, KML, GeoJSON or photos anywhere on the page. */
export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void importFiles(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="drop-zone" aria-hidden="true">
      <div className="drop-card">Drop GPX, KML, GeoJSON or photos</div>
    </div>
  );
}

/** Shown while drawing a route: how to add points and finish. */
export function DrawBar() {
  const draft = useLayers((s) => s.draft);
  const touch = useTouchDevice();
  const L = useLayers.getState();
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Enter') L.finishDraft();
      else if (e.key === 'Escape') L.cancelDraft();
      else if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        L.undoDraftPoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft !== null]);
  if (!draft) return null;
  return (
    <div className="panel draw-bar" role="toolbar" aria-label="Drawing a route">
      <span className="draw-hint">
        {touch
          ? draft.length === 0
            ? 'Tap to add points'
            : `${draft.length} point${draft.length === 1 ? '' : 's'}`
          : draft.length === 0
            ? 'Click the map to start the route'
            : `${draft.length} point${draft.length === 1 ? '' : 's'} · double-click or Enter to finish`}
      </span>
      <button className="chip chip-small" onClick={() => L.undoDraftPoint()} disabled={!draft.length}>
        Undo
      </button>
      <button className="chip chip-small" onClick={() => L.cancelDraft()}>
        Cancel
      </button>
      <button className="chip chip-small chip-primary" onClick={() => L.finishDraft()} disabled={draft.length < 2}>
        Done
      </button>
    </div>
  );
}

/** Brief message after an import. */
export function LayerNotice() {
  const notice = useLayers((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useLayers.getState().setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  if (!notice) return null;
  return (
    <div className="layer-notice" role="status">
      <span>{notice}</span>
      <button aria-label="Dismiss" onClick={() => useLayers.getState().setNotice(null)}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Full photo, when it was taken, and buttons to see the sun at that place and moment. */
export function PhotoViewer() {
  const id = useLayers((s) => s.openPhoto);
  const photo = useLayers((s) => s.photos.find((p) => p.id === s.openPhoto) ?? null);
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id && !d.open) d.showModal();
    if (!id && d.open) d.close();
    setUrl(null);
    setFailed(false);
    if (!id) return;
    let objectUrl: string | null = null;
    let live = true;
    loadPhotoBlob(id)
      .then((blob) => {
        if (!live) return;
        if (!blob) return setFailed(true);
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const tz = photo ? timeZoneAt(photo.lat, photo.lng) : 'UTC';
  const goToMoment = () => {
    if (!photo) return;
    const app = useApp.getState();
    app.setPin({ lat: photo.lat, lng: photo.lng, name: photo.name });
    if (photo.takenAt !== null) app.setTime(photo.takenAt);
    useLayers.getState().setOpenPhoto(null);
  };

  return (
    <dialog ref={ref} className="panel photo-viewer" onClose={() => useLayers.getState().setOpenPhoto(null)}>
      {photo && (
        <>
          <div className="photo-frame">
            {url && !failed ? (
              <img src={url} alt={photo.name} onError={() => setFailed(true)} />
            ) : failed ? (
              <p className="muted">This browser can't show this photo (HEIC photos open in Safari).</p>
            ) : null}
          </div>
          <div className="photo-info">
            <div>
              <strong>{photo.name}</strong>
              <p className="muted mono">
                {photo.takenAt !== null ? `${formatDate(photo.takenAt, tz)} · ${formatClock(photo.takenAt, tz)}` : 'No capture time in the file'}
                {' · '}
                {photo.lat.toFixed(5)}, {photo.lng.toFixed(5)}
                {!photo.fromGps && ' (placed by hand)'}
              </p>
            </div>
            <div className="photo-actions">
              <button className="chip chip-small chip-primary" onClick={goToMoment}>
                {photo.takenAt !== null ? 'Sun when this was taken' : 'Move sun pin here'}
              </button>
              <button className="chip chip-small" onClick={() => useLayers.getState().setOpenPhoto(null)}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

const COMPASS_NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A Wikimedia Commons photo spot: the photo, who took it and its licence, and when. */
export function SpotViewer() {
  const spot = useSpots((s) => s.open);
  const heading = useSpots((s) => s.openHeading);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (spot && !d.open) d.showModal();
    if (!spot && d.open) d.close();
  }, [spot]);

  const close = () => useSpots.getState().set({ open: null, openHeading: undefined });
  const t = spot?.taken;
  const when = t ? [t.day, MONTHS[t.month - 1], t.year].filter(Boolean).join(' ') + (t.hour !== null ? ` · ${String(t.hour).padStart(2, '0')}:${String(t.minute ?? 0).padStart(2, '0')}` : '') : 'Date not recorded';
  const facing =
    heading === undefined ? '' : heading === null ? 'Direction not recorded' : `Facing ${COMPASS_NAMES[Math.round(heading / 45) % 8]} (${Math.round(heading)}°), shown on the map`;

  const goToMoment = () => {
    if (!spot) return;
    const app = useApp.getState();
    const tz = timeZoneAt(spot.lat, spot.lng);
    app.setPin({ lat: spot.lat, lng: spot.lng, name: spot.title });
    if (t?.day) {
      const now = zonedParts(app.time, tz);
      app.setTime(zonedToUtc({ year: t.year, month: t.month, day: t.day, hour: t.hour ?? now.hour, minute: t.minute ?? now.minute }, tz));
    }
    close();
  };

  return (
    <dialog ref={ref} className="panel photo-viewer" onClose={close}>
      {spot && (
        <>
          <div className="photo-frame">
            <img src={spot.large} alt={spot.title} referrerPolicy="no-referrer" />
          </div>
          <div className="photo-info">
            <div>
              <strong>{spot.title}</strong>
              <p className="muted">
                Photo: {spot.artist || 'unknown'} ·{' '}
                {spot.licenseUrl ? (
                  <a href={spot.licenseUrl} target="_blank" rel="noreferrer">
                    {spot.license}
                  </a>
                ) : (
                  spot.license
                )}{' '}
                ·{' '}
                <a href={spot.page} target="_blank" rel="noreferrer">
                  Wikimedia Commons
                </a>
              </p>
              <p className="muted mono">
                {when}
                {facing && ` · ${facing}`}
              </p>
            </div>
            <div className="photo-actions">
              <button className="chip chip-small chip-primary" onClick={goToMoment}>
                {t?.day ? 'Sun when this was taken' : 'Move sun pin here'}
              </button>
              <button className="chip chip-small" onClick={close}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
