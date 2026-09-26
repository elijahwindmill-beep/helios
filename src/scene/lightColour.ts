import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { sunPosition } from '../sun/position';
import { lightGain } from './lightGain';

/**
 * Light colour through the day: as the sun nears the horizon the scene warms like real
 * light (golden hour), then turns the blue of blue hour and dims into night.
 *
 * It's a custom WebGL layer that multiplies everything already drawn by a per-channel gain,
 * like a camera kept at daylight white balance. It sits under the labels, so they stay
 * readable, and it's in the map's own image, so exported frames include it.
 */

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision mediump float;
uniform vec3 u_gain;
out vec4 color;
void main() { color = vec4(u_gain, 1.0); }`;

export function installLightColour(map: MlMap, beforeLayer: string): () => void {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let gainLoc: WebGLUniformLocation | null = null;
  let posLoc = 0;

  const gainNow = (): [number, number, number] | null => {
    const s = useApp.getState();
    if (!s.overlays.lightColour) return null;
    const g = lightGain(sunPosition(s.time, s.pin.lat, s.pin.lng).elevation);
    return g.every((v) => v > 0.995) ? null : g;
  };

  const layer: CustomLayerInterface = {
    id: 'light-colour',
    type: 'custom',
    onAdd(_map, gl) {
      const g = gl as WebGL2RenderingContext;
      const compile = (type: number, src: string) => {
        const sh = g.createShader(type)!;
        g.shaderSource(sh, src);
        g.compileShader(sh);
        if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(sh) ?? 'shader');
        return sh;
      };
      program = g.createProgram()!;
      g.attachShader(program, compile(g.VERTEX_SHADER, VERT));
      g.attachShader(program, compile(g.FRAGMENT_SHADER, FRAG));
      g.linkProgram(program);
      gainLoc = g.getUniformLocation(program, 'u_gain');
      posLoc = g.getAttribLocation(program, 'a_pos');
      buffer = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buffer);
      // One triangle that covers the whole screen.
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    },
    render(gl) {
      const gain = gainNow();
      if (!gain || !program) return;
      const g = gl as WebGL2RenderingContext;
      g.useProgram(program);
      g.bindVertexArray(null); // keep MapLibre's vertex arrays untouched
      g.bindBuffer(g.ARRAY_BUFFER, buffer);
      g.enableVertexAttribArray(posLoc);
      g.vertexAttribPointer(posLoc, 2, g.FLOAT, false, 0, 0);
      g.uniform3fv(gainLoc, gain);
      g.disable(g.DEPTH_TEST);
      g.disable(g.STENCIL_TEST);
      g.disable(g.CULL_FACE);
      g.enable(g.BLEND);
      // result = destination × gain, per channel; alpha untouched.
      g.blendFuncSeparate(g.DST_COLOR, g.ZERO, g.ZERO, g.ONE);
      g.drawArrays(g.TRIANGLES, 0, 3);
      g.disableVertexAttribArray(posLoc);
    },
    onRemove(_map, gl) {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    },
  };
  map.addLayer(layer, beforeLayer);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.time !== prev.time || now.pin !== prev.pin || now.overlays.lightColour !== prev.overlays.lightColour) map.triggerRepaint();
  });

  return () => {
    unsubscribe();
    if (map.getLayer('light-colour')) map.removeLayer('light-colour');
  };
}
