import { useApp } from '../store/app';

/**
 * The part of the lens look that covers everything, panels included: a slight vignette, a
 * blur that feathers in toward the edges through the vignette's shape, and film grain on
 * top to blend it all. (Aberration, tilt-shift, dirt and dust are in the map image: scene/lens.ts.)
 */
export function LensOverlay() {
  const on = useApp((s) => s.overlays.lens);
  const strength = useApp((s) => s.lensStrength);
  if (!on || strength <= 0) return null;
  return (
    <div className="lens-overlay" aria-hidden="true" style={{ '--lens': strength } as React.CSSProperties}>
      <div className="lens-vignette" />
      <div className="lens-edge" />
      <svg className="lens-grain" width="100%" height="100%">
        <filter id="lens-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lens-grain)" />
      </svg>
    </div>
  );
}
