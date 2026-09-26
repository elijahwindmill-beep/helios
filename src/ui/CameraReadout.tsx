import { useState } from 'react';
import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';
import { setCameraHeight } from '../map/camera';
import { formatHeight, parseReadoutNumber, type CameraState } from '../map/cameraMath';

type Field = 'lat' | 'lng' | 'height' | 'bearing' | 'pitch';

const FIELDS: Array<{ id: Field; label: string; format(c: CameraState): string }> = [
  { id: 'lat', label: 'Lat', format: (c) => c.lat.toFixed(5) },
  { id: 'lng', label: 'Lng', format: (c) => c.lng.toFixed(5) },
  { id: 'height', label: 'Height', format: (c) => formatHeight(c.height) },
  { id: 'bearing', label: 'Bearing', format: (c) => `${c.bearing.toFixed(1)}°` },
  { id: 'pitch', label: 'Pitch', format: (c) => `${c.pitch.toFixed(1)}°` },
];

function apply(field: Field, value: number) {
  const map = getMap();
  if (!map) return;
  const c = map.getCenter();
  switch (field) {
    case 'lat':
      if (Math.abs(value) <= 85) map.jumpTo({ center: [c.lng, value] });
      break;
    case 'lng':
      if (Math.abs(value) <= 180) map.jumpTo({ center: [value, c.lat] });
      break;
    case 'height':
      if (value > 0) setCameraHeight(map, value);
      break;
    case 'bearing':
      map.jumpTo({ bearing: value });
      break;
    case 'pitch':
      map.jumpTo({ pitch: value });
      break;
  }
}

/** Live camera readout. Click a value to type a new one; Enter applies, Escape cancels. */
export function CameraReadout({ inline = false }: { inline?: boolean }) {
  const camera = useApp((s) => s.camera);
  const [editing, setEditing] = useState<{ field: Field; text: string } | null>(null);
  if (!camera) return null;

  return (
    <div className={inline ? 'readout readout-inline' : 'panel readout readout-floating'} aria-label="Camera">
      {FIELDS.map((f) => {
        const isEditing = editing?.field === f.id;
        return (
          <label key={f.id} className="readout-field">
            <span className="readout-label">{f.label}</span>
            <input
              className="mono"
              value={isEditing ? editing.text : f.format(camera)}
              onFocus={(e) => {
                const input = e.target;
                setEditing({ field: f.id, text: f.format(camera).replace(/[°m ]|km/g, '') });
                // After React re-renders the plain number, select it so typing replaces it.
                setTimeout(() => input.select(), 0);
              }}
              onChange={(e) => setEditing({ field: f.id, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  const input = e.target as HTMLInputElement;
                  setEditing(null);
                  setTimeout(() => input.blur(), 0);
                }
              }}
              onBlur={() => {
                if (editing?.field === f.id) {
                  const n = parseReadoutNumber(editing.text);
                  if (n !== null) apply(f.id, n);
                }
                setEditing(null);
              }}
              spellCheck={false}
              aria-label={`Camera ${f.label.toLowerCase()}`}
            />
          </label>
        );
      })}
    </div>
  );
}
