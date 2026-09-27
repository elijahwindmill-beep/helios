# Google Photorealistic 3D Tiles in Zenit: context for connecting and verifying them

Written 27 Sep 2026 for a Claude session (or developer) picking this up. It says what the app
is, how the 3D tiles layer is built, what has and hasn't been tested, and what to check once a
real Google key is in hand.

## 1. The project in brief

- **Zenit** (called Helios until 27 Sep 2026): a browser tool for scouting sun and shadow on real
  3D terrain, then keyframing camera and sun moves and exporting them as MP4. Built for a
  filmmaker who shoots in the Dolomites and monetises the video.
- Live: https://elijahwindmill-beep.github.io/zenit/ · Repo: https://github.com/elijahwindmill-beep/zenit
  (local checkout: `~/helios`). Deployed by GitHub Actions to Pages on every push to `main`
  (Vite `base` is `/zenit/` in builds, `/` in dev).
- Stack: Vite 8, React 19, TypeScript, Zustand 5, **MapLibre GL JS 6.11** with raster-dem
  terrain (Mapterhorn LiDAR tiles by default), Vitest. The brief is `PROMPT.md`; the
  user-facing docs are `README.md`.
- Run: `npm install`, `npm run dev` (http://localhost:5173), `npm test`, `npm run build`.

Google 3D tiles are the brief's **optional, last** feature: behind a switch, the viewer's own
key, never core to the app. Everything else (shadows, timeline, export) works without them.

## 2. Rules that apply

- **Never commit a key.** The key is typed into the app (stored in the browser's localStorage
  under `helios.settings`) or, for local dev only, put in `.env.local` as
  `VITE_GOOGLE_MAPS_KEY=...` (git-ignored). Never add it to the GitHub Actions build: anything
  `VITE_` is baked into the public site.
- **Google's Map Tiles API policies** (https://developers.google.com/maps/documentation/tile/policies):
  show Google's data attributions (and the Google logo) while tiles are on screen; don't
  pre-fetch, cache or store tiles beyond HTTP caching; videos only as short (≤ 30 s), clearly
  marked promotional clips. Zenit therefore **leaves the tiles out of video exports**.
- The brief says not to scrape or hotlink anything from Google. The official Map Tiles API with
  the user's own key is the sanctioned exception; nothing else from Google is fetched (the
  Google logo image is *not* bundled for that reason: see open question 6).

## 3. How the layer is built

| File | Role |
|---|---|
| `src/map/google3d.ts` | Small, always loaded. Watches the store (`overlays.google3d`, `googleKey`) and lazy-imports the heavy module on first use. Dev-only `?tileset=<url>` loads any 3D Tiles set without a key. Doesn't retry a failed key until the key or switch changes. |
| `src/map/google3dLayer.ts` | The layer (three.js 0.186 + 3d-tiles-renderer 0.5.3, ~700 kB, code-split). |
| `src/map/earthFrame.ts` | Pure maths: ECEF ⇄ geodetic (WGS84), ENU axes, Web Mercator, `MercatorFrame` (local float32-safe frame). Unit-tested. |
| `src/map/geoid.ts` + `public/egm96-1deg.bin` | EGM96 geoid heights on a 1° grid (public domain, ±1 m) to turn Google's ellipsoid heights into heights above sea level, which MapLibre uses. Unit-tested. |
| `src/store/google3d.ts` | Status for the UI: `off / loading / ok / error`, message, credits. |
| `src/ui/Settings.tsx` | Foot of the layer panel: key field (password input), **Photorealistic 3D** switch, status text. |
| `src/map/shadowLayer.ts` | Publishes `shadowImages` (the shadow canvases and their bounds) so the tiles can have the cast shadows painted on. |
| `src/map/MapView.tsx` | Installs the layer on map load, **before** the `light-colour` custom layer (so golden-hour tint applies to the tiles too). |

### Pipeline (google3dLayer.ts)

