import { useApp } from '../store/app';
import { COMPACT_QUERY } from '../ui/useMedia';

/**
 * The lens look is measured in screen pixels, sized for a computer screen: on a phone the same
 * blur, vignette and fringes cover a far larger share of the picture. There it runs at this share.
 */
export const PHONE_LENS = 0.45;

/** 0–1: how strong the lens look is right now (off, the viewer's setting, eased on a phone). */
export function lensStrengthNow(compact = window.matchMedia(COMPACT_QUERY).matches): number {
  const s = useApp.getState();
  if (!s.overlays.lens) return 0;
  return s.lensStrength * (compact ? PHONE_LENS : 1);
}
