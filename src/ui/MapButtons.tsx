import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';

export function MapButtons() {
  const bearing = useApp((s) => s.camera?.bearing ?? 0);
  return (
    <div className="map-buttons">
      <button className="icon-button" aria-label="Zoom in" onClick={() => getMap()?.zoomIn()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button className="icon-button" aria-label="Zoom out" onClick={() => getMap()?.zoomOut()}>
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
