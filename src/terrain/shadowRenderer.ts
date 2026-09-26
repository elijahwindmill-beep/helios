import { EARTH_RADIUS } from '../map/cameraMath';
import { TILE_SIZE } from './demTiles';
import { CURVATURE, PENUMBRA_TAN, stepGrowth, sunDirection, type MarchSettings } from './march';
import type { Mosaic, TileRange } from './mosaic';

// GPU version of march.ts: one fragment per output pixel, each walking toward the sun
// over the height mosaic. Keep the two in step (the close-up grid and output area are GPU-only).
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uDem;
uniform vec2 uDemSize;
// Optional close-up grid of finer heights inside the wide one: where a ray is over it, use it.
uniform sampler2D uFine;
uniform bool uHasFine;
uniform vec2 uFineOrigin;
uniform float uFineScale;
uniform vec2 uFineSize;
// The output covers this part of the wide grid (x, y, width, height in its pixels) …
uniform vec4 uArea;
// … except this rectangle (x0, y0, x1, y1), which another layer draws.
uniform vec4 uHole;
uniform vec2 uOutSize;
uniform vec2 uDir;
uniform float uTanEl;
uniform float uPenumbra;
uniform int uSteps;
uniform float uFirst;
uniform float uGrowth;
uniform float uMaxDist;
uniform float uCurvature;
uniform float uTileY0;
uniform float uWorldTiles;
uniform float uMppEquator;
uniform vec3 uColor;
uniform float uStrength;
// Close-up pass only: the rim width (wide-grid pixels) over which it fades into the wide pass,
// and the wide pass's own march settings for that.
uniform float uBlend;
uniform float uWideFirst;
uniform float uWideGrowth;
uniform int uWideSteps;
out vec4 outColor;

const float PI = 3.141592653589793;

