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

/** Phone-width layout. Keep in step with the 760px breakpoint in theme.css. */
export const useNarrow = () => useMedia('(max-width: 760px)');

/** True on phones and tablets (a finger is the main pointer). */
export const useTouchDevice = () => useMedia('(pointer: coarse)');
