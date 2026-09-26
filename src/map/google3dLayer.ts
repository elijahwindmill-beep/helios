import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  LinearSRGBColorSpace,
  MeshBasicMaterial,
  NoColorSpace,
  PerspectiveCamera,
  Scene,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { useGoogle3d } from '../store/google3d';
import { multiply } from '../scene/projection';
import { cameraPosition } from './cameraMath';
import { shadowImages, type ShadowImage } from './shadowLayer';
import { ecefToGeodetic, enuAxes, geodeticToEcef, MercatorFrame, mercatorX, mercatorY, type Geodetic } from './earthFrame';
import { geoidAt, loadGeoid } from './geoid';

/**
 * Google Photorealistic 3D Tiles drawn into the map with three.js (3d-tiles-renderer), with the
 * viewer's own key. Each tile is moved once, when it loads, from Earth-centred coordinates onto
 * MapLibre's Web Mercator world at its height above sea level, so it sits on the terrain, pin
 * and sun scene. It hides the map surface it covers, so the cast shadows (or sun hours) are
 * painted onto it. Left out of video exports: Google only allows short promotional clips.
 */

export const GOOGLE_3D_LAYER = 'google-3d';
const RAD = Math.PI / 180;
/** Screen-space error the tiles refine to, in pixels: lower is sharper and heavier. */
const ERROR_TARGET = { smooth: 32, balanced: 20, detailed: 12 } as const;

interface ShadowSlot {
  texture: CanvasTexture;
  rect: { value: Vector4 };
  opacity: { value: number };
}

function shadowSlot(): ShadowSlot {
  const texture = new CanvasTexture(document.createElement('canvas'));
  // Row 0 of the shadow canvases is north, the smallest local y.
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = LinearFilter;
  return { texture, rect: { value: new Vector4(0, 0, 0, 0) }, opacity: { value: 1 } };
}

