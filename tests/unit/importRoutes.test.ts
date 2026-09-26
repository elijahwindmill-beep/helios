// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseRouteFile } from '../../src/layers/importRoutes';
import { boundsOf } from '../../src/layers/model';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="46.6007" lon="11.7260"><name>Seceda</name><desc>Top station</desc></wpt>
  <trk><name>Ridge walk</name>
    <trkseg>
      <trkpt lat="46.6000" lon="11.7200"><ele>2400</ele></trkpt>
      <trkpt lat="46.6010" lon="11.7250"><ele>2450</ele></trkpt>
      <trkpt lat="46.6020" lon="11.7300"><ele>2500</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Hut</name><Point><coordinates>11.75,46.59,0</coordinates></Point></Placemark>
  <Placemark><name>Descent</name><LineString><coordinates>11.73,46.60,0 11.74,46.595,0 11.75,46.59,0</coordinates></LineString></Placemark>
</Document></kml>`;

describe('route import', () => {
  it('reads a GPX track and its waypoint', () => {
    const r = parseRouteFile('walk.gpx', GPX);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0].name).toBe('Ridge walk');
    expect(r.routes[0].lines[0]).toEqual([
      [11.72, 46.6],
      [11.725, 46.601],
      [11.73, 46.602],
    ]);
    expect(r.places).toEqual([{ name: 'Seceda', notes: 'Top station', lat: 46.6007, lng: 11.726 }]);
  });

  it('reads KML lines and points', () => {
    const r = parseRouteFile('trip.KML', KML);
    expect(r.routes.map((x) => x.name)).toEqual(['Descent']);
    expect(r.routes[0].lines[0]).toHaveLength(3);
    expect(r.places.map((p) => [p.name, p.lat, p.lng])).toEqual([['Hut', 46.59, 11.75]]);
  });

  it('reads GeoJSON, naming unnamed routes after the file', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[11, 46], [11.1, 46.1]] } },
        { type: 'Feature', properties: { name: 'Loop' }, geometry: { type: 'Polygon', coordinates: [[[11, 46], [11.1, 46], [11.1, 46.1], [11, 46]]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[11, 46]] } },
      ],
    };
    const r = parseRouteFile('plan.geojson', JSON.stringify(fc));
    expect(r.routes.map((x) => x.name)).toEqual(['plan 1', 'Loop']);
    // A bare geometry works too.
    expect(parseRouteFile('line.json', JSON.stringify(fc.features[0].geometry)).routes[0].name).toBe('line');
  });

  it('says plainly what went wrong', () => {
    expect(() => parseRouteFile('bad.geojson', '{nope')).toThrow("bad.geojson isn't valid JSON");
    expect(() => parseRouteFile('bad.gpx', '<gpx><trk>')).toThrow("bad.gpx isn't valid GPX");
    expect(() => parseRouteFile('photo.png', '')).toThrow('use GPX, KML or GeoJSON');
  });

  it('bounds', () => {
    expect(boundsOf([[11, 46], [12, 45.5], [11.5, 47]])).toEqual([11, 45.5, 12, 47]);
    expect(boundsOf([])).toBeNull();
  });
});
