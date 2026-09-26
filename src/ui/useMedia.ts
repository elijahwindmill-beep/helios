import { useSyncExternalStore } from 'react';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
  );
}

/**
 * Compact (phone) layout: portrait phones, and phones on their side (short screens).
 * Keep in step with the breakpoints in theme.css.
 */
export const COMPACT_QUERY = '(max-width: 760px), (max-height: 500px) and (orientation: landscape)';
export const useNarrow = () => useMedia(COMPACT_QUERY);

/** True on phones and tablets (a finger is the main pointer). */
export const useTouchDevice = () => useMedia('(pointer: coarse)');
