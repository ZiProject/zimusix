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
  (extensions: png, jpg, jpeg, webp, svg, avif). Recommended resolution **640×360 px**, 16:9 aspect ratio, under 300 KB. If missing, a styled placeholder is displayed.
- **`id`**: lowercase letters, numbers, `-` or `_`, 2–48 characters, starting with alphanumeric. Must match directory name.
- **Allowed file extensions**: `json css png jpg jpeg webp gif avif svg woff woff2 ttf otf mp4 webm md txt`.
  Folders containing other extensions (especially `.js`, `.html`) are **rejected** during import.
- **Limits**: ≤ 200 files, ≤ 30 MB, ≤ 6 directory levels deep, no symlinks, `preset.json` ≤ 128 KB.
- **Paths** in manifest and CSS must always be **relative** to the preset folder root, using `/`, without `..`.

Starter template: [`docs/preset-template/`](./preset-template/).

## How Users Install Presets

1. Open the **Themes** tab → **Add preset folder**.
2. Select *a preset folder* (containing `preset.json`) **or** a parent folder containing multiple preset subfolders.
3. The sidecar validates and **copies** files into the app preset store (`<app data dir>/presets/<id>/`), so deleting or moving the original folder will not break the installed preset.
4. Click **Use this preset**. Configurable parameters appear in the "Settings" section below (only parameters exposed by the preset author).

Built-in presets reside in `public/presets/<id>/` and follow the **same conventions**; listed in `public/presets/index.json`
(regenerated via `npm run presets:index`). User-installed presets are prefixed with `user:<id>` internally, preventing collisions with built-in presets.

## `preset.json`

```jsonc
{
  "schema": 1,                    // schema format version (currently 1)
  "id": "my-preset",
  "name": "Display Name",
  "version": "1.0.0",
  "author": "…",
  "description": "≤ 300 characters",
  "tags": ["…"],                  // ≤ 8 tags
  "preview": "preview.png",
  "style": "style.css",           // optional

  "layout": {}, "controls": {}, "artwork": {}, "info": {}, "background": {},
  "visualizer": {}, "lyrics": {}, "theme": {},
  "settings": []
}
```

Any omitted section defaults to the original baseline (`classic`). Invalid or out-of-range parameters **do not crash the preset**:
the app ignores invalid values and falls back to defaults while displaying non-fatal warnings on the preset card.

## Module Parameters

The tables below describe parameters defined in `src/presets/schema.js` (the single source of truth).

### `layout`

Overall interface layout (sidebar, player position, content width).

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `shell` | `classic` · `stage` · `focus` · `split` | `classic` | classic: vertical list \| stage: centered stage \| focus: lyrics emphasis \| split: side-by-side stage + content |
| `sidebar` | `left` · `right` · `rail` · `hidden` | `left` | Sidebar position: left, right, collapsed icon rail, or hidden |
| `player` | `bottom` · `floating` · `top` · `minimal` | `bottom` | Player position: bottom bar, floating pill, top bar, or minimal |
| `density` | `comfortable` · `compact` | `comfortable` | Spacing and padding density |
| `defaultView` | `keep` · `search` · `library` · `queue` · `related` · `lyrics` · `nowplaying` · `presets` · `discord` | `keep` | View to activate when selecting preset ("keep" preserves active tab) |
| `contentWidth` | number 560–1400 | `880` | Maximum content width (px) |
| `radius` | number 0–28 | `12` | Panel corner radius (px) |

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
| `style` | `square` · `rounded` · `circle` · `vinyl` · `polaroid` · `none` | `rounded` | Artwork shape style |
| `size` | number 32–96 | `56` | Artwork size in bottom player bar (px) |
| `stageSize` | number 160–560 | `320` | Artwork size on Now Playing stage (px) |
| `react` | `true` / `false` | `true` | Artwork pulses with bass energy |
| `reactAmount` | number 0–20 | `8` | Pulse intensity (%) |
| `glow` | `true` / `false` | `true` | Dynamic glow aura reacting to bass |
| `spin` | `true` / `false` | `false` | Rotates during playback (best for circle / vinyl) |
| `spinSpeed` | number 4–60 | `18` | Seconds per rotation |
| `shadow` | `true` / `false` | `false` | Drop shadow beneath artwork |

### `info`

Track metadata rendering.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `style` | `inline` · `stacked` · `centered` · `huge` | `inline` | inline: compact \| stacked: larger title \| centered: center alignment \| huge: poster typography |
| `show` | array ⊂ {`title`, `artist`, `source`, `duration`} | `["title","artist","source"]` | Metadata fields to display |
| `marquee` | `true` / `false` | `true` | Marquee scrolling when title overflows container (pauses on hover). When disabled, truncates with ellipsis (huge wraps to 2 lines max). CSS can hook into `html[data-info-marquee]` |
| `titleScale` | number 0.7–2 | `1` | Font scale multiplier for title |

### `background`

Background visual effects.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `effect` | `media` · `aurora` · `gradient` · `solid` · `particles` | `media` | media: cover art/video \| aurora \| gradient \| solid \| particles |
| `media` | `auto` · `on` · `off` | `auto` | Whether to overlay cover art/video (auto: only when effect = media) |
| `colors` | array of ≤ 4 hex colors | `[]` | Up to 4 hex colors; empty = derives from accent color |
| `speed` | number 0.2–3 | `1` | Animation speed multiplier |
| `intensity` | number 0–1 | `0.6` | Visual effect opacity/intensity |
| `angle` | number 0–360 | `135` | Gradient angle (degrees) |
| `count` | number 10–200 | `70` | Particle count (particles effect) |
| `react` | `true` / `false` | `true` | Reacts dynamically to music energy |

