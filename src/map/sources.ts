// Every tile source Helios loads, with its attribution and licence notes.
// The About panel and README are generated from / kept in sync with this list.

export type ElevationId = 'mapterhorn' | 'terrarium';

export interface ElevationProvider {
  id: ElevationId;
  label: string;
  note: string;
  attribution: string;
  url: string;
  encoding: 'terrarium';
  tileSize: 256 | 512;
  /** Deepest zoom used for the 3D terrain and hillshade. Past local coverage the service 404s and MapLibre keeps the parent tile. */
  terrainMaxzoom: number;
  hillshadeMaxzoom: number;
  contourMaxzoom: number;
  /** Deepest zoom, in 256 px tile levels, worth loading for the close-up shadow detail; 0 = none. */
  detailZoom: number;
}

export const ELEVATION: Record<ElevationId, ElevationProvider> = {
  mapterhorn: {
    id: 'mapterhorn',
    label: 'Detailed (Mapterhorn)',
    note: 'LiDAR where the region publishes it: South Tyrol 2.5 m, Austria 1 m, Switzerland, Trentino 5 m and more; 30 m (Copernicus) elsewhere.',
    attribution:
      'Terrain: <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a> (South Tyrol, BEV, swisstopo, Copernicus and others)',
    url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
    encoding: 'terrarium',
    tileSize: 512,
    terrainMaxzoom: 15,
    hillshadeMaxzoom: 15,
    // Contours need every tile: past z12 the service 404s outside LiDAR areas.
    contourMaxzoom: 12,
    detailZoom: 16,
  },
  terrarium: {
    id: 'terrarium',
    label: 'Standard (Mapzen, 30 m)',
    note: 'About 30 m everywhere. A fallback if the detailed tiles are slow or down.',
    attribution:
      'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> (AWS Open Data)',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    tileSize: 256,
    // Tiles exist to z15, but the Alps data is ~30 m, so z14 already oversamples it,
    // and the hillshade turns to blotchy noise past z12.
    terrainMaxzoom: 14,
    hillshadeMaxzoom: 12,
    contourMaxzoom: 13,
    detailZoom: 0,
  },
};

export const ELEVATION_ORDER: ElevationId[] = ['mapterhorn', 'terrarium'];

export const OPENFREEMAP_URL = 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export type ImageryId = 'esri' | 'southtyrol' | 'eox' | 'maptiler';

/** 'ok' = fine for monetised videos, 'check' = read the terms first, 'no' = needs a paid licence. */
export type CommercialUse = 'ok' | 'check' | 'no';

export interface ImageryProvider {
  id: ImageryId;
  label: string;
  attribution: string;
  commercial: CommercialUse;
  note: string;
  needsKey: boolean;
  /** MapLibre raster source for this provider. `key` only matters when needsKey. */
  source(key: string): { tiles?: string[]; url?: string; tileSize: number; maxzoom?: number; bounds?: [number, number, number, number] };
}

export const IMAGERY: Record<ImageryId, ImageryProvider> = {
  esri: {
    id: 'esri',
    label: 'Esri World Imagery',
    attribution:
      'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community',
    commercial: 'check',
    note: "Sharp in the Alps. Esri's terms limit use outside ArcGIS, so check them before using frames in paid work.",
    needsKey: false,
    source: () => ({
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    }),
  },
  southtyrol: {
    id: 'southtyrol',
    label: 'South Tyrol aerial 2023 (20 cm)',
    attribution:
      'Imagery: <a href="https://data.civis.bz.it/" target="_blank" rel="noopener">Autonomous Province of Bolzano</a>, orthophoto 2023 (CC0)',
    commercial: 'ok',
    note: "The province's 2023 aerial photos, about 20 cm per pixel: far sharper than the others, and CC0 (free for any use). South Tyrol only (Seceda, Odle, Sella, Tre Cime's north side…); elsewhere the map is blank.",
    needsKey: false,
    source: () => ({
      tiles: [
        'https://geoservices.buergernetz.bz.it/mapproxy/ows?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=p_bz-Orthoimagery:Aerial-2023-RGB&STYLE=default&TILEMATRIXSET=EPSG_3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png',
      ],
      tileSize: 256,
      maxzoom: 20,
      bounds: [10.35, 46.175, 12.525, 47.142],
    }),
  },
  eox: {
    id: 'eox',
    label: 'EOX Sentinel-2 cloudless 2016',
    attribution:
      '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
    commercial: 'no',
    note: 'Cloud-free but soft (10 m). Commercial use needs a paid EOX licence, so not for monetised videos as-is.',
    needsKey: false,
    source: () => ({
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
      tileSize: 256,
      maxzoom: 15,
    }),
  },
  maptiler: {
    id: 'maptiler',
    label: 'MapTiler Satellite (your key)',
    attribution:
      '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a>',
    commercial: 'check',
    note: 'Uses your own MapTiler key, stored only in this browser. Commercial use depends on your MapTiler plan.',
    needsKey: true,
    source: (key) => ({
      url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${encodeURIComponent(key)}`,
      tileSize: 512,
    }),
  },
};

export const IMAGERY_ORDER: ImageryId[] = ['esri', 'southtyrol', 'eox', 'maptiler'];

/** Everything that is not imagery, for the About panel and README. */
export const DATA_SOURCES = [
  {
    name: 'Mapterhorn terrain tiles',
    use: 'Detailed elevation for 3D terrain, shadows, contours and hillshade (South Tyrol 2.5 m DGM CC0, BEV Austria 1 m CC BY 4.0, swisstopo, Copernicus GLO-30 and more)',
    licence: 'Open data from each producer, free incl. commercial with attribution; full list at mapterhorn.com/attribution',
    url: 'https://mapterhorn.com/attribution',
  },
  {
    name: 'Mapzen Terrain Tiles (Terrarium)',
    use: 'Standard elevation (the fallback choice)',
    licence: 'Mixed open licences, free incl. commercial, attribution required',
    url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
  {
    name: 'OpenFreeMap (OpenMapTiles schema)',
    use: 'Water, roads, lifts, peak and place names on Paper and Terrain',
    licence: 'Map data © OpenStreetMap contributors (ODbL), © OpenMapTiles; free incl. commercial',
    url: 'https://openfreemap.org',
  },
  {
    name: 'MET Norway Locationforecast',
    use: 'Weather forecast at the pin, about 9 days ahead',
    licence: 'Data from The Norwegian Meteorological Institute, CC BY 4.0; free incl. commercial with attribution',
    url: 'https://api.met.no/doc/License',
  },
  {
    name: 'Wikimedia Commons',
    use: 'Photo spots: geotagged photos around the view',
    licence: 'Each photo has its own free licence (mostly CC BY / BY-SA, paid use allowed with credit), shown with the photo',
    url: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
  },
  {
    name: 'Google Photorealistic 3D Tiles (optional, your key)',
    use: '3D buildings, trees and rock with photo texture, when switched on in Settings',
    licence: "Google Maps Platform terms: Google's credits shown while on; not in exported videos (Google allows only short promotional clips)",
    url: 'https://developers.google.com/maps/documentation/tile/policies',
  },
  {
    name: 'EGM96 geoid (NGA)',
    use: 'Sea level versus the ellipsoid, to seat the Google 3D tiles on the terrain',
    licence: 'Public domain',
    url: 'https://earth-info.nga.mil/',
  },
  {
    name: 'Nominatim (OpenStreetMap)',
    use: 'Place search',
    licence: 'ODbL data; usage policy of max 1 request per second, no bulk use',
    url: 'https://operations.osmfoundation.org/policies/nominatim/',
  },
] as const;
