import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { lensStrengthNow } from './lensStrength';
import { useApp } from '../store/app';
import { getSunScreen } from './sunScene';

/**
 * The lens look, drawn into the map image itself as the last layer (so exported frames carry
 * it): soft chromatic aberration, tilt-shift blur at the top and bottom, lens dirt that lights
 * up near the sun, dust specks, and a little frost in the corners.
 *
 * Everything is in screen space and sized in CSS pixels, so it looks the same at any zoom.
 * The vignette, edge blur and grain sit over the whole screen instead (ui/LensOverlay.tsx).
 */

/** Strength 1 values, from the approved mockup. */
const CA_PX = 1.2; // red/blue offset
const CA_GAIN = 3.5; // lifts the blurred fringes back to visible
const DIRT = 0.35;
const TILT = 0.75;
const FROST = 0.22;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const DOWNSAMPLE = `#version 300 es
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o;
void main() {
  // Four bilinear taps cover a 4 x 4 block of source pixels.
  o = 0.25 * (texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)) + texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)) +
              texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)) + texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)));
}`;

// Colour fringes: where the red channel shifted right and the blue left differ from the
// picture. Averaged over each 4 x 4 block so thin edges aren't missed, stored around 0.5.
const FRINGE = `#version 300 es
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_ca;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 sum = vec2(0.0);
  vec2 shift = vec2(u_ca * u_texel.x, 0.0);
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      vec2 uv = v_uv + u_texel * vec2(float(i) - 1.5, float(j) - 1.5);
      vec3 c = texture(u_src, uv).rgb;
      sum += vec2(texture(u_src, uv - shift).r - c.r, texture(u_src, uv + shift).b - c.b);
    }
  }
  vec2 f = sum / 16.0;
  o = vec4(0.5 + 0.5 * f.x, 0.5, 0.5 + 0.5 * f.y, 1.0);
}`;

