<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/logo/helios-dark.svg" />
    <img src="design/logo/helios-light.svg" alt="Helios" width="300" height="70" />
  </picture>
</h1>

Shadow casting map for scheduling and planning trips and photography. Scout sun and shadow on real 3D terrain, then turn it into keyframed clips and export them as video.

The mark is a horizon line through a cut stone under the sun; the HELIOS wordmark is drawn as single strokes, like the engraved lettering on the Soviet Helios-44 lens (no font file).

**Live app:** https://elijahwindmill-beep.github.io/helios/

Default location: Seceda ridgeline, Val Gardena (46.60068, 11.72598).

## Status

| Phase | What | State |
|---|---|---|
| 1 | 3D terrain, Satellite / Paper / Terrain bases, mouse controls, camera readout, search | Done |
| 2 | Sun position, cast terrain shadows, time and date sliders, sun scrubber | Done |
| 3 | Compass ring, sun paths, solstice paths, draggable sun | Done |
| 4 | Routes (GPX/KML/GeoJSON), places, geotagged photos | Done |
| 5 | Keyframes, clips, timeline, playback, video export, sun-hours heatmap, South Tyrol aerial imagery | Done |
| 6 | Detailed LiDAR terrain (Mapterhorn) with close-up shadows, performance modes, light Paper theme, optional Google 3D tiles, new logo | Done |

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
   - Driven by the real sun elevation at the pin, so it follows the time and date sliders, the sun chart and (later) keyframed clips.
   - Sunlit ground takes the warm sun colour, shadows take the cooler sky-blue fill, and the sky and horizon haze change with it.
   - Drawn into the map image itself (not a screen overlay), so exported videos include it. An on/off toggle keeps a neutral view for plain scouting.
5. ~~**Redesign: the Frost HUD**~~ Done 26 Sep 2026. Chosen from the mockup canvas: the Frostpunk 2 inspired board with the Apple-style sun and lens.
   - Dark frosted-glass panels with thin corner brackets, condensed capital labels (Barlow Condensed), iOS switches, soft near-black instead of pure black.
   - Desktop HUD: top bar (location, sun height, azimuth, sunrise, sunset, golden hour, daylight, air and wind, typed date and time), 9-day forecast strip, alerts (weather, golden hour, blue hour), tool dock (route, place, import), sun chart at the bottom.
   - Sun scene: hairline ring and paths, white sun with a warm glow, gradient day path, glass labels.
   - Lens look (switch and strength slider): soft chromatic aberration, tilt-shift, lens dirt lit by the sun, dust, frost in the corners, vignette, edge blur and film grain.
6. ~~**Photo spots**~~ Done 26 Sep 2026: geotagged Wikimedia Commons photos around the view (see "Photo spots" below). Flickr could follow later; its API needs Flickr's approval for commercial use.

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

