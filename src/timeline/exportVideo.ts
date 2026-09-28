import { create } from 'zustand';
import { getSunCore, setFlareClock } from '../scene/sunScene';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeVideo } from 'mediabunny';
import type { Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { useTimeline } from '../store/timeline';
import { getMap } from '../map/mapInstance';
import { shadowsBusy } from '../map/shadowLayer';
import { clipDuration } from './model';
import { applyFrame, ensureLift, fillPivotHeights, frameAt, seek } from './runtime';
import { ProResWriter } from './prores';

/**
 * Video export, one frame at a time: for every frame the clip is set to that exact moment,
 * the map waits until tiles and shadows have caught up, and the frame is encoded with its own
 * timestamp. So the video is smooth however slow the computer is. Output: MP4 (H.264) via
 * the browser's video encoder (WebCodecs) and Mediabunny; or the sun scene alone over
 * transparency as ProRes 4444 with alpha (timeline/prores.ts).
 *
 * Motion blur: each frame is the average of several moments spread over the time the shutter
 * is open (shutter angle / 360 of a frame, from the frame's own time), like a film camera.
 */

export interface ExportOptions {
  height: 720 | 1080 | 2160;
  fps: 24 | 30 | 60;
  /** The whole view, or the sun scene alone (sun, paths, ring, labels) over transparency. */
  contents: 'full' | 'sun';
  motionBlur: boolean;
  /** Degrees: 180 is the classic film look, 360 a fully open shutter. */
  shutter: number;
  /** Moments averaged into each frame, 2–30. */
  samples: number;
}

interface ExportState {
  phase: 'idle' | 'dialog' | 'rendering' | 'done' | 'error';
  options: ExportOptions;
  frame: number;
  total: number;
  message: string;
  url: string | null;
  filename: string;
  openDialog(): void;
  close(): void;
  setOptions(o: Partial<ExportOptions>): void;
}

export const useExport = create<ExportState>()((set) => ({
  phase: 'idle',
  options: { height: 1080, fps: 30, contents: 'full', motionBlur: false, shutter: 180, samples: 8 },
  frame: 0,
  total: 0,
  message: '',
  url: null,
  filename: '',
  openDialog: () => set({ phase: 'dialog', message: '' }),
  close: () => set({ phase: 'idle' }),
  setOptions: (o) => set((s) => ({ options: { ...s.options, ...o } })),
}));

let cancelled = false;
export const cancelExport = () => {
  cancelled = true;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the map has drawn everything for the current state (tiles, terrain, shadows). */
async function settle(map: MlMap) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    await Promise.race([
      new Promise<void>((resolve) => {
        map.once('idle', () => resolve());
        map.triggerRepaint();
      }),
      sleep(8000),
    ]);
    if (!shadowsBusy()) {
      // One more frame so the canvas-source shadows and the sun scene show this exact state.
      await new Promise<void>((resolve) => {
        map.once('render', () => resolve());
        map.triggerRepaint();
      });
      return;
    }
    await sleep(40);
  }
}

/** One more drawn frame (the sun scene alone doesn't wait for tiles or shadows). */
const nextRender = (map: MlMap) =>
  new Promise<void>((resolve) => {
    map.once('render', () => resolve());
    map.triggerRepaint();
  });

/** The sun scene alone, over transparency. */
function composeSun(out: CanvasRenderingContext2D, map: MlMap) {
  const W = out.canvas.width;
  const H = out.canvas.height;
  out.clearRect(0, 0, W, H);
  const scene = map.getContainer().querySelector<HTMLCanvasElement>('canvas.sun-scene');
  if (scene) out.drawImage(scene, 0, 0, W, H);
}

/**
 * Motion blur: the frame's moments averaged, in premultiplied alpha so transparent edges
 * blend right.
 */
