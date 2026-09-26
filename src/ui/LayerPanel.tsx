import { useApp, type ShadowQuality } from '../store/app';
import { IMAGERY, IMAGERY_ORDER } from '../map/sources';
import type { BaseLayer, Overlays } from '../map/style';
import { CameraReadout } from './CameraReadout';
import { useNarrow, useReadoutInPanel } from './useMedia';
import { MyLayers } from './MyLayers';
import { SearchBar } from './SearchBar';

const BASES: Array<{ id: BaseLayer; label: string }> = [
  { id: 'satellite', label: 'Satellite' },
  { id: 'paper', label: 'Paper' },
  { id: 'terrain', label: 'Terrain' },
];

const OVERLAYS: Array<{ id: keyof Overlays; label: string; swatch: string }> = [
  { id: 'shadows', label: 'Cast shadows', swatch: '#3B4A5A' },
  { id: 'routes', label: 'Routes', swatch: '#5B8DEF' },
  { id: 'places', label: 'Places', swatch: '#1F1D1A' },
  { id: 'photos', label: 'Photos', swatch: '#C98A0F' },
  { id: 'sunPath', label: 'Sun path', swatch: '#E8A317' },
  { id: 'solstices', label: 'Solstice paths', swatch: '#BDB6A5' },
  { id: 'compass', label: 'Compass ring', swatch: '#6B665C' },
  { id: 'contours', label: 'Contours', swatch: '#BDB6A5' },
  { id: 'labels', label: 'Labels', swatch: '#8A857B' },
  { id: 'lightColour', label: 'Golden hour light', swatch: 'linear-gradient(135deg, #F2B45A, #7C8FB8)' },
  { id: 'lens', label: 'Lens look', swatch: 'radial-gradient(circle, #f4f6f8 20%, #5b8def 60%, #e4572e)' },
];

const QUALITIES: Array<{ id: ShadowQuality; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const COMMERCIAL_TEXT = { ok: 'OK for paid work', check: 'Check terms for paid work', no: 'Not for paid work' };

export function LayerPanel() {
  const base = useApp((s) => s.base);
  const overlays = useApp((s) => s.overlays);
  const imagery = useApp((s) => s.imagery);
  const maptilerKey = useApp((s) => s.maptilerKey);
  const quality = useApp((s) => s.shadowQuality);
  const lensStrength = useApp((s) => s.lensStrength);
  const status = useApp((s) => s.shadowStatus);
  const { setBase, toggleOverlay, setImagery, setMaptilerKey, setAboutOpen, setShadowQuality } = useApp.getState();
  const provider = IMAGERY[imagery];
  const narrow = useNarrow();
  const readoutInPanel = useReadoutInPanel();
  const open = useApp((s) => s.layersOpen);

  return (
    <aside className="panel layer-panel" aria-label="Layers" data-open={open} hidden={narrow && !open}>
      {narrow && (
        <button className="icon-button sheet-close" aria-label="Close layers" onClick={() => useApp.getState().setLayersOpen(false)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
      {narrow ? (
        <>
          <h1 className="title">Helios</h1>
          <p className="subtitle">Sun and shadow scout</p>
        </>
      ) : (
        <SearchBar />
      )}

      <h2 className="eyebrow hud-label">Base layer</h2>
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

      {overlays.lens && (
        <label className="lens-strength">
          <span className="hud-label">Lens strength</span>
          <input
            type="range"
            className="range"
            min={0}
            max={1}
            step={0.05}
            value={lensStrength}
            aria-label="Lens strength"
            onChange={(e) => useApp.getState().setLensStrength(Number(e.target.value))}
          />
        </label>
      )}

      {overlays.shadows && (
        <div className="shadow-settings">
          <div className="segmented segmented-small" role="group" aria-label="Shadow quality">
            {QUALITIES.map((q) => (
              <button key={q.id} aria-pressed={quality === q.id} onClick={() => setShadowQuality(q.id)}>
                {q.label}
              </button>
            ))}
          </div>
          <p className={`shadow-status${status.state === 'error' ? ' shadow-status-error' : ''}`} role="status">
            {status.state === 'loading' && 'Loading elevation for shadows…'}
            {status.state === 'error' && `Shadows unavailable: ${status.message}`}
            {status.state === 'idle' && status.renderMs !== undefined && `Shadows drawn in ${Math.max(1, Math.round(status.renderMs))} ms`}
          </p>
        </div>
      )}

      <MyLayers />

      {readoutInPanel && (
        <>
          <h2 className="eyebrow hud-label">Camera</h2>
          <CameraReadout inline />
        </>
      )}

      <button className="link-button" onClick={() => setAboutOpen(true)}>
        About, sources and licences
      </button>
    </aside>
  );
}