const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_step;
in vec2 v_uv;
out vec4 o;
void main() {
  // Nine-tap Gaussian from five linear samples.
  o = texture(u_src, v_uv) * 0.2270270270;
  o += (texture(u_src, v_uv + u_step * 1.3846153846) + texture(u_src, v_uv - u_step * 1.3846153846)) * 0.3162162162;
  o += (texture(u_src, v_uv + u_step * 3.2307692308) + texture(u_src, v_uv - u_step * 3.2307692308)) * 0.0702702703;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform sampler2D u_blur;
uniform sampler2D u_fringe;
uniform sampler2D u_dust;
uniform float u_gain;
uniform float u_tilt;
uniform float u_dirt;
uniform float u_frost;
uniform vec2 u_sun;
uniform float u_sunOn;
uniform float u_aspect;
in vec2 v_uv;
out vec4 o;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 c = texture(u_src, v_uv).rgb;

  // Tilt-shift: sharp through most of the frame, softening only near the top and bottom edges.
  float y = v_uv.y;
  float tilt = max(smoothstep(0.78, 1.0, y), smoothstep(0.22, 0.0, y));
  c = mix(c, texture(u_blur, v_uv).rgb, tilt * u_tilt);

  // Soft chromatic aberration.
  vec4 f = texture(u_fringe, v_uv);
  c.r += u_gain * (f.r - 0.5) * 2.0;
  c.b += u_gain * (f.b - 0.5) * 2.0;

  // Lens dirt and dust, lit near the sun (screen blend); barely there elsewhere, so no haze.
  vec2 p = v_uv * vec2(u_aspect, 1.0);
  float blot = smoothstep(0.56, 0.82, fbm(p * 2.6 + 3.1));
  vec2 d = (v_uv - u_sun) * vec2(u_aspect, 1.0);
  float light = mix(0.03, 1.0, u_sunOn * exp(-dot(d, d) * 3.5));
  vec3 flare = vec3(1.0, 0.95, 0.86) * (blot * 0.45 + texture(u_dust, v_uv).a) * light * u_dirt;
  c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - flare);

  // Frost creeping in at the corners.
  float corner = smoothstep(1.0, 1.42, length((v_uv - 0.5) * 2.0));
  float crystals = smoothstep(0.42, 0.78, fbm(p * 11.0));
  c = mix(c, vec3(0.9, 0.95, 1.0), corner * crystals * u_frost);

  o = vec4(c, 1.0);
}`;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

/** Dust on the lens: small bright specks, a few soft out-of-focus discs and fibres. */
function dustCanvas(w: number, h: number, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const count = Math.round(((w * h) / (scale * scale)) / 16000);
  for (let i = 0; i < count; i++) {
    const soft = rnd() < 0.2;
    const x = rnd() * w;
    const y = rnd() * h;
    if (soft) {
      const r = (3 + rnd() * 8) * scale;
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.07})`;
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 0.6 * scale;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
      g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.35})`;
      g.beginPath();
      g.arc(x, y, (0.4 + rnd() * 1.1) * scale, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.2)';
  g.lineWidth = 0.6 * scale;
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 14 * scale, y - 6 * scale, x + 22 * scale, y + 4 * scale, x + 34 * scale, y - 2 * scale);
    g.stroke();
  }
  return c;
}

export function installLens(map: MlMap): () => void {
  let gl: WebGL2RenderingContext;
  const programs: Record<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }> = {};
  let buffer: WebGLBuffer | null = null;
  let src: WebGLTexture | null = null;
  let dust: WebGLTexture | null = null;
  let targets: Target[] = []; // quarter size: blur, blur temp, fringe, fringe temp
  let size = [0, 0];
  let broken = false;

  const strength = () => lensStrengthNow();

  const compile = (frag: string, uniforms: string[]) => {
    const make = (type: number, text: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, text);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'lens shader');
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, make(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'lens program');
    return { p, u: Object.fromEntries(uniforms.map((n) => [n, gl.getUniformLocation(p, n)])) };
  };

  const texture = (w: number, h: number) => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  const resize = (w: number, h: number) => {
    for (const t of targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    if (src) gl.deleteTexture(src);
    if (dust) gl.deleteTexture(dust);
    src = texture(w, h);
    const qw = Math.max(1, Math.ceil(w / 4));
    const qh = Math.max(1, Math.ceil(h / 4));
    targets = [0, 1, 2, 3].map(() => {
      const tex = texture(qw, qh);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    });
    dust = texture(1, 1);
    gl.bindTexture(gl.TEXTURE_2D, dust);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, dustCanvas(Math.ceil(w / 2), Math.ceil(h / 2), devicePixelRatio / 2));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    size = [w, h];
  };

  const layer: CustomLayerInterface = {
    id: 'lens',
    type: 'custom',
    onAdd(_map, context) {
      gl = context as WebGL2RenderingContext;
      try {
        programs.down = compile(DOWNSAMPLE, ['u_src', 'u_texel']);
        programs.fringe = compile(FRINGE, ['u_src', 'u_texel', 'u_ca']);
        programs.blur = compile(BLUR, ['u_src', 'u_step']);
        programs.comp = compile(COMPOSITE, ['u_src', 'u_blur', 'u_fringe', 'u_dust', 'u_gain', 'u_tilt', 'u_dirt', 'u_frost', 'u_sun', 'u_sunOn', 'u_aspect']);
      } catch (err) {
        console.warn('Lens look unavailable:', err);
        broken = true;
        return;
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    },
    render() {
      const k = strength();
      if (broken || k <= 0) return;
      const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (w !== size[0] || h !== size[1]) resize(w, h);
      const qw = Math.ceil(w / 4);
      const qh = Math.ceil(h / 4);
      const dpr = w / map.getCanvas().clientWidth;

      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);

      // The frame so far.
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);

      const pass = (prog: (typeof programs)[string], out: Target, input: WebGLTexture, set: () => void) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
        gl.viewport(0, 0, qw, qh);
        gl.useProgram(prog.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.uniform1i(prog.u.u_src, 0);
        set();
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const [blurA, blurB, fringeA, fringeB] = targets;
      pass(programs.down, blurA, src!, () => gl.uniform2f(programs.down.u.u_texel, 1 / w, 1 / h));
      pass(programs.fringe, fringeA, src!, () => {
        gl.uniform2f(programs.fringe.u.u_texel, 1 / w, 1 / h);
        gl.uniform1f(programs.fringe.u.u_ca, CA_PX * dpr * k);
      });
      // Two blur rounds: roughly a 10 px Gaussian on screen, like the mockup's softened fringes.
      for (let round = 0; round < 2; round++) {
        for (const [from, tmp] of [
          [blurA, blurB],
          [fringeA, fringeB],
        ] as const) {
          pass(programs.blur, tmp, from.tex, () => gl.uniform2f(programs.blur.u.u_step, 1 / qw, 0));
          pass(programs.blur, from, tmp.tex, () => gl.uniform2f(programs.blur.u.u_step, 0, 1 / qh));
        }
      }

      // Composite back onto the map's own framebuffer.
      const sun = getSunScreen();
      const css = map.getCanvas();
      const c = programs.comp;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, w, h);
      gl.useProgram(c.p);
      [src!, blurA.tex, fringeA.tex, dust!].forEach((t, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
      });
      gl.uniform1i(c.u.u_src, 0);
      gl.uniform1i(c.u.u_blur, 1);
      gl.uniform1i(c.u.u_fringe, 2);
      gl.uniform1i(c.u.u_dust, 3);
      gl.uniform1f(c.u.u_gain, CA_GAIN);
      gl.uniform1f(c.u.u_tilt, TILT * k);
      gl.uniform1f(c.u.u_dirt, DIRT * k);
      gl.uniform1f(c.u.u_frost, FROST * k);
      gl.uniform2f(c.u.u_sun, sun ? sun[0] / css.clientWidth : 0.5, sun ? 1 - sun[1] / css.clientHeight : 0.5);
      gl.uniform1f(c.u.u_sunOn, sun ? 1 : 0);
      gl.uniform1f(c.u.u_aspect, w / h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
    onRemove() {
      for (const t of targets) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      if (src) gl.deleteTexture(src);
      if (dust) gl.deleteTexture(dust);
      if (buffer) gl.deleteBuffer(buffer);
      for (const p of Object.values(programs)) gl.deleteProgram(p.p);
    },
  };
  map.addLayer(layer);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.overlays.lens !== prev.overlays.lens || now.lensStrength !== prev.lensStrength) map.triggerRepaint();
  });
  return () => {
    unsubscribe();
    if (map.getLayer('lens')) map.removeLayer('lens');
  };
}
