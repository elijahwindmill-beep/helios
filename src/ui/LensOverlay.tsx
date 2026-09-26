import { useEffect, useState } from 'react';
import { useApp } from '../store/app';
import { PERFORMANCE } from '../map/performance';

// Control windows that get their own tilt-shift: a blur feathering in from their top and bottom edges.
const WINDOWS = '.top-bar, .forecast, .alerts, .layer-panel, .sun-chart, .tool-dock, .readout-floating, .sun-card, .search-box, .weather-warning';

interface Band {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  edge: 'top' | 'bottom';
}

/** Blur bands along each visible control window's top and bottom edges, kept in step with the layout. */
function useWindowBands(on: boolean): Band[] {
  const [bands, setBands] = useState<Band[]>([]);
  useEffect(() => {
    if (!on) return setBands([]);
    let last = '';
    const measure = () => {
      const next: Band[] = [];
      document.querySelectorAll<HTMLElement>(WINDOWS).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return;
        const h = Math.min(18, r.height / 3);
        next.push({ key: `${i}t`, left: r.left, top: r.top, width: r.width, height: h, edge: 'top' });
        next.push({ key: `${i}b`, left: r.left, top: r.bottom - h, width: r.width, height: h, edge: 'bottom' });
      });
      const sig = next.map((b) => `${b.left|0},${b.top|0},${b.width|0},${b.height|0}`).join(';');
      if (sig !== last) {
        last = sig;
        setBands(next);
      }
    };
    measure();
    // Panels open, close, scroll into place and slide in and out: re-measure often, cheaply.
    const id = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [on]);
  return bands;
}

/**
 * The part of the lens look that covers everything, panels included: a slight vignette, a
 * blur that feathers in from the screen edges, a tilt-shift band along each control window,
 * and fine grey film grain on top to blend it all. (Aberration, tilt-shift on the map, dirt
 * and dust are in the map image: scene/lens.ts.)
 */
export function LensOverlay() {
  const on = useApp((s) => s.overlays.lens && s.lensStrength > 0);
  // The blurs over the panels are the costly part; Smooth performance leaves them out.
  const overPanels = useApp((s) => PERFORMANCE[s.performance].lensOverPanels);
  const bands = useWindowBands(on && overPanels);
  if (!on) return null;
  return (
    <div className="lens-overlay" aria-hidden="true">
      <div className="lens-vignette" />
      {overPanels && <div className="lens-edge" />}
      {bands.map((b) => (
        <div key={b.key} className="lens-band" data-edge={b.edge} style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
      ))}
      <svg className="lens-grain" width="100%" height="100%">
        <filter id="lens-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="1" seed="11" stitchTiles="stitch" />
          {/* Grey only: every channel takes the red noise, fully opaque. */}
          <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lens-grain)" />
      </svg>
    </div>
  );
}
