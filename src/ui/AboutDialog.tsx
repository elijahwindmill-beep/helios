import { useEffect, useRef } from 'react';
import { useApp } from '../store/app';
import { DATA_SOURCES, IMAGERY, IMAGERY_ORDER } from '../map/sources';

const COMMERCIAL = { ok: 'Yes', check: 'Check terms', no: 'Needs paid licence' };

export function AboutDialog() {
  const open = useApp((s) => s.aboutOpen);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="panel about" onClose={() => useApp.getState().setAboutOpen(false)}>
      <h2 className="title">About Helios</h2>
      <p>
        Scout sun and shadow on real terrain, then turn it into keyframed clips. Terrain only: buildings and trees are not
        modelled.
      </p>

      <h3 className="eyebrow">Data sources</h3>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Used for</th>
            <th>Licence</th>
          </tr>
        </thead>
        <tbody>
          {DATA_SOURCES.map((s) => (
            <tr key={s.name}>
              <td>
                <a href={s.url} target="_blank" rel="noopener">
                  {s.name}
                </a>
              </td>
              <td>{s.use}</td>
              <td>{s.licence}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="eyebrow">Satellite imagery</h3>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Paid work?</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {IMAGERY_ORDER.map((id) => (
            <tr key={id}>
              <td>{IMAGERY[id].label}</td>
              <td>{COMMERCIAL[IMAGERY[id].commercial]}</td>
              <td>{IMAGERY[id].note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted">
        Map rendering: MapLibre GL JS (BSD-3). Contours: maplibre-contour (BSD-3). Full attribution is shown in the map
        corner.
      </p>

      <form method="dialog">
        <button className="primary">Close</button>
      </form>
    </dialog>
  );
}