export async function addGoogleTiles(map: MlMap, beforeLayer: string, source: { key?: string; url?: string }): Promise<() => void> {
  const geoid = await loadGeoid();
  const center = map.getCenter();
  const frame = new MercatorFrame(center.lat, center.lng);

  const wide = shadowSlot();
  const detail = shadowSlot();
  const uniforms = {
    uWide: { value: wide.texture as Texture },
    uWideRect: wide.rect,
    uWideOpacity: wide.opacity,
    uDetail: { value: detail.texture as Texture },
    uDetailRect: detail.rect,
    uDetailOpacity: detail.opacity,
  };

  // Paint the shadow images onto the tile photos by where each pixel lies on the map.
  const paintShadows = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHeliosXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeliosXY = transformed.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vHeliosXY;
uniform sampler2D uWide;
uniform vec4 uWideRect;
uniform float uWideOpacity;
uniform sampler2D uDetail;
uniform vec4 uDetailRect;
uniform float uDetailOpacity;
vec4 heliosShade(sampler2D tex, vec4 rect, vec2 p) {
  if (rect.z <= 0.0) return vec4(0.0);
  vec2 uv = (p - rect.xy) / rect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(tex, uv);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
{
  vec4 s = heliosShade(uWide, uWideRect, vHeliosXY);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, s.rgb, s.a * uWideOpacity);
  s = heliosShade(uDetail, uDetailRect, vHeliosXY);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, s.rgb, s.a * uDetailOpacity);
}`,
      );
  };

  /** Unlit, both sides (the move to map axes mirrors the winding), colours passed straight through like the map's. */
  const prepareMaterial = (m: Material): Material => {
    const src = m as Material & { map?: Texture | null; color?: Color };
    const basic = m instanceof MeshBasicMaterial ? m : new MeshBasicMaterial({ map: src.map ?? null, color: src.color, transparent: m.transparent, opacity: m.opacity });
    if (basic.map) basic.map.colorSpace = NoColorSpace;
    basic.side = DoubleSide;
    basic.onBeforeCompile = paintShadows;
    basic.customProgramCacheKey = () => 'helios-google-3d';
    basic.needsUpdate = true;
    return basic;
  };

  // Re-project every tile as it loads: Earth-centred metres → local map frame (see earthFrame.ts).
  const mercatorPlugin = {
    name: 'HELIOS_MERCATOR',
    processTileModel(scene: Object3D) {
      scene.updateMatrixWorld(true);
      const v = new Vector3();
      const g: Geodetic = { lat: 0, lng: 0, height: 0 };
      const done = new Set<BufferGeometry>();
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || done.has(mesh.geometry)) return;
        done.add(mesh.geometry);
        const position = mesh.geometry.getAttribute('position');
        const out = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          ecefToGeodetic(v.x, v.y, v.z, g);
          frame.write(g.lat, g.lng, g.height - geoidAt(geoid, g.lat, g.lng), out, i * 3);
        }
        mesh.geometry.setAttribute('position', new BufferAttribute(out, 3));
        mesh.geometry.deleteAttribute('normal');
        mesh.geometry.computeBoundingSphere();
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(prepareMaterial) : prepareMaterial(mesh.material);
      });
      // The positions now include every transform; clear them so none is applied twice.
      scene.traverse((o) => {
        o.position.set(0, 0, 0);
        o.quaternion.identity();
        o.scale.set(1, 1, 1);
        o.updateMatrix();
      });
    },
  };

  const tiles = new TilesRenderer(source.url);
  if (source.key) tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: source.key, autoRefreshToken: true }));
  // Explicit decoder files: three.js's own default paths don't resolve in Vite's dev server.
  const draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl });
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(mercatorPlugin);
  tiles.errorTarget = ERROR_TARGET[useApp.getState().performance];

  const scene = new Scene();
  scene.add(tiles.group);
  // Level of detail is chosen from a real camera in Earth-centred space…
  const lodCamera = new PerspectiveCamera();
  lodCamera.matrixAutoUpdate = false;
  lodCamera.matrixWorldAutoUpdate = false;
  tiles.setCamera(lodCamera);
  // … and drawing uses MapLibre's own matrix, so the tiles line up exactly with the map.
  const drawCamera = new Camera();

  let renderer: WebGLRenderer | null = null;
  const repaint = () => map.triggerRepaint();
  tiles.addEventListener('needs-update', repaint);
  tiles.addEventListener('load-model', repaint);
  tiles.addEventListener('load-root-tileset', () => useGoogle3d.setState({ status: 'ok', message: '' }));
  tiles.addEventListener('load-error', ({ tile, error }) => {
    // The root failing means no tiles at all: usually the key.
    if (tile && tile !== tiles.root) return;
    const text = String(error?.message ?? error);
    const denied = /40[013]/.test(text);
    useGoogle3d.setState({
      status: 'error',
      message: denied
        ? "Google didn't accept the key. It needs the Map Tiles API enabled and billing set up in Google Cloud."
        : `3D tiles didn't load: ${text}`,
    });
  });

  let creditTimer = 0;
  const credits = document.createElement('div');
  credits.className = 'google-credits';
  map.getContainer().appendChild(credits);
  tiles.addEventListener('tile-visibility-change', () => {
    clearTimeout(creditTimer);
    creditTimer = window.setTimeout(() => {
      const text = tiles
        .getAttributions()
        .filter((a) => a.type === 'string' && a.value)
        .map((a) => String(a.value))
        .join('; ');
      credits.innerHTML = text ? `<strong>Google</strong> · ${text.replace(/[<>&]/g, '')}` : '';
      useGoogle3d.setState({ credits: text });
    }, 200);
  });

  const toLocal = (b: ShadowImage['bounds']) =>
    new Vector4(
      (mercatorX(b.west) - frame.ox) / frame.k,
      (mercatorY(b.north) - frame.oy) / frame.k,
      (mercatorX(b.east) - mercatorX(b.west)) / frame.k,
      (mercatorY(b.south) - mercatorY(b.north)) / frame.k,
    );
  let shadowsSeen = -1;
  const syncShadows = () => {
    if (shadowImages.version === shadowsSeen) return;
    shadowsSeen = shadowImages.version;
    for (const [slot, image] of [
      [wide, shadowImages.wide],
      [detail, shadowImages.detail],
    ] as const) {
      if (!image) {
        slot.rect.value.set(0, 0, 0, 0);
        continue;
      }
      slot.texture.image = image.canvas;
      slot.texture.needsUpdate = true;
      slot.rect.value.copy(toLocal(image.bounds));
      slot.opacity.value = image.opacity;
    }
  };

  const updateLodCamera = (fov: number, width: number, height: number) => {
    const c = map.getCenter();
    const cam = cameraPosition({
      lat: c.lat,
      lng: c.lng,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      centerElevation: map.getCenterElevation(),
      fov: fov / RAD,
      viewportHeight: map.getCanvas().clientHeight,
    });
    const [x, y, z] = geodeticToEcef(cam.lat, cam.lng, cam.altitude + geoidAt(geoid, cam.lat, cam.lng));
    const { east, north, up } = enuAxes(cam.lat, cam.lng);
    const b = map.getBearing() * RAD;
    const t = map.getPitch() * RAD;
    const across = (i: number) => Math.sin(b) * east[i] + Math.cos(b) * north[i];
    const forward = new Vector3(...[0, 1, 2].map((i) => Math.sin(t) * across(i) - Math.cos(t) * up[i]));
    const camUp = new Vector3(...[0, 1, 2].map((i) => Math.cos(t) * across(i) + Math.sin(t) * up[i]));
    const right = new Vector3().crossVectors(forward, camUp);
    lodCamera.matrixWorld.makeBasis(right, camUp, forward.negate()).setPosition(x, y, z);
    lodCamera.matrixWorldInverse.copy(lodCamera.matrixWorld).invert();
    lodCamera.fov = fov / RAD;
    lodCamera.aspect = width / height;
    lodCamera.near = 1;
    lodCamera.far = 2e6;
    lodCamera.updateProjectionMatrix();
    tiles.setResolution(lodCamera, width, height);
  };

  const layer: CustomLayerInterface = {
    id: GOOGLE_3D_LAYER,
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.setPixelRatio(1);
    },
    render(gl, args) {
      // Not in exported videos (Google's terms), and nothing to draw before the root arrives.
      if (!renderer || 'exporting' in document.documentElement.dataset) return;
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      updateLodCamera(args.fov, width, height);
      tiles.update();
      syncShadows();
      const m = multiply(args.modelViewProjectionMatrix, frame.matrix(512 * 2 ** map.getZoom()));
      drawCamera.projectionMatrix.fromArray(m);
      drawCamera.projectionMatrixInverse.copy(drawCamera.projectionMatrix).invert();
      renderer.resetState();
      renderer.setViewport(0, 0, width, height);
      // In front of the map surface wherever there are tiles.
      renderer.clearDepth();
      renderer.render(scene, drawCamera);
      if (tiles.loadProgress < 1) map.triggerRepaint();
    },
  };
  map.addLayer(layer, map.getLayer(beforeLayer) ? beforeLayer : undefined);
  // For checking alignment from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { __google3d: unknown }).__google3d = { tiles, scene, frame, drawCamera, lodCamera };

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.performance !== prev.performance) {
      tiles.errorTarget = ERROR_TARGET[now.performance];
      repaint();
    }
  });
  repaint();

  return () => {
    unsubscribe();
    clearTimeout(creditTimer);
    credits.remove();
    if (map.getLayer(GOOGLE_3D_LAYER)) map.removeLayer(GOOGLE_3D_LAYER);
    tiles.dispose();
    draco.dispose();
    wide.texture.dispose();
    detail.texture.dispose();
    renderer?.dispose();
    repaint();
  };
}
