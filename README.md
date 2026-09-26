# Helios

Shadow casting map for scheduling and planning trips and photography. Scout sun and shadow on real 3D terrain, then (soon) turn it into keyframed clips for video.

**Live app:** https://elijahwindmill-beep.github.io/helios/

Default location: Seceda ridgeline, Val Gardena (46.60068, 11.72598).

## Status

| Phase | What | State |
|---|---|---|
| 1 | 3D terrain, Satellite / Paper / Terrain bases, mouse controls, camera readout, search | Done |
| 2 | Sun position, cast terrain shadows, time and date sliders, sun-arc scrubber | Done |
| 3 | Compass ring, sun paths, solstice paths, draggable sun | Done |
| 4 | Routes (GPX/KML/GeoJSON), places, geotagged photos | Done |
| 5 | Keyframes, clips, timeline, playback, video export | Next |
| 6 | Alpenglow dark theme, sun-hours heatmap, South Tyrol LiDAR, extras | |

The full build brief is in [PROMPT.md](PROMPT.md).

## Queue

Extra tasks, in the order they'll be built. Each runs after the phase it names.

1. ~~**Mobile layout and touch controls**~~ Done 26 Sep 2026 (see "On a phone" below).
   - Layout fitted to portrait phone screens: map full screen, panels collapse into a bottom sheet, readout and attribution never overlap, all touch targets at least 44 px.
   - Touch gestures, matching the mouse controls:
     - 1 finger drag: pan. Double-tap: move the pin.
     - 2 fingers: pinch to move the camera closer or further, twist to rotate.
     - 3 fingers drag: orbit (up/down tilts, left/right rotates).
   - Tutorial overlay on first visit that shows the 1, 2 and 3 finger gestures, with a cross (×) button to close it. Once closed it stays closed, and a "?" button brings it back.
2. ~~**Sun controls: precise and predictable**~~ Done 26 Sep 2026.
   - Dragging the sun only moves it along today's path; it no longer jumps to a solstice or equinox path on its own. Shift + drag (any date) stays.
   - Summer solstice and Winter solstice buttons next to the time, always visible (on phones too).
   - Type an exact time and date (e.g. `06:47`, `12 Oct 2026`) in addition to the sliders.
