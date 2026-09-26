/**
 * MET Norway Locationforecast 2.0 (compact): about 9 days ahead, hourly for the first
 * ~2.5 days and 6-hourly after that. CC BY 4.0, commercial use allowed with attribution.
 * https://api.met.no/weatherapi/locationforecast/2.0/documentation
 */

const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const HOUR = 3600000;

export interface ForecastEntry {
  /** Start of the period this entry describes (UTC ms). */
  time: number;
  /** Length of the period the symbol and precipitation cover (1 h or 6 h). */
  span: number;
  /** MET symbol code without the _day/_night suffix, e.g. "partlycloudy", "lightrainshowers". */
  symbol: string;
  /** °C */
  temperature: number;
  /** % of the sky */
  cloud: number;
  /** m/s */
  wind: number;
  /** mm over the span, when given */
  precipitation: number | null;
}

export interface Forecast {
  entries: ForecastEntry[];
  /** When the forecast should be fetched again (from the Expires header). */
  expires: number;
}

interface MetResponse {
  properties: {
    timeseries: Array<{
      time: string;
      data: {
        instant: { details: { air_temperature?: number; cloud_area_fraction?: number; wind_speed?: number } };
        next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
        next_6_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
      };
    }>;
  };
}

export function parseForecast(json: MetResponse, expires: number): Forecast {
  const entries: ForecastEntry[] = [];
  for (const t of json.properties.timeseries) {
    const next = t.data.next_1_hours ?? t.data.next_6_hours;
    if (!next) continue; // the last entries carry only instant values
    const d = t.data.instant.details;
    entries.push({
      time: Date.parse(t.time),
      span: t.data.next_1_hours ? HOUR : 6 * HOUR,
      symbol: next.summary.symbol_code.replace(/_(day|night|polartwilight)$/, ''),
      temperature: d.air_temperature ?? NaN,
      cloud: d.cloud_area_fraction ?? NaN,
      wind: d.wind_speed ?? NaN,
      precipitation: next.details?.precipitation_amount ?? null,
    });
  }
  return { entries, expires };
}

/** MET asks for at most 4 decimals; 2 (about 1 km) keeps pin nudges from refetching. */
export function forecastKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function fetchForecast(lat: number, lng: number, signal?: AbortSignal): Promise<Forecast> {
  const url = `${ENDPOINT}?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`MET Norway ${res.status}`);
  const expires = Date.parse(res.headers.get('expires') ?? '') || Date.now() + 30 * 60000;
  return parseForecast((await res.json()) as MetResponse, Math.max(expires, Date.now() + 10 * 60000));
}

export type ForecastAt =
  | { kind: 'ok'; entry: ForecastEntry }
  | { kind: 'past' }
  | { kind: 'beyond'; until: number }
  | { kind: 'none' };

/** The entry covering `time`, or why there isn't one. */
export function forecastAt(f: Forecast, time: number): ForecastAt {
  const { entries } = f;
  if (!entries.length) return { kind: 'none' };
  if (time < entries[0].time) return { kind: 'past' };
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.time <= time) return time < e.time + e.span ? { kind: 'ok', entry: e } : { kind: 'beyond', until: e.time + e.span };
  }
  return { kind: 'none' };
}

export type Sky = 'clear' | 'fair' | 'partly' | 'overcast' | 'fog' | 'rain' | 'sleet' | 'snow' | 'thunder';

export interface Assessment {
  sky: Sky;
  /** Plain name, e.g. "Partly cloudy", "Light rain showers". */
  label: string;
  /** Short reason the moment is poor for light and shadows, or null when it's fine. */
  warning: string | null;
}

/** Strong breeze (Beaufort 6) and up: hard to hold a camera or fly a drone. */
export const STRONG_WIND = 10.8;

export function assess(e: ForecastEntry, sunUp: boolean): Assessment {
  const s = e.symbol;
  const named: Record<string, [Sky, string]> = {
    clearsky: ['clear', 'Clear sky'],
    fair: ['fair', 'Fair'],
    partlycloudy: ['partly', 'Partly cloudy'],
    cloudy: ['overcast', 'Overcast'],
    fog: ['fog', 'Fog'],
  };
  let sky: Sky;
  let label: string;
  if (named[s]) {
    [sky, label] = named[s];
  } else {
    const m = /^(light|heavy)?(rain|sleet|snow)(showers)?(andthunder)?$/.exec(s);
    const kind = (m?.[2] ?? 'rain') as 'rain' | 'sleet' | 'snow';
    sky = m?.[4] ? 'thunder' : kind;
    const words = [m?.[1], kind, m?.[3] && 'showers', m?.[4] && 'and thunder'].filter(Boolean).join(' ');
    label = words[0].toUpperCase() + words.slice(1);
  }

  let warning: string | null = null;
  if (sky === 'overcast') warning = sunUp ? "Overcast · shadows won't show" : 'Overcast';
  else if (sky === 'fog') warning = 'Fog · low visibility';
  else if (sky === 'thunder') warning = 'Thunderstorms';
  else if (sky === 'rain' || sky === 'sleet' || sky === 'snow') warning = label;
  if (e.wind >= STRONG_WIND) {
    const wind = `Wind ${Math.round(e.wind * 3.6)} km/h`;
    warning = warning ? `${warning} · ${wind.toLowerCase()}` : `Strong wind · ${Math.round(e.wind * 3.6)} km/h`;
  }
  return { sky, label, warning };
}
