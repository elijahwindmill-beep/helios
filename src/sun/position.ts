// Sun position from NOAA's solar calculator (Meeus, "Astronomical Algorithms").
// Accurate to about 0.01° for dates 1900-2100, far better than the 1° the brief needs.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Apparent elevation above the horizon, degrees, including atmospheric refraction. */
  elevation: number;
  /** Geometric elevation, degrees, no refraction. Used for shadow casting. */
  elevationTrue: number;
  /** Solar declination, degrees. */
  declination: number;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Declination (deg) and equation of time (minutes) for an instant. */
export function solarCoordinates(ms: number): { declination: number; equationOfTime: number } {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;

  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);

  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;

  const y = Math.tan((eps / 2) * RAD) ** 2;
  const l0 = L0 * RAD;
  const m = M * RAD;
  const eot =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return { declination, equationOfTime: 4 * eot * DEG };
}

/** NOAA's refraction correction, degrees, for a geometric elevation. */
export function refraction(elevation: number): number {
  if (elevation > 85) return 0;
  const te = Math.tan(elevation * RAD);
  let arcsec: number;
  if (elevation > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elevation > -0.575)
    arcsec = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

export function sunPosition(ms: number, lat: number, lng: number): SunPosition {
  const { declination, equationOfTime } = solarCoordinates(ms);
  const minutesUtc = mod(ms / 60000, 1440);
  const trueSolarTime = mod(minutesUtc + equationOfTime + 4 * lng, 1440);
  const hourAngle = trueSolarTime / 4 - 180;

  const phi = lat * RAD;
  const dec = declination * RAD;
  const ha = hourAngle * RAD;
  const cosZenith = Math.min(
    1,
    Math.max(-1, Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)),
  );
  const elevationTrue = 90 - Math.acos(cosZenith) * DEG;
  const azimuth = mod(
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) * DEG + 180,
    360,
  );
  return { azimuth, elevation: elevationTrue + refraction(elevationTrue), elevationTrue, declination };
}
