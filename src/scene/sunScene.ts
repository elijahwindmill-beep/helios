import { MercatorCoordinate, type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { sunPosition } from '../sun/position';
import { dayTimes, HORIZON_GEOMETRIC, seasons } from '../sun/times';
import { formatClock, startOfZonedDay, timeZoneAt, zonedToUtc } from '../sun/timezone';
import { solveDateTime, solveTimeOnDay, skyVector, type SkyDirection } from '../sun/solver';
import { EARTH_RADIUS, EYE_HEIGHT_M } from '../map/cameraMath';
import { cameraEye } from '../map/camera';
import { isStanding } from '../store/stand';
import { invert, multiply, pixelRay, raySphere, toScreen, transform, type Mat4, type Vec3 } from './projection';

// The Shadowmap-style sun scene around the pin: compass ring on the ground, today's sun
// path, solstice and equinox paths, the sun with its ray, and labels. It is drawn on a 2D
// canvas over the map, projected with the map's own camera matrix every frame (captured by
// a custom layer), so it moves with the 3D view exactly.
//
// The sky is a dome centred on the pin; a sun direction (azimuth, elevation) sits on it at
// the dome radius. The radius follows the zoom so the ring keeps a steady size on screen,
// unless it's locked to a size in metres: then it behaves like an object in the landscape
// (for camera moves), and the sun and labels scale with it.

// Thin, light lines like Apple Weather's sun chart, with dark glass labels (the Frost HUD).
const AMBER = '#F5A623';
const WHITE = 'rgba(255,255,255,0.9)';
const GLASS = 'rgba(24,29,35,0.72)';
const HUD = '"Barlow Condensed", "Barlow", sans-serif';
/** Soft dark shadow under thin light lines, so they read on snow and bright rock. */
const LINE_SHADOW = 'rgba(8,12,18,0.45)';

/** Tilt-shift blur at the top and bottom edges at full lens strength, CSS pixels. */
const TILT_BLUR_PX = 3;

type Rgba = [number, number, number, number];
const rgba = ([r, g, b, a]: Rgba) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;

/** At eye level the dome surrounds the viewer at this radius, metres: the paths sit in the real sky. */
const EYE_DOME_M = 400;
/** The camera counts as at eye level below this height over the ground (e.g. standing-view keyframes). */
const EYE_LEVEL_M = 15;

/** The sun's apparent diameter, degrees. */
const SUN_DIAMETER_DEG = 0.53;

/** Sun and its reach, in CSS pixels. */
const SUN_HIT_PX = 28;

interface PathPoint {
  t: number;
  dir: Vec3;
}
interface DayPaths {
  key: string;
  today: PathPoint[][];
  rise: PathPoint | null;
  set: PathPoint | null;
  refs: Array<{ label: string; style: 'dash' | 'dot'; dayStart: number; dayEnd: number; runs: PathPoint[][]; apex: PathPoint | null }>;
}

function dirOf(t: number, lat: number, lng: number): Vec3 {
  const s = sunPosition(t, lat, lng);
  return skyVector(s.azimuth, s.elevationTrue);
}

/** The sun's path over a local day, split into runs above the horizon. */
function pathRuns(dayStart: number, dayEnd: number, lat: number, lng: number): PathPoint[][] {
  const runs: PathPoint[][] = [];
  let run: PathPoint[] = [];
  const step = 4 * 60000;
  for (let t = dayStart; t <= dayEnd; t += step) {
    const dir = dirOf(t, lat, lng);
    if (dir[2] >= 0) run.push({ t, dir });
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  // Pin the ends exactly onto the horizon so the path meets the ring.
  return runs.map((r) =>
    r.map((p, i) => (i === 0 || i === r.length - 1) && p.dir[2] < 0.02 ? { t: p.t, dir: [p.dir[0], p.dir[1], 0] as Vec3 } : p),
  );
}

// Where the sun was last drawn on screen (CSS px in the map), for the lens dirt glow.
let lastSunScreen: [number, number] | null = null;
export const getSunScreen = () => lastSunScreen;
// The dome radius last drawn, metres: what "Lock size" freezes.
let lastRadius: number | null = null;
export const getSunSceneRadius = () => lastRadius;

export function installSunScene(map: MlMap): () => void {
  const container = map.getCanvasContainer();
  const canvas = document.createElement('canvas');
  canvas.className = 'sun-scene';
  canvas.setAttribute('aria-hidden', 'true');
  container.insertBefore(canvas, map.getCanvas().nextSibling);
  const ctx = canvas.getContext('2d')!;

  let matrix: Mat4 | null = null;
  let localToClip: Float64Array | null = null;
  let radius = 1000;
  let scale = 1;
  let labelScale = 1;
  /** A font string with its pixel size scaled for a locked scene. */
  const font = (weight: number, px: number) => `${weight} ${Math.round(px * labelScale * 10) / 10}px ${HUD}`;
  const tiltCanvas = document.createElement('canvas');
  /** Where the sun is on screen, for dragging it. */
  let sunScreen: [number, number] | null = null;
  /** The same, only while the sun is mostly in view: where the lens dirt glows. */
  let glareAt: [number, number] | null = null;
  let paths: DayPaths | null = null;
  let yearStarts: { key: string; starts: number[] } | null = null;

  const resize = () => {
    const w = map.getCanvas().clientWidth;
    const h = map.getCanvas().clientHeight;
    const dpr = map.getPixelRatio();
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };
  resize();
  map.on('resize', resize);

  const getPaths = (lat: number, lng: number, time: number, tz: string): DayPaths => {
    const day = dayTimes(time, lat, lng, tz, HORIZON_GEOMETRIC);
    const key = `${lat.toFixed(5)},${lng.toFixed(5)},${tz},${day.dayStart}`;
    if (paths?.key === key) return paths;
    const year = new Date(day.solarNoon).getUTCFullYear();
    const s = seasons(year);
    const north = lat >= 0;
    const refDays = [
      { label: north ? 'Summer solstice' : 'Winter solstice', ms: s.juneSolstice, style: 'dash' as const },
      { label: north ? 'Winter solstice' : 'Summer solstice', ms: s.decemberSolstice, style: 'dash' as const },
      { label: 'Equinox', ms: s.marchEquinox, style: 'dot' as const },
    ];
    paths = {
      key,
      today: pathRuns(day.dayStart, day.dayEnd, lat, lng),
      rise: day.sunrise !== null ? { t: day.sunrise, dir: flat(dirOf(day.sunrise, lat, lng)) } : null,
      set: day.sunset !== null ? { t: day.sunset, dir: flat(dirOf(day.sunset, lat, lng)) } : null,
      refs: refDays.map((r) => {
        const dayStart = startOfZonedDay(r.ms, tz);
        const dayEnd = startOfZonedDay(dayStart + 26 * 3600000, tz);
        const runs = pathRuns(dayStart, dayEnd, lat, lng);
        const all = runs.flat();
        const apex = all.reduce<PathPoint | null>((b, p) => (!b || p.dir[2] > b.dir[2] ? p : b), null);
        return { label: r.label, style: r.style, dayStart, dayEnd, runs, apex };
      }),
    };
    return paths;
  };

  /**
   * How high the terrain's skyline stands toward an azimuth, degrees above the horizontal, as
   * seen from a viewer: walks out along that bearing to 30 km (with the earth's curve and the
   * usual refraction) over the terrain MapLibre has loaded, so it matches the picture.
   */
  let skylineCache: { key: string; angle: number } | null = null;
  const skylineAngle = (lat: number, lng: number, alt: number, azimuth: number): number => {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)},${alt.toFixed(1)},${azimuth.toFixed(2)}`;
    if (skylineCache?.key === key) return skylineCache.angle;
    const a = (azimuth * Math.PI) / 180;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    let best = -Infinity;
    for (let d = 20; d < 30000; d *= 1.06) {
      const pLat = lat + ((d * Math.cos(a)) / EARTH_RADIUS) * (180 / Math.PI);
      const pLng = lng + ((d * Math.sin(a)) / (EARTH_RADIUS * cosLat)) * (180 / Math.PI);
      const h = map.queryTerrainElevation([pLng, pLat]);
      if (h === null || h === undefined) continue;
      best = Math.max(best, (h - (0.87 * d * d) / (2 * EARTH_RADIUS) - alt) / d);
    }
    const angle = Number.isFinite(best) ? (Math.atan(best) * 180) / Math.PI : -90;
    skylineCache = { key, angle };
    return angle;
  };

  // ---- Drawing ----

  const draw = () => {
    const dpr = map.getPixelRatio();
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    sunScreen = null;
    glareAt = null;
    lastSunScreen = null;
    const s = useApp.getState();
    const { compass, sunPath, solstices } = s.overlays;
    if (!matrix || !(compass || sunPath || solstices)) return;

    // Local frame: metres east, north, up from the pin on the ground.
    // MapLibre 6's custom-layer world space is x/y in world pixels at the current zoom
    // (Mercator x 512 x 2^zoom) and z in metres (checked against map.project()).
    const pin = s.pin;
    // At eye level (the standing view) the scene is centred on the viewer instead: the sun and
    // its paths appear where they really are in the sky, the compass ring on the horizon.
    const eye = cameraEye(map);
    const underEye = map.queryTerrainElevation([eye.lng, eye.lat]);
    const eyeLevel = isStanding() || (underEye !== null && eye.altitude - underEye < EYE_LEVEL_M && eye.pitch > 60);
    const at = eyeLevel ? eye : pin;
    const ground = eyeLevel ? eye.altitude : (map.queryTerrainElevation([pin.lng, pin.lat]) ?? 0);
    const origin = MercatorCoordinate.fromLngLat([at.lng, at.lat]);
    const worldSize = 512 * 2 ** map.getZoom();
    const pxPerMeter = origin.meterInMercatorCoordinateUnits() * worldSize;
    const toWorld = [pxPerMeter, 0, 0, 0, 0, -pxPerMeter, 0, 0, 0, 0, 1, 0, origin.x * worldSize, origin.y * worldSize, ground, 1];
    localToClip = multiply(matrix, toWorld);
    const m = localToClip;

    // Ring size: steady on screen, about 30% of the smaller side, or locked in metres.
    const ringPx = Math.max(110, Math.min(240, 0.3 * Math.min(W, H)));
    const mpp = (2 * Math.PI * EARTH_RADIUS * Math.cos((pin.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    radius = eyeLevel ? EYE_DOME_M : (s.sunSceneSize ?? ringPx * mpp);
    lastRadius = radius;
    const R = radius;
    // Locked: the sun, lines and labels grow and shrink with the ring (labels less, to stay legible).
    const zoomScale = s.sunSceneSize && !eyeLevel ? Math.min(3, Math.max(0.3, R / mpp / ringPx)) : 1;
    scale = zoomScale;
    labelScale = Math.min(1.5, Math.max(0.7, Math.sqrt(zoomScale)));

    const P = (v: Vec3) => transform(m, [v[0] * R, v[1] * R, v[2] * R]);
    // Around the viewer, points far off to the side project to huge screen positions: drop them.
    const wMin = eyeLevel ? 0.03 * Math.abs(P(skyVector(eye.bearing, eye.pitch - 90)).w) : 0;
    const S = (v: Vec3) => {
      const c = P(v);
      return c.w > wMin ? toScreen(c, W, H) : null;
    };

    // Polyline through dome points, skipping pieces behind the camera.
    const polyline = (pts: Vec3[], closed = false) => {
      ctx.beginPath();
      let pen = false;
      const list = closed ? [...pts, pts[0]] : pts;
      for (const p of list) {
        const q = S(p);
        if (!q) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
        pen = true;
      }
    };
    const circle = (r: number, n = 120): Vec3[] =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI;
        return [Math.sin(a) * r, Math.cos(a) * r, 0];
      });

    const tz = timeZoneAt(pin.lat, pin.lng);
    const dp = getPaths(pin.lat, pin.lng, s.time, tz);
    // Labels are placed after the lines, most important first, skipping any that would
    // overlap one already placed (after trying a nudge up or down).
    const labels: Array<{ priority: number; draw: () => void }> = [];
    const label = (priority: number, draw: () => void) => labels.push({ priority, draw });
    placed = [];

    // Compass ring on the ground.
    if (compass) {
      const outer = circle(1);
      const inner = circle(0.9);
      const so = outer.map(S);
      const si = inner.map(S);
      if (so.every(Boolean) && si.every(Boolean)) {
        ctx.beginPath();
        so.forEach((q, i) => (i ? ctx.lineTo(q![0], q![1]) : ctx.moveTo(q![0], q![1])));
        ctx.closePath();
        si.forEach((q, i) => (i ? ctx.lineTo(q![0], q![1]) : ctx.moveTo(q![0], q![1])));
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.24)';
        ctx.fill('evenodd');
      }
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      polyline(outer, true);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      polyline(inner, true);
      ctx.stroke();
      for (let deg = 0; deg < 360; deg += 10) {
        const a = (deg * Math.PI) / 180;
        const major = deg % 30 === 0;
        const r0 = major ? 0.9 : 0.94;
        polyline([
          [Math.sin(a) * r0, Math.cos(a) * r0, 0],
          [Math.sin(a), Math.cos(a), 0],
        ]);
        ctx.strokeStyle = major ? 'rgba(20,24,29,0.6)' : 'rgba(20,24,29,0.32)';
        ctx.lineWidth = major ? 0.9 : 0.6;
        ctx.stroke();
        if (major) {
          const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg];
          const q = S([Math.sin(a) * 1.1, Math.cos(a) * 1.1, 0]);
          if (q)
            label(cardinal ? 3 : 1, () =>
              text(q, cardinal ?? String(deg), cardinal ? font(600, 14) : font(500, 11), cardinal ? '#ffffff' : 'rgba(255,255,255,0.78)'),
            );
        }
      }
    }

    // Solstice and equinox paths: dashed and dotted.
    if (solstices) {
      for (const ref of dp.refs) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.setLineDash(ref.style === 'dash' ? [4, 5] : [0.1, 5]);
        ctx.shadowColor = LINE_SHADOW;
        ctx.shadowBlur = 3;
        for (const run of ref.runs) {
          polyline(run.map((p) => p.dir));
          ctx.strokeStyle = 'rgba(255,255,255,0.82)';
          ctx.lineWidth = ref.style === 'dash' ? 0.9 : 1.6;
          ctx.stroke();
        }
        ctx.restore();
        if (ref.apex) {
          const q = S(ref.apex.dir);
          if (q) label(2, () => pill([q[0], q[1] - 14], ref.label, 'rgba(24,29,35,0.55)', '#ffffff', font(500, 12)));
        }
      }
    }

    // Today's path and the sun.
    if (sunPath) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const run of dp.today) {
        const pts = run.map((p) => S(p.dir)).filter((q): q is [number, number] => q !== null);
        if (pts.length < 2) continue;
        // Soft light under a thin warm path that deepens toward sunset.
        polyline(run.map((p) => p.dir));
        ctx.save();
        ctx.strokeStyle = 'rgba(245,166,35,0.35)';
        ctx.lineWidth = 6;
        ctx.filter = 'blur(3px)';
        ctx.stroke();
        ctx.restore();
        const xs = pts.map((q) => q[0]);
        const grad = ctx.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
        grad.addColorStop(0, '#ffd98a');
        grad.addColorStop(0.5, AMBER);
        grad.addColorStop(1, '#ff9a55');
        polyline(run.map((p) => p.dir));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      for (const b of [dp.rise, dp.set]) {
        if (!b) continue;
        const q = S(b.dir);
        if (q) label(8, () => pill(q, formatClock(b.t, tz), GLASS, '#ffd58a', font(600, 12)));
      }

      const sun = sunPosition(s.time, pin.lat, pin.lng);
      const dir = skyVector(sun.azimuth, sun.elevationTrue);
      const aboveHorizon = sun.elevationTrue > -1;
      const groundDir: Vec3 = [dir[0] / Math.hypot(dir[0], dir[1]), dir[1] / Math.hypot(dir[0], dir[1]), 0];

      // Direction on the ground and the ray from the pin to the sun (not at eye level: they'd start in the camera).
      ctx.save();
      if (eyeLevel) ctx.globalAlpha = 0;
      ctx.shadowColor = LINE_SHADOW;
      ctx.shadowBlur = 3;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = WHITE;
      polyline([[0, 0, 0], groundDir]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (aboveHorizon) {
        polyline([[0, 0, 0], dir]);
        ctx.strokeStyle = 'rgba(245,166,35,0.9)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      ctx.restore();

      const az = S([groundDir[0] * 1.02, groundDir[1] * 1.02, 0]);
      if (az) label(6, () => pill(az, `${sun.azimuth.toFixed(1)}°`, GLASS, '#ffffff', font(500, 12)));
      if (aboveHorizon) {
        const el = S([dir[0] * 0.45, dir[1] * 0.45, dir[2] * 0.45]);
        if (el) label(6, () => pill([el[0] + 30, el[1]], `△ ${sun.elevation.toFixed(1)}°`, GLASS, '#ffffff', font(500, 12)));
        const q = S(dir);
        // Hidden from the viewer, or (in the map view) from someone standing at the pin.
        const from = eyeLevel ? eye : { lat: pin.lat, lng: pin.lng, altitude: ground + EYE_HEIGHT_M };
        const below = skylineAngle(from.lat, from.lng, from.altitude, sun.azimuth) - sun.elevationTrue;
        // Behind the ridge once its centre is; the tint cools over the sun's half-degree width.
        const hidden = below > 0;
        const cover = Math.min(1, Math.max(0, below / SUN_DIAMETER_DEG + 0.5));
        if (q) {
          const discR = 8.5 * scale;
          // Always see-through: a glowing crown and a solid glowing rim around an empty disc. Warm
          // in the open, cooling to a cold blue as it slips behind the terrain from the pin (or
          // from you, standing).
          const tint = (warm: Rgba, cold: Rgba) => rgba(warm.map((v, i) => v + (cold[i] - v) * cover) as Rgba);
          const glowR = 40 * scale;
          const glow = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], glowR);
          glow.addColorStop(0, tint([255, 255, 255, 1], [235, 245, 255, 1]));
          glow.addColorStop(0.25, tint([255, 243, 208, 0.9], [190, 215, 250, 0.85]));
          glow.addColorStop(0.6, tint([245, 166, 35, 0.28], [110, 160, 230, 0.28]));
          glow.addColorStop(1, tint([245, 166, 35, 0], [110, 160, 230, 0]));
          ctx.beginPath();
          ctx.arc(q[0], q[1], glowR, 0, 2 * Math.PI);
          ctx.arc(q[0], q[1], discR, 0, 2 * Math.PI, true);
          ctx.fillStyle = glow;
          ctx.fill('evenodd');
          ctx.save();
          ctx.beginPath();
          ctx.arc(q[0], q[1], discR, 0, 2 * Math.PI);
          ctx.strokeStyle = tint([255, 253, 246, 0.95], [225, 238, 255, 0.95]);
          ctx.lineWidth = 1.5 * scale;
          ctx.shadowColor = tint([255, 205, 120, 0.95], [120, 175, 255, 0.95]);
          ctx.shadowBlur = 8 * scale;
          ctx.stroke();
          ctx.stroke();
          ctx.restore();
          // No lens glare from a sun that's mostly behind the terrain; it can always be dragged.
          sunScreen = q;
          if (cover < 0.5) glareAt = q;
          if (hidden) {
            const note = `${formatClock(s.time, tz)} · behind terrain`;
            ctx.font = font(600, 14);
            // Left edge just clear of the sun (the pill is placed by its centre).
            const half = (ctx.measureText(note).width + 14) / 2;
            label(10, () => pill([q[0] + 16 * scale + 6 + half, q[1]], note, GLASS, '#ffffff', font(600, 14)));
          } else label(10, () => pill([q[0] + 36 * labelScale + 8 * scale, q[1]], formatClock(s.time, tz), GLASS, '#ffffff', font(600, 14)));
          const r = 14 * scale;
          placed.push([q[0] - r, q[1] - r, q[0] + r, q[1] + r]); // the sun itself
        }
      }
    }

    labels.sort((a, b) => b.priority - a.priority);
    for (const l of labels) l.draw();
    lastSunScreen = glareAt;

    // Tilt-shift like the map's (scene/lens.ts): blurred toward the top and bottom, sharp in
    // the middle band, so the scene sits at the same focal depth as the terrain under it.
    const k = s.overlays.lens ? s.lensStrength : 0;
    if (k > 0) tiltShift(k, dpr);
  };

  /** sharp × (1 − m) + blurred × m, with m the lens's tilt mask (smoothstep bands). */
  const tiltShift = (k: number, dpr: number) => {
    const w = canvas.width;
    const h = canvas.height;
    if (tiltCanvas.width !== w || tiltCanvas.height !== h) {
      tiltCanvas.width = w;
      tiltCanvas.height = h;
    }
    const t = tiltCanvas.getContext('2d')!;
    const mask = (c: CanvasRenderingContext2D) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      for (const [y, a] of [[0, 0.75], [0.055, 0.63], [0.11, 0.38], [0.165, 0.12], [0.22, 0], [0.78, 0], [0.835, 0.12], [0.89, 0.38], [0.945, 0.63], [1, 0.75]]) {
        g.addColorStop(y, `rgba(0,0,0,${a * k})`);
      }
      return g;
    };
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, w, h);
    t.filter = `blur(${TILT_BLUR_PX * dpr}px)`;
    t.drawImage(canvas, 0, 0);
    t.filter = 'none';
    t.globalCompositeOperation = 'destination-in';
    t.fillStyle = mask(t);
    t.fillRect(0, 0, w, h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = mask(ctx);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(tiltCanvas, 0, 0);
    ctx.restore();
  };

  // Screen boxes of labels drawn this frame: [x0, y0, x1, y1].
  let placed: Array<[number, number, number, number]> = [];
  /** Finds a free spot for a w x h box centred near q (as is, nudged down, nudged up). */
  const place = (q: [number, number], w: number, h: number): [number, number] | null => {
    for (const dy of [0, h + 2, -(h + 2)]) {
      const box: [number, number, number, number] = [q[0] - w / 2, q[1] + dy - h / 2, q[0] + w / 2, q[1] + dy + h / 2];
      if (!placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) {
        placed.push(box);
        return [q[0], q[1] + dy];
      }
    }
    return null;
  };

  const text = (at: [number, number], s: string, font: string, color: string) => {
    ctx.font = font;
    const q = place(at, ctx.measureText(s).width + 4, 14);
    if (!q) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,24,29,0.55)';
    ctx.strokeText(s, q[0], q[1]);
    ctx.fillStyle = color;
    ctx.fillText(s, q[0], q[1]);
  };

  const pill = (at: [number, number], s: string, bg: string, fg: string, font: string) => {
    ctx.font = font;
    const w = ctx.measureText(s).width + 14;
    const h = 20;
    const q = place(at, w, h);
    if (!q) return;
    const x = q[0] - w / 2;
    const y = q[1] - h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, q[0], q[1] + 0.5);
  };

  // ---- The custom layer only borrows the camera matrix each frame ----

  const layer: CustomLayerInterface = {
    id: 'sun-scene',
    type: 'custom',
    renderingMode: '3d',
    render: (_gl, args) => {
      matrix = args.modelViewProjectionMatrix;
      draw();
    },
  };
  map.addLayer(layer);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.time !== prev.time || now.pin !== prev.pin || now.overlays !== prev.overlays || now.sunSceneSize !== prev.sunSceneSize || now.lensStrength !== prev.lensStrength) map.triggerRepaint();
  });

  // ---- Dragging the sun ----

  let dragging: { shift: boolean } | null = null;
  let pending: { x: number; y: number; shift: boolean } | null = null;
  let frame = 0;

  const local = (clientX: number, clientY: number): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const nearSun = (x: number, y: number) => !!sunScreen && Math.hypot(x - sunScreen[0], y - sunScreen[1]) < SUN_HIT_PX * Math.max(1, scale);

  /** Sky direction under a canvas pixel: where the pointer ray meets the dome. */
  const skyAt = (x: number, y: number): SkyDirection | null => {
    if (!localToClip) return null;
    const inv = invert(localToClip);
    if (!inv) return null;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const { origin, dir } = pixelRay(inv, x, y, W, H);
    const R = radius;
    const s = useApp.getState();
    const cur = sunPosition(s.time, s.pin.lat, s.pin.lng);
    const curV = skyVector(cur.azimuth, cur.elevationTrue);
    let hits = raySphere(origin, dir, R);
    if (!hits.length) {
      // Missed the dome: use the point of the ray closest to it.
      const t = -(origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]);
      hits = [[origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t]];
    }
    // The ray crosses the dome twice; keep the crossing nearest the sun's current spot so
    // dragging is continuous whether the sun is on the near or the far side.
    let best = hits[0];
    let bestDot = -Infinity;
    for (const h of hits) {
      const l = Math.hypot(...h);
      const d = (h[0] * curV[0] + h[1] * curV[1] + h[2] * curV[2]) / l;
      if (d > bestDot) {
        bestDot = d;
        best = h;
      }
    }
    const l = Math.hypot(...best);
    return {
      azimuth: ((Math.atan2(best[0], best[1]) * 180) / Math.PI + 360) % 360,
      elevation: (Math.asin(Math.max(-1, Math.min(1, best[2] / l))) * 180) / Math.PI,
    };
  };

  const yearDayStarts = (year: number, tz: string): number[] => {
    const key = `${year},${tz}`;
    if (yearStarts?.key === key) return yearStarts.starts;
    const starts: number[] = [];
    for (let d = 0; d <= 366; d++) {
      const dt = new Date(Date.UTC(year, 0, 1 + d));
      starts.push(zonedToUtc({ year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), hour: 0, minute: 0 }, tz));
    }
    yearStarts = { key, starts };
    return starts;
  };

  const applyDrag = () => {
    frame = 0;
    if (!pending) return;
    const { x, y, shift } = pending;
    pending = null;
    const target = skyAt(x, y);
    if (!target) return;
    const s = useApp.getState();
    const { lat, lng } = s.pin;
    const tz = timeZoneAt(lat, lng);
    let time: number;
    if (shift) {
      // Shift: any date and time of the year.
      const year = new Date(s.time).getUTCFullYear();
      time = solveDateTime(lat, lng, yearDayStarts(year, tz), target, s.time).time;
    } else {
      // Plain drag stays on the current day: only the time changes, however far off the path.
      const day = dayTimes(s.time, lat, lng, tz);
      time = solveTimeOnDay(lat, lng, day.dayStart, day.dayEnd, target).time;
    }
    s.setTime(time);
  };

  const onDown = (e: MouseEvent | TouchEvent) => {
    const pt = 'touches' in e ? (e.touches.length === 1 ? e.touches[0] : null) : e.button === 0 ? e : null;
    if (!pt) return;
    const [x, y] = local(pt.clientX, pt.clientY);
    if (!useApp.getState().overlays.sunPath || !nearSun(x, y)) return;
    dragging = { shift: e.shiftKey };
    e.stopPropagation();
    e.preventDefault();
    map.getCanvas().style.cursor = 'grabbing';
  };
  const onMove = (e: MouseEvent | TouchEvent) => {
    const pt = 'touches' in e ? e.touches[0] : e;
    if (!pt) return;
    const [x, y] = local(pt.clientX, pt.clientY);
    if (!dragging) {
      if (!('touches' in e)) map.getCanvas().style.cursor = nearSun(x, y) ? 'grab' : '';
      return;
    }
    e.preventDefault();
    pending = { x, y, shift: e.shiftKey || dragging.shift };
    if (!frame) frame = requestAnimationFrame(applyDrag);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = null;
    map.getCanvas().style.cursor = '';
  };

  const outer = map.getContainer();
  outer.addEventListener('mousedown', onDown, true);
  outer.addEventListener('touchstart', onDown, { capture: true, passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  // Dev hook for checking the scene from the console.
  if (import.meta.env.DEV) {
    (window as unknown as { __scene: unknown }).__scene = { skyAt, getSunScreen: () => sunScreen, getRadius: () => radius };
  }

  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
    map.off('resize', resize);
    if (map.getLayer('sun-scene')) map.removeLayer('sun-scene');
    canvas.remove();
    outer.removeEventListener('mousedown', onDown, true);
    outer.removeEventListener('touchstart', onDown, true);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
  };
}

/** Flattens a direction onto the horizon (for sunrise/sunset badges on the ring). */
function flat(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l, 0];
}
