import { useEffect } from 'react';
import { create } from 'zustand';
import { useApp } from '../store/app';
import { sunPosition } from '../sun/position';
import { assess, fetchForecast, forecastAt, forecastKey, type Assessment, type Forecast, type ForecastAt } from './metno';

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

/** Forecast at the pin for the viewed moment. */
export function useWeather(): Weather {
  const { lat, lng } = useApp((s) => s.pin);
  const time = useApp((s) => s.time);
  const key = forecastKey(lat, lng);
  const state = useForecasts((s) => s.byKey[key]);

  // Wait until the pin settles before asking MET for a new place.
  useEffect(() => {
    const id = setTimeout(() => load(lat, lng), 400);
    return () => clearTimeout(id);
  }, [key]);

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
