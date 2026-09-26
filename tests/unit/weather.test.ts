import { describe, expect, it } from 'vitest';
import { assess, forecastAt, parseForecast, type ForecastEntry } from '../../src/weather/metno';

const H = 3600000;
const T0 = Date.parse('2026-09-26T10:00:00Z');

function row(hoursFromT0: number, symbol: string | null, step: 1 | 6, instant = { air_temperature: 12, cloud_area_fraction: 10, wind_speed: 2 }) {
  const next = symbol ? { summary: { symbol_code: symbol }, details: { precipitation_amount: 0 } } : undefined;
  return {
    time: new Date(T0 + hoursFromT0 * H).toISOString().replace('.000', ''),
    data: { instant: { details: instant }, ...(step === 1 ? { next_1_hours: next } : { next_6_hours: next }) },
  };
}

// Hourly for 3 h, then 6-hourly, then a last instant-only row (as MET sends it).
const json = {
  properties: {
    timeseries: [
      row(0, 'clearsky_day', 1),
      row(1, 'partlycloudy_day', 1),
      row(2, 'cloudy', 1),
      row(3, 'lightrainshowers_day', 6),
      row(9, 'heavysnowandthunder', 6),
      row(15, null, 6),
    ],
  },
};

describe('MET Norway forecast', () => {
  const f = parseForecast(json, 0);

  it('drops instant-only rows and strips day/night suffixes', () => {
    expect(f.entries.map((e) => e.symbol)).toEqual(['clearsky', 'partlycloudy', 'cloudy', 'lightrainshowers', 'heavysnowandthunder']);
    expect(f.entries.map((e) => e.span / H)).toEqual([1, 1, 1, 6, 6]);
  });

  it('picks the period covering a time', () => {
    const at = (h: number) => forecastAt(f, T0 + h * H);
    expect(at(0.5)).toMatchObject({ kind: 'ok', entry: { symbol: 'clearsky' } });
    expect(at(2)).toMatchObject({ kind: 'ok', entry: { symbol: 'cloudy' } });
    expect(at(8.9)).toMatchObject({ kind: 'ok', entry: { symbol: 'lightrainshowers' } });
    expect(at(14.9)).toMatchObject({ kind: 'ok', entry: { symbol: 'heavysnowandthunder' } });
    expect(at(-2)).toEqual({ kind: 'past' });
    expect(at(40)).toEqual({ kind: 'beyond', until: T0 + 15 * H });
  });

  const entry = (symbol: string, wind = 2): ForecastEntry => ({ time: 0, span: H, symbol, temperature: 10, cloud: 50, wind, precipitation: 0 });

  it('names the sky and warns only when light is poor', () => {
    expect(assess(entry('clearsky'), true)).toEqual({ sky: 'clear', label: 'Clear sky', warning: null });
    expect(assess(entry('partlycloudy'), true).warning).toBeNull();
    expect(assess(entry('cloudy'), true)).toEqual({ sky: 'overcast', label: 'Overcast', warning: "Overcast · shadows won't show" });
    expect(assess(entry('cloudy'), false).warning).toBe('Overcast');
    expect(assess(entry('fog'), true).warning).toBe('Fog · low visibility');
    expect(assess(entry('lightrainshowers'), true)).toEqual({ sky: 'rain', label: 'Light rain showers', warning: 'Light rain showers' });
    expect(assess(entry('heavysnowandthunder'), true)).toMatchObject({ sky: 'thunder', label: 'Heavy snow and thunder', warning: 'Thunderstorms' });
    expect(assess(entry('sleet'), true).sky).toBe('sleet');
  });

  it('warns about strong wind', () => {
    expect(assess(entry('clearsky', 12), true).warning).toBe('Strong wind · 43 km/h');
    expect(assess(entry('cloudy', 12), true).warning).toBe("Overcast · shadows won't show · wind 43 km/h");
    expect(assess(entry('clearsky', 10), true).warning).toBeNull();
  });
});
