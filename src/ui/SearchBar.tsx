import { useState } from 'react';
import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';
import { parseLatLng } from '../map/cameraMath';

interface Result {
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

// Nominatim's usage policy: at most 1 request/second and no search-as-you-type,
// so we only search on Enter.
async function searchNominatim(q: string): Promise<Result[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const rows: Array<{ name: string; display_name: string; lat: string; lon: string }> = await res.json();
  return rows.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    detail: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [status, setStatus] = useState<string>('');

  const go = (r: { lat: number; lng: number; name: string }) => {
    useApp.getState().setPin(r);
    getMap()?.flyTo({ center: [r.lng, r.lat], zoom: Math.max(getMap()!.getZoom(), 13), duration: 2500 });
    setResults(null);
    setStatus('');
  };

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    const coords = parseLatLng(q);
    if (coords) return go({ ...coords, name: '' });
    setStatus('Searching…');
    try {
      const found = await searchNominatim(q);
      setResults(found);
      setStatus(found.length ? '' : 'No places found');
    } catch (err) {
      setResults(null);
      setStatus(err instanceof Error ? err.message : 'Search failed');
    }
  };

  return (
    <div className="search">
      <label className="search-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          aria-label="Search place or paste lat, lng"
          placeholder="Search a place or paste lat, lng"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setResults(null);
          }}
        />
      </label>
      {(results?.length || status) && (
        <div className="panel search-results" role="listbox" aria-label="Search results">
          {status && <p className="search-status">{status}</p>}
          {results?.map((r, i) => (
            <button key={i} role="option" aria-selected={false} onClick={() => go(r)}>
              <span className="result-name">{r.name}</span>
              <span className="result-detail">{r.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
