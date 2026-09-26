import { useApp, type Theme } from '../store/app';
import { ELEVATION, ELEVATION_ORDER } from '../map/sources';
import { PERFORMANCE, PERFORMANCE_ORDER } from '../map/performance';

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
  const { setTheme, setPerformance, setElevation } = useApp.getState();
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
    </section>
  );
}
