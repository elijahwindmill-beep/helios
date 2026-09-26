import { useRef } from 'react';
import { useLayers } from '../store/layers';
import { IMPORT_ACCEPT, addPlaceAtPin, toggleDrawing } from '../layers/actions';
import { importFiles } from '../layers/importFiles';
import { useTimeline } from '../store/timeline';

/** Desktop tool dock: draw a route, save a place, import routes and photos. */
export function ToolDock() {
  const drawing = useLayers((s) => s.draft !== null);
  const input = useRef<HTMLInputElement>(null);
  const tools = [
    { label: drawing ? 'Finish' : 'Route', pressed: drawing, onClick: toggleDrawing, tone: 'route', icon: 'M5 19c3-1 3-6 7-7s4-6 7-7M5 19a1.5 1.5 0 1 0 0.01 0M19 5a1.5 1.5 0 1 0 0.01 0', title: 'Draw a route on the map' },
    { label: 'Place', onClick: addPlaceAtPin, icon: 'M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 8.5a2 2 0 1 0 0.01 0', title: "Save the sun pin's spot as a place" },
    { label: 'Import', onClick: () => input.current?.click(), icon: 'M4 7h3l2-2.5h6L17 7h3v12H4zM12 10a3.2 3.2 0 1 0 0.01 0', title: 'Import GPX, KML, GeoJSON or photos' },
    { label: 'Timeline', onClick: () => useTimeline.getState().setOpen(true), tone: 'key', icon: 'M12 3l5 6-5 6-5-6zM4 20h16', title: 'Keyframes, playback and video export' },
  ];
  return (
    <nav className="panel tool-dock" aria-label="Tools">
      {tools.map((t) => (
        <button key={t.label} className="tool" aria-pressed={t.pressed} onClick={t.onClick} title={t.title} data-tone={t.tone}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span className="hud-label">{t.label}</span>
        </button>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={IMPORT_ACCEPT}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void importFiles(files);
        }}
      />
    </nav>
  );
}
