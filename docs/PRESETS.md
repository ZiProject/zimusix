# Preset Runtime & Preset Conventions

Presets determine the **entire visual presentation of Zimusix**:

| Preset controls | Section in `preset.json` |
| --- | --- |
| Overall layout + web shell arrangement (sidebar, player bar, density, content width) | `layout` |
| **All buttons and controls** (common buttons, Play button, navigation, toolbar, panel style, icon size) | `controls` |
| Artwork presentation (cover art) | `artwork` |
| Track information display style | `info` |
| Background effects | `background` |
| Visualizer | `visualizer` |
| Lyrics display style | `lyrics` |
| Colors, typography | `theme` |
| User-configurable settings | `settings` |

Presets are **declarative data**: they select available modules in the app and assign parameters. Presets **do not contain executable JS or HTML**,
ensuring imported presets cannot run arbitrary code. Custom visual effects are authored via `style.css`.

> **Status:** schema version **1**. Everything in this document (except the [Roadmap](#roadmap-deeper-customization)) is implemented and verified
> by `npm run presets:check` and `npm run test:presets`.

## Built-in Presets

Located in `public/presets/<id>/`, listed in `public/presets/index.json`.

| id | Shell · Sidebar · Player | Artwork | Background | Visualizer (placement) | Lyrics | Uses `style.css` | Exposed settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `classic` | classic · left · bottom | rounded | media (cover/video) | bars (player) | list · view | – | none (baseline defaults) |
| `lyrics-focus` | focus · rail · floating | rounded | gradient | wave (stage) | karaoke · stage | – | lyrics size, lyrics mode, glow, accent |
| `neon-stage` | stage · hidden · minimal | circle, spinning | particles | circle ring (stage) | focus · stage | – | particle count, viz height, viz type, spin, accent |
| `split-studio` | split · right · top | polaroid | media | mirror (background) | list · stage | – | radius, density, viz opacity, button style |
| `vinyl-night` | split · rail · floating | vinyl, spinning | aurora | wave (stage) | karaoke · stage | – | spin speed, accent, aurora intensity, lyrics size, panels |
| `neon-afterlife` | stage · rail · floating | polaroid | aurora | bars (stage + player) | focus · stage | ✔ (scanlines, neon edges) | neon intensity, scanlines (`css:` vars), accent, bass reactivity |
| `dynamic-scenes` | stage · rail · floating | circle, spinning | **5 switchable scenes**: sakura · rainy city · fireworks · hearts · note rain | circle ring (stage) | karaoke · stage | ✔ (re-tints the UI per scene) | scene, brightness, density, speed, react, reaction strength, cover behind scene, viz type, spin, lyrics size |

`dynamic-scenes` is the reference example for the **music-reactive scene** backgrounds (see [`background`](#background)): a `select` setting bound to
`background.effect` lets the user switch the animated world live, and its `style.css` re-tints the interface for each scene through `html[data-bg-effect="…"]`.

`neon-afterlife` is the reference example for a preset that combines declarative modules with `style.css`, `css:--preset-*` settings,
a custom `README.md` and an SVG preview.

## Directory Structure

```
my-preset/                 ← folder name = "id" in preset.json
├─ preset.json             REQUIRED  manifest
├─ preview.png             recommended  preview image, 640×360 (16:9)
├─ style.css               optional  additional CSS
├─ assets/                 optional  images, fonts, videos used by style.css
│   ├─ noise.png
│   └─ ...
└─ README.md               optional  notes, license
```

Conventions:

- **Preview image**: located at the **preset folder root**, default name `preview.png`. Custom name configured via `"preview": "custom-name.webp"`
  (extensions: png, jpg, jpeg, webp, svg, avif). Recommended resolution **640×360 px**, 16:9 aspect ratio, under 300 KB. If missing, a styled placeholder
  (first letter of the preset name) is displayed and `presets:check` prints a warning.
- **`id`**: lowercase letters, numbers, `-` or `_`, 2–48 characters, starting with alphanumeric. Should match the directory name
  (a mismatch is only a warning in the app, but file serving uses the directory name — keep them identical).
- **Allowed file extensions**: `json css png jpg jpeg webp gif avif svg woff woff2 ttf otf mp4 webm md txt`.
  Folders containing other extensions (especially `.js`, `.html`) are **rejected** during import.
  `Thumbs.db`, `desktop.ini`, `.DS_Store` and hidden (`.`-prefixed) directories are silently skipped.
- **Limits**: ≤ 200 files, ≤ 30 MB, ≤ 6 directory levels deep, no symlinks, `preset.json` ≤ 128 KB, ≤ 50 presets per single import.
- **Paths** in manifest and CSS must always be **relative** to the preset folder root, using `/`, without `..`.

Starter template: [`docs/preset-template/`](./preset-template/). Its folder name (`preset-template`) intentionally differs from its id (`my-preset`),
so `presets:check` always prints one harmless warning for it. Rename the folder to your id when you copy it.

## How Users Install Presets

1. Open the **Themes** tab → **Add preset folder** (in the Tauri app; in browser/dev mode paste an absolute folder path instead).
2. Select *a preset folder* (containing `preset.json`) **or** a parent folder containing multiple preset subfolders.
3. The sidecar validates and **copies** files into the app preset store (`<app data dir>/presets/<id>/`), so deleting or moving the original folder will not break the installed preset.
   Importing a preset with an `id` that is already installed **overwrites** it (the previous files are replaced atomically).
4. Click **Use this preset**. Configurable parameters appear in the "Customize" section below (only parameters exposed by the preset author).

Built-in presets reside in `public/presets/<id>/` and follow the **same conventions**; listed in `public/presets/index.json`
(regenerated via `npm run presets:index`, and automatically by `npm run web` / `npm run web:build`). User-installed presets are keyed as `user:<id>`
internally, preventing collisions with built-in presets, and show a **Custom** badge. A broken installed preset is still listed (with its errors) so it can be deleted.
If the active preset is deleted or becomes invalid, the app falls back to `classic`.

## `preset.json`

```jsonc
{
  "schema": 1,                    // schema format version (currently 1; higher values are rejected)
  "id": "my-preset",
  "name": "Display Name",         // ≤ 60 characters
  "version": "1.0.0",             // ≤ 20 characters
  "author": "…",                  // ≤ 60 characters
  "description": "≤ 300 characters",
  "tags": ["…"],                  // ≤ 8 tags, each ≤ 24 characters
  "preview": "preview.png",
  "style": "style.css",           // optional

  "layout": {}, "controls": {}, "artwork": {}, "info": {}, "background": {},
  "visualizer": {}, "lyrics": {}, "theme": {},
  "settings": []
}
```

Any omitted section defaults to the original baseline (`classic`). Invalid or out-of-range parameters **do not crash the preset**:
the app ignores invalid values and falls back to defaults while displaying non-fatal warnings on the preset card.
Unknown top-level fields and unknown parameters produce a warning and are ignored (`$schema` is accepted).
Only a bad `id`, missing `name`, or a `schema` newer than the app makes a preset **unusable**.

## Module Parameters

The tables below describe parameters defined in `src/presets/schema.js` (the single source of truth). They are maintained by hand —
when you change `MODULES`, update this section too (see [Roadmap](#roadmap-deeper-customization) for a generator).

### `layout`

Overall interface layout (sidebar, player position, content width).

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `shell` | `classic` · `stage` · `focus` · `split` | `classic` | classic: vertical list \| stage: centered stage \| focus: lyrics emphasis \| split: side-by-side stage + content |
| `sidebar` | `left` · `right` · `rail` · `hidden` | `left` | Sidebar position: left, right, collapsed icon rail, or hidden |
| `player` | `bottom` · `floating` · `top` · `minimal` | `bottom` | Player position: bottom bar, floating pill, top bar, or minimal |
| `density` | `comfortable` · `compact` | `comfortable` | Spacing and padding density |
| `defaultView` | `keep` · `search` · `library` · `queue` · `related` · `lyrics` · `nowplaying` · `presets` · `discord` | `keep` | View to activate when the preset is applied — on selection **and on app startup** when it is the saved preset (`keep` preserves the active tab) |
| `contentWidth` | number 560–1400 | `880` | Maximum content width (px) |
| `radius` | number 0–28 | `12` | Panel corner radius (px) |

`sidebar: "hidden"` also sets the app's sidebar-hidden state. The user can still toggle the sidebar with the toolbar button; changing a *setting* that
alters `layout.sidebar` re-syncs that state.

### `controls`

Visual appearance of buttons, toolbars, navigation items, and panels.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `buttons` | `soft` · `pill` · `square` · `ghost` · `outline` | `soft` | General button style: soft (default) \| pill \| square \| ghost (borderless) \| outline (accent border) |
| `playButton` | `circle` · `square` · `accent` | `circle` | Play/Pause button: circle \| rounded square \| solid accent fill |
| `nav` | `soft` · `pill` · `bar` | `soft` | Sidebar navigation item style: soft \| pill \| bar (indicator line) |
| `toolbar` | `docked` · `floating` · `transparent` · `autohide` | `docked` | Top toolbar: docked \| floating pill \| transparent \| autohide on hover |
| `panels` | `solid` · `glass` · `flat` | `solid` | Background of sidebar/player/dialogs: solid \| frosted glass \| flat (transparent) |
| `iconSize` | number 14–26 | `18` | Button and navigation icon size (px) |

### `artwork`

Artwork presentation (player bar + Now Playing stage).

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `style` | `square` · `rounded` · `circle` · `vinyl` · `polaroid` · `none` | `rounded` | Artwork shape style (`none` hides the stage cover and disables the circle "ring" visualizer) |
| `size` | number 32–96 | `56` | Artwork size in bottom player bar (px) |
| `stageSize` | number 160–560 | `320` | Artwork size on Now Playing stage (px) |
| `react` | `true` / `false` | `true` | Artwork pulses with bass energy |
| `reactAmount` | number 0–20 | `8` | Pulse intensity (%) |
| `glow` | `true` / `false` | `true` | Dynamic glow aura reacting to bass |
| `spin` | `true` / `false` | `false` | Rotates during playback (best for circle / vinyl) |
| `spinSpeed` | number 4–60 | `18` | Seconds per rotation |
| `shadow` | `true` / `false` | `false` | Drop shadow beneath artwork |

### `info`

Track metadata rendering (player bar + Now Playing stage).

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `style` | `inline` · `stacked` · `centered` · `huge` | `inline` | inline: compact \| stacked: larger title \| centered: center alignment \| huge: poster typography |
| `show` | array ⊂ {`title`, `artist`, `source`, `duration`} | `["title","artist","source"]` | Metadata fields to display |
| `marquee` | `true` / `false` | `true` | Marquee scrolling when title overflows container (pauses on hover). When disabled, truncates with ellipsis (huge wraps to 2 lines max). CSS can target `html[data-info-marquee="0"]` / `"1"` |
| `titleScale` | number 0.7–2 | `1` | Font scale multiplier for title |

### `background`

Background visual effects, rendered in a fixed layer behind the UI (`#bg-layer`).

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `effect` | `media` · `aurora` · `gradient` · `solid` · `particles` · `glyphs` · `hearts` · `fireworks` · `rain` · `sakura` | `media` | media: cover art/video \| aurora \| gradient \| solid \| particles \| **music-reactive scenes** (see below): glyphs = rain of music notes, hearts, fireworks, rainy city, sakura |
| `media` | `auto` · `on` · `off` | `auto` | Whether to overlay cover art/video (auto: only when effect = media) |
| `colors` | array of ≤ 4 hex colors | `[]` | Effect palette; empty = derived from accent colors. **aurora** and **gradient** use the first **3** colors; the 4th is only used by **particles**. For the **scenes** an empty list means "the scene's own palette"; if set, glyphs blends the colors across the screen, hearts / fireworks / sakura draw from the list |
| `speed` | number 0.2–3 | `1` | Animation speed multiplier |
| `intensity` | number 0–1 | `0.6` | Opacity/intensity of the **effect** layer (does not affect cover/video — see below) |
| `angle` | number 0–360 | `135` | Gradient angle (degrees) |
| `count` | number 10–200 | `70` | Particle count (particles effect); for scenes the density of notes / hearts / sparks / drops / petals |
| `react` | `true` / `false` | `true` | Effect reacts dynamically to music energy |
| `sensitivity` | number 0.2–2 | `1` | Multiplier for how strongly the **scenes** respond to bass/energy (`react` must be on) |

#### Music-reactive scenes

`glyphs`, `hearts`, `fireworks`, `rain` and `sakura` are original canvas animations drawn by `src/presets/bg-scenes.js` on the `#bg-particles` canvas
(they share it with `particles`, so only one runs at a time). They paint their own backdrop, so `background.intensity` controls the opacity of both
backdrop and elements; `speed`, `count`, `colors`, `react` and `sensitivity` work as described above.

| Scene | Ambient (nothing playing) | Reaction to the music |
| --- | --- | --- |
| `glyphs` | music notes fall in depth layers over a gently waving five-line staff | left lanes follow the bass, right lanes the energy; each beat sends a shock-wave from the bottom that swells the notes it passes; bass makes the staff tremble |
| `hearts` | glossy hearts rise like bubbles and pop into sparkles | a lub-dub heartbeat pulse + expanding ring on each beat, a few new hearts per beat, energy speeds up the rise |
| `fireworks` | a shell every 1–2.5 s over a skyline and water; bursts: peony · tilted ring · spiral · willow · crackle, with reflections | each beat launches a shell (two on the hardest hits), energy raises launch rate and brightness, bass glows the horizon and ripples the reflections |
| `rain` | layered rain, perspective puddle ripples, glowing city bokeh | energy slants and thickens the rain, lamps swell with the bass, the hardest hits call a lightning bolt |
| `sakura` | a blossoming branch under a dusk sky and moon; petals swirl in a wind field | each beat pulses the blossoms and sheds a burst of petals, energy strengthens wind and flutter, the moon glow breathes with the bass |

Beat detection: a hit is a bass value clearly above its own slow average (≥ 190 ms apart). With `react: false`, in `prefers-reduced-motion`, or when nothing plays,
scenes fall back to calm ambient motion (reduced-motion also slows them to 35 %).

**Interplay with the user's own Background panel.** The toolbar's *Background* panel (blur, opacity, overlay dimming, bass bounce, cover-art fallback)
is an **app-level user preference**, stored in `localStorage["zimusix-bg"]` and independent of presets. Those sliders affect the cover-art / video layer
(shown when `media` resolves to on), while `background.intensity`, `speed`, `angle`, `colors` and `react` affect only the preset effect layer.
The video/cover overlay can be shown together with an effect by setting `media: "on"`.

### `visualizer`

Audio visualizer.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `type` | `bars` · `mirror` · `wave` · `circle` · `dots` · `none` | `bars` | Visualizer rendering type. `circle` wraps around the artwork when placed on `stage` and artwork is not `none` |
| `placement` | array ⊂ {`player`, `stage`, `background`} | `["player"]` | Where to render (can target multiple placements). `stage` requires the Now Playing view |
| `bars` | number 8–96 | `32` | Number of frequency bars/points |
| `colorMode` | `gradient` · `accent` · `solid` | `gradient` | Color mode (gradient = `accent` → `accent2`) |
| `color` | hex color | `#a78bfa` | Color when colorMode = solid |
| `thickness` | number 1–10 | `2` | Bar gap / line width (px). Ignored by `dots` |
| `smoothing` | number 0–0.95 | `0` | Temporal frame smoothing factor |
| `opacity` | number 0.1–1 | `1` | Visualizer opacity |
| `height` | number 60–420 | `120` | Visualizer canvas height on Now Playing stage (px) |

A soft glow is added automatically to canvases wider than 240 px (stage/background); it is not configurable yet.
Audio-reactive values (`--music-*`) are computed even when `type` is `none`, so artwork, background and lyrics keep reacting.

### `lyrics`

Lyrics presentation.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `mode` | `list` · `karaoke` · `focus` · `compact` | `list` | list: full list \| karaoke: active line prominent, distant lines blurred \| focus: active + adjacent lines centered \| compact: dense text |
| `placement` | `view` · `stage` | `view` | view: Lyrics tab \| stage: embedded on Now Playing stage |
| `align` | `left` · `center` · `right` | `left` | Text alignment |
| `showTime` | `true` / `false` | `true` | Show timestamp per line |
| `size` | number 14–48 | `22` | Base font size (px) |
| `activeScale` | number 1–1.8 | `1.27` | Active line scale multiplier |
| `glow` | `true` / `false` | `true` | Active line glows with music energy |

### `theme`

Colors & typography.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `colorScheme` | `dark` · `light` | `dark` | Native control color scheme (scrollbars, form inputs) |
| `fontFamily` | font-family string | — | CSS font-family stack (≤ 120 chars; letters, digits, spaces, `,` `'` `"` `-` `.` only) |
| `colors` | object | `{}` | Keys: `accent`, `accent2`, `bg`, `panel`, `panel2`, `line`, `text`, `muted`, `ok`, `danger` → hex values (`#rgb`, `#rrggbb`, `#rrggbbaa`) |

`fontFamily` can only name fonts that are already installed on the system. Bundled fonts (`woff2`, …) can be shipped in `assets/` but must currently be
declared with `@font-face` in `style.css`.

## `settings` — User Configurable Options

Each item registers an interactive control that binds to a parameter via `bind`. The controls appear in **Themes → Customize** and, for quick access while listening, at the bottom of the **Background panel** (sliders icon in the top-right toolbar).
Users can only modify options you explicitly declare; values are clamped to specified ranges and persisted per preset.

| Field | Description |
| --- | --- |
| `key` | Unique camelCase identifier (`^[a-z][A-Za-z0-9]{0,31}$`) |
| `label` / `description` | Display label (≤ 60 chars, defaults to `key`) and tooltip note (≤ 160 chars) |
| `type` | `range` (number) · `toggle` (boolean) · `select` (enum) · `color` (hex) |
| `bind` | Target: `"section.param"` (e.g. `"visualizer.bars"`), `"theme.colors.accent"`, `"theme.colorScheme"`, or `"css:--preset-name"` |
| `min` `max` `step` `unit` | For `range`. Range cannot exceed parameter bounds (for `css:` binds you set the bounds yourself) |
| `options` | For `select`: `[{ "value": "...", "label": "..." }]`, ≤ 12 options, each `value` must be a valid enum choice |
| `default` | Optional fallback; if omitted, defaults to the section parameter value |

Type bindings: `range` → numeric parameter (or `css:`), `toggle` → boolean parameter, `select` → enum parameter, `color` → color parameter / `theme.colors.*` / `css:--preset-*`.
`css:--preset-*` sets a CSS custom property for consumption in your `style.css` (the `--preset-` prefix is mandatory to avoid colliding with core variables;
`range` values get the `unit` appended).

Limits and constraints:

- At most **24** settings per preset; extra entries are ignored.
- Parameters of type **list** (`info.show`, `visualizer.placement`), **colors** (`background.colors`) and **font** (`theme.fontFamily`) **cannot be bound** to a setting yet.
  Authors can only expose them indirectly (e.g. a `select` that is bound to another enum, or CSS variables).
- Settings are a flat list (no groups, no conditional visibility).

Persistence & precedence: user selections are stored in `localStorage["zimusix-preset"]` as `{ active, values: { [presetKey]: { [settingKey]: value } } }`.
Precedence order: user selection > setting `default` > section manifest value. **Reset preset to defaults** clears the stored values of the active preset.
Setting changes apply immediately without reloading `style.css` and without re-rendering the whole page (so sliders stay smooth).

## `style.css`

Loaded while the preset is active and unloaded when switching presets. The app **sanitizes** styles before injection:

- `@import` rules are stripped.
- `url(...)` only accepts relative paths within the preset folder (e.g. `url(assets/noise.png)`), `data:` URIs, or `#fragment` references. External `http(s)://` URLs are blocked → presets run fully offline.
- `expression()`, `behavior`, `-moz-binding` are stripped.

Sanitizer notes (what was removed or blocked) are shown by `npm run presets:check`; **they are not shown in the app UI yet**.
The sanitizer is not a layout sandbox: CSS can restyle or cover any part of the interface, so users should only install presets from sources they trust.

### CSS hooks

`data-*` attributes on `<html>`, one per preset parameter:

| Attribute | Values / source |
| --- | --- |
| `data-preset` | preset id |
| `data-shell` · `data-sidebar` · `data-player-pos` · `data-density` | `layout.*` |
| `data-btn` · `data-play-btn` · `data-nav` · `data-toolbar` · `data-panels` | `controls.*` |
| `data-artwork` · `data-art-spin` (`1`/`0`) · `data-art-shadow` (`1`/`0`) | `artwork.*` |
| `data-info` · `data-info-marquee` (`1`/`0`) | `info.*` |
| `data-bg-effect` | `background.effect` (also `data-effect` on `#bg-layer`) |
| `data-viz` · `data-viz-player` (`1` when the player-bar visualizer is on) | `visualizer.*` |
| `data-lyrics-mode` · `data-lyrics-align` · `data-lyrics-time` (`1`/`0`) | `lyrics.*` |
| `data-scheme` | `theme.colorScheme` |

State class: `is-playing` on `<html>` while audio plays.

CSS variables set by the runtime:

| Variable | Source |
| --- | --- |
| `--accent` `--accent-2` `--bg` `--panel` `--panel-2` `--line` `--text` `--muted` `--ok` `--danger` (+ `--bg-rgb`, `--panel-rgb`) | `theme.colors.*` |
| `--content-width` `--radius` `--icon-size` | `layout.*`, `controls.iconSize` |
| `--stage-art` `--spin-speed` `--art-react` `--art-glow` | `artwork.*` (player-bar cover size is applied directly by the app) |
| `--lyrics-size` `--lyrics-active-scale` `--viz-stage-h` `--info-title-scale` | `lyrics.*`, `visualizer.height`, `info.titleScale` |
| `--fx-speed` `--fx-intensity` `--fx-angle` · `--fx-1…--fx-4` (on `#bg-layer`) | `background.*` |
| `--music-bass` `--music-energy` `--music-punch` (0–1, live audio values) | audio analyser |
| `--preset-*` | `settings` bound to `css:--preset-*` |

Useful elements: `.stage-cover`, `.stage-title`, `.stage-info`, `.stage-lyrics`, `.stage-viz`, `.cover`, `.track-grid` / `.track-card` / `.track-art` / `.track-title` / `.track-author` (song cards in Search, Queue, Related), `.lyrics-list`, `.lyric-line` (with `.active`, `.past` and
`data-d="0…4"` = distance from the active line), `.player`, `.sidebar`, `.main-toolbar`, `#bg-layer`, `#bg-fx`.

## Validating Presets

```sh
npm run presets:check                       # built-in presets + starter template
node scripts/presets.mjs check ./my-preset  # custom preset (or directory of presets)
npm run test:presets                        # schema + sidecar preset store unit tests (no Rust/ffmpeg needed)
```

The CLI runner uses the exact same schema validator as the app and verifies real assets on disk (preview, style.css, file extensions, file sizes).
Current status: all seven built-in presets and the template pass (the template reports one expected directory-name warning); 22/22 tests pass.

## Runtime Architecture (For Contributors)

```
src/presets/
├─ schema.js       module registration + parameters, normalizeManifest(), resolveConfig(), settings validation (shared with scripts/)
├─ css.js          CSS sanitizer                                                           (pure)
├─ loader.js       loads built-in presets (public/presets) and user presets (sidecar GET /presets)
├─ store.js        persists selected preset + custom settings in localStorage ("zimusix-preset")
├─ runtime.js      applyPreset / setPresetSetting; sets data-* attributes and CSS vars on <html>; fires onPresetChange
├─ visualizers.js  bars · mirror · wave · circle · dots canvas visualizers
├─ bg-fx.js        particles background effect (aurora/gradient/solid implemented in CSS)
├─ bg-scenes.js    music-reactive scenes: glyphs · hearts · fireworks · rain · sakura (+ beat detector)
└─ reactive.js     shared bass/energy state read by the particles effect and the scenes
src/ui/visualizer.js          per-frame audio analysis → --music-* vars, draws visualizer onto player/stage/background canvases
src/features/background.js    background layer: cover/video, effect palette (--fx-*), particles / scene start-stop
src/ui/views/presets.js       Themes view: gallery cards + generated settings controls
src/styles/preset-layout.css   shell / sidebar / player / density
src/styles/preset-modules.css  artwork / info / visualizer / lyrics / background
src/styles/preset-controls.css buttons, navigation, toolbar, panels, icon size
src/styles/preset-gallery.css  Themes page styling
sidecar/presets.js             install, list, delete, serve preset files (sandboxed path/ext/size checks)
```

Flow: `initPresets()` loads built-in + user entries → `applyPreset()` loads/sanitizes CSS, resolves config (`resolveConfig` = manifest + user setting values)
→ `applyConfig()` writes `data-*` attributes and CSS variables → `onPresetChange` listeners (wired in `main.js`) re-render player/sidebar/main view and restart the background effect.

Adding a **new value for a module** (e.g. a new visualizer type): add it to `MODULES` in `schema.js`, implement corresponding rendering/CSS,
update the parameter table above, then run `npm run presets:check` and `npm run test:presets`.

Sidecar API endpoints: `GET /presets` · `POST /presets/import {path}` · `POST /presets/remove {id}` (bearer token) and
`GET /presets/file?id=&path=&token=` (token as query parameter so `<img>`/`<link>`/`<video>` can load files; supports `Range` for video).

## App Behavior (Independent of Presets)

- **Minimal view toggle (`H` key / eye icon)**: when hidden, selecting any sidebar tab (Search, Queue, Lyrics…) or clicking the Lyrics button in the player bar automatically restores the view. The state is persisted.
- The **Now Playing** item is always pinned at the top of the sidebar.
- The **Background panel** (blur / opacity / dimming / bass bounce / cover fallback) is a user-level setting that applies on top of any preset (see `background`).
- `prefers-reduced-motion` is honored for the aurora blobs, spinning artwork, title marquee and the music-reactive **scenes** (slowed to 35 %, no beat reactions). The **particles** canvas and the other audio-reactive pulses do not check it yet.

## Known Limitations (Current State)

- Settings cannot control list, palette or font parameters; no grouping or conditional visibility; max 24 settings.
- Users cannot edit arbitrary preset parameters or create/duplicate presets inside the app — only the author-exposed settings are adjustable.
- Preset folders must be imported from disk (no zip import, no sharing/registry, no update mechanism).
- Layout is limited to four fixed `shell` arrangements; the order and position of cover / info / visualizer / lyrics on the stage can only be changed with `style.css`.
- Audio reactivity (bass band, smoothing, sensitivity) is hard-coded; presets can only turn it on/off per module.
- Fonts bundled in `assets/` require manual `@font-face`; background images/videos from the preset folder require `style.css`.
- Sanitizer notes are not displayed in the app; there is no JSON Schema file for editor autocomplete (the template's `$schema` URL is a placeholder), and no documentation generator.

## Roadmap: Deeper Customization

Directions are ordered by value-to-effort. All of them keep the core rule: **presets stay declarative** (no JS/HTML), additions are optional fields,
and an older app simply ignores them with a warning (so most items can stay within `schema: 1`; bump to `2` only for breaking changes).

### Phase 1 — Lift the limits of `settings` (schema + UI only, low risk)

1. **New setting types** that bind to the parameters that are currently unreachable:
   - `multiselect` → `list` params (`info.show`, `visualizer.placement`);
   - `palette` → `background.colors` (1–4 color pickers);
   - `font` → `theme.fontFamily` as a `select` from a curated safe list (system stacks + fonts shipped in `assets/`).
2. **Grouping and conditions**: `group` (collapsible sections in Customize) and `visibleIf` (e.g. show *Particle count* only when `background.effect = particles`).
   Raise the 24-setting cap or make it per group.
3. **User override layer ("Advanced" editor)**: auto-generate a full editor from `MODULES` (it already knows type, min/max/step, enum values and docs of every
   parameter). Store overrides next to setting values (precedence: advanced override > setting > default > manifest) with per-parameter reset.
   Because the schema is the single source of truth, new parameters appear in the editor with no extra UI work.
4. **Duplicate / export / import**: "Duplicate as my preset" writes a preset folder into the user store (via a new sidecar endpoint) so users can fork any
   preset; export a preset (or just the user's customization) as JSON to share.
5. **Authoring quality**: surface sanitizer notes on the preset card; generate `preset-1.json` (JSON Schema) from `MODULES` so editors autocomplete `preset.json`;
   add `node scripts/presets.mjs docs` to regenerate the parameter tables of this file between markers (the previous version of this doc claimed
   this existed; it did not).

### Phase 2 — Richer modules and reuse

6. **Preset variants**: `variants: [{ id, name, set: { "visualizer.type": "mirror", … } }]` — one-click named bundles (Night / Minimal / Party) reusing the settings engine.
7. **Inheritance**: `extends: "classic"` (or a built-in/user id, depth ≤ 3, cycle-checked) with deep merge, so a preset can be a 10-line diff of another one.
8. **`reactive` module** exposing what is hard-coded today: `bassHz` range, `sensitivity`, `attack`/`release`, and which targets react (artwork, background, lyrics, UI accents).
9. **More parameters per module** (each is: schema entry + CSS/JS + doc row):
   - visualizer: `glow`, `gap`, `rounded`, `peakHold`, `mirrorVertical`, per-visualizer `colors`;
   - artwork: `border`, `tilt`/parallax, aspect ratio;
   - info: `uppercase`, `letterSpacing`, `artistScale`, `weight`;
   - lyrics: `inactiveOpacity`, `blur`, `lineGap`, `weight`;
   - layout: `sidebarWidth`, `playerHeight`, per-view `contentWidth`;
   - controls: `focusRing`, `hoverEffect`, `seekbar` style (line / thick / wave), volume control style.
10. **First-class assets**: `theme.fonts: [{ family, file: "assets/x.woff2" }]` (runtime generates `@font-face`), `background.image` / `background.video`
    from the preset folder (with `fit`, `blur`, `parallax`) — both currently require hand-written CSS.
11. **New background effects**: `waves`, `noise/grain`, `grid`, `spectrum-blur`, each with the existing `colors/speed/intensity/react` parameters.
    Also use the 4th palette color in aurora/gradient, or document the 3-color limit permanently.

### Phase 3 — Dynamic and contextual presets

12. **Color from artwork**: `"accent": "@cover"` / `background.colors: "@cover"` — extract a palette from the current thumbnail (through the sidecar thumbnail
    proxy to avoid canvas tainting), animate transitions between tracks, with a contrast guard so text stays readable.
13. **Declarative rules** (no scripting): `rules: [{ when: { width: "<900" }, set: { "layout.sidebar": "rail" } }]`. `when` is a closed whitelist:
    viewport width/height, fullscreen, view, source (`youtube|soundcloud|spotify|attachments`), `playing`, `hasLyrics`, `hasVideo`, target (`local|discord`),
    time of day. The runtime re-resolves config when a condition flips.
14. **More CSS hooks** so `style.css` can do the same: `data-view`, `data-playing`, `data-source`, `data-has-lyrics`, `data-has-video`, `data-target`,
    `--cover-color`, `--cover-color-2`, `--track-progress`.
15. **Performance/accessibility profile**: a `performance` section (max FPS, canvas scale, particle cap, disable blur) plus automatic degradation on low
    frame rate / battery saver, and make `prefers-reduced-motion` also cover particles and audio-reactive pulses.

### Phase 4 — Structural freedom and distribution

16. **Slot-based stage layout**: replace "pick one of four shells" with a declarative composition, e.g.
    `layout.stage: { direction: "row", slots: ["cover", { "info": { align: "end" } }, "lyrics"], visualizer: "overlay" }` with ordering, anchors, gaps and
    per-slot visibility. `shell` stays as a shortcut for the common arrangements.
17. **Packaging & sharing**: import from `.zip` (validated by the sidecar with the same limits plus zip-bomb/path-traversal checks), `engine`/`minAppVersion`
    compatibility field, signed or hash-pinned "official gallery" index, update check for installed presets.
18. **Authoring tools**: `presets watch <folder>` (hot-reload a folder in dev mode without importing), automatic preview-image capture, contrast/accessibility lint
    in `presets:check`.

### Security checklist for every new capability

- Keep all inputs inside closed vocabularies (enums, clamped numbers, hex colors, preset-relative paths); never evaluate strings as code or expressions.
- `extends`, `fonts`, `image`/`video` only resolve **inside the preset store**, using the existing `safeRelPath` / extension allow-list / `realpath` checks.
- Rules and `@cover` must not leak data off-device: no network access from presets.
- Every new parameter must degrade to its default with a warning (never an error) so older presets keep working.
