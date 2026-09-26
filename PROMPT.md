# Helios: build brief for Claude Code

You are building **Helios**, a reusable web tool for scouting sun and shadow on real terrain and turning it into playable, keyframed clips. It replicates the core of Shadowmap (app.shadowmap.org) for terrain only, plus a video-editor style keyframe timeline that Shadowmap does not have.

Owner: Elijah (video creator, Windmill brand). First real use: scouting light in the Dolomites (Seceda ridgeline, lat 46.60068, lng 11.72598) and recording sun/shadow flythroughs for YouTube. He is new to GitHub, so keep the repo simple, commit often with clear messages, and keep the README current.

Work directly, no subagents. Before anything expensive (large data downloads, long test loops), say so in one line first.

## 0. Read first

- `design/reference/*.jpg`: screenshots of Shadowmap. Study the sun compass ring (degree ticks, N/E/S/W letters, tilted 3D ellipse), the yellow sun path with sunrise/sunset badges, the dashed sun paths for other dates, the sun ray from the pin to the sun with elevation and azimuth labels, the red pin, the time and date sliders (time slider sunrise to sunset; date slider 01/01 to 31/12 with solstice/equinox notches).
- `design/mockups/*.dc.html`: three UI directions (Paper, Alpenglow, Stone). They are HTML markup with inline styles. Read them for layout, tokens and copy. Do not run them.
- Final UI = **A (Paper) panels + B (Alpenglow) timeline and keyframe inspector + C (sun-arc scrubber)** as the main time control. Both a Paper (light) and Alpenglow (dark) theme, toggleable.

## 1. Scope

In: terrain, satellite and off-white base layers, cast shadows from terrain, sun geometry and trajectories, overlays (routes, places, photos), keyframed timeline over time/date/camera, playback, video export, saving projects.

Out (do not build): buildings, vegetation and tree shadows, accounts, payments, mobile apps.

## 2. Features

### 2.1 Map and camera
- 3D terrain with tilt. Base layers, one active at a time: **Satellite**, **Paper** (minimal off-white: `#F4F1EA` ground, thin contour lines, subtle water and roads, shadows in slate `#3B4A5A`), **Terrain** (hillshade relief).
- **Mouse controls (must feel like Google Earth):**
  - **Left-drag**: pan (move camera position over the ground).
  - **Right-drag**: orbit (horizontal = bearing/rotation, vertical = tilt/pitch angle).
  - **Scroll wheel**: change camera height (dolly in/out toward the cursor), smooth and eased.
  - Extras: Ctrl/Cmd+left-drag = orbit (trackpad users); Alt+wheel = fine pitch; double-click = drop or move the analysis pin; keys R = reset north, T = reset tilt.
  - Show a live readout (lat, lng, height above ground, bearing, pitch) and let the user type values into it.
- Place search (geocoder, e.g. Nominatim or MapTiler; note usage limits).

### 2.2 Sun and shadows
- Accurate sun position (SunCalc or astronomy-engine) for the pin location, with timezone from coordinates.
- **Cast shadows from terrain** on all base layers, updating live as time or date change. Recommended approach: compute a shadow mask texture in geographic space over the current view bounds by ray-marching the DEM toward the sun in a fragment shader (like ShadeMap), then drape it on the terrain as an overlay. This works with any camera tilt. Add a quality setting (resolution, ray steps).
- Optional overlay: **hours of direct sun** heatmap for a chosen day (accumulate masks over the day), phase 5.

