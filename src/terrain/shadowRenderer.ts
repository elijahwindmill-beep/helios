import { EARTH_RADIUS } from '../map/cameraMath';
import { TILE_SIZE } from './demTiles';
import { CURVATURE, PENUMBRA_TAN, stepGrowth, sunDirection, type MarchSettings } from './march';
import type { Mosaic } from './mosaic';

// GPU version of march.ts: one fragment per output pixel, each walking toward the sun
// over the height mosaic. Keep the two in step.
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uDem;
uniform vec2 uDemSize;
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
out vec4 outColor;

const float PI = 3.141592653589793;

float heightAt(vec2 p) {
  vec2 f = p - 0.5;
  vec2 i = floor(f);
  vec2 t = f - i;
  ivec2 maxI = ivec2(uDemSize) - 1;
  ivec2 a = clamp(ivec2(i), ivec2(0), maxI);
  ivec2 b = clamp(ivec2(i) + 1, ivec2(0), maxI);
  float h00 = texelFetch(uDem, ivec2(a.x, a.y), 0).r;
  float h10 = texelFetch(uDem, ivec2(b.x, a.y), 0).r;
  float h01 = texelFetch(uDem, ivec2(a.x, b.y), 0).r;
  float h11 = texelFetch(uDem, ivec2(b.x, b.y), 0).r;
  return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
}

void main() {
  // Output row 0 is the bottom of the canvas; mosaic row 0 is the north edge.
  vec2 p = vec2(gl_FragCoord.x, uOutSize.y - gl_FragCoord.y) * (uDemSize / uOutSize);
  float n = PI - 2.0 * PI * (uTileY0 + p.y / ${TILE_SIZE}.0) / uWorldTiles;
  float lat = atan(sinh(n));
  float mpp = uMppEquator * cos(lat);

  float shadow = 1.0;
  if (uTanEl > 0.0) {
    float h0 = heightAt(p);
    float best = -1e9;
    float d = uFirst;
    for (int i = 0; i < 1024; i++) {
      if (i >= uSteps || d > uMaxDist) break;
      vec2 q = p + uDir * d;
      if (q.x < 0.0 || q.y < 0.0 || q.x > uDemSize.x || q.y > uDemSize.y) break;
      float dm = d * mpp;
      float hq = heightAt(q) - dm * dm * uCurvature;
      best = max(best, (hq - h0) / dm);
      d *= uGrowth;
    }
    shadow = smoothstep(-uPenumbra, uPenumbra, best - uTanEl);
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
}

export class ShadowRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private dem: WebGLTexture;
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
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  setMosaic(m: Mosaic) {
    const gl = this.gl;
    this.mosaic = m;
    gl.bindTexture(gl.TEXTURE_2D, this.dem);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, m.width, m.height, 0, gl.RED, gl.FLOAT, m.heights);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  hasMosaic(): boolean {
    return this.mosaic !== null;
  }

  /** Draws the shadow mask for the current mosaic into `canvas`. Returns render time, ms. */
  render(p: ShadowRenderParams): number {
    const m = this.mosaic;
    if (!m) return 0;
    const gl = this.gl;
    const t0 = performance.now();
    const scale = Math.min(1, p.maxOutputSize / Math.max(m.width, m.height));
    const outW = Math.max(1, Math.round(m.width * scale));
    const outH = Math.max(1, Math.round(m.height * scale));
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }
    const worldTiles = 2 ** m.z;
    const mppEquator = (2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * worldTiles);
    const midLat = Math.atan(Math.sinh(Math.PI - (2 * Math.PI * (m.y0 + m.height / TILE_SIZE / 2)) / worldTiles));
    const maxDistance = Math.min(
      p.maxDistanceMeters / (mppEquator * Math.cos(midLat)),
      Math.hypot(m.width, m.height),
    );
    const march: MarchSettings = { steps: p.steps, firstStep: 0.7, maxDistance };
    const [dx, dy] = sunDirection(p.azimuth);

    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dem);
    gl.uniform1i(this.u('uDem'), 0);
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Wait for the GPU so the reported time (and the canvas) is final.
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return performance.now() - t0;
  }

  /** The whole last render as RGBA bytes, bottom row first (shadow amount is in alpha). */
  readMask(): Uint8Array {
    const gl = this.gl;
    const px = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  /** Shadow amount 0-1 at an output pixel (row 0 = north), for checks and tests. */
  readShadow(col: number, rowFromTop: number, strength: number): number {
    const gl = this.gl;
    const px = new Uint8Array(4);
    gl.readPixels(col, this.canvas.height - 1 - rowFromTop, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
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
