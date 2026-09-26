import type {
  LayerSpecification,
  SkySpecification,
  StyleSpecification,
} from 'maplibre-gl';
import {
  GLYPHS_URL,
  OPENFREEMAP_URL,
  TERRAIN_ATTRIBUTION,
  TERRAIN_MAXZOOM,
  TERRARIUM_URL,
  type ImageryProvider,
} from './sources';

export type BaseLayer = 'satellite' | 'paper' | 'terrain';
export interface Overlays {
  shadows: boolean;
  contours: boolean;
  labels: boolean;
}

// Paper tokens from the brief / mockup A.
const PAPER = {
  ground: '#F4F1EA',
  ink: '#1F1D1A',
  muted: '#6B665C',
  contour: '#CFC8B7',
  contourMajor: '#BDB6A5',
  water: '#D6DEDF',
  waterLine: '#B9C7CA',
  road: '#E2DCCD',
  roadMajor: '#D5CDB9',
  slate: '#3B4A5A',
};

/**
 * Which base layers each map layer belongs to. Overlay layers are keyed by overlay name
 * instead and show on every base.
 */
const BASE_GROUPS: Record<string, BaseLayer[]> = {
  satellite: ['satellite'],
  'terrain-hillshade': ['terrain'],
  'paper-hillshade': ['paper'],
  glacier: ['paper', 'terrain'],
  water: ['paper', 'terrain'],
  waterway: ['paper', 'terrain'],
  'roads-minor': ['paper', 'terrain'],
  paths: ['paper', 'terrain'],
  'roads-major': ['paper', 'terrain'],
  aerialway: ['paper', 'terrain'],
};

const OVERLAY_GROUPS: Record<string, keyof Overlays> = {
  // Added at runtime by shadowLayer.ts once elevation has loaded.
  shadows: 'shadows',
  'contour-minor': 'contours',
  'contour-major': 'contours',
  'contour-label': 'contours',
  'label-peak': 'labels',
  'label-place': 'labels',
};

/** Visibility of every managed layer for a base + overlay combination. */
export function layerVisibility(base: BaseLayer, overlays: Overlays): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, bases] of Object.entries(BASE_GROUPS)) out[id] = bases.includes(base);
  for (const [id, key] of Object.entries(OVERLAY_GROUPS)) out[id] = overlays[key];
  return out;
}

/** Paint that changes with the base so overlays stay readable on dark imagery. */
export function basePaint(base: BaseLayer): Array<[layer: string, prop: string, value: unknown]> {
  const onImagery = base === 'satellite';
  const labelInk = onImagery ? '#FBFAF7' : PAPER.ink;
  const halo = onImagery ? 'rgba(20,24,29,0.75)' : 'rgba(244,241,234,0.9)';
  return [
    ['background', 'background-color', base === 'terrain' ? '#EFEBE2' : PAPER.ground],
    ['contour-minor', 'line-color', onImagery ? 'rgba(251,250,247,0.22)' : PAPER.contour],
    ['contour-major', 'line-color', onImagery ? 'rgba(251,250,247,0.6)' : PAPER.contourMajor],
    ['contour-label', 'text-color', onImagery ? '#FBFAF7' : PAPER.muted],
    ['contour-label', 'text-halo-color', halo],
    ['label-peak', 'text-color', labelInk],
    ['label-peak', 'text-halo-color', halo],
    ['label-place', 'text-color', labelInk],
    ['label-place', 'text-halo-color', halo],
  ];
}

export function skyFor(base: BaseLayer): SkySpecification {
  if (base === 'satellite') {
    return {
      'sky-color': '#9DB7CF',
      'horizon-color': '#DCE4EA',
      'fog-color': '#DCE4EA',
      'sky-horizon-blend': 0.5,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': 0,
    };
  }
  return {
    'sky-color': '#DCE3E6',
    'horizon-color': PAPER.ground,
    'fog-color': PAPER.ground,
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
    'atmosphere-blend': 0,
  };
}

export function satelliteSource(provider: ImageryProvider, key: string) {
  return { type: 'raster' as const, attribution: provider.attribution, ...provider.source(key) };
}

const NAME = ['coalesce', ['get', 'name'], ['get', 'name_en']] as const;