### 2.3 Sun visualisation (replicate Shadowmap)
- **Compass ring** around the pin, drawn in 3D on the ground plane, with degree ticks every 10 degrees, labels at 30 degree steps, and N/E/S/W letters. Scales with zoom.
- **Sun path for the selected date**: a solid yellow curve (the sun's trajectory, in 3D over the ring) with badges at sunrise and sunset showing local times (e.g. 07:08, 19:02).
- **Solstice and equinox paths**: dashed/dotted curves for summer solstice, winter solstice (and equinox), labelled ("Winter Solstice" style tag on hover or always on, toggleable).
- **The sun** as a glowing sphere on the path with a time badge (e.g. 13:21), and a **ray** from the pin to the sun with elevation and azimuth labels (e.g. 42.1 deg, 185.6 deg).
- **The sun is draggable.**
  - Drag along the path to change the time of day.
  - Hold Shift while dragging (or drag onto another dashed path) to change the date, so the sun snaps to the path of another day.
  - Implement by raycasting the mouse onto the sky dome, computing target azimuth/elevation, then solving for the (date, time) whose sun position is closest. Dragging updates the sliders and the shadows live.
- Time slider (sunrise to sunset), date slider (01/01 to 31/12 with notches at solstices and equinoxes), NOW button, and the C-style sun-arc scrubber.

### 2.4 Layers (all toggleable, with the Paper-style layer list)
- Base: Satellite / Paper / Terrain.
- Overlays: Cast shadows, Contours, Sun path, Solstice paths, Compass ring, Routes, Places, Photos, Labels.
- **Routes**: import GPX, KML, GeoJSON (drag and drop). Draw on the map. Per-route color and name.
- **Places**: pins with name and notes. Search-to-add.
- **Photos**: import geotagged photos (read EXIF GPS with a small library) or place manually. Thumbnail markers, click to open.
- Layer visibility can be keyed on the timeline (Routes and Photos tracks in the mockups).

### 2.5 Keyframes, clips and playback (the main new feature)
- A **clip** is an ordered list of keyframes on a playback timeline (seconds). A project holds multiple clips.
- A **keyframe** stores: playback time, **sun moment** (full date + time of day), **camera** (lng, lat, zoom or height, bearing, pitch), easing to next (Linear, Ease, Hold), and optionally layer visibility.
- **Time scales must all work**: minutes and hours within a day, **days, weeks, months, years**. Sun moment is interpolated as an absolute timestamp, so keyframes a year apart produce a **year lapse** (the sun path, shadows and date all sweep). Per segment, offer two sun modes:
  - **Continuous**: interpolate the absolute timestamp (good for a day sweep or a slow year sweep).
  - **Day lapse**: advance the date between keyframes while holding, or looping, the time of day (N loops per day optional), so you get a clean "same hour, changing seasons" effect.
- Camera interpolation: interpolate center in Web Mercator, zoom/height, shortest-path bearing, pitch; optional smooth spline (Catmull-Rom) through 3+ keyframes.
- Timeline UI like mockup B: transport (play, prev/next keyframe, loop), timecode, ruler, tracks for **Sun time**, **Camera**, **Layers**, clip blocks on top, red playhead, draggable diamonds, "Add keyframe" (captures the current view and sun), "Split clip", a keyframe inspector panel (editable numeric fields, easing, "Set from view", delete). Snap to seconds. Scrub by dragging the playhead.
- **Export video** of a clip: WebM via canvas `captureStream` + `MediaRecorder` at chosen resolution (720p/1080p/4K if GPU allows) and fps (24/30/60). Deterministic frame stepping (render frame by frame, do not rely on real-time playback) so the export is smooth even if the GPU is slow. MP4 via ffmpeg.wasm as a later optional step.
- Keyboard: Space = play/pause, K = add keyframe, arrows = step time, Delete = delete keyframe.

### 2.6 Projects
- Autosave to `localStorage`, plus **export/import project as JSON** (clips, keyframes, pins, routes, places, photo references, layer settings).
- Deep-linkable URL state for the current view (lat, lng, zoom, bearing, pitch, time) like Shadowmap's URL.

## 3. Stack and data

- **TypeScript + Vite**. UI: React + Zustand. Map: **MapLibre GL JS** with terrain and a custom WebGL layer for shadows and the sun visuals (Three.js custom layer for the ring, sun and paths is fine and shares the map camera).
- **Elevation**: Terrarium tiles from AWS open data: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (decode: `height = (R*256 + G + B/256) - 32768`). Free, CORS enabled. Coarse (about 30 m), fine for a first version.
- **Higher resolution (optional adapter, phase 5)**: South Tyrol open-data LiDAR terrain model and orthophotos for the Dolomites. Check the province's Geokatalog for the current service URLs, licence and CORS before wiring in. Design the tile source layer so extra DEM and imagery sources are pluggable.
- **Satellite imagery (pluggable, user picks in settings)**: Esri World Imagery (needs attribution, check terms for your usage), EOX Sentinel-2 cloudless (check its non-commercial licence, Elijah's content is commercial so flag this in the UI and README), MapTiler with the user's own key (stored locally, never committed). Do NOT use Google Maps/Earth tiles from scripts or scrape anything.
- **Paper base**: vector style with custom off-white colors plus contour lines generated client-side from the DEM (`maplibre-contour`), or an open vector tile source (OpenFreeMap or similar).
- **Google Photorealistic 3D Tiles**: optional and last (phase 6). Needs the user's own Google API key with billing and has attribution and usage rules. Isolate behind a toggle. Treat as a nice-to-have, not core.
- Never commit API keys. Use `.env.local`, document it in the README.

## 4. Design tokens

Use the mockups. Summary:

| Theme | Background / surface | Ink / muted | Accent (sun) | Secondary |
|---|---|---|---|---|
| Paper (default) | `#F4F1EA` / `#FBFAF7` | `#1F1D1A` / `#6B665C` | `#E8A317` (amber), darker `#C98A0F` for lines | slate `#3B4A5A`, hairline `#DDD8CC` |
| Alpenglow (dark) | `#14181D` / `#1D232B` | `#EDEBE6` / `#9AA3AE` | `#FFB84A` | coral `#FF6B4A` keyframes/playhead, blue `#5B8DEF` routes |

Fonts: Instrument Sans (Paper UI), Manrope (dark UI), JetBrains Mono for all times and numbers, Newsreader for titles. Touch targets at least 44 px, real `<button>`s, `aria-label` on icon-only buttons, text contrast at least 4.5:1. Sun amber is always the single accent. Layer colors stay the same across themes.

## 5. Suggested structure

```
src/
  sun/        sun position, sunrise/sunset, path generation (day, solstices, equinox), inverse solver for dragging
  terrain/    DEM tile loading, heightmap mosaic, shadow-mask shader, quality settings
  map/        MapLibre setup, camera controller (mouse controls), base layers, custom layers
  scene/      compass ring, sun sphere, ray, path lines, badges (Three.js layer)
  layers/     routes (gpx/kml/geojson), places, photos (exif)
  timeline/   keyframe model, interpolation (sun modes, camera), playback engine, export
  ui/         panels, timeline, inspector, scrubber, theme
  store/      zustand stores, project save/load, URL state
tests/        unit (sun math, interpolation, solver) + e2e (Playwright)
```

## 6. Build phases (commit and push after each, keep the app runnable)

1. **Foundation**: Vite + TS + MapLibre, Terrarium terrain, satellite and Paper base layers, Paper theme shell, mouse camera controls (left pan, right orbit, wheel height) with the readout. Deploy to **GitHub Pages** via a GitHub Actions workflow so Elijah gets a live URL. Update README with the URL and setup.
2. **Sun and shadows**: sun math, shadow-mask shader draped on terrain, time and date sliders, sun-arc scrubber, NOW button.
3. **Sun visuals**: compass ring, day path with sunrise/sunset badges, solstice and equinox dotted paths, sun sphere with ray and labels, **draggable sun** (time drag, Shift for date).
4. **Layers**: layer panel, GPX/KML/GeoJSON routes, places, photos with EXIF.
5. **Keyframes and clips**: model, timeline UI, inspector, both sun modes (continuous and day lapse), camera interpolation, playback, autosave and JSON import/export, then **video export** with deterministic frame stepping.
6. **Polish and extras**: Alpenglow dark theme toggle, sun-hours heatmap, higher-resolution South Tyrol data adapter, optional Google 3D tiles, performance modes.

At the end of every phase, tell Elijah in plain language what works and what to try in the browser.

## 7. Acceptance checks

- **Sun math** (unit tests): at lat 46.60068, lng 11.72598, Shadowmap showed on 26 Sep 2026 at 10:06 local (UTC+2): elevation about 28.4 deg, azimuth about 127.2 deg; at 13:21: elevation about 42.1 deg, azimuth about 185.6 deg; sunrise about 07:08 and sunset about 19:02 in the ring badges. Match within about 1 degree and 2 minutes (difference in refraction/horizon conventions is fine, note any).
- Dragging the sun updates time (and date with Shift) and shadows live, and the inverse solver round-trips: place sun at (az, el), solve, recompute, error under 0.1 deg.
- A two-keyframe clip a year apart (e.g. 21 Mar to 21 Mar next year) plays as a year lapse; a "Day lapse" segment holds 10:00 while the date advances; a same-day segment sweeps dawn to dusk. Playback is deterministic (same frame every time).
- Mouse controls: left-drag pans, right-drag orbits (bearing and pitch), wheel changes height, all smooth; readout matches the actual camera.
- Layers toggle independently; imported GPX shows; a photo with EXIF GPS lands at the right spot.
- Exported WebM plays back the same as the on-screen preview.

## 8. Testing notes

The build sandbox usually blocks tile servers, so you cannot test with real imagery there. Use a **mock tile server with a synthetic DEM** (a few Gaussian peaks) in Playwright tests and for local dev fallback, and verify shadows against known geometry (shadow length = height / tan(elevation)). Real-imagery checks happen in Elijah's browser on the deployed Pages URL. Report anything you could not verify.

## 9. Rules

- Do not scrape or hotlink anything from Shadowmap, ShadeMap or Google. Build your own implementation from the descriptions here.
- Keep dependencies modest and licensed for commercial use (Elijah monetises content). List all data and imagery sources with their licences in `README.md` and in the app's About panel with proper attribution.
- No invented data in the UI. Default demo location is Seceda (46.60068, 11.72598).
- Keep commits small and messages clear. Never commit secrets.
