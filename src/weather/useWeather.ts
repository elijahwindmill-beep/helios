import { useEffect } from 'react';
import { create } from 'zustand';
import { useApp } from '../store/app';
import { sunPosition } from '../sun/position';
import { assess, dailyForecast, fetchForecast, forecastAt, forecastKey, type Assessment, type DaySummary, type DayWindow, type Forecast, type ForecastAt } from './metno';
import { dayTimesCached } from '../sun/dayCache';
import { startOfZonedDay, timeZoneAt } from '../sun/timezone';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ok'; forecast: Forecast };

// Forecasts by rounded place, shared by every component that shows the weather.
const useForecasts = create<{ byKey: Record<string, Load> }>(() => ({ byKey: {} }));
const inFlight = new Set<string>();

function load(lat: number, lng: number) {
  const key = forecastKey(lat, lng);
  const have = useForecasts.getState().byKey[key];
  if (inFlight.has(key)) return;
  if (have?.status === 'ok' && have.forecast.expires > Date.now()) return;
  inFlight.add(key);
  const set = (l: Load) => useForecasts.setState((s) => ({ byKey: { ...s.byKey, [key]: l } }));
  if (!have || have.status !== 'ok') set({ status: 'loading' });
  fetchForecast(lat, lng)
    .then((forecast) => set({ status: 'ok', forecast }))
    .catch(() => {
      if (have?.status !== 'ok') set({ status: 'error' });
    })
    .finally(() => inFlight.delete(key));
}

export type Weather =
  | { status: 'loading' }
  | { status: 'error' }
  | ({ status: 'ok' } & Exclude<ForecastAt, { kind: 'ok' }>)
  | { status: 'ok'; kind: 'ok'; entry: Extract<ForecastAt, { kind: 'ok' }>['entry']; assessment: Assessment };

/** The forecast for the pin, loading it (after the pin settles) when needed. */
function usePinForecast(): Load | undefined {
  const { lat, lng } = useApp((s) => s.pin);
  const key = forecastKey(lat, lng);
  const state = useForecasts((s) => s.byKey[key]);
  // Wait until the pin settles before asking MET for a new place.
  useEffect(() => {
    const id = setTimeout(() => load(lat, lng), 400);
    return () => clearTimeout(id);
  }, [key]);
  return state;
}

/** Forecast at the pin for the viewed moment. */
export function useWeather(): Weather {
  const { lat, lng } = useApp((s) => s.pin);
  const time = useApp((s) => s.time);
  const state = usePinForecast();

  // Also refresh an expired forecast when the viewed time changes.
  useEffect(() => {
    if (state?.status === 'ok' && state.forecast.expires < Date.now()) load(lat, lng);
  }, [time]);

  if (!state || state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error' };
  const at = forecastAt(state.forecast, time);
  if (at.kind !== 'ok') return { status: 'ok', ...at };
  const sunUp = sunPosition(time, lat, lng).elevation > 0;
  return { status: 'ok', kind: 'ok', entry: at.entry, assessment: assess(at.entry, sunUp) };
}

export interface ForecastDay extends DayWindow {
  summary: DaySummary | null;
}

/** The next `count` local days at the pin, starting today, with a daylight summary where the forecast reaches. */
export function useForecastDays(count = 9): { status: Load['status'] | 'loading'; days: ForecastDay[] } {
  const { lat, lng } = useApp((s) => s.pin);
  const state = usePinForecast();
  const timeZone = timeZoneAt(lat, lng);
  const days: DayWindow[] = [];
  let start = startOfZonedDay(Date.now(), timeZone);
  for (let i = 0; i < count; i++) {
    const d = dayTimesCached(start + 12 * 3600000, lat, lng, timeZone);
    days.push({ start: d.dayStart, end: d.dayEnd, sunrise: d.sunrise, sunset: d.sunset, noon: d.solarNoon });
    start = d.dayEnd;
  }
  const summaries = state?.status === 'ok' ? dailyForecast(state.forecast, days) : days.map(() => null);
  return { status: state?.status ?? 'loading', days: days.map((d, i) => ({ ...d, summary: summaries[i] })) };
}
