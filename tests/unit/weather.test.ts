import { describe, expect, it } from 'vitest';
import { assess, dailyForecast, forecastAt, parseForecast, type ForecastEntry } from '../../src/weather/metno';

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

describe('daily forecast', () => {
  const D = Date.parse('2026-09-29T00:00:00Z');
  const hour = (h: number, symbol: string, cloud: number, temperature = 8): ForecastEntry => ({
    time: D + h * H,
    span: H,
    symbol,
    temperature,
    cloud,
    wind: 2,
    precipitation: 0,
  });
  const day = { start: D, end: D + 24 * H, sunrise: D + 6 * H, sunset: D + 18 * H, noon: D + 12 * H };
  const run = (entries: ForecastEntry[]) => dailyForecast({ entries, expires: 0 }, [day])[0];

  it('flags overcast mornings and scores the light', () => {
    const entries = Array.from({ length: 24 }, (_, h) => (h < 11 ? hour(h, 'cloudy', 98, 5) : hour(h, 'clearsky', 5, 12)));
    const d = run(entries)!;
    expect(d.note).toBe('OVERCAST AM');
    expect(d.tempMax).toBe(12);
    expect(d.tempMin).toBe(5);
    expect(d.light).toBeGreaterThan(40);
    expect(d.light).toBeLessThan(60);
  });

  it('a clear day has no note and high light', () => {
    const d = run(Array.from({ length: 24 }, (_, h) => hour(h, 'clearsky', 0)))!;
    expect(d).toMatchObject({ sky: 'clear', note: null, light: 100 });
  });

  it('rain in the afternoon caps the light and shows on the icon', () => {
    const d = run(Array.from({ length: 24 }, (_, h) => (h >= 13 && h < 17 ? hour(h, 'rain', 100) : hour(h, 'partlycloudy', 40))))!;
    expect(d.note).toBe('RAIN PM');
    expect(d.light).toBeLessThanOrEqual(20);
    expect(d.sky).toBe('rain');
  });

  it('days beyond the forecast are null', () => {
    const later = { ...day, start: day.start + 20 * 24 * H, end: day.end + 20 * 24 * H, sunrise: null, sunset: null, noon: day.noon + 20 * 24 * H };
    expect(dailyForecast({ entries: [hour(8, 'clearsky', 0)], expires: 0 }, [later])[0]).toBeNull();
  });
});
