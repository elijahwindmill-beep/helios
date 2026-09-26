# Helios

Shadow casting map for scheduling and planning trips and photography. Scout sun and shadow on real 3D terrain, then (soon) turn it into keyframed clips for video.

**Live app:** https://elijahwindmill-beep.github.io/helios/

Default location: Seceda ridgeline, Val Gardena (46.60068, 11.72598).

## Status

| Phase | What | State |
|---|---|---|
| 1 | 3D terrain, Satellite / Paper / Terrain bases, mouse controls, camera readout, search | Done |
| 2 | Sun position, cast terrain shadows, time and date sliders, sun-arc scrubber | Next |
| 3 | Compass ring, sun paths, solstice paths, draggable sun | |
| 4 | Routes (GPX/KML/GeoJSON), places, geotagged photos | |
| 5 | Keyframes, clips, timeline, playback, video export | |
| 6 | Alpenglow dark theme, sun-hours heatmap, South Tyrol LiDAR, extras | |

The full build brief is in [PROMPT.md](PROMPT.md).

## Queue

Extra tasks, in the order they'll be built. Each runs after the phase it names.

1. **Mobile layout and touch controls** (after phase 2, requested 26 Sep 2026)
   - Layout fitted to portrait phone screens: map full screen, panels collapse into a bottom sheet, readout and attribution never overlap, all touch targets at least 44 px.
   - Touch gestures, matching the mouse controls:
     - 1 finger drag: pan. Double-tap: move the pin.
     - 2 fingers: pinch to move the camera closer or further, twist to rotate.
     - 3 fingers drag: orbit (up/down tilts, left/right rotates).
   - Tutorial overlay on first visit that shows the 1, 2 and 3 finger gestures, with a cross (×) button to close it. Once closed it stays closed, and a "?" button brings it back.

## Using it

| Do this | To |
|---|---|
| Left-drag | Pan |
| Right-drag | Orbit: left/right turns, up/down tilts |
| Ctrl or Cmd + left-drag | Orbit (for trackpads) |
| Scroll wheel | Move the camera closer or further, toward the cursor |
| Alt + scroll (on a Mac trackpad: Option + two-finger swipe up/down) | Fine, smooth tilt |
| Double-click | Move the pin (the spot the sun will be calculated for) |
| Drag the pin | Move the pin |
| R / T | Reset north / reset tilt |

The readout in the bottom-left shows the view centre (lat, lng), the camera's height above the ground under it, bearing and pitch. Click any value, type a new one and press Enter (heights accept `850`, `850 m` or `1.2 km`).

Search finds places by name, or paste coordinates straight from Google Maps (`46.60068, 11.72598`).

The page URL always holds the current view, so you can bookmark or share a view.

## Running it on your computer

Needs [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Other commands: `npm test` (unit tests), `npm run build` (production build into `dist/`).

On a Mac with Deno instead of Node: `deno install`, then `deno run -A node_modules/vite/bin/vite.js`.

### Optional: MapTiler key

MapTiler satellite imagery needs your own key from https://cloud.maptiler.com. Pick "MapTiler Satellite" under Satellite in the app and paste the key; it is stored only in your browser. For local development you can instead put it in a file called `.env.local`:

```
VITE_MAPTILER_KEY=your-key-here
```

`.env.local` is ignored by git, so the key never gets committed. Don't add it to the GitHub build: anything starting with `VITE_` ends up inside the published site.

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages (see `.github/workflows/pages.yml`). One-time setup: in the repo on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Data sources and licences

Helios is made for monetised videos, so each source's commercial terms matter. The same list is in the app under "About, sources and licences".

| Source | Used for | Licence | Paid work? |
|---|---|---|---|
| [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, AWS Open Data) | 3D terrain, contours, hillshade | Mixed open licences, [attribution required](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Yes |
| [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema) | Water, roads, lifts, names | © OpenStreetMap contributors (ODbL), © OpenMapTiles | Yes |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Place search | ODbL data; max 1 request per second | Yes (light use) |
| Esri World Imagery | Satellite (default) | Esri terms | **Check terms**: Esri limits use outside ArcGIS |
| [EOX Sentinel-2 cloudless 2016](https://cloudless.eox.at) | Satellite (alternative) | Commercial use needs a paid EOX licence | **No**, not as-is |
| MapTiler Satellite | Satellite (your key) | Your MapTiler plan | Depends on plan |

Terrain data is about 30 m resolution: good for large-scale light and shadow on ridges and valleys, too coarse for single rocks or buildings. A higher-resolution South Tyrol LiDAR option is planned for phase 6.

Libraries: MapLibre GL JS (BSD-3), maplibre-contour (BSD-3), React (MIT), Zustand (MIT).

## Project layout

```
src/
  map/     MapLibre setup, style and base layers, camera controls, tile sources
  store/   app state (Zustand), saved in the browser
  ui/      panels, search, readout, theme
tests/     unit tests
```
