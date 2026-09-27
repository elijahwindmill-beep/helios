import { useState } from 'react';
import { useApp } from '../store/app';
import { getMap } from '../map/mapInstance';
import { parseLatLng } from '../map/cameraMath';
import { useLayers } from '../store/layers';
import { shortPlace } from './parseInput';

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
  return rows.map((r) => {
    const name = r.name || r.display_name.split(',')[0];
    return { name, detail: shortPlace(r.display_name, name), lat: Number(r.lat), lng: Number(r.lon) };
  });
}

/**
 * Photon (komoot's OpenStreetMap search) forgives more, e.g. a missing word or a partial name:
 * asked only when Nominatim finds nothing.
 */
async function searchPhoton(q: string): Promise<Result[]> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data: { features: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }> } = await res.json();
  return data.features.map((f) => {
    const p = f.properties;
    const name = p.name ?? p.city ?? p.state ?? 'Unnamed place';
    return {
      name,
      detail: [name, p.city ?? p.county, p.state, p.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', '),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    };
  });
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
      let found = await searchNominatim(q);
      if (!found.length) found = await searchPhoton(q).catch(() => []);
      setResults(found);
      setStatus(found.length ? '' : 'No places found');
    } catch (err) {
      setResults(null);
      setStatus(err instanceof Error ? err.message : 'Search failed');
    }
  };

  return (
    <div className="search">
      {/* A form, so a phone keyboard's Search key submits it. */}
      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          // Put the phone keyboard away so the results aren't hidden under it.
          e.currentTarget.querySelector('input')?.blur();
          void submit();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          enterKeyHint="search"
          aria-label="Search place or paste lat, lng"
          placeholder="Search a place or paste lat, lng"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setResults(null);
          }}
        />
      </form>
      {(results?.length || status) && (
        <div className="panel search-results" role="listbox" aria-label="Search results">
          {status && <p className="search-status">{status}</p>}
          {results?.map((r, i) => (
            <div key={i} className="result-row">
              <button role="option" aria-selected={false} onClick={() => go(r)}>
                <span className="result-name">{r.name}</span>
                <span className="result-detail">{r.detail}</span>
              </button>
              <button
                className="result-save"
                aria-label={`Save ${r.name} as a place`}
                title="Save as a place"
                onClick={() => {
                  useLayers.getState().addPlaces([{ name: r.name, notes: r.detail, lat: r.lat, lng: r.lng }]);
                  if (!useApp.getState().overlays.places) useApp.getState().toggleOverlay('places');
                  go(r);
                  useLayers.getState().setNotice(`Saved ${r.name} as a place`);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
