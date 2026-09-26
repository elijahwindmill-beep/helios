// The viewed moment lives in the URL hash next to MapLibre's view, e.g.
// #map=13.4/46.60068/11.72598/20/62&t=2026-09-26T08:06Z  (UTC, minute precision)

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export function formatUrlTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + 'Z';
}

export function parseUrlTime(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(value)) return null;
  const ms = Date.parse(value.replace('Z', ':00Z'));
  return Number.isFinite(ms) ? ms : null;
}

export function readTimeFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  return parseUrlTime(hashParams().get('t'));
}

export function writeTimeToUrl(ms: number) {
  const params = hashParams();
  params.set('t', formatUrlTime(ms));
  // URLSearchParams would escape the slashes in MapLibre's value; keep the hash readable.
  const hash = '#' + decodeURIComponent(params.toString());
  window.history.replaceState(window.history.state, '', hash);
}
