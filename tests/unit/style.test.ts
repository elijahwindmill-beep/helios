import { describe, expect, it } from 'vitest';
import { buildStyle, layerVisibility } from '../../src/map/style';
import { IMAGERY } from '../../src/map/sources';

describe('base layers', () => {
  const all = { shadows: true, sunPath: true, solstices: true, compass: true, contours: true, labels: true, lightColour: true, routes: true, places: true, photos: true, lens: true };

  it('shows exactly one base at a time', () => {
    const sat = layerVisibility('satellite', all);
    expect(sat.satellite).toBe(true);
    expect(sat['paper-hillshade']).toBe(false);
    expect(sat['terrain-hillshade']).toBe(false);

    const paper = layerVisibility('paper', all);
    expect(paper.satellite).toBe(false);
    expect(paper['paper-hillshade']).toBe(true);
    expect(paper.water).toBe(true);

    const terrain = layerVisibility('terrain', all);
    expect(terrain['terrain-hillshade']).toBe(true);
    expect(terrain.satellite).toBe(false);
  });

  it('overlays toggle independently of the base', () => {
    const v = layerVisibility('satellite', { ...all, contours: false });
    expect(v['contour-minor']).toBe(false);
    expect(v['contour-major']).toBe(false);
    expect(v['label-peak']).toBe(true);
  });

  it('builds a style with 3D terrain and every managed layer', () => {
    const style = buildStyle({
      base: 'paper',
      overlays: all,
      imagery: IMAGERY.esri,
      imageryKey: '',
      contourTilesUrl: 'dem-contour://{z}/{x}/{y}',
    });
    expect(style.terrain?.source).toBe('dem-terrain');
    const ids = style.layers.map((l) => l.id);
    // 'shadows' is added at runtime once elevation loads.
    for (const id of Object.keys(layerVisibility('paper', all))) if (id !== 'shadows') expect(ids).toContain(id);
  });

  it('never puts a MapTiler key in the style unless one is given', () => {
    const src = IMAGERY.maptiler.source('');
    expect(src.url).toContain('key=');
    expect(src.url).not.toMatch(/key=[A-Za-z0-9]/);
  });
});
