import type { LngLat, Map as MlMap } from 'maplibre-gl';
import { isStanding } from '../store/stand';

// MapLibre already gives the Google Earth feel for the core gestures:
//   left-drag = pan, right-drag = orbit (x = bearing, y = pitch), wheel = dolly toward cursor.
// This adds the extras from the brief on top.

/** Same rates as MapLibre's own right-drag, so both orbit gestures feel identical. */
const BEARING_PER_PX = 0.8;
const PITCH_PER_PX = 0.5;
/** Alt+wheel: degrees of pitch per wheel pixel. Small on purpose ("fine pitch"). */
const FINE_PITCH_PER_PX = 0.04;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function installCameraControls(
  map: MlMap,
  opts: { onDoubleClick(lngLat: LngLat): void },
): () => void {
  const container = map.getContainer();
  map.doubleClickZoom.disable();
  // Gentler than the default 1/450 so the wheel dolly feels eased rather than steppy.
  map.scrollZoom.setWheelZoomRate(1 / 600);

  // Ctrl/Cmd + left-drag = orbit, for trackpads. Captured on the outer container so
  // MapLibre's pan handler (on the inner canvas container) never sees the drag.
  let orbit: { x: number; y: number } | null = null;
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !(e.metaKey || e.ctrlKey) || isStanding()) return;
    if (!(e.target instanceof HTMLCanvasElement)) return;
    e.stopPropagation();
    e.preventDefault();
    orbit = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!orbit) return;
    const dx = e.clientX - orbit.x;
    const dy = e.clientY - orbit.y;
    orbit = { x: e.clientX, y: e.clientY };
    map.jumpTo({
      bearing: map.getBearing() + dx * BEARING_PER_PX,
      pitch: map.getPitch() - dy * PITCH_PER_PX,
    });
  };
  const onMouseUp = () => {
    orbit = null;
  };

  // Alt + wheel = fine pitch instead of dolly.
  const onWheel = (e: WheelEvent) => {
    if (!e.altKey || isStanding()) return;
    e.stopPropagation();
    e.preventDefault();
    map.jumpTo({ pitch: map.getPitch() - e.deltaY * FINE_PITCH_PER_PX });
  };

  // R and T pressed in quick succession must both land, but a second easeTo cancels the
  // first, so merge the targets while a reset is still animating.
  let reset: { bearing?: number; pitch?: number } = {};
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || isStanding()) return;
    const key = e.key.toLowerCase();
    if (key !== 'r' && key !== 't') return;
    reset = { ...reset, ...(key === 'r' ? { bearing: 0 } : { pitch: 0 }) };
    map.easeTo({ ...reset, duration: 500 });
    map.once('moveend', () => (reset = {}));
  };

  const onDbl = (e: { lngLat: LngLat }) => !isStanding() && opts.onDoubleClick(e.lngLat);

  container.addEventListener('mousedown', onMouseDown, true);
  container.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKey);
  map.on('dblclick', onDbl);

  return () => {
    container.removeEventListener('mousedown', onMouseDown, true);
    container.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKey);
    map.off('dblclick', onDbl);
  };
}
