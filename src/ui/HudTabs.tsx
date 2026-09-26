import { useEffect } from 'react';
import { useApp, type Hud } from '../store/app';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

// Arrow per screen edge: points away from the map to hide that group, back in to show it.
const TABS: Array<{ side: keyof Hud; label: string; hide: string; show: string }> = [
  { side: 'left', label: 'layer panel', hide: 'M14 6l-6 6 6 6', show: 'M10 6l6 6-6 6' },
  { side: 'right', label: 'alerts and map buttons', hide: 'M10 6l6 6-6 6', show: 'M14 6l-6 6 6 6' },
  { side: 'top', label: 'top bar and forecast', hide: 'M6 14l6-6 6 6', show: 'M6 10l6 6 6-6' },
  { side: 'bottom', label: 'sun chart, tools and readout', hide: 'M6 10l6 6 6-6', show: 'M6 14l6-6 6 6' },
];

/** Edge tabs that slide the control groups out of the way for a clear map. H toggles them all. */
export function HudTabs() {
  const hud = useApp((s) => s.hud);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key.toLowerCase() === 'h') useApp.getState().toggleHud();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      {TABS.map((t) => (
        <button
          key={t.side}
          className="hud-tab"
          data-side={t.side}
          aria-pressed={!hud[t.side]}
          aria-label={`${hud[t.side] ? 'Hide' : 'Show'} the ${t.label} (H hides or shows everything)`}
          title={`${hud[t.side] ? 'Hide' : 'Show'} the ${t.label} · H: all`}
          onClick={() => useApp.getState().setHud({ [t.side]: !hud[t.side] })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={hud[t.side] ? t.hide : t.show} />
          </svg>
        </button>
      ))}
    </>
  );
}

/** Phone: one button hides everything but the map; a small one brings it back. */
export function ClearViewButton() {
  const hidden = useApp((s) => !Object.values(s.hud).some(Boolean));
  return (
    <button
      className={hidden ? 'icon-button clear-view clear-view-restore' : 'icon-button clear-view'}
      aria-label={hidden ? 'Show the controls' : 'Hide the controls for a clear map'}
      onClick={() => useApp.getState().toggleHud()}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" />
          </>
        )}
      </svg>
    </button>
  );
}