export function buildStyle(opts: {
  base: BaseLayer;
  overlays: Overlays;
  imagery: ImageryProvider;
  imageryKey: string;
  contourTilesUrl: string;
}): StyleSpecification {
  const { base, overlays, imagery, imageryKey, contourTilesUrl } = opts;
  const visible = layerVisibility(base, overlays);
  const vis = (id: string) => ({ visibility: visible[id] ? ('visible' as const) : ('none' as const) });

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': PAPER.ground } },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: vis('satellite') },
    {
      id: 'terrain-hillshade',
      type: 'hillshade',
      source: 'dem-hillshade',
      layout: vis('terrain-hillshade'),
      paint: {
        'hillshade-method': 'igor',
        'hillshade-exaggeration': 0.6,
        'hillshade-shadow-color': PAPER.slate,
        'hillshade-highlight-color': '#FFFFFF',
        'hillshade-accent-color': '#8A857B',
      },
    },
    {
      id: 'paper-hillshade',
      type: 'hillshade',
      source: 'dem-hillshade',
      layout: vis('paper-hillshade'),
      paint: {
        'hillshade-method': 'igor',
        'hillshade-exaggeration': 0.3,
        'hillshade-shadow-color': PAPER.slate,
        'hillshade-highlight-color': '#FFFFFF',
        'hillshade-accent-color': PAPER.ground,
      },
    },
    {
      id: 'glacier',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'subclass'], 'glacier'],
      layout: vis('glacier'),
      paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.55 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'omt',
      'source-layer': 'water',
      layout: vis('water'),
      paint: { 'fill-color': PAPER.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'omt',
      'source-layer': 'waterway',
      layout: vis('waterway'),
      paint: { 'line-color': PAPER.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 15, 1.4] },
    },
    {
      id: 'roads-minor',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
      minzoom: 12,
      layout: { ...vis('roads-minor'), 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': PAPER.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2] },
    },
    {
      id: 'paths',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
      minzoom: 12,
      layout: vis('paths'),
      paint: {
        'line-color': PAPER.roadMajor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1.4],
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'roads-major',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      layout: { ...vis('roads-major'), 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': PAPER.roadMajor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 16, 4],
      },
    },
    {
      id: 'aerialway',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: ['==', ['get', 'class'], 'aerialway'],
      minzoom: 11,
      layout: vis('aerialway'),
      paint: { 'line-color': PAPER.muted, 'line-width': 0.8, 'line-dasharray': [4, 3] },
    },
    {
      id: 'contour-minor',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      filter: ['==', ['get', 'level'], 0],
      layout: vis('contour-minor'),
      paint: { 'line-color': PAPER.contour, 'line-width': 0.6 },
    },
    {
      id: 'contour-major',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: vis('contour-major'),
      paint: { 'line-color': PAPER.contourMajor, 'line-width': 1.1 },
    },
    {
      id: 'contour-label',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      filter: ['>', ['get', 'level'], 0],
      layout: {
        ...vis('contour-label'),
        'symbol-placement': 'line',
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' m'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
      },
      paint: { 'text-color': PAPER.muted, 'text-halo-color': PAPER.ground, 'text-halo-width': 1.2 },
    },
    {
      id: 'label-place',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet']]],
      layout: {
        ...vis('label-place'),
        'text-field': NAME as unknown as string,
        'text-font': ['Noto Sans Bold'],
        'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 12],
        'text-max-width': 8,
      },
      paint: { 'text-color': PAPER.ink, 'text-halo-color': PAPER.ground, 'text-halo-width': 1.5 },
    },
    {
      id: 'label-peak',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'mountain_peak',
      minzoom: 10,
      layout: {
        ...vis('label-peak'),
        'text-field': [
          'case',
          ['has', 'ele'],
          ['format', NAME, {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.85 }],
          NAME,
        ] as unknown as string,
        'text-font': ['Noto Sans Italic'],
        'text-size': 11,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.3],
      },
      paint: { 'text-color': PAPER.ink, 'text-halo-color': PAPER.ground, 'text-halo-width': 1.5 },
    },
  ];

  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      'dem-terrain': {
        type: 'raster-dem',
        tiles: [TERRARIUM_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: TERRAIN_MAXZOOM,
        attribution: TERRAIN_ATTRIBUTION,
      },
      // A second source over the same tiles: MapLibre warns when terrain and hillshade share one.
      // Capped at z12: the ~30 m data shades as blotchy noise when overzoomed further.
      'dem-hillshade': {
        type: 'raster-dem',
        tiles: [TERRARIUM_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 12,
      },
      contours: { type: 'vector', tiles: [contourTilesUrl], maxzoom: 15 },
      omt: { type: 'vector', url: OPENFREEMAP_URL },
      satellite: satelliteSource(imagery, imageryKey),
    },
    layers,
    terrain: { source: 'dem-terrain', exaggeration: 1 },
    sky: skyFor(base),
  };
  for (const [layer, prop, value] of basePaint(base)) {
    const l = style.layers.find((x) => x.id === layer) as { paint?: Record<string, unknown> };
    l.paint = { ...l.paint, [prop]: value };
  }
  return style;
}