float sampleGrid(sampler2D tex, vec2 size, vec2 p) {
  vec2 f = p - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  ivec2 maxI = ivec2(size) - 1;
  ivec2 a = clamp(ivec2(i), ivec2(0), maxI);
  ivec2 b = clamp(ivec2(i) + 1, ivec2(0), maxI);
  float h00 = texelFetch(tex, ivec2(a.x, a.y), 0).r;
  float h10 = texelFetch(tex, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(tex, ivec2(a.x, b.y), 0).r;
  float h11 = texelFetch(tex, ivec2(b.x, b.y), 0).r;
  return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
}

float heightAt(vec2 p, bool fine) {
  if (fine && uHasFine) {
    vec2 f = (p - uFineOrigin) * uFineScale;
    if (f.x >= 0.5 && f.y >= 0.5 && f.x <= uFineSize.x - 0.5 && f.y <= uFineSize.y - 0.5) return sampleGrid(uFine, uFineSize, f);
  }
  return sampleGrid(uDem, uDemSize, p);
}

/** 0 in full sun … 1 in full shadow: walk toward the sun, track the steepest rise. */
float shade(vec2 p, float mpp, bool fine, float first, float growth, int steps) {
  float h0 = heightAt(p, fine);
  float best = -1e9;
  float d = first;
  for (int i = 0; i < 1024; i++) {
    if (i >= steps || d > uMaxDist) break;
    vec2 q = p + uDir * d;
    if (q.x < 0.0 || q.y < 0.0 || q.x > uDemSize.x || q.y > uDemSize.y) break;
    float dm = d * mpp;
    float hq = heightAt(q, fine) - dm * dm * uCurvature;
    best = max(best, (hq - h0) / dm);
    d *= growth;
  }
  return smoothstep(-uPenumbra, uPenumbra, best - uTanEl);
}

void main() {
  // Output row 0 is the bottom of the canvas; grid row 0 is the north edge.
  vec2 p = uArea.xy + vec2(gl_FragCoord.x, uOutSize.y - gl_FragCoord.y) / uOutSize * uArea.zw;
  if (p.x > uHole.x && p.y > uHole.y && p.x < uHole.z && p.y < uHole.w) {
    outColor = vec4(0.0);
    return;
  }
  float n = PI - 2.0 * PI * (uTileY0 + p.y / ${TILE_SIZE}.0) / uWorldTiles;
  float lat = atan(sinh(n));
  float mpp = uMppEquator * cos(lat);

  float shadow = 1.0;
  if (uTanEl > 0.0) {
    shadow = shade(p, mpp, true, uFirst, uGrowth, uSteps);
    // Close-up pass: fade into exactly what the wide pass draws toward the rim, so the edge
    // between them never shows (nor jumps when the close-up area moves).
    if (uBlend > 0.0) {
      vec2 inset = min(p - uArea.xy, uArea.xy + uArea.zw - p);
      float w = smoothstep(0.0, uBlend, min(inset.x, inset.y));
      if (w < 1.0) shadow = mix(shade(p, mpp, false, uWideFirst, uWideGrowth, uWideSteps), shadow, w);
    }
  }
  float a = shadow * uStrength;
  outColor = vec4(uColor * a, a);
}`;

const VERTEX = `#version 300 es
void main() {
  // One triangle that covers the whole canvas.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export interface ShadowRenderParams {
  azimuth: number;
  /** Geometric sun elevation, degrees. */
  elevation: number;
  /** Shadow colour, 0-1 RGB. */
  color: [number, number, number];
  /** Opacity of full shadow. */
  strength: number;
  /** Longest output side, pixels. */
  maxOutputSize: number;
  steps: number;
  /** How far away a mountain can still cast a shadow, metres. */
  maxDistanceMeters: number;
  /** Draw only the close-up area (the detail grid) instead of the whole wide grid. */
  detail?: boolean;
  /** Tiles of the wide grid to leave empty because the close-up layer covers them. */
  hole?: TileRange | null;
  /** Close-up pass: the wide pass's steps, to fade into it at the rim. */
  wideSteps?: number;
}

export class ShadowRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private dem: WebGLTexture;
  private fine: WebGLTexture;
  private detailMosaic: Mosaic | null = null;
  /** Size of the last pass, in the canvas's bottom-left corner. */
  outW = 0;
  outH = 0;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private mosaic: Mosaic | null = null;
  readonly maxTextureSize: number;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      // MapLibre copies this canvas into its own texture later, outside our draw call.
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
    });
    if (!gl) throw new Error('WebGL2 is not available, so terrain shadows cannot be drawn.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.program = link(gl, VERTEX, FRAGMENT);
    this.dem = gl.createTexture()!;
    this.fine = gl.createTexture()!;
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  private upload(texture: WebGLTexture, m: Mosaic) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, m.width, m.height, 0, gl.RED, gl.FLOAT, m.heights);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setMosaic(m: Mosaic) {
    this.mosaic = m;
    this.upload(this.dem, m);
  }

  /** Finer heights for part of the wide grid (a higher zoom, inside it), or null for none. */
  setDetail(d: Mosaic | null) {
    if (d === this.detailMosaic) return;
    this.detailMosaic = d;
    if (d) this.upload(this.fine, d);
  }

  /** A tile range of another zoom as a rectangle in the wide grid's pixels: x, y, width, height. */
  private rectOf(r: TileRange, m: Mosaic): [number, number, number, number] {
    const k = 2 ** (r.z - m.z);
    return [
      (r.x0 / k - m.x0) * TILE_SIZE,
      (r.y0 / k - m.y0) * TILE_SIZE,
      ((r.x1 - r.x0 + 1) / k) * TILE_SIZE,
      ((r.y1 - r.y0 + 1) / k) * TILE_SIZE,
    ];
  }

  hasMosaic(): boolean {
    return this.mosaic !== null;
  }

  /** Draws the shadow mask for the current mosaic into `canvas`. Returns render time, ms. */
  render(p: ShadowRenderParams): number {
    const m = this.mosaic;
    const d = p.detail ? this.detailMosaic : null;
    if (!m || (p.detail && !d)) return 0;
    const gl = this.gl;
    const t0 = performance.now();
    const area: [number, number, number, number] = d ? this.rectOf(d, m) : [0, 0, m.width, m.height];
    // Output pixels follow the grid being drawn: the close-up one, or the wide one.
    const gridW = d ? d.width : m.width;
    const gridH = d ? d.height : m.height;
    const scale = Math.min(1, p.maxOutputSize / Math.max(gridW, gridH));
    const outW = Math.max(1, Math.round(gridW * scale));
    const outH = Math.max(1, Math.round(gridH * scale));
    // The canvas only grows, so switching between the wide and close-up passes doesn't
    // reallocate it every frame; each pass draws into its bottom-left corner.
    if (this.canvas.width < outW || this.canvas.height < outH) {
      this.canvas.width = Math.max(this.canvas.width, outW);
      this.canvas.height = Math.max(this.canvas.height, outH);
    }
    this.outW = outW;
    this.outH = outH;
    const worldTiles = 2 ** m.z;
    const mppEquator = (2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * worldTiles);
    const midLat = Math.atan(Math.sinh(Math.PI - (2 * Math.PI * (m.y0 + m.height / TILE_SIZE / 2)) / worldTiles));
    const maxDistance = Math.min(
      p.maxDistanceMeters / (mppEquator * Math.cos(midLat)),
      Math.hypot(m.width, m.height),
    );
    // Steps start at 0.7 pixels of the finest grid in use, so slopes facing away shade themselves.
    const fineScale = d ? 2 ** (d.z - m.z) : 1;
    const march: MarchSettings = { steps: p.steps, firstStep: 0.7 / fineScale, maxDistance };
    const [dx, dy] = sunDirection(p.azimuth);
    const hole = p.hole ? this.rectOf(p.hole, m) : null;

    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dem);
    gl.uniform1i(this.u('uDem'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fine);
    gl.uniform1i(this.u('uFine'), 1);
    gl.uniform1i(this.u('uHasFine'), d ? 1 : 0);
    if (d) {
      const [fx, fy] = this.rectOf(d, m);
      gl.uniform2f(this.u('uFineOrigin'), fx, fy);
      gl.uniform1f(this.u('uFineScale'), fineScale);
      gl.uniform2f(this.u('uFineSize'), d.width, d.height);
    }
    gl.uniform4f(this.u('uArea'), ...area);
    if (hole) gl.uniform4f(this.u('uHole'), hole[0], hole[1], hole[0] + hole[2], hole[1] + hole[3]);
    else gl.uniform4f(this.u('uHole'), 0, 0, 0, 0);
    gl.uniform2f(this.u('uDemSize'), m.width, m.height);
    gl.uniform2f(this.u('uOutSize'), outW, outH);
    gl.uniform2f(this.u('uDir'), dx, dy);
    gl.uniform1f(this.u('uTanEl'), p.elevation > 0 ? Math.tan((p.elevation * Math.PI) / 180) : 0);
    gl.uniform1f(this.u('uPenumbra'), PENUMBRA_TAN);
    gl.uniform1i(this.u('uSteps'), march.steps);
    gl.uniform1f(this.u('uFirst'), march.firstStep);
    gl.uniform1f(this.u('uGrowth'), stepGrowth(march));
    gl.uniform1f(this.u('uMaxDist'), march.maxDistance);
    gl.uniform1f(this.u('uCurvature'), CURVATURE);
    gl.uniform1f(this.u('uTileY0'), m.y0);
    gl.uniform1f(this.u('uWorldTiles'), worldTiles);
    gl.uniform1f(this.u('uMppEquator'), mppEquator);
    gl.uniform3f(this.u('uColor'), ...p.color);
    gl.uniform1f(this.u('uStrength'), p.strength);
    if (d) {
      const wide: MarchSettings = { steps: p.wideSteps ?? p.steps, firstStep: 0.7, maxDistance };
      // Fade over the outer 12 % of the close-up area.
      gl.uniform1f(this.u('uBlend'), 0.12 * Math.min(area[2], area[3]));
      gl.uniform1f(this.u('uWideFirst'), wide.firstStep);
      gl.uniform1f(this.u('uWideGrowth'), stepGrowth(wide));
      gl.uniform1i(this.u('uWideSteps'), wide.steps);
    } else gl.uniform1f(this.u('uBlend'), 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Wait for the GPU so the reported time (and the canvas) is final.
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return performance.now() - t0;
  }

  /** Copies the last pass into a 2D canvas of its own size, e.g. a map canvas source. */
  copyTo(target: HTMLCanvasElement) {
    if (target.width !== this.outW || target.height !== this.outH) {
      target.width = this.outW;
      target.height = this.outH;
    }
    const ctx = target.getContext('2d')!;
    ctx.clearRect(0, 0, this.outW, this.outH);
    ctx.drawImage(this.canvas, 0, this.canvas.height - this.outH, this.outW, this.outH, 0, 0, this.outW, this.outH);
  }

  /** The whole last pass as RGBA bytes, bottom row first (shadow amount is in alpha). */
  readMask(): Uint8Array {
    const gl = this.gl;
    const px = new Uint8Array(this.outW * this.outH * 4);
    gl.readPixels(0, 0, this.outW, this.outH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  /** Shadow amount 0-1 at an output pixel (row 0 = north), for checks and tests. */
  readShadow(col: number, rowFromTop: number, strength: number): number {
    const gl = this.gl;
    const px = new Uint8Array(4);
    gl.readPixels(col, this.outH - 1 - rowFromTop, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[3] / 255 / strength;
  }
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}
