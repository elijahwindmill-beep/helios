/**
 * Motion blur's averaging: many images of one frame's moments summed and divided, in
 * premultiplied alpha so see-through edges blend right. On the graphics card (half-float
 * sums, so hundreds of faint moments still add up) with a slower CPU fallback.
 */

export interface Average {
  reset(): void;
  add(image: CanvasImageSource): void;
  /** The average so far, as a canvas to draw from. */
  result(): HTMLCanvasElement;
}

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform float k;
in vec2 uv;
out vec4 color;
void main() { color = texture(img, uv) * k; }`;

class GpuAverage implements Average {
  private n = 0;
  private constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
    private prog: WebGLProgram,
    private sum: WebGLTexture,
    private fbo: WebGLFramebuffer,
    private src: WebGLTexture,
  ) {}

  static create(width: number, height: number): GpuAverage | null {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;
    const shader = (type: number, text: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, text);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const texture = (internal: number, format: number, type: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
      return t;
    };
    const sum = texture(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sum, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const src = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    gl.useProgram(prog);
    gl.viewport(0, 0, width, height);
    return new GpuAverage(canvas, gl, prog, sum, fbo, src);
  }

  reset() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.n = 0;
  }

  add(image: CanvasImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    // Canvases come in premultiplied; summing premultiplied colour is what makes alpha average right.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // Canvas rows run top down, GL's bottom up: flip on the way in, draw straight on the way out.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image as TexImageSource);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'k'), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.n++;
  }

  result(): HTMLCanvasElement {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.sum);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'k'), 1 / Math.max(1, this.n));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

class CpuAverage implements Average {
  private sum: Float32Array;
  private n = 0;
  private scratch: CanvasRenderingContext2D;
  private out: HTMLCanvasElement;
  constructor(
    private width: number,
    private height: number,
  ) {
    this.sum = new Float32Array(width * height * 4);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    this.scratch = c.getContext('2d', { willReadFrequently: true })!;
    this.out = document.createElement('canvas');
    this.out.width = width;
    this.out.height = height;
  }
  reset() {
    this.sum.fill(0);
    this.n = 0;
  }
  add(image: CanvasImageSource) {
    this.scratch.clearRect(0, 0, this.width, this.height);
    this.scratch.drawImage(image, 0, 0, this.width, this.height);
    const d = this.scratch.getImageData(0, 0, this.width, this.height).data;
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
  result(): HTMLCanvasElement {
    const g = this.out.getContext('2d')!;
    const img = g.createImageData(this.width, this.height);
    const d = img.data;
    const s = this.sum;
    const n = Math.max(1, this.n);
    for (let i = 0; i < d.length; i += 4) {
      const a = s[i + 3] / n;
      if (a <= 0) continue;
      const k = 1 / (a * n);
      d[i] = s[i] * k;
      d[i + 1] = s[i + 1] * k;
      d[i + 2] = s[i + 2] * k;
      d[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return this.out;
  }
}

export function createAverage(width: number, height: number): Average {
  return GpuAverage.create(width, height) ?? new CpuAverage(width, height);
}