- **Top bar** (desktop): where the pin is (name, ground height), then the sun at the viewed moment: height, azimuth, sunrise, sunset, the start of the evening golden hour, daylight, and air temperature and wind. On the right: the date and time at the pin (in the pin's own timezone) and **Now**. Narrower windows drop the less important numbers.
- **Type a time or date:** click the time or the date and type over it, then press Enter. Times: `06:47`, `647`, `6.47`, `6:47 pm`. Dates: `12 Oct 2026`, `12 october`, `12/10/2026` (day first), `2026-10-12`. Esc cancels. Changing one keeps the other.
- **Sun chart** (bottom): the day like Apple Weather's sun chart. Time runs across, the sun's height up, the line across is the horizon. Golden hours are marked amber on the curve and blue hours blue. Drag anywhere on it to change the time; with keyboard focus, arrow keys step 5 minutes (Shift: 30), Home and End jump to sunrise and sunset.
- **Date slider** (under the chart): 1 January to 31 December. The marks are the equinoxes and solstices; **Mar / Jun / Sep / Dec** jump straight to them.
- **Summer solstice / Winter solstice** jump to that day, keeping the time. South of the equator they swap months.
- **Forecast strip** (top): the next 9 days at the pin: sky, high temperature, a bar for how good the daylight is for light and shadows (clear is full amber, cloud and rain grey), and flags like OVERCAST AM or RAIN PM. Click a day to jump to it, keeping the time.
- **Alerts** (right): the weather at the viewed moment (turns into an orange warning with a × when the light will be poor), and the day's morning and evening golden hour (sun from the horizon to 6° up) and blue hour (4° to 6° below).
- **Now** jumps to the current time.
- **Weather** (in the alerts; on a phone under the solstice buttons): the forecast at the pin for the chosen time, from MET Norway: sky, temperature, wind, and rain or snow when there is some. Hourly for the next 2 to 3 days, then in 6-hour blocks, up to about 9 days ahead. Past times and dates further out say so instead of guessing.
- **Weather warning** (phone): a small dark note floats at the top when the forecast is poor for light and shadows (overcast, fog, rain, sleet, snow, thunder, or wind from 39 km/h), e.g. "Overcast at 08:00 · shadows won't show". × hides it for that forecast slot.
- **Sun hours (whole day)** (layer panel): a heatmap of how many hours of direct sun each spot gets on the viewed day, from deep blue (none) to orange (11+ h). Helios renders the terrain shadows every 10 minutes from sunrise to sunset and adds them up, so it takes a few seconds; it updates when you change the day or move the pin, and stands in for the cast shadows while on.
- **Cast shadows** (layer panel) shows where the terrain blocks the sun. With the detailed elevation (see Settings), a sharper close-up layer covers about 2 km around the view centre (3 km on Detailed) from 1.6 m elevation where the region has LiDAR, while mountains up to 12 km away still cast into it.
- The relief shading on Paper and Terrain is lit from the real sun direction too.
- **Golden hour light** (layer panel, on by default): the whole map takes the colour of the real light. Neutral when the sun is high, warming from about 12° down to a deep orange at sunset, then the blue of blue hour (sun 4° to 6° below the horizon) and a dim blue night. Shadows cool toward sky blue as the sun gets low, like real shadows lit by the sky. It's drawn into the map image itself, so video export will include it; labels stay neutral. Turn it off for a plain scouting view.

- **Clear map:** the small arrow tabs at the middle of each screen edge slide that side's controls away (left: layer panel, right: alerts and map buttons, top: top bar and forecast, bottom: sun chart, tools and readout). **H** hides or shows them all. On a phone the frame button above the map buttons clears everything; the eye button brings it back.
- **Lens look** (layer panel, on by default, with a strength slider): the look of a vintage lens. Soft red/blue fringes on edges, a tilt-shift blur toward the top and bottom, lens dirt that glows near the sun, dust specks and a little frost in the corners are drawn into the map image (so video export will carry them); a slight vignette, a 12 px blur feathering in over the last 140 px toward the screen edges, a soft blur band along each control window's top and bottom edge, and fine grey film grain cover the whole screen, panels included. It's all measured in screen pixels, so zooming never changes it.

### Settings (foot of the layer panel)

- **Theme:** Dark (the Frost HUD), Light (the Paper palette from the brief: warm paper, ink, amber), or Auto, which follows the system setting.
- **Performance:** Smooth, Balanced (default) or Detailed. It sets how sharp and far the shadows are, whether the close-up shadows are drawn, the drawing resolution (Smooth draws at normal resolution on high-density screens), the blurs over the panels (Smooth leaves them out) and how detailed the Google 3D tiles get. Try Smooth on a laptop on battery or a phone.
- **Elevation data:** Detailed (Mapterhorn, the default) or Standard (Mapzen, 30 m). Detailed uses LiDAR wherever a region publishes it: South Tyrol 2.5 m, Austria 1 m, Switzerland, Trentino 5 m, and 30 m (Copernicus) elsewhere. Cliffs, towers and gullies come out sharply, and shadows from small ridges show. Switch to Standard if the detailed tiles are slow or down.
- **Google 3D tiles** (optional): paste your own Google Maps Platform key (Map Tiles API enabled, with billing) and switch on **Photorealistic 3D** for Google's 3D mesh of buildings, trees and rock faces, with Helios's cast shadows (or sun hours) painted onto it. The key stays in this browser. Google's credits show at the bottom while it's on. It's left out of exported videos, because Google allows only short, clearly marked promotional clips. The 3D renderer (about 1 MB) only downloads the first time you switch it on.

### Sun in 3D

- Around the pin: a **compass ring** (ticks every 10°, N/E/S/W), today's **sun path** in amber with sunrise and sunset badges where it meets the horizon, the **solstice** paths (dashed) and the **equinox** path (dotted). Each has its own switch in the layer panel.
- The **sun** sits on its path with a line down to the pin, its elevation (△) and its azimuth on the ring.
- **Drag the sun** along its path to change the time. Hold **Shift** while dragging to move it anywhere in the sky: Helios finds the date and time when the sun is there. A plain drag never changes the date, however far you pull it.
- The ring badges show when the sun centre crosses a flat horizon (like Shadowmap's badges), so they are a few minutes inside the sunrise/sunset times in the sun card.
- The time is part of the page link (`&t=…` in UTC), so a shared link opens at the same moment.

### Your routes, places and photos

In the layer panel under **Your layers** (on a phone: the Layers button), or from the tool dock at the bottom right (Route, Place, Import):

- **Import…** or drop files anywhere on the map: GPX, KML and GeoJSON routes, and photos (JPEG or HEIC). The map zooms to what you added. Waypoints and points in the files become places.
- **Routes:** each gets its own colour; click the dot to change it, click the name to rename. **Draw route** lets you click points on the map; double-click, Enter or **Done** finishes, Backspace undoes the last point, Esc cancels. On a phone: tap points, then Done.
- **Places:** pins with a name and notes. **Place at pin** saves the sun pin's spot; the **+** next to a search result saves that result. Click a place on the map for its notes and **Move sun pin here**. Drag it to move it.
- **Photos:** placed from the GPS in the photo. A photo without GPS starts at the sun pin; drag it into place. Click a photo to see it full size with when it was taken. **Sun when this was taken** moves the pin and the time to that photo, so you can compare the light. HEIC photos show full size in Safari; other browsers show them as a camera icon.
- Routes, Places and Photos each have an on/off switch. Everything is kept in this browser (photos in its file storage, not uploaded anywhere).

### Timeline and video (phase 5)

- **Timeline** (tool dock, or the diamond button on a phone): set the view and sun, press **◇ Add keyframe** (K), move the playhead, change the view and sun, add another. Space plays, arrows step (Shift: tenths), Delete removes the selected keyframe. Drag diamonds to move them (snaps to seconds; Alt for tenths).
- **Inspector** (right, when a keyframe is selected): sun time and date, **Continuous** (glide the exact moment: day sweeps, year lapses) or **Day lapse** (the date steps day by day, the time holds or sweeps N times), camera numbers, easing (Linear, Ease, Hold), layer switches, Set from view, Delete.
- Several clips per project; **Split clip** cuts at the playhead. Everything autosaves in the browser; **Save project** / **Open…** use a .json file.
- **Export video**: MP4 (H.264), 720p / 1080p / 4K, 24 / 30 / 60 fps. Frames are rendered one at a time, each waiting for the map and shadows, so the video is smooth on any computer (it takes longer than the clip). Uses the browser's WebCodecs encoder with Mediabunny (MPL-2.0) instead of the brief's WebM MediaRecorder, because it gives exact frame timing and a file Resolve opens directly. Pins and photo markers aren't in the video.

### Photo spots

- **Photo spots (Wikimedia)** (layer panel, on by default): up to 50 geotagged photos from Wikimedia Commons within 10 km of the view centre, each as a small round thumbnail where the camera stood. Clusters show the popular viewpoints. They reload as you move the map.
- Click one for the full photo, the photographer, its licence (linked) and a link to its page on Commons. **Sun when this was taken** moves the pin there and jumps to the date and time the photo records (date only: the time stays), so you can compare the real light with the model.
- When the file page records which way the camera faced (few do), the viewer says so and a wedge on the map shows the view.
- Commons' search is sometimes briefly overloaded; the panel says so and the spots load on the next map move.

### On a phone

| Gesture | To |
|---|---|
| 1 finger drag | Pan |
| Double-tap | Move the pin |
| 2 fingers: pinch / twist | Move closer or further / turn the view |
| 3 fingers drag | Orbit: up/down tilts, left/right turns |

The map fills the screen. The sun summary sits under the search bar (tap the arrow for the sun details, the 9-day forecast and the sliders), the sun chart is at the bottom, and the layers button opens the layer panel and camera readout as a sheet. A short tutorial shows the gestures on the first visit; the **?** button brings it back (on a computer it shows the mouse controls).

The readout in the bottom-left (in the layer panel on windows narrower than 1400 px) shows the view centre (lat, lng), the camera's height above the ground under it, bearing and pitch. Click any value, type a new one and press Enter (heights accept `850`, `850 m` or `1.2 km`).

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

### Optional: Google 3D tiles key

Create a key in Google Cloud with the **Map Tiles API** enabled and billing set up, then paste it under Settings → Google 3D tiles. For local development it can go in `.env.local` as `VITE_GOOGLE_MAPS_KEY=...` (same rules as above: never in the GitHub build). Restrict the key to your site's address in Google Cloud.

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages (see `.github/workflows/pages.yml`). One-time setup: in the repo on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Data sources and licences

Helios is made for monetised videos, so each source's commercial terms matter. The same list is in the app under "About, sources and licences".

| Source | Used for | Licence | Paid work? |
|---|---|---|---|
| [Mapterhorn](https://mapterhorn.com/attribution) terrain tiles | Detailed elevation (default): 3D terrain, shadows, contours, hillshade. Sources include South Tyrol DGM 2.5 m (CC0), BEV Austria 1 m (CC BY 4.0), swisstopo, Trentino, Copernicus GLO-30 | Open data from each producer, attribution required ([full list](https://mapterhorn.com/attribution)) | Yes, with attribution |
| [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, AWS Open Data) | Standard elevation (fallback choice) | Mixed open licences, [attribution required](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | Yes |
| [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema) | Water, roads, lifts, names | © OpenStreetMap contributors (ODbL), © OpenMapTiles | Yes |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Place search | ODbL data; max 1 request per second | Yes (light use) |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) | Photo spots | Each photo has its own free licence (mostly CC BY / BY-SA), shown and linked with the photo; credit the author when you reuse one | Yes, with credit (and share-alike where the licence says so) |
| [MET Norway Locationforecast](https://api.met.no/) | Weather forecast at the pin | Data from The Norwegian Meteorological Institute, [CC BY 4.0](https://api.met.no/doc/License) | Yes, with attribution |
| Esri World Imagery | Satellite (default) | Esri terms | **Check terms**: Esri limits use outside ArcGIS |
| [South Tyrol orthophoto 2023](https://data.civis.bz.it/) (Autonomous Province of Bolzano) | Aerial imagery, ~20 cm, South Tyrol only | CC0 | Yes |
| [EOX Sentinel-2 cloudless 2016](https://cloudless.eox.at) | Satellite (alternative) | Commercial use needs a paid EOX licence | **No**, not as-is |
| MapTiler Satellite | Satellite (your key) | Your MapTiler plan | Depends on plan |
| [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/policies) | Optional 3D mesh (your key) | Google Maps Platform terms; Google's credits shown while on | **Not in videos**: left out of exports (Google allows only short promotional clips) |
| EGM96 geoid (NGA) | Seating Google's 3D tiles at sea-level heights | Public domain | Yes |

Sun position uses NOAA's solar calculator (accurate to about 0.01°). Sunrise and sunset in the sun card are the standard ones: sun centre 0.833° below a flat horizon. At Seceda on 26 Sep 2026 Helios gives 28.2° / 127.2° at 10:06 where Shadowmap shows 28.4° / 127.2°, and sunrise/sunset 07:04 / 19:03 where Shadowmap's slider shows 07:05 / 19:05. Real sunrise at a spot can be later and sunset earlier when mountains block the horizon; the cast shadows show that, the sunrise/sunset numbers don't.

Shadows are computed from the elevation data: for every ground point Helios walks toward the sun and checks whether terrain rises above it, including mountains up to 12 km away and the curvature of the earth. Edges are softened by the width of the sun's disk.

Terrain detail depends on the region. With the default detailed elevation (Mapterhorn), South Tyrol is 2.5 m (the province's DGM, CC0), Austria 1 m, Switzerland and several Italian regions 0.5 to 5 m, and the rest of the world 30 m (Copernicus). That's enough for towers, gullies and small ridges, not for single trees or buildings (the optional Google 3D tiles show those, but their shadows aren't computed: the painted shadows come from the terrain). South Tyrol's own 0.5 m LiDAR is only published as pre-lit pictures, so 2.5 m is the finest usable there without running a tile server. Its 20 cm 2023 aerial photos are available as an imagery choice.

Fonts: Barlow and Barlow Condensed (SIL Open Font License), loaded from Google Fonts. The logo lettering is drawn in SVG, not a font.

Libraries: MapLibre GL JS (BSD-3), maplibre-contour (BSD-3), React (MIT), Zustand (MIT), @photostructure/tz-lookup (CC0, timezone from coordinates), @tmcw/togeojson (BSD-2, GPX and KML import), exifr (MIT, photo GPS and capture time), Mediabunny (MPL-2.0, MP4 export), three.js (MIT) and 3d-tiles-renderer (Apache-2.0) for the optional Google 3D tiles (loaded only when switched on). Tests only: Vitest (MIT), happy-dom (MIT).

## Project layout

```
src/
  map/     MapLibre setup, style and base layers, camera controls, tile and elevation sources, shadow layer, performance modes, optional Google 3D tiles
  scene/   3D sun scene: compass ring, sun paths, sun, labels, dragging; golden/blue hour light colour; lens look
  sun/     sun position, sunrise and sunset, seasons, timezones, inverse solver for dragging
  terrain/ elevation tiles, height mosaic, shadow ray-march (CPU reference and GPU shader)
  weather/ MET Norway forecast: fetching, picking the slot for a time, warnings
  layers/  your routes, places and photos: file import (GPX/KML/GeoJSON, EXIF), map drawing, photo storage; Wikimedia Commons photo spots
  store/   app state (Zustand), saved in the browser
  ui/      HUD: top bar, forecast, alerts, sun chart, tool dock, panels, search, readout, lens overlay, theme
tests/     unit tests
```
