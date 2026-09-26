import { useApp, type Theme } from '../store/app';
import { ELEVATION, ELEVATION_ORDER } from '../map/sources';
import { PERFORMANCE, PERFORMANCE_ORDER } from '../map/performance';
import { useGoogle3d } from '../store/google3d';

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: 'frost', label: 'Dark' },
  { id: 'paper', label: 'Light' },
  { id: 'auto', label: 'Auto' },
];

/** Look, speed and data choices, at the foot of the layer panel. */
export function Settings() {
  const theme = useApp((s) => s.theme);
  const performance = useApp((s) => s.performance);
  const elevation = useApp((s) => s.elevation);
  const googleKey = useApp((s) => s.googleKey);
  const google3d = useApp((s) => s.overlays.google3d);
  const google = useGoogle3d();
  const { setTheme, setPerformance, setElevation, setGoogleKey, toggleOverlay } = useApp.getState();
  return (
    <section className="settings" aria-label="Settings">
      <h2 className="eyebrow hud-label">Theme</h2>
      <div className="segmented segmented-small" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} title={t.id === 'auto' ? 'Follow the system setting' : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      <h2 className="eyebrow hud-label">Performance</h2>
      <div className="segmented segmented-small" role="group" aria-label="Performance">
        {PERFORMANCE_ORDER.map((id) => (
          <button key={id} aria-pressed={performance === id} onClick={() => setPerformance(id)}>
            {PERFORMANCE[id].label}
          </button>
        ))}
      </div>
      <p className="setting-note">{PERFORMANCE[performance].hint}</p>

      <h2 className="eyebrow hud-label">Elevation data</h2>
      <div className="segmented segmented-small" role="group" aria-label="Elevation data">
        {ELEVATION_ORDER.map((id) => (
          <button key={id} aria-pressed={elevation === id} onClick={() => setElevation(id)}>
            {ELEVATION[id].label.replace(/ \(.*\)$/, '')}
          </button>
        ))}
      </div>
      <p className="setting-note">{ELEVATION[elevation].note}</p>

      <h2 className="eyebrow hud-label">Google 3D tiles</h2>
      <label className="field">
        <span className="setting-note">Your Google Maps Platform key (Map Tiles API)</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your key"
          defaultValue={googleKey}
          onBlur={(e) => setGoogleKey(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      <button className="toggle" aria-pressed={google3d} disabled={!googleKey} onClick={() => toggleOverlay('google3d')}>
        <span className="toggle-label">Photorealistic 3D</span>
        <span className="switch" aria-hidden="true">
          <span className="knob" />
        </span>
      </button>
      <p className={`setting-note${google.status === 'error' ? ' shadow-status-error' : ''}`} role="status">
        {google.status === 'loading' && 'Loading the 3D renderer…'}
        {google.status === 'error' && google.message}
        {google.status !== 'loading' && google.status !== 'error' &&
          "Buildings, trees and rock faces in 3D, with the cast shadows painted on. Google bills your key per use and keeps it in this browser only. Not in exported videos: Google allows only short promotional clips."}
      </p>
    </section>
  );
}
