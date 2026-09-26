import { useEffect } from 'react';
import { useApp } from '../store/app';
import { useMedia } from './useMedia';

/** Puts the chosen palette on <html data-theme>, following the system when set to auto. */
export function useTheme() {
  const theme = useApp((s) => s.theme);
  const systemDark = useMedia('(prefers-color-scheme: dark)');
  const resolved = theme === 'auto' ? (systemDark ? 'frost' : 'paper') : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'paper' ? '#f4f1ea' : '#1a1f24');
  }, [resolved]);
}
