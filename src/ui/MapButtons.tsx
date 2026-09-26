import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';

export function MapButtons() {
  const bearing = useApp((s) => s.camera?.bearing ?? 0);
  return (
    <div className="map-buttons">
      <button
        className="icon-button narrow-only"
        aria-label="Layers and settings"
        onClick={() => useApp.getState().setLayersOpen(!useApp.getState().layersOpen)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l9 5-9 5-9-5z" />
          <path d="M3 14l9 5 9-5" />
        </svg>
      </button>
      <button className="icon-button" aria-label="How to move around" title="How to move around" onClick={() => useApp.getState().openTutorial()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <button className="icon-button wide-only" aria-label="Zoom in" onClick={() => getMap()?.zoomIn()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button className="icon-button wide-only" aria-label="Zoom out" onClick={() => getMap()?.zoomOut()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        className="icon-button"
        aria-label="Reset north and tilt"
        title="Reset north and tilt (R, T)"
        onClick={() => getMap()?.easeTo({ bearing: 0, pitch: 0, duration: 600 })}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transform: `rotate(${-bearing}deg)` }}
        >
          <path d="M12 3l4 9h-8z" fill="#E8A317" stroke="#1F1D1A" />
          <path d="M12 21l-4-9h8z" strokeOpacity="0.35" />
        </svg>
      </button>
    </div>
  );
}
