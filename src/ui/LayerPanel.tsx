import { useApp } from '../store/app';
import { IMAGERY, IMAGERY_ORDER } from '../map/sources';
import type { BaseLayer, Overlays } from '../map/style';

const BASES: Array<{ id: BaseLayer; label: string }> = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'paper', label: 'Paper' },
  { id: 'terrain', label: 'Terrain' },
];

const OVERLAYS: Array<{ id: keyof Overlays; label: string; swatch: string }> = [
  { id: 'contours', label: 'Contours', swatch: '#BDB6A5' },
  { id: 'labels', label: 'Labels', swatch: '#8A857B' },
];

const COMMERCIAL_TEXT = { ok: 'OK for paid work', check: 'Check terms for paid work', no: 'Not for paid work' };

export function LayerPanel() {
  const base = useApp((s) => s.base);
  const overlays = useApp((s) => s.overlays);
  const imagery = useApp((s) => s.imagery);
  const maptilerKey = useApp((s) => s.maptilerKey);
  const { setBase, toggleOverlay, setImagery, setMaptilerKey, setAboutOpen } = useApp.getState();
  const provider = IMAGERY[imagery];

  return (
    <aside className="panel layer-panel" aria-label="Layers">
      <h1 className="title">Helios</h1>
      <p className="subtitle">Sun and shadow scout</p>

      <h2 className="eyebrow">Base layer</h2>
      <div className="segmented" role="group" aria-label="Base layer">
        {BASES.map((b) => (
          <button key={b.id} aria-pressed={base === b.id} onClick={() => setBase(b.id)}>
            {b.label}
          </button>
        ))}
      </div>

      {base === 'satellite' && (
        <div className="imagery">
          <label className="field">
            <span className="eyebrow">Imagery</span>
            <select value={imagery} onChange={(e) => setImagery(e.target.value as typeof imagery)}>
              {IMAGERY_ORDER.map((id) => (
                <option key={id} value={id}>
                  {IMAGERY[id].label}
                </option>
              ))}
            </select>
          </label>
          {provider.needsKey && (
            <label className="field">
              <span className="eyebrow">MapTiler key</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your key"
                defaultValue={maptilerKey}
                onBlur={(e) => setMaptilerKey(e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
          )}
          <p className={`licence licence-${provider.commercial}`}>
            <strong>{COMMERCIAL_TEXT[provider.commercial]}.</strong> {provider.note}
          </p>
        </div>
      )}

      <h2 className="eyebrow overlays-heading">Overlays</h2>
      <ul className="toggles">
        {OVERLAYS.map((o) => (
          <li key={o.id}>
            <button className="toggle" aria-pressed={overlays[o.id]} onClick={() => toggleOverlay(o.id)}>
              <span className="swatch" style={{ background: o.swatch }} />
              <span className="toggle-label">{o.label}</span>
              <span className="switch" aria-hidden="true">
                <span className="knob" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button className="link-button" onClick={() => setAboutOpen(true)}>
        About, sources and licences
      </button>
    </aside>
  );
}
