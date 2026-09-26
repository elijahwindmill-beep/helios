import { create } from 'zustand';

/** Progress of the sun-hours heatmap, for the layer panel. */
export const useSunHours = create<{ state: 'idle' | 'working'; progress: number; max: number }>(() => ({ state: 'idle', progress: 0, max: 0 }));