1. `TilesRenderer()` with `GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true })`
   (it sets the root to `https://tile.googleapis.com/v1/3dtiles/root.json`, handles the session
   token and collects per-tile copyright strings), `GLTFExtensionsPlugin({ dracoLoader })`
   (Google's meshes are Draco; the decoder files are imported with Vite `?url`, because
   three.js's default decoder path doesn't resolve on Vite's dev server), and our own plugin.
   `errorTarget` follows the performance mode: Smooth 32, Balanced 20, Detailed 12.
2. **Our plugin, `processTileModel`**: every vertex of every tile is moved once, on load, on the
   CPU in double precision: ECEF → lat/lng/ellipsoid height → minus the geoid → a local
   Mercator frame (x east, y south, both in ~metres from a fixed origin; z = metres above sea
   level). Node transforms are then reset to identity, materials become unlit
   `MeshBasicMaterial` (colour space pass-through: `NoColorSpace` in, `LinearSRGBColorSpace`
   out, matching MapLibre's untouched colours) and `DoubleSide` (the move to Mercator axes
   mirrors the triangle winding). Normals are dropped.
3. **Drawing**: a MapLibre custom layer (`renderingMode: '3d'`) shares MapLibre's WebGL2
   context with a three.js `WebGLRenderer`. The projection is
   `args.modelViewProjectionMatrix × frame.matrix(512·2^zoom)`. Important MapLibre 6 detail:
   the custom-layer world space is **x/y in world pixels (Mercator × 512 × 2^zoom) and z in
   metres**, not 0–1 Mercator (the sun scene in `src/scene/sunScene.ts` relies on the same).
   Each frame: `resetState()`, `setViewport(drawingBuffer)`, **`clearDepth()`** (the tiles win
   over MapLibre's terrain surface wherever they exist), render, and keep repainting while
   `tiles.loadProgress < 1`.
4. **Level of detail** uses a separate `PerspectiveCamera` placed in ECEF from the MapLibre
   camera (`cameraPosition()` in `src/map/cameraMath.ts`, plus the geoid), oriented from bearing
   and pitch, with MapLibre's vertical fov. `tiles.setCamera(lodCamera)` +
   `setResolution(width, height)`; the tiles group stays at identity, so its frame is ECEF.
5. **Shadows on the tiles**: `onBeforeCompile` adds two samplers (wide shadow canvas and the
   close-up detail canvas) and their rectangles in the local frame; the fragment shader mixes
   the shadow colour by alpha after `opaque_fragment`, the same way the raster layer drapes on
   terrain. With sun hours on, the heatmap is painted instead.
6. **Credits**: a `.google-credits` line bottom-centre on the map ("**Google** · Data SIO, …"),
   rebuilt 200 ms after `tile-visibility-change` from `tiles.getAttributions()`.
7. **Errors**: only a failure of the root tileset changes the status; a 400/401/403 shows
   "Google didn't accept the key. It needs the Map Tiles API enabled and billing set up."
8. **Export**: the layer skips rendering while `<html data-exporting>` is set
   (`src/timeline/exportVideo.ts`), and the export dialog says why.

## 4. What has been tested, and what hasn't

Verified (Sep 2026, in the dev browser):

- **Placement**, with a synthetic tileset in ECEF (`tools/test-tileset/`): an orange tower
  placed 150 m east of the Seceda summit appears there, standing on the terrain; the maths is
  also unit-tested (`tests/unit/earthFrame.test.ts`, `geoid.test.ts`).
- **Shadows painted on the mesh** line up with the terrain shadows around them.
- **Draco-compressed** tiles decode and render (test tile compressed with glTF-Transform).
- **Switching off and on** removes and re-adds cleanly; no console errors.
- **A bad key** (a real request to Google's root.json) shows the key message above.
- The 3D renderer is code-split: the main bundle doesn't grow.

**Not tested: real Google tiles.** No key was available. Everything in section 6 is about that.

## 5. Connecting a real key

1. Google Cloud console → a project → **APIs & Services → Library → Map Tiles API → Enable**.
2. **Billing** must be enabled on the project (Map Tiles API refuses keys without it).
3. **Credentials → Create credentials → API key.** Restrict it:
   - Application restriction: **Websites**, e.g. `https://elijahwindmill-beep.github.io/*`,
     `http://localhost:5173/*`, `http://127.0.0.1:5173/*`.
   - API restriction: **Map Tiles API** only.
4. In Zenit: layer panel → Settings → Google 3D tiles → paste the key → switch
   **Photorealistic 3D** on. Or for dev: `.env.local` with `VITE_GOOGLE_MAPS_KEY=...`, restart
   `npm run dev`.

## 6. What to check first with real tiles (open questions, likely fixes)

1. **Do tiles appear at all?** Check `window.__google3d` in dev: `tiles.visibleTiles.size`,
   `tiles.loadProgress`, network requests to `tile.googleapis.com`. If none after the root:
   the LOD camera is probably wrong (step 4 above). Log `lodCamera.matrixWorld` position vs
   `geodeticToEcef()` of the MapLibre camera; try a wider fov for culling.
2. **Vertical fit.** Google heights are ellipsoidal; we subtract EGM96. The mesh should sit on
   MapLibre's terrain within a few metres (compare `map.queryTerrainElevation()` at a meadow
   with the mesh; photogrammetry includes trees and buildings, so compare open ground). A
   constant offset means the geoid step or `cameraPosition()` altitude is off.
3. **Colours.** Google's textures are sRGB JPEG/WebP. If tiles look washed out or too dark,
   revisit the colour-space choice (`NoColorSpace` + `LinearSRGBColorSpace` output) and check
   whether Google's materials arrive as `MeshBasicMaterial` (KHR_materials_unlit) or get
   converted by `prepareMaterial()`.
4. **Precision far from the origin.** The local frame's origin is the map centre when the layer
   is switched on. Far travel (hundreds of km) loses float32 precision: switching off and on
   re-centres. Consider re-centring automatically.
5. **Performance.** The per-vertex re-projection runs on the main thread in
   `processTileModel`; Google tiles can be large. If panning stutters while tiles load,
   move it to a worker or cache geodetic results per tile. Watch GPU memory (`tiles.lruCache`).
6. **Google logo.** The policy asks for the Google Maps logo image beside the credits. It's not
   bundled (the brief bars fetching from Google); either the user supplies the official logo
   asset from Google's brand resources for `public/`, or pass it via
   `GoogleCloudAuthPlugin({ logoUrl })` and show attributions of type `'image'` in the credits.
7. **Occlusion order.** `clearDepth()` makes the mesh cover everything drawn before it,
   including draped layers (routes, contours). Labels drawn after may be hidden behind the
   mesh. Decide what should stay visible on top.
8. **Camera over buildings.** Terrain clearance for keyframed moves (`src/timeline/clearance.ts`)
   only knows the DEM, not the Google mesh: a low camera move can pass through buildings or
   trees. Acceptable for now; noted.
9. **Session tokens.** `autoRefreshToken: true` is set; check that long sessions keep loading
   (Google sessions expire).

## 7. Debugging helpers

- `window.__map` (MapLibre map), `window.__app` (app store), `window.__timeline` (timeline
  store), `window.__shadow`, `window.__google3d` (`{ tiles, scene, frame, drawCamera,
  lodCamera }`): all dev-only.
- Test without a key: `cd tools/test-tileset && python3 make.py && python3 serve.py`, then open
  `http://localhost:5173/?tileset=http://127.0.0.1:8765/tileset.json` and switch
  Photorealistic 3D on (the `?tileset` override works in dev only).
- The in-app browser pane throttles `requestAnimationFrame` when hidden; if the map seems
  frozen during automated checks, bring the pane to the front or take a screenshot.
- After editing a Zustand store file, restart the dev server: Vite's hot reload can leave two
  copies of the store.
