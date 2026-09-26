/**
 * How far sea level (the EGM96 geoid) sits above the WGS84 ellipsoid: Google's 3D tiles are
 * placed by ellipsoid height, the map's terrain by height above sea level. A 1° grid of whole
 * metres (NGA EGM96, public domain) in public/egm96-1deg.bin, bilinear: within about a metre.
 * Rows run south to north from -90°, columns east from -180°.
 */
export const GEOID_ROWS = 181;
export const GEOID_COLS = 360;

export function geoidAt(grid: Int8Array, lat: number, lng: number): number {
  const fr = Math.min(GEOID_ROWS - 1, Math.max(0, lat + 90));
  const fc = ((((lng + 180) % 360) + 360) % 360);
  const r0 = Math.min(GEOID_ROWS - 2, Math.floor(fr));
  const c0 = Math.floor(fc);
  const c1 = (c0 + 1) % GEOID_COLS;
  const tr = fr - r0;
  const tc = fc - c0;
  const at = (r: number, c: number) => grid[r * GEOID_COLS + c];
  const south = at(r0, c0) * (1 - tc) + at(r0, c1) * tc;
  const north = at(r0 + 1, c0) * (1 - tc) + at(r0 + 1, c1) * tc;
  return south * (1 - tr) + north * tr;
}

let grid: Promise<Int8Array> | null = null;

export function loadGeoid(): Promise<Int8Array> {
  grid ??= fetch(`${import.meta.env.BASE_URL}egm96-1deg.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`Geoid grid ${r.status}`);
      return r.arrayBuffer();
    })
    .then((b) => new Int8Array(b));
  grid.catch(() => (grid = null));
  return grid;
}
