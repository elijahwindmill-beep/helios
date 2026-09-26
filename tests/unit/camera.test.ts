import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS,
  cameraPosition,
  formatHeight,
  normalizeBearing,
  parseLatLng,
  parseReadoutNumber,
  zoomForHeight,
} from '../../src/map/cameraMath';

describe('camera position', () => {
  // fov 2*atan(1/3) makes cameraToCenterDistance exactly 3 * half the viewport height.
  const fov = (2 * Math.atan(1 / 3) * 180) / Math.PI;
  const base = { lat: 0, lng: 0, zoom: 10, bearing: 0, centerElevation: 0, fov, viewportHeight: 900 };
  const metersPerPx = (2 * Math.PI * EARTH_RADIUS) / (512 * 2 ** 10);
  const distance = 1350 * metersPerPx;

  it('looking straight down, the camera is right above the centre', () => {
    const cam = cameraPosition({ ...base, pitch: 0 });
    expect(cam.altitude).toBeCloseTo(distance, 3);
    expect(cam.lat).toBeCloseTo(0, 9);
    expect(cam.lng).toBeCloseTo(0, 9);
  });

  it('tilted and facing north, the camera sits south of the centre and lower', () => {
    const cam = cameraPosition({ ...base, pitch: 60, centerElevation: 1000 });
    expect(cam.altitude).toBeCloseTo(1000 + distance / 2, 3);
    const southMeters = (-cam.lat * Math.PI * EARTH_RADIUS) / 180;
    expect(southMeters).toBeCloseTo(distance * Math.sin(Math.PI / 3), 2);
    expect(cam.lng).toBeCloseTo(0, 9);
  });

  it('facing east, the camera sits west of the centre', () => {
    const cam = cameraPosition({ ...base, pitch: 45, bearing: 90 });
    expect(cam.lng).toBeLessThan(0);
    expect(cam.lat).toBeCloseTo(0, 9);
  });
});

describe('camera math', () => {
  it('normalizes bearings into [0, 360)', () => {
    expect(normalizeBearing(-20)).toBe(340);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(725)).toBe(5);
  });

  it('halving the height adds one zoom level', () => {
    expect(zoomForHeight(12, 2000, 1000)).toBeCloseTo(13);
    expect(zoomForHeight(12, 2000, 4000)).toBeCloseTo(11);
    // Nonsense input keeps the current zoom rather than jumping.
    expect(zoomForHeight(12, 0, 1000)).toBe(12);
    expect(zoomForHeight(12, 1000, -5)).toBe(12);
  });

  it('formats heights', () => {
    expect(formatHeight(849.6)).toBe('850 m');
    expect(formatHeight(12345)).toBe('12.3 km');
  });

  it('parses typed readout values', () => {
    expect(parseReadoutNumber('46.6')).toBe(46.6);
    expect(parseReadoutNumber('46,6°')).toBe(46.6);
    expect(parseReadoutNumber('1.2 km')).toBe(1200);
    expect(parseReadoutNumber('850 m')).toBe(850);
    expect(parseReadoutNumber('-12')).toBe(-12);
    expect(parseReadoutNumber('abc')).toBeNull();
  });

  it('parses pasted lat, lng', () => {
    expect(parseLatLng('46.60068, 11.72598')).toEqual({ lat: 46.60068, lng: 11.72598 });
    expect(parseLatLng('46.60068 11.72598')).toEqual({ lat: 46.60068, lng: 11.72598 });
    expect(parseLatLng('Seceda')).toBeNull();
    expect(parseLatLng('100, 11')).toBeNull();
  });
});