3. ~~**Weather for the place and moment**~~ Done 26 Sep 2026.
   - Forecast for the pin at the chosen date and time: sky (clear, cloudy, fog), cloud cover, temperature, wind, rain.
   - Source: [MET Norway Locationforecast](https://api.met.no/) (the Norwegian national weather service; free, CC BY 4.0, commercial use allowed with attribution, forecasts about 9 days ahead, works directly from the browser). Credited in the app and About panel.
   - A small floating warning at the top, minimal style, when conditions are poor for light and shadows (overcast, fog, rain or snow, strong wind), e.g. "Overcast at 08:00 · shadows won't show", with a × to dismiss.
   - Dates beyond the forecast range say so plainly instead of guessing. (Long-term climate averages would need a second source; Open-Meteo's free tier is non-commercial, so it would need their paid plan.)
4. ~~**Real-world light colour (white balance) through the day**~~ Done 26 Sep 2026.
   - As the sun nears the horizon the whole scene warms like real light: neutral daylight (about 5500 K) at high sun, warming through golden hour (sun below about 6°) to deep orange at sunset, then the cool blue of blue hour (sun 4° to 6° below the horizon) and dark night after that.
   - Driven by the real sun elevation at the pin, so it follows the time and date sliders, the arc and (later) keyframed clips.
   - Sunlit ground takes the warm sun colour, shadows take the cooler sky-blue fill, and the sky and horizon haze change with it.
   - Drawn into the map image itself (not a screen overlay), so exported videos include it. An on/off toggle keeps a neutral view for plain scouting.
5. **Apple-style redesign** (after phase 4, requested 26 Sep 2026, waiting on approval of the mockup)
   - Frosted-glass panels, Apple system fonts, iOS-style switches and segmented controls, round map buttons.
   - Sun scene: clean sun disc with a soft glow and no thick outline, thin gradient sun path with soft light under it, hairline dashed solstice paths, glass labels.
   - Thin lines everywhere (compass, sun paths, sliders), soft near-black instead of pure black, a white Apple Weather-style sun.
   - Time scrubber redesigned after Apple Weather's sun chart: sun height through 24 h, horizon line, day part lit, twilight dots, first light / sunrise / sunset / last light / daylight.
   - Lens look on the map: a subtle tilt-shift blur at the top and bottom edges with slight chromatic aberration and vignette, like a vintage lens (strength adjustable, off switch).
   - Mockup: the "Helios Apple-style mockup" design canvas (desktop, phone with a weather warning, and a before/after of the sun).

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

### Sun and shadows

- The card in the top-right shows the time at the pin (in the pin's own timezone), the sun's elevation and azimuth, and sunrise and sunset.
- **Type a time or date:** click the time or the date and type over it, then press Enter. Times: `06:47`, `647`, `6.47`, `6:47 pm`. Dates: `12 Oct 2026`, `12 october`, `12/10/2026` (day first), `2026-10-12`. Esc cancels. Changing one keeps the other.
- **Summer solstice / Winter solstice** (under the time) jump to that day, keeping the time. South of the equator they swap months.
- **Time slider:** sunrise to sunset. Press **24 h** to cover the whole day.
- **Date slider:** 1 January to 31 December. The marks are the equinoxes and solstices; **Mar / Jun / Sep / Dec** jump straight to them.
- **Now** jumps to the current time.
- **Weather** (under the solstice buttons): the forecast at the pin for the chosen time, from MET Norway: sky, temperature, wind, and rain or snow when there is some. Hourly for the next 2 to 3 days, then in 6-hour blocks, up to about 9 days ahead. Past times and dates further out say so instead of guessing.
- **Weather warning:** a small dark note floats at the top when the forecast is poor for light and shadows (overcast, fog, rain, sleet, snow, thunder, or wind from 39 km/h), e.g. "Overcast at 08:00 · shadows won't show". × hides it for that forecast slot.
- **Sun arc** (bottom): drag or click the sun along the arc to change the time. When it has keyboard focus, arrow keys step 5 minutes (Shift: 30), Home and End jump to sunrise and sunset.
- **Cast shadows** (layer panel) shows where the terrain blocks the sun. Quality: Low, Medium (default), High. High loads more detailed elevation and takes longer to draw.
- The relief shading on Paper and Terrain is lit from the real sun direction too.
- **Golden hour light** (layer panel, on by default): the whole map takes the colour of the real light. Neutral when the sun is high, warming from about 12° down to a deep orange at sunset, then the blue of blue hour (sun 4° to 6° below the horizon) and a dim blue night. Shadows cool toward sky blue as the sun gets low, like real shadows lit by the sky. It's drawn into the map image itself, so video export will include it; labels stay neutral. Turn it off for a plain scouting view.

### Sun in 3D

- Around the pin: a **compass ring** (ticks every 10°, N/E/S/W), today's **sun path** in amber with sunrise and sunset badges where it meets the horizon, the **solstice** paths (dashed) and the **equinox** path (dotted). Each has its own switch in the layer panel.
- The **sun** sits on its path with a line down to the pin, its elevation (△) and its azimuth on the ring.
- **Drag the sun** along its path to change the time. Hold **Shift** while dragging to move it anywhere in the sky: Helios finds the date and time when the sun is there. A plain drag never changes the date, however far you pull it.
- The ring badges show when the sun centre crosses a flat horizon (like Shadowmap's badges), so they are a few minutes inside the sunrise/sunset times in the sun card.
- The time is part of the page link (`&t=…` in UTC), so a shared link opens at the same moment.

### Your routes, places and photos

In the layer panel under **Your layers** (on a phone: the Layers button):

- **Import…** or drop files anywhere on the map: GPX, KML and GeoJSON routes, and photos (JPEG or HEIC). The map zooms to what you added. Waypoints and points in the files become places.
- **Routes:** each gets its own colour; click the dot to change it, click the name to rename. **Draw route** lets you click points on the map; double-click, Enter or **Done** finishes, Backspace undoes the last point, Esc cancels. On a phone: tap points, then Done.
- **Places:** pins with a name and notes. **Place at pin** saves the sun pin's spot; the **+** next to a search result saves that result. Click a place on the map for its notes and **Move sun pin here**. Drag it to move it.
- **Photos:** placed from the GPS in the photo. A photo without GPS starts at the sun pin; drag it into place. Click a photo to see it full size with when it was taken. **Sun when this was taken** moves the pin and the time to that photo, so you can compare the light. HEIC photos show full size in Safari; other browsers show them as a camera icon.
- Routes, Places and Photos each have an on/off switch. Everything is kept in this browser (photos in its file storage, not uploaded anywhere).

### On a phone

| Gesture | To |
|---|---|
| 1 finger drag | Pan |
| Double-tap | Move the pin |
| 2 fingers: pinch / twist | Move closer or further / turn the view |
| 3 fingers drag | Orbit: up/down tilts, left/right turns |

The map fills the screen. The sun summary sits under the search bar (tap the arrow for the sliders), the sun arc is at the bottom, and the layers button opens the layer panel and camera readout as a sheet. A short tutorial shows the gestures on the first visit; the **?** button brings it back (on a computer it shows the mouse controls).

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
| [MET Norway Locationforecast](https://api.met.no/) | Weather forecast at the pin | Data from The Norwegian Meteorological Institute, [CC BY 4.0](https://api.met.no/doc/License) | Yes, with attribution |
| Esri World Imagery | Satellite (default) | Esri terms | **Check terms**: Esri limits use outside ArcGIS |
| [EOX Sentinel-2 cloudless 2016](https://cloudless.eox.at) | Satellite (alternative) | Commercial use needs a paid EOX licence | **No**, not as-is |
| MapTiler Satellite | Satellite (your key) | Your MapTiler plan | Depends on plan |

Sun position uses NOAA's solar calculator (accurate to about 0.01°). Sunrise and sunset in the sun card are the standard ones: sun centre 0.833° below a flat horizon. At Seceda on 26 Sep 2026 Helios gives 28.2° / 127.2° at 10:06 where Shadowmap shows 28.4° / 127.2°, and sunrise/sunset 07:04 / 19:03 where Shadowmap's slider shows 07:05 / 19:05. Real sunrise at a spot can be later and sunset earlier when mountains block the horizon; the cast shadows show that, the sunrise/sunset numbers don't.

Shadows are computed from the elevation data: for every ground point Helios walks toward the sun and checks whether terrain rises above it, including mountains up to 12 km away and the curvature of the earth. Edges are softened by the width of the sun's disk.

Terrain data is about 30 m resolution: good for large-scale light and shadow on ridges and valleys, too coarse for single rocks or buildings. A higher-resolution South Tyrol LiDAR option is planned for phase 6.

Libraries: MapLibre GL JS (BSD-3), maplibre-contour (BSD-3), React (MIT), Zustand (MIT), @photostructure/tz-lookup (CC0, timezone from coordinates), @tmcw/togeojson (BSD-2, GPX and KML import), exifr (MIT, photo GPS and capture time). Tests only: Vitest (MIT), happy-dom (MIT).

## Project layout

```
src/
  map/     MapLibre setup, style and base layers, camera controls, tile sources, shadow layer
  scene/   3D sun scene: compass ring, sun paths, sun, labels, dragging; golden/blue hour light colour
  sun/     sun position, sunrise and sunset, seasons, timezones, inverse solver for dragging
  terrain/ elevation tiles, height mosaic, shadow ray-march (CPU reference and GPU shader)
  weather/ MET Norway forecast: fetching, picking the slot for a time, warnings
  layers/  your routes, places and photos: file import (GPX/KML/GeoJSON, EXIF), map drawing, photo storage
  store/   app state (Zustand), saved in the browser
  ui/      panels, search, readout, theme
tests/     unit tests
```
