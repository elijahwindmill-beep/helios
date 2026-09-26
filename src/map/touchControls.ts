import type { LngLat, Map as MlMap } from 'maplibre-gl';

// Touch gestures, matching the mouse controls:
//   1 finger drag   = pan              (MapLibre)
//   double-tap      = move the pin     (here; MapLibre's double-tap zoom is off)
//   2 fingers       = pinch to dolly, twist to rotate (MapLibre)
//   3 fingers drag  = orbit: up/down tilts, left/right rotates (here)

/** Degrees per pixel of three-finger movement. Slightly gentler than the mouse orbit. */
const BEARING_PER_PX = 0.5;
const PITCH_PER_PX = 0.35;
/** A tap moves less than this and lasts less than TAP_MS. */
const TAP_SLOP_PX = 12;
const TAP_MS = 300;
/** Two taps this close in time and space make a double-tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;

function centroid(touches: TouchList): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let i = 0; i < touches.length; i++) {
    x += touches[i].clientX;
    y += touches[i].clientY;
  }
  return { x: x / touches.length, y: y / touches.length };
}

export function installTouchControls(map: MlMap, opts: { onDoubleTap(lngLat: LngLat): void }): () => void {
  const container = map.getContainer();
  // Two-finger vertical drag would also tilt in MapLibre; tilting is the three-finger gesture here.
  map.touchPitch.disable();

  let orbit: { x: number; y: number } | null = null;
  let tapStart: { x: number; y: number; t: number } | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    } else {
      tapStart = null;
    }
    if (e.touches.length === 3) {
      // Hand the gesture over from MapLibre's pan/pinch to our orbit. Disabling resets
      // their state, so there is no jump when fingers come back down later.
      map.dragPan.disable();
      map.touchZoomRotate.disable();
      orbit = centroid(e.touches);
      e.preventDefault();
    }
  };

  const onMove = (e: TouchEvent) => {
    if (tapStart && e.touches.length === 1) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > TAP_SLOP_PX) tapStart = null;
    }
    if (!orbit || e.touches.length < 3) return;
    const c = centroid(e.touches);
    map.jumpTo({
      // Same directions as the mouse orbit: right turns, up tilts toward the horizon.
      bearing: map.getBearing() + (c.x - orbit.x) * BEARING_PER_PX,
      pitch: map.getPitch() - (c.y - orbit.y) * PITCH_PER_PX,
    });
    orbit = c;
    e.preventDefault();
    e.stopPropagation();
  };

  const onEnd = (e: TouchEvent) => {
    if (orbit && e.touches.length < 3) orbit = null;
    if (e.touches.length === 0) {
      if (!map.dragPan.isEnabled()) map.dragPan.enable();
      if (!map.touchZoomRotate.isEnabled()) map.touchZoomRotate.enable();
    }
    // Double-tap: two quick taps near each other.
    if (tapStart && e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = performance.now();
      const t = e.changedTouches[0];
      if (now - tapStart.t < TAP_MS) {
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < DOUBLE_TAP_PX) {
          const rect = map.getCanvas().getBoundingClientRect();
          opts.onDoubleTap(map.unproject([t.clientX - rect.left, t.clientY - rect.top]));
          lastTap = null;
          e.preventDefault();
        } else {
          lastTap = { x: t.clientX, y: t.clientY, t: now };
        }
      }
    }
    tapStart = null;
  };

  // Capture phase on the outer container, so these run before MapLibre's own handlers.
  container.addEventListener('touchstart', onStart, { capture: true, passive: false });
  container.addEventListener('touchmove', onMove, { capture: true, passive: false });
  container.addEventListener('touchend', onEnd, { capture: true, passive: false });
  container.addEventListener('touchcancel', onEnd, { capture: true, passive: false });

  return () => {
    container.removeEventListener('touchstart', onStart, true);
    container.removeEventListener('touchmove', onMove, true);
    container.removeEventListener('touchend', onEnd, true);
    container.removeEventListener('touchcancel', onEnd, true);
  };
}