class Accumulator {
  private sum: Float32Array;
  private n = 0;
  constructor(private ctx: CanvasRenderingContext2D) {
    this.sum = new Float32Array(ctx.canvas.width * ctx.canvas.height * 4);
  }
  reset() {
    this.sum.fill(0);
    this.n = 0;
  }
  add() {
    const d = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height).data;
    const s = this.sum;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      s[i] += d[i] * a;
      s[i + 1] += d[i + 1] * a;
      s[i + 2] += d[i + 2] * a;
      s[i + 3] += a;
    }
    this.n++;
  }
  /** Writes the average back to the canvas. */
  write() {
    const { width, height } = this.ctx.canvas;
    const img = this.ctx.createImageData(width, height);
    const d = img.data;
    const s = this.sum;
    const n = this.n;
    for (let i = 0; i < d.length; i += 4) {
      const a = s[i + 3] / n;
      if (a <= 0) continue;
      const k = 1 / (a * n);
      d[i] = s[i] * k;
      d[i + 1] = s[i + 1] * k;
      d[i + 2] = s[i + 2] * k;
      d[i + 3] = a * 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

/** A tile of grey noise for the film grain. */
function noiseTile(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 11;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = 64 + ((seed / 2147483647) * 128) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * The frame as seen on screen: the map (with the in-map lens), the sun scene on top, then the
 * screen-wide lens effects the app draws over everything: vignette, edge blur and grain.
 */
function compose(out: CanvasRenderingContext2D, map: MlMap, frameIndex: number, cssScale: number, noise: HTMLCanvasElement, tmp: HTMLCanvasElement) {
  const W = out.canvas.width;
  const H = out.canvas.height;
  out.globalCompositeOperation = 'source-over';
  out.globalAlpha = 1;
  out.drawImage(map.getCanvas(), 0, 0, W, H);
  // The sun's core: the map inside its rim as a black-and-white negative (the page does it with a filter).
  const core = getSunCore();
  if (core) {
    out.save();
    out.beginPath();
    core.forEach(([x, y], i) => (i ? out.lineTo(x * cssScale, y * cssScale) : out.moveTo(x * cssScale, y * cssScale)));
    out.closePath();
    out.clip();
    out.filter = 'grayscale(1) invert(1)';
    out.drawImage(map.getCanvas(), 0, 0, W, H);
    out.restore();
  }
  const scene = map.getContainer().querySelector<HTMLCanvasElement>('canvas.sun-scene');
  if (scene) out.drawImage(scene, 0, 0, W, H);

  const app = useApp.getState();
  const k = app.overlays.lens ? app.lensStrength : 0;
  if (k <= 0) return;

  // Edge blur: the frame blurred, kept only toward the edges (fitted ellipse, 80 px feather).
  const t = tmp.getContext('2d')!;
  t.globalCompositeOperation = 'source-over';
  t.clearRect(0, 0, W, H);
  t.filter = `blur(${5 * k * cssScale}px)`;
  t.drawImage(out.canvas, 0, 0);
  t.filter = 'none';
  t.globalCompositeOperation = 'destination-in';
  t.save();
  t.translate(W / 2, H / 2);
  t.scale(1, H / W);
  const r = W / 2;
  const edge = t.createRadialGradient(0, 0, 0, 0, 0, r);
  edge.addColorStop(Math.max(0, 1 - (80 * cssScale) / r), 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  t.fillStyle = edge;
  t.fillRect(-W, -W, 2 * W, 2 * W);
  t.restore();
  out.drawImage(tmp, 0, 0);

  // Vignette.
  out.save();
  out.translate(W / 2, H / 2);
  out.scale(1, H / W);
  const rv = (W / 2) * Math.SQRT2;
  const vig = out.createRadialGradient(0, 0, 0, 0, 0, rv);
  vig.addColorStop(0.48, 'rgba(20,24,29,0)');
  vig.addColorStop(0.72, `rgba(20,24,29,${0.16 * k})`);
  vig.addColorStop(1, `rgba(20,24,29,${0.48 * k})`);
  out.fillStyle = vig;
  out.fillRect(-W, -W, 2 * W, 2 * W);
  out.restore();

  // Grain, moving every frame like film (but the same for the same frame).
  out.save();
  out.globalCompositeOperation = 'overlay';
  out.globalAlpha = 0.18 * k;
  const pattern = out.createPattern(noise, 'repeat')!;
  pattern.setTransform(new DOMMatrix().translate((frameIndex * 7919) % 256, (frameIndex * 104729) % 256));
  out.fillStyle = pattern;
  out.fillRect(0, 0, W, H);
  out.restore();
}

export async function runExport() {
  const map = getMap();
  const ex = useExport.getState();
  const tl = useTimeline.getState();
  const clip = tl.activeClip();
  if (!map || clip.keyframes.length < 2) return;
  const { height, fps, contents, motionBlur, shutter, samples } = ex.options;
  const sunOnly = contents === 'sun';
  const width = Math.round((height * 16) / 9 / 2) * 2;
  const fail = (message: string) => useExport.setState({ phase: 'error', message });

  if (!sunOnly) {
    if (typeof VideoEncoder === 'undefined') return fail("This browser can't encode video. Export works in Chrome, Edge, and Safari 16.4 or newer.");
    if (!(await canEncodeVideo('avc', { width, height, bitrate: QUALITY_HIGH }))) {
      return fail(`This browser or graphics card can't encode ${height}p H.264 video. Try a smaller size.`);
    }
  }
  const gl = map.getCanvas().getContext('webgl2');
  const maxSize = gl ? Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)) : 4096;
  if (width > maxSize) return fail(`The graphics card can draw at most ${maxSize} px wide, too small for ${height}p. Try 1080p.`);

  cancelled = false;
  fillPivotHeights();
  const duration = clipDuration(clip);
  const total = Math.round(duration * fps) + 1;
  const base = (clip.name || 'clip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'clip';
  const filename = sunOnly ? `zenit-${base}-sun-${height}p${fps}-prores4444.mov` : `zenit-${base}-${height}p${fps}.mp4`;
  useExport.setState({ phase: 'rendering', frame: 0, total, message: sunOnly ? 'Loading the ProRes encoder (about 32 MB, the first time)' : '', filename });

  let prores: ProResWriter | null = null;
  if (sunOnly) {
    try {
      prores = await ProResWriter.open(fps);
    } catch (err) {
      return fail(`The ProRes encoder didn't load (it comes from cdn.jsdelivr.net): ${err instanceof Error ? err.message : String(err)}`);
    }
    useExport.setState({ message: '' });
  }
  if (ex.url) URL.revokeObjectURL(ex.url);

  // Size the map to a 16:9 box on screen and draw it at the export resolution.
  const container = map.getContainer();
  const saved = { style: container.getAttribute('style'), ratio: map.getPixelRatio(), playhead: tl.playhead };
  const cssW = Math.min(innerWidth, Math.floor((innerHeight * 16) / 9));
  const cssH = Math.round((cssW * 9) / 16);
  document.documentElement.dataset.exporting = '';
  Object.assign(container.style, { position: 'fixed', width: `${cssW}px`, height: `${cssH}px`, left: `${(innerWidth - cssW) / 2}px`, top: `${(innerHeight - cssH) / 2}px`, right: 'auto', bottom: 'auto' });
  map.setPixelRatio(width / cssW);
  map.resize();
  // Terrain clearance for the export's own map size.
  await ensureLift();

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d', { alpha: sunOnly, willReadFrequently: motionBlur })!;
  const blur = motionBlur ? new Accumulator(ctx) : null;
  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  const noise = noiseTile(256);

  const target = new BufferTarget();
  const output = sunOnly ? null : new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = sunOnly ? null : new CanvasSource(out, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  if (output && source) output.addVideoTrack(source, { frameRate: fps });

  /** Puts the clip at moment t and draws it into the frame canvas. */
  const drawMoment = async (t: number, i: number) => {
    const f = frameAt(t);
    setFlareClock(t);
    if (f) applyFrame(f);
    map.triggerRepaint();
    if (sunOnly) {
      await nextRender(map);
      composeSun(ctx, map);
    } else {
      await settle(map);
      compose(ctx, map, i, width / cssW, noise, tmp);
    }
  };
  const open = (Math.min(360, Math.max(1, shutter)) / 360) / fps;
  const n = Math.round(Math.min(30, Math.max(2, samples)));

  try {
    await output?.start();
    for (let i = 0; i < total; i++) {
      if (cancelled) break;
      if (blur) {
        blur.reset();
        for (let k = 0; k < n && !cancelled; k++) {
          await drawMoment(i / fps + (k / n) * open, i);
          blur.add();
        }
        blur.write();
      } else await drawMoment(i / fps, i);
      // Development only: lets a test look at each finished frame.
      if (import.meta.env.DEV) (window as unknown as { __exportProbe?: (c: HTMLCanvasElement, i: number) => void }).__exportProbe?.(out, i);
      if (prores) await prores.add(out);
      else await source!.add(i / fps, 1 / fps);
      useExport.setState({ frame: i + 1 });
    }
    if (cancelled) {
      await output?.cancel();
      prores?.cancel();
      useExport.setState({ phase: 'idle' });
      return;
    }
    let blob: Blob;
    if (prores) {
      useExport.setState({ message: 'Writing the file' });
      blob = await prores.finish();
    } else {
      await output!.finalize();
      blob = new Blob([target.buffer!], { type: 'video/mp4' });
    }
    const url = URL.createObjectURL(blob);
    useExport.setState({ phase: 'done', url, message: `${(blob.size / 1e6).toFixed(1)} MB` });
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } catch (err) {
    await output?.cancel().catch(() => {});
    prores?.cancel();
    fail(`Export stopped: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (saved.style === null) container.removeAttribute('style');
    else container.setAttribute('style', saved.style);
    delete document.documentElement.dataset.exporting;
    setFlareClock(null);
    map.setPixelRatio(saved.ratio);
    map.resize();
    seek(saved.playhead);
  }
}