### `visualizer`

Audio visualizer.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `type` | `bars` · `mirror` · `wave` · `circle` · `dots` · `none` | `bars` | Visualizer rendering type |
| `placement` | array ⊂ {`player`, `stage`, `background`} | `["player"]` | Where to render (can target multiple placements) |
| `bars` | number 8–96 | `32` | Number of frequency bars/points |
| `colorMode` | `gradient` · `accent` · `solid` | `gradient` | Color mode |
| `color` | hex color | `#a78bfa` | Color when colorMode = solid |
| `thickness` | number 1–10 | `2` | Stroke thickness / bar gap (px) |
| `smoothing` | number 0–0.95 | `0` | Temporal frame smoothing factor |
| `opacity` | number 0.1–1 | `1` | Visualizer opacity |
| `height` | number 60–420 | `120` | Visualizer canvas height on Now Playing stage (px) |

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

Colors & typography. `colors` takes hex color codes.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `colorScheme` | `dark` · `light` | `dark` | Native control color scheme (scrollbars, form inputs) |
| `fontFamily` | font-family string | — | CSS font-family stack (sanitized, alphanumeric + quotes) |
| `colors` | object | `{}` | Keys: `accent`, `accent2`, `bg`, `panel`, `panel2`, `line`, `text`, `muted`, `ok`, `danger` → hex values |

## `settings` — User Configurable Options

Each item registers an interactive control in **Themes → Settings** that binds to a parameter via `bind`.
Users can only modify options you explicitly declare; values are clamped to specified ranges and persisted per preset.

| Field | Description |
| --- | --- |
| `key` | Unique camelCase identifier (`^[a-z][A-Za-z0-9]{0,31}$`) |
| `label` / `description` | Display label and tooltip note |
| `type` | `range` (number) · `toggle` (boolean) · `select` (enum) · `color` (hex) |
| `bind` | Target: `"section.param"` (e.g. `"visualizer.bars"`), `"theme.colors.accent"`, or `"css:--preset-name"` |
| `min` `max` `step` `unit` | For `range`. Range cannot exceed parameter bounds |
| `options` | For `select`: `[{ "value": "...", "label": "..." }]`, `value` must be a valid enum choice |
| `default` | Optional fallback; if omitted, defaults to the section parameter value |

Type bindings: `range` → numeric parameter, `toggle` → boolean, `select` → enum, `color` → color parameter / `theme.colors.*` / `css:--preset-*`.
`css:--preset-*` sets a CSS custom property for consumption in your `style.css` (the `--preset-` prefix is mandatory to avoid colliding with core variables).
Precedence order: user selection > setting `default` > section manifest value.

## `style.css`

Loaded while the preset is active and unloaded when switching presets. The app **sanitizes** styles before injection:

- `@import` rules are stripped.
- `url(...)` only accepts relative paths within the preset folder (e.g. `url(assets/noise.png)`) or `data:` URIs. External `http(s)://` URLs are blocked → presets run fully offline.
- `expression()`, `behavior`, `-moz-binding` are stripped.

Useful CSS hooks: `data-*` attributes on `<html>` (`data-shell`, `data-sidebar`, `data-player-pos`, `data-artwork`, `data-info`,
`data-btn`, `data-nav`, `data-toolbar`, `data-panels`, `data-bg-effect`, `data-viz`, `data-lyrics-mode`, `data-preset`), the `is-playing` class on `<html>`, CSS variables `--accent`, `--accent-2`,
`--bg`, `--panel`, `--music-bass` / `--music-energy` (0–1 dynamic audio values), and element classes like `.stage-cover`, `.stage-title`, `.lyric-line`.

## Validating Presets

```sh
npm run presets:check                       # built-in presets + starter template
node scripts/presets.mjs check ./my-preset  # custom preset (or directory of presets)
```

The CLI runner uses the exact same schema validator as the app and verifies real assets on disk (preview, style.css, file extensions, file sizes).

## Runtime Architecture (For Contributors)

```
src/presets/
├─ schema.js       module registration + parameters, normalizeManifest(), resolveConfig() (shared with scripts/)
├─ css.js          CSS sanitizer                                                           (pure)
├─ loader.js       loads built-in presets (public/presets) and user presets (sidecar GET /presets)
├─ store.js        persists selected preset + custom settings in localStorage ("zimusix-preset")
├─ runtime.js      applyPreset / setPresetSetting; sets data-* attributes and CSS vars on <html>; fires onPresetChange
├─ visualizers.js  bars · mirror · wave · circle · dots canvas visualizers
└─ bg-fx.js        particles background effect (aurora/gradient/solid implemented in CSS)
src/styles/preset-layout.css   shell / sidebar / player / density
src/styles/preset-modules.css  artwork / info / visualizer / lyrics / background
src/styles/preset-controls.css buttons, navigation, toolbar, panels, icon size
sidecar/presets.js             install, list, delete, serve preset files (sandboxed path/ext/size checks)
```

Adding a **new value for a module** (e.g. a new visualizer type): add it to `MODULES` in `schema.js`, implement corresponding rendering/CSS,
then run `npm run presets:check`. The parameter tables above update automatically when running documentation generators.

Sidecar API endpoints (all require bearer token): `GET /presets` · `POST /presets/import {path}` · `POST /presets/remove {id}` · `GET /presets/file?id=&path=`.

## App Behavior (Independent of Presets)

- **Minimal view toggle (`H` key / eye icon)**: when hidden, selecting any sidebar tab (Search, Queue, Lyrics…) or clicking the Lyrics button in the player bar automatically restores the view.
- The **Now Playing** item is always pinned at the top of the sidebar.
