import type { Performance } from '../store/app';

export interface PerformanceSettings {
  label: string;
  hint: string;
  /** The wide shadow mosaic: the view plus 12 km for far mountains. */
  shadows: { maxTilesPerSide: number; maxZoom: number; maxOutputSize: number; steps: number };
  /** Close-up shadows from detailed elevation around the view centre; null = off. */
  detail: { halfSize: number; maxTilesPerSide: number; steps: number } | null;
  /** Most drawing pixels per screen pixel. */
  maxPixelRatio: number;
  /** Blur bands along the control windows and the edge blur over the panels (costly to draw). */
  lensOverPanels: boolean;
  /** Longest side of the sun-hours heatmap, pixels. */
  hoursSize: number;
}

export const PERFORMANCE: Record<Performance, PerformanceSettings> = {
  smooth: {
    label: 'Smooth',
    hint: 'For laptops on battery and phones: sharp shadows only from the wide view, screen drawn at normal resolution, no blur over the panels.',
    shadows: { maxTilesPerSide: 8, maxZoom: 12, maxOutputSize: 1024, steps: 96 },
    detail: null,
    maxPixelRatio: 1,
    lensOverPanels: false,
    hoursSize: 768,
  },
  balanced: {
    label: 'Balanced',
    hint: 'Close-up shadows from detailed elevation about 2 km around the view centre.',
    shadows: { maxTilesPerSide: 10, maxZoom: 12, maxOutputSize: 2048, steps: 160 },
    detail: { halfSize: 1800, maxTilesPerSide: 12, steps: 192 },
    maxPixelRatio: 2,
    lensOverPanels: true,
    hoursSize: 1024,
  },
  detailed: {
    label: 'Detailed',
    hint: 'Close-up shadows about 3 km around the view centre and finer far shadows. Needs a fast graphics card.',
    shadows: { maxTilesPerSide: 14, maxZoom: 13, maxOutputSize: 3072, steps: 256 },
    detail: { halfSize: 3000, maxTilesPerSide: 16, steps: 256 },
    maxPixelRatio: 3,
    lensOverPanels: true,
    hoursSize: 1536,
  },
};

export const PERFORMANCE_ORDER: Performance[] = ['smooth', 'balanced', 'detailed'];
