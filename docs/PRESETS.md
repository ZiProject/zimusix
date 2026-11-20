# Preset Runtime & Preset Conventions

A preset is a **folder** that fully defines how Zimusix looks and behaves — and, since schema 2, **also what can be customised in the first place**.
Users cannot add code to the app; they extend it only through presets, so presets own everything:

| File in the preset folder | What it owns |
| --- | --- |
| `preset.json` | identity, the **values** of every parameter, user-facing `settings`, pointers to the other files |
| [`modules.json`](#modulesjson--the-schema-lives-in-the-preset) | the **schema**: sections → parameters (types, ranges, enum values, defaults, docs) and how each one is emitted to CSS |
| [`hooks.json`](#hooksjson--live-logic) | **live logic**: signals computed from [hooks](#hooks--live-values-the-app-offers-to-presets) (audio, player, track, viewport…), bindings to CSS, rules that change parameters |
| [`draw.json`](#drawjson--draw-programs) | **custom visualizers and backgrounds** drawn from data |
| `style.css`, `assets/`, fonts | styling and files, all inside the folder |

Presets are **data, never code**: no JavaScript or HTML is ever executed. Dynamic behaviour is written in a small, sandboxed
[expression language](#expression-language) that can only *read* hooks the app exposes.

> **Status:** schema version **2** (schema-1 presets keep working unchanged: without `modules.json` they use the shared core pack).
> Everything here is implemented and covered by `npm run presets:check` and `npm run test:presets`.

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
| `signal-lab` | stage · rail · floating | circle, spinning | **starfield** (draw.json) | **halo** ring + **ember** (draw.json) | focus · stage | ✔ (reads hook values) | reaction strength, mode, base hue, visualizer, background, star count |
| `dynamic-scenes` | stage · rail · floating | circle, spinning | **5 switchable scenes**: sakura · rainy city · fireworks · hearts · note rain | circle ring (stage) | karaoke · stage | ✔ (re-tints the UI per scene) | scene, brightness, density, speed, react, reaction strength, cover behind scene, viz type, spin, lyrics size |

`dynamic-scenes` is the reference example for the **music-reactive scene** backgrounds (see [`background`](#background)): a `select` setting bound to
`background.effect` lets the user switch the animated world live, and its `style.css` re-tints the interface for each scene through `html[data-bg-effect="…"]`.

`signal-lab` is the reference example for **schema 2**: its own `pulse` module (`modules.json`), per-track colours and beat flashes (`hooks.json` signals/binds), responsive and low-power rules, and
custom visualizers/background (`draw.json`). Every built-in preset ships its own complete `modules.json`; `signal-lab` shows the shorter `"extends": "core"` form.

`neon-afterlife` is the reference example for a preset that combines declarative modules with `style.css`, `css:--preset-*` settings,
a custom `README.md` and an SVG preview.

## Directory Structure

```
my-preset/                 ← folder name = "id" in preset.json
├─ preset.json             REQUIRED  manifest + values + settings
├─ modules.json            optional  the schema (parameters this preset understands); default = core pack
├─ hooks.json              optional  signals / bindings / rules (live logic)
├─ draw.json               optional  custom visualizers and backgrounds
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
- **Limits**: ≤ 200 files, ≤ 30 MB, ≤ 6 directory levels deep, no symlinks, `preset.json` ≤ 128 KB, `modules.json`/`hooks.json`/`draw.json` ≤ 256 KB each and valid JSON, ≤ 50 presets per single import.
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
  "schema": 2,                    // 1 or 2 (higher values are rejected)
  "id": "my-preset",
  "name": "Display Name",         // ≤ 60 characters
  "version": "1.0.0",             // ≤ 20 characters
  "author": "…",                  // ≤ 60 characters
  "description": "≤ 300 characters",
  "tags": ["…"],                  // ≤ 8 tags, each ≤ 24 characters
  "preview": "preview.png",
  "style": "style.css",           // optional
  "modules": "modules.json",      // optional — the schema (omit = core pack)
  "hooks": "hooks.json",          // optional — live logic
  "draw": "draw.json",            // optional — custom visualizers / backgrounds
  "fonts": [                      // optional — bundled fonts become @font-face rules (≤ 8)
    { "family": "My Font", "file": "assets/my-font.woff2", "weight": "400" }
  ],

  // … one object per SECTION declared in modules.json (core: layout, controls, artwork, info,
  //   background, visualizer, lyrics, theme) holding parameter values …
  "layout": {}, "background": {}, "visualizer": {},

  "settings": []
}
```

Omitted sections/parameters take the schema default. Invalid or out-of-range values **do not crash the preset**: they fall back to the default and
show a warning on the preset card. Unknown top-level fields and parameters that the schema doesn't declare produce a warning and are ignored
(`$schema` is accepted). Only a bad `id`, missing `name`, or a `schema` newer than the app makes a preset **unusable**.

## Module Parameters

The tables below describe the **core pack** (`public/schema/core.json`) — the parameters every built-in preset's `modules.json` starts from.
The app code contains no module definitions any more: a preset may add, change or drop any of them in its own `modules.json`
(see [below](#modulesjson--the-schema-lives-in-the-preset)). Regenerate this knowledge at any time with `node scripts/presets.mjs eject <dir>` (copies the core pack into your preset).

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

Everything behind the UI lives in one fixed layer (`#bg-layer`). It is built from **four kinds of source** that are deliberately kept separate, because they come from
different places, are controlled by different people and change at different moments:

| # | Source | Comes from | Controlled by | Changes when | Parameters |
| --- | --- | --- | --- | --- | --- |
| 1 | **Drawn** (effect) | CSS, built-in canvas code, or a **draw program** in the preset's `draw.json` | the preset | the preset / its settings change; reacts to the audio live | `effect`, `colors`, `speed`, `intensity`, `angle`, `count`, `react`, `sensitivity` |
| 2 | **Preset wallpaper** (image / video) | **files inside the preset folder** (`assets/…`) | the preset | the preset changes — static, **identical for every track** | `image`, `video`, `wallpaper`, `fit`, `wallBlur` |
| 3 | **Track media** (cover / video) | the **sidecar**: the playing track's thumbnail and `/video/stream` | the track, plus the user's *Background* panel and the preset's `media` | on every track change | `media` (preset); `art`, `blur`, `opacity`, `dim` (user panel) |
| 4 | **User media** *(planned — not implemented)* | files the **user** adds, stored by the sidecar | the user | when the user picks one | see [User-added backgrounds](#user-added-backgrounds-planned) |

Stacking order, bottom to top (each layer is optional):

```
 ┌ #bg-layer ───────────────────────────────────────────────────────────────┐
 │ 2  preset wallpaper   #bg-wall-img / #bg-wall-video   (preset folder)    │  ← lowest
 │ 3  track cover        #bg-art                         (sidecar thumbnail)│
 │ 3  track video        #bg-video                       (sidecar stream)   │  fades the cover out when ready
 │ 1  effect             #bg-fx  (CSS blobs) + #bg-particles (canvas)       │
 │    visualizer canvas  #bg-viz   (visualizer.placement includes "background") │
 │    overlay            #bg-overlay (legibility gradient + user "dim")     │  ← top, below the UI
 └──────────────────────────────────────────────────────────────────────────┘
```

Rules that follow from the model:

* **A source never replaces another one's data**, it only decides what is *visible*. Track media (3) is drawn above the wallpaper (2); a drawn effect (1) is drawn above both, so effects and
  particles can float over a cover, a video or a wallpaper.
* **`effect: "media"` means "no effect layer"** — it is the value for presets that want only track media (and the wallpaper) behind the UI. `media` decides whether source 3 is shown at all:
  `auto` = only while `effect` is `media`, `on` = always (so an effect can sit on top of the cover), `off` = never.
* **The wallpaper (2) is a fallback by default.** `wallpaper: "fallback"` shows it only while the playing track brings no cover/video of its own — nothing playing, no thumbnail,
  or track media switched off by the user (`art`/`videoBg`) or by the preset (`media: "off"`). `wallpaper: "always"` keeps it visible under the track media.
  Without `image` and `video` nothing is shown and the setting has no effect.
* **Video beats image.** If both are set, `video` plays and `image` is its poster (shown while the video loads, and under `prefers-reduced-motion`, where the video stays paused).
* **Only (3) is affected by the user's Background panel sliders** (blur, opacity, bass bounce, cover fallback); **only (1) is affected by `intensity`, `speed`, `angle`, `colors`, `react`**;
  (2) is shaped only by `fit` and `wallBlur`. The overlay's *dim* applies on top of everything, so a bright wallpaper stays readable.
* Wallpaper files obey the same rules as every preset file: relative paths **inside the preset folder**, allowed extensions only (`png jpg jpeg webp gif avif svg` for `image`, `mp4 webm` for `video`),
  counted in the folder's size limit (30 MB / 200 files). `npm run presets:check` fails when a referenced file does not exist. Keep videos short and small — they decode continuously.
* A preset wallpaper video is **muted, looped and not synchronised** with the music (unlike the track video, which is kept in sync with the playback position).

```jsonc
"background": {
  "effect": "starfield",          // 1  drawn — here a draw.json program (see draw programs)
  "image": "assets/nebula.jpg",   // 2  preset wallpaper (the video, if any, uses it as poster)
  "video": "assets/nebula.mp4",
  "wallpaper": "fallback",        //    only when the playing track has no cover/video of its own
  "media": "auto"                 // 3  track cover/video from the sidecar: auto = only with effect "media"
}
```

`signal-lab` ships exactly this pattern with an SVG wallpaper (`assets/nebula.svg`): it shows while nothing plays, and the drawn starfield floats on top of it or of the track cover.

#### Parameters

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `effect` | `media` · `aurora` · `gradient` · `solid` · `particles` · `glyphs` · `hearts` · `fireworks` · `rain` · `sakura` | `media` | media: cover art/video \| aurora \| gradient \| solid \| particles \| **music-reactive scenes** (see below): glyphs = rain of music notes, hearts, fireworks, rainy city, sakura |
| `media` | `auto` · `on` · `off` | `auto` | Source 3 — whether to show the **track's** cover art/video from the sidecar (auto: only when effect = media) |
| `image` | asset (`png jpg jpeg webp gif avif svg`) | — | Source 2 — preset wallpaper image: a file in the preset folder |
| `video` | asset (`mp4 webm`) | — | Source 2 — preset wallpaper video (muted, looped); wins over `image`, which becomes its poster |
| `wallpaper` | `fallback` · `always` | `fallback` | `fallback`: show the wallpaper only when the playing track has no cover/video of its own · `always`: keep it visible below the track media |
| `fit` | `cover` · `contain` | `cover` | How the wallpaper fills the screen (CSS `--wall-fit`) |
| `wallBlur` | number 0–40 | `0` | Wallpaper blur in px (CSS `--wall-blur`) |
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

**Interplay with the user's own Background panel (source 3).** The toolbar's *Background* panel (blur, opacity, overlay dimming, bass bounce, cover-art fallback)
is an **app-level user preference**, stored in `localStorage["zimusix-bg"]` and independent of presets. Those sliders affect the cover-art / video layer
(shown when `media` resolves to on), while `background.intensity`, `speed`, `angle`, `colors` and `react` affect only the preset effect layer.
The video/cover overlay can be shown together with an effect by setting `media: "on"`.

#### User-added backgrounds (planned)

*Not implemented yet — this is the agreed design, so presets and the sidecar can be built towards it. Presets cannot grant themselves this: the user always decides.*

* **Storage:** the sidecar keeps user files in `<DATA_DIR>/backgrounds/` (images and videos only, same extension allow-list and size limits as presets) and exposes
  `GET /backgrounds`, `POST /backgrounds/add {path}`, `POST /backgrounds/remove {id}` and `GET /backgrounds/file?id=&token=` (Range supported), mirroring `/presets`.
* **UI:** the toolbar's *Background* panel gets a "My backgrounds" picker (add, choose, remove, per-file `fit`/blur). The choice is a user preference stored next to `zimusix-bg`,
  **independent of the active preset** — switching preset keeps it.
* **Position in the stack:** user media becomes source 4 and takes the place of the preset wallpaper (2) in the same slot: it uses the same elements and the same `wallpaper`
  rule (`fallback` = only when the track has no media of its own; `always`), so presets keep full control over *layout* (effects, overlay, fit via CSS) without owning the file.
* **Preset opt-out/in:** a preset will declare a boolean parameter (planned name `background.allowUser`, default `true`) in its `modules.json`; when `false` the user's file is ignored for that
  preset (e.g. a preset whose look depends on its own wallpaper). Until it exists, older apps simply warn about the unknown parameter and ignore it.
* **Hooks:** a planned `background` hook root (`background.source` = `effect | preset | track | user`, `background.hasMedia`) so `hooks.json` can adapt colours or effects to what is behind the UI.
* **Security:** same model as presets — files are only ever read from the sidecar's own directory (`realpath` checks), URLs carry the bearer token, nothing leaves the device.

### `visualizer`

Audio visualizer.

| Parameter | Values | Default | Description |
| --- | --- | --- | --- |
| `type` | `bars` · `mirror` · `wave` · `circle` · `dots` · `none` | `bars` | Visualizer rendering type. `circle` wraps around the artwork when placed on `stage` and artwork is not `none` |
| `placement` | array ⊂ {`player`, `stage`, `background`} | `["player"]` | Where to render (can target multiple placements). `stage` requires the Now Playing view |
| `bars` | number 8–96 | `32` | Number of frequency bars/points |
| `colorMode` | `gradient` · `accent` · `solid` · `spectrum` | `gradient` | Color mode (gradient = `accent` → `accent2`; spectrum = cyan → lime with pink peak caps, like the web MusicPlayerView) |
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

`fontFamily` can name installed fonts **or fonts bundled with the preset**: list them in `preset.json` → `fonts` (`family`, `file`, optional `weight`/`style`) and the runtime
generates the `@font-face` rules; then use the family name in `fontFamily`.

## `settings` — User Configurable Options

Each item registers an interactive control that binds to a parameter via `bind`. The controls appear in **Themes → Customize** and, for quick access while listening,
at the bottom of the **Background panel**. Values are clamped to the schema, persisted per preset, and can be reset.

| Field | Description |
| --- | --- |
| `key` | Unique camelCase identifier (`^[a-z][A-Za-z0-9]{0,31}$`) |
| `label` / `description` | Display label (≤ 60 chars, defaults to `key`) and note (≤ 160 chars) |
| `type` | `range` · `toggle` · `select` · `color` · `multiselect` · `palette` · `text` |
| `bind` | `"section.param"` of **any section in this preset's modules.json**, `"section.colormap.key"` (e.g. `"theme.colors.accent"`), or `"css:--preset-name"` |
| `group` | Optional heading: consecutive settings with the same `group` are drawn in one box |
| `visibleIf` | Optional [expression](#expression-language) over `p` (the resolved parameters), e.g. `"p.background.effect == 'particles'"`; the control is hidden while it is false |
| `min` `max` `step` `unit` | For `range`; cannot exceed the parameter's bounds (for `css:` binds you set them) |
| `options` | For `select` / `multiselect`: `[{ "value", "label" }]` or plain strings, ≤ 16. **Optional for enum binds** — omitted means "all values of the enum" |
| `count` | For `palette`: number of colour pickers (≤ the parameter's `max`) |
| `default` | Optional fallback; if omitted, the manifest value of the bound parameter |

Type bindings: `range` → number · `toggle` → boolean · `select` → enum / font / string · `color` → color / colormap key · `multiselect` → list · `palette` → colors · `text` → string / font.
Any of `range`/`toggle`/`select`/`color` can also bind to `css:--preset-*` (a CSS custom property for your `style.css`; `range` gets `unit` appended, `toggle` becomes `1`/`0`).
At most **64** settings per preset.

### Precedence and the advanced editor

From lowest to highest priority:

1. schema default → 2. manifest value → 3. setting `default` → 4. **active `rules`** (hooks.json) → 5. **user setting** → 6. **user override**

*User overrides* come from **Themes → Customize → Advanced**, an editor generated from the preset's own schema that exposes **every parameter** (even ones the author did not put in `settings`).
Overridden parameters are marked and can be reset one by one. Storage: `localStorage["zimusix-preset"]` =
`{ active, values: { [presetKey]: { [settingKey]: v } }, overrides: { [presetKey]: { "section.param": v } } }`. **Reset preset to defaults** clears both.

## `modules.json` — the schema lives in the preset

```jsonc
{
  "extends": "core",                       // optional: start from public/schema/core.json (omit for a complete, standalone schema)
  "sections": {
    "cinema": {                            // a NEW module — name: camelCase ≤ 24 chars
      "doc": "Letterbox look",
      "params": {
        "mode":     { "type": "enum", "values": ["off", "letterbox", "scope"], "default": "off", "emit": { "attr": "cinema" } },
        "vignette": { "type": "number", "min": 0, "max": 1, "step": 0.05, "default": 0.4, "emit": { "css": "--cinema-vignette" } },
        "bars":     { "type": "boolean", "default": true, "emit": { "class": "bars" } }
      }
    },
    "layout": { "params": {
      "shell": { "values": ["classic", "stage", "focus", "split", "cinema"] },   // change an existing parameter (arrays are replaced)
      "radius": null                                                            // null removes it
    } }
  },
  "emit": [                                // derived values computed from the parameters (expressions over `p`)
    { "css": "--cinema-dim", "expr": "p.cinema.mode == 'off' ? 0 : p.cinema.vignette * 100", "unit": "%" }
  ]
}
```

**Parameter types**

| `type` | Fields | Value |
| --- | --- | --- |
| `number` | `min` `max` `step` `default` | number (clamped, rounded to `step`; `step` defaults to 0.01 / 0.1 / 1 by range size) |
| `boolean` | `default` | `true` / `false` |
| `enum` | `values` (≤ 64 of `[A-Za-z0-9_.:+-]{1,40}`), `default` | one of `values` |
| `color` | `default` | hex `#rgb` `#rrggbb` `#rrggbbaa` |
| `list` | `values`, `max`, `default` | array of distinct `values` |
| `colors` | `max` (≤ 16), `default` | array of hex colours |
| `font` / `string` | `maxLen` (string), `default` | text |
| `asset` | `accept` (extensions), `default` | relative path to a file **in this preset folder** (`presets:check` verifies it exists) |
| `colormap` | `keys: { name: "--css-var" }`, optional `rgb: { name: "--css-var-rgb" }` | object `name → hex`; emits one CSS variable per key (and an `R G B` triplet for `rgb` keys) |

**`emit`** — how a parameter reaches the interface, on `<html>`: `{ "attr": "name" }` → `data-name="…"`, `{ "css": "--var" }` (or `font-family`, `color-scheme`, `font-size`, `font-weight`, `letter-spacing`, `opacity`, `filter`, `backdrop-filter`) → inline CSS property,
`{ "class": "name" }` → class `x-name` while the value is true. `unit` is appended to numbers. Booleans emit `1`/`0`; lists emit space-joined (attr) or comma-joined (css); `asset` emits `url("…")` pointing inside the folder; empty values emit nothing.
Reserved: attribute `preset`. Everything emitted by the previous preset is removed when switching.

Limits: ≤ 32 sections, ≤ 64 parameters per section, ≤ 400 in total, ≤ 120 `emit` rules.

**What stays in the app** (the engine contract): the app can only *render* what it implements — the built-in visualizer types (`bars mirror wave circle dots none`) and background effects
(`media aurora gradient solid particles glyphs hearts fireworks rain sakura`). Presets can add values to those enums and give them meaning with [`draw.json`](#drawjson--draw-programs) or `style.css`
(`html[data-cinema="scope"] …`). A small set of fallback values for keys that JavaScript reads directly (`ENGINE_CONTRACT` in `schema.js`) guarantees the app keeps working when a schema omits a section.

## Hooks — live values the app offers to presets

A **hook** is a read-only live value. Presets use them inside [expressions](#expression-language) (`audio.bass`, `viewport.w`, `track.seed` …) — there is no other way to
reach app state, and no way to change it except through the preset's own parameters. *Cost* tells how often the value changes: **frame** values make every expression that reads them run each animation frame,
the others are refreshed ~5× per second.

List them from the terminal with `node scripts/presets.mjs hooks`.

#### `audio` · frame

Live audio analysis of the playing track.

| Field | Meaning |
| --- | --- |
| `audio.active` | true while audio is playing and analysed |
| `audio.bass` | 0..1 kick / sub-bass energy (fast attack, smoothed fall-off) |
| `audio.energy` | 0..1 overall loudness |
| `audio.punch` | 0..1 bass with extra punch (same value as --music-punch) |
| `audio.low` | 0..1 average of the low third of the spectrum |
| `audio.mid` | 0..1 average of the middle third |
| `audio.high` | 0..1 average of the top third |
| `audio.beat` | 1 at every detected beat, then decays to 0 in ~0.33 s |
| `audio.hit` | true for exactly one frame when a beat is detected |
| `audio.strength` | 0..1.2 how hard the last beat was |
| `audio.bands` | array of 32 values 0..1 (log-spaced spectrum, 28 Hz – 16 kHz) |

#### `player` · tick

Playback state of the current target (this app or a Discord server).

| Field | Meaning |
| --- | --- |
| `player.playing` | true while a track is playing (not paused) |
| `player.paused` | true when paused |
| `player.position` | seconds elapsed |
| `player.duration` | track length in seconds (0 for live streams) |
| `player.progress` | 0..1 position / duration |
| `player.volume` | 0..1 |
| `player.loop` | 'off' \| 'queue' \| 'track' |
| `player.autoplay` | true when autoplay-related is on |

#### `track` · tick

The current track.

| Field | Meaning |
| --- | --- |
| `track.has` | true when a track is loaded |
| `track.title` | title text |
| `track.artist` | artist / channel |
| `track.source` | 'youtube' \| 'soundcloud' \| 'spotify' \| 'attachments' \| '' |
| `track.live` | true for live streams |
| `track.seed` | 0..1 number derived from the track id — stable per track, handy for per-song colours |
| `track.hasCover` | true when the track has artwork |

#### `lyrics` · tick

Synchronised lyrics of the current track.

| Field | Meaning |
| --- | --- |
| `lyrics.has` | true when synced lyrics are loaded |
| `lyrics.loading` | true while lyrics are being fetched |
| `lyrics.count` | number of lines |
| `lyrics.index` | index of the active line (-1 before the first line) |

#### `view` · event

Name of the active tab: search · library · queue · related · lyrics · nowplaying · presets · discord.

#### `target` · event

Playback target: 'local' (this app) or 'discord'.

#### `viewport` · event

Window geometry.

| Field | Meaning |
| --- | --- |
| `viewport.w` | width in CSS px |
| `viewport.h` | height in CSS px |
| `viewport.aspect` | w / h |
| `viewport.dpr` | device pixel ratio |
| `viewport.landscape` | true when w >= h |
| `viewport.fullscreen` | true when the window is fullscreen |

#### `clock` · tick

Local wall clock.

| Field | Meaning |
| --- | --- |
| `clock.hour` | 0..24 (fractional) |
| `clock.minute` | 0..60 |
| `clock.weekday` | 0 (Sunday) .. 6 |
| `clock.month` | 1..12 |

#### `system` · tick

Environment.

| Field | Meaning |
| --- | --- |
| `system.reducedMotion` | true when the OS asks for reduced motion |
| `system.fps` | measured frame rate (updated every second) |
| `system.lowPower` | true when fps stays below 30 |

#### `ui` · event

State of the app chrome.

| Field | Meaning |
| --- | --- |
| `ui.sidebarHidden` | true when the sidebar is hidden |
| `ui.contentHidden` | true in minimal/media view (tab content hidden) |
| `ui.discordConnected` | true when the Discord bot is logged in |

#### `time` · frame

Seconds since the preset was applied.

#### `dt` · frame

Seconds since the previous evaluation.

#### `preset` · event

Identity of the active preset.

| Field | Meaning |
| --- | --- |
| `preset.id` | preset id |
| `preset.name` | display name |

Two more roots are always available: `p` — the resolved parameters of the preset (`p.visualizer.bars`, `p.pulse.intensity`) — and `s` — the preset's own [signals](#hooksjson--live-logic).

**Adding a hook (app developers):** `registerHook("name", { cost: "tick", doc: "…", fields: { x: "…" } }, () => ({ x: … }))` in `src/presets/hooks.js` makes `name.x` available to every preset and to the validator.

## `hooks.json` — live logic

```jsonc
{
  "signals": {                    // named derived values; later expressions read them as `s.<name>`
    "kick":  "smooth(audio.bass, 0.85, 0.1)",
    "hue":   "mod(p.pulse.hueShift + track.seed * 360 + time * 4, 360)"      // a different colour for every song
  },
  "bind": [                       // push values to <html> every frame/tick
    { "css": "--preset-glow", "expr": "mix(4, 40, s.kick)", "unit": "px", "round": 1 },
    { "attr": "mood",  "expr": "audio.energy > 0.5 ? 'hot' : 'calm'" },   // → data-mood="hot"
    { "class": "lyrics-live", "expr": "lyrics.has && lyrics.index >= 0" }  // → class x-lyrics-live
  ],
  "rules": [                      // conditional parameter overrides
    { "when": "viewport.w < 900", "set": { "layout.sidebar": "rail", "layout.density": "compact" } },
    { "when": "system.lowPower",  "set": { "background.effect": "gradient", "visualizer.type": "bars" } }
  ]
}
```

* **signals** (≤ 32) are evaluated in order; a signal may read only signals declared **before** it. Names are camelCase.
* **bind** (≤ 48) writes a computed value to `<html>`: `css` must be a `--preset-*` custom property, `attr` becomes `data-<name>`, `class` becomes `x-<name>`. Numbers get `unit` and are rounded to `round` decimals (default 3); booleans become `1`/`0`.
  CSS values that could load something (`url(`, `@import`, `;`, `{}` …) are dropped. Use them in `style.css` with `var(--preset-glow)`, `html[data-mood="hot"] …`, `html.x-lyrics-live …`.
* **rules** (≤ 24) re-resolve the preset's parameters while `when` is true (all matching rules apply, later ones win). `set` keys are `"section.param"` (or `"theme.colors.accent"`) of **this preset's schema**; values are validated like manifest values.
  `when` can read hooks and signals, **not** `p` (rules change `p`). Rules are checked ~5×/second with a ≥ 350 ms hysteresis; an explicit user setting or override always wins over a rule.
* **Cost is automatic:** anything that reads a *frame* hook (`audio`, `time`, `dt`) runs every animation frame, everything else about 5×/second. Stateful functions advance per evaluation, so they behave the same at any rate.
* A runtime error inside an expression never throws; the affected value just keeps its previous value (or `0`).

## Expression language

Small, safe, and evaluated by Zimusix's own interpreter — **never** `eval`/`new Function`.

* Literals: `1.5`, `'text'` / `"text"`, `true`, `false`, `null`, arrays `[1, 2]`. Operators: `+ - * / %`, `< <= > >= == !=`, `&& || ??`, `!`, unary `-`, ternary `a ? b : c`, grouping.
  Division/modulo by zero give `0`. `+` concatenates when one side is a string.
* Names: hooks (`audio.bass`), `p.section.param`, `s.signal`, constants `pi`, `tau`. Member access `a.b`, indexing `list[i]`, `.length` of strings/arrays. Only *own data properties* can be read (`constructor`, `__proto__`… are invisible).
* Only the functions below can be called — values can never be called. Limits: 500 characters, 240 syntax nodes, 16 levels of nesting.

| Group | Functions |
| --- | --- |
| Math | `abs min max floor ceil round(x, decimals) sqrt pow exp log sin cos tan atan2 sign fract mod clamp(x, lo, hi) clamp01` |
| Interpolation | `mix(a, b, t)` · `step(edge, x)` · `smoothstep(a, b, x)` · `map(x, inLo, inHi, outLo, outHi)` · `ease(t, 'in'｜'out'｜'inOut'｜'cubic'｜'sine'｜'back')` |
| Procedural | `rand(seed, salt)` (deterministic 0..1) · `noise(x)` (smooth 0..1) |
| Data | `has(list, v)` · `len(x)` · `pick(list, i)` · `avgof(list)` · `str num concat lower contains` |
| Colour (return CSS strings) | `hsl(h, s, l, a)` · `rgb(r, g, b, a)` · `alpha(color, a)` · `mixc(c1, c2, t)` · `lighten(color, amount)` |
| Stateful (one state slot **per call site**) | `smooth(x, attack, release)` fast-attack/slow-release smoothing · `lag(x, seconds)` low-pass · `peak(x, decayPerSec)` · `avg(x, seconds)` · `delta(x)` · `accum(x)` integral · `pulse(cond, seconds)` 1 on rising edge then fades · `hold(x, seconds)` |

## `draw.json` — draw programs

Presets can define **their own visualizers and backgrounds** without code. A *program* is a list of drawing operations whose numbers and colours are expressions.

```jsonc
{
  "visualizers": {
    "ember": {
      "bands": 40,                                     // spectrum resolution handed to the program (8–96); default = visualizer.bars
      "ring": false,                                   // true → on the Now Playing stage it wraps around the artwork (like `circle`)
      "vars": { "bw": "w / n" },                       // evaluated once per frame, read as v.bw
      "draw": [
        { "op": "each", "count": "n", "as": "i", "do": [
          { "op": "rect", "x": "i * v.bw", "y": "h - bands[i] * h", "w": "v.bw - 2", "h": "bands[i] * h", "radius": 3,
            "fill": { "linear": { "x1": 0, "y1": "h", "x2": 0, "y2": 0, "stops": [[0, "accent"], [1, "accent2"]] } },
            "alpha": "0.4 + bands[i] * 0.6", "glow": "bands[i] * 14" }
        ] }
      ]
    }
  },
  "backgrounds": { "starfield": { "draw": [ /* uses time, rand(i), audio.beat … */ ] } }
}
```

Select a program like a built-in one — `"visualizer": { "type": "ember" }` / `"background": { "effect": "starfield" }` — after adding its id to the enum `values` in `modules.json`
(`presets:check` warns about selectable values nobody implements).

**Scope** inside programs: `w h` (canvas size in CSS px), `u` (= min(w, h) / 100), `n` (band count; for backgrounds `background.count`), `bands[i]` (0..1), `bass energy beat`,
`accent accent2 colors[i]`, `ring`, `v.<var>`, the loop variables you declare, every [hook](#hooks--live-values-the-app-offers-to-presets), `p` and `s`.

**Operations** — every drawing op also accepts `fill`, `stroke` (colour expression **or** `{ "linear": { x1, y1, x2, y2, stops } }` / `{ "radial": { x, y, r0, r1, stops } }`), `lineWidth`, `alpha`, `glow`, `glowColor`,
`blend` (`source-over` `lighter` `screen` `multiply` `overlay` `plus-lighter`), `cap`, `join`:

| `op` | Properties |
| --- | --- |
| `rect` | `x y w h` `radius` |
| `circle` | `x y r` |
| `line` | `x1 y1 x2 y2` |
| `arc` | `x y r a0 a1` (radians) |
| `poly` | `count` `x` `y` (evaluated per point with loop variable `as`, default `i`), `closed`, `smooth` |
| `text` | `x y text` `size` `align` `weight` |
| `group` | `do` `tx ty rotate scale alpha blend` — transform and alpha apply to the children |
| `each` | `count as do` — loop (≤ 512 iterations) |
| `if` | `when do else` |
| `let` | `name value` → stored as `v.name` for later operations |

Hard limits (so a preset can never freeze the app): ≤ 16 programs, ≤ 200 operations per program, loops ≤ 512, **≤ 6000 primitives drawn per frame** (the rest of the frame is skipped), nesting ≤ 6.
Stateful functions advance once per draw call. A program that throws is disabled and logged once; the rest of the interface keeps working.
Programs run on the same canvases as the built-in effects (player bar, stage, background layer), so `visualizer.placement`, `thickness`/`opacity` and `background.count` still apply.

## `style.css`

Loaded while the preset is active and unloaded when switching presets. The app **sanitizes** styles before injection:

- `@import` rules are stripped.
- `url(...)` only accepts relative paths within the preset folder (e.g. `url(assets/noise.png)`), `data:` URIs, or `#fragment` references. External `http(s)://` URLs are blocked → presets run fully offline.
- `expression()`, `behavior`, `-moz-binding` are stripped.

Sanitizer notes (what was removed or blocked) are shown by `npm run presets:check`; **they are not shown in the app UI yet**.
The sanitizer is not a layout sandbox: CSS can restyle or cover any part of the interface, so users should only install presets from sources they trust.

### CSS hooks

What lands on `<html>` is decided by the preset's own `modules.json` (`emit`) and `hooks.json` (`bind`). `data-preset` (the preset id) is always set.
The **core pack** emits:

| Attribute | Values / source |
| --- | --- |
| `data-shell` · `data-sidebar` · `data-player-pos` · `data-density` | `layout.shell` · `layout.sidebar` · `layout.player` · `layout.density` |
| `data-btn` · `data-play-btn` · `data-nav` · `data-toolbar` · `data-panels` | `controls.*` |
| `data-artwork` · `data-art-spin` (`1`/`0`) · `data-art-shadow` (`1`/`0`) | `artwork.*` |
| `data-info` · `data-info-marquee` (`1`/`0`) | `info.*` |
| `data-bg-effect` | `background.effect` (also `data-effect` on `#bg-layer`) |
| `data-viz` · `data-viz-player` (`1` when the player-bar visualizer is on) | `visualizer.*` (derived) |
| `data-lyrics-mode` · `data-lyrics-align` · `data-lyrics-time` (`1`/`0`) | `lyrics.*` |
| `data-scheme` | `theme.colorScheme` |

Your own parameters add their own attributes/variables/classes the same way; `hooks.json` binds add `--preset-*`, `data-*` and `x-*` classes.

## Validating Presets

```sh
npm run presets:check                       # built-in presets + starter template
node scripts/presets.mjs check ./my-preset  # custom preset (or directory of presets)
node scripts/presets.mjs eject ./my-preset  # copy the full core schema into the preset as modules.json
node scripts/presets.mjs hooks              # list every hook (live value) presets can read
npm run test:presets                        # expression engine, schema, hooks.json, draw.json, sidecar store (no Rust/ffmpeg needed)
```

The CLI runner builds the preset with the exact same code as the app (`src/presets/build.js`): schema, values, settings, `hooks.json` expressions (unknown names/fields, forward signal references, protected targets),
`draw.json` programs, selectable renderers that nobody implements — and verifies real files on disk (preview, style.css, assets, fonts, file extensions, sizes).
Every built-in preset and the template pass (the template reports its expected directory-name and "no modules.json" warnings).

## Runtime Architecture (For Contributors)

```
src/presets/
├─ expr.js          safe expression language: tokenizer, parser, closure compiler, function library        (pure)
├─ schema.js        schema ENGINE: buildModules, normalizeManifest, resolveConfig, emitConfig, settings    (pure, shared with scripts/)
├─ hook-catalog.js  documented list of hooks + cost classes                                                  (pure data)
├─ logic.js         hooks.json → compiled signals/binds/rules + stateful runner                              (pure)
├─ draw.js          draw.json → compiled programs, rendered on any 2D-context-like object                    (pure)
├─ build.js         assemble a whole preset from its files + cross-checks                                    (pure)
├─ beat.js          beat detector used for audio.beat / audio.hit                                           (pure)
├─ css.js           CSS sanitizer                                                                            (pure)
├─ loader.js        loads built-in presets (public/presets) and user presets (sidecar GET /presets) and each preset's modules/hooks/draw files
├─ store.js         persists selected preset, setting values and advanced overrides ("zimusix-preset")
├─ runtime.js       applyPreset / setPresetSetting / setPresetOverride / setRuleSets; emits attributes, CSS vars and classes; fires onPresetChange
├─ hooks.js         hook providers + the shared frame loop that runs hooks.json and applies bindings and rules   (app side)
├─ programs.js      runs draw programs on the visualizer canvases and on the background canvas                     (app side)
├─ visualizers.js   built-in bars · mirror · wave · circle · dots
├─ bg-fx.js / bg-scenes.js   built-in particles background and music-reactive scenes
└─ reactive.js      shared bass/energy/punch/bands state written by the visualizer and read by effects and hooks
public/schema/core.json        base schema pack (what `extends: "core"` and schema-1 presets use)
public/presets/<id>/           every built-in preset: preset.json, modules.json, [hooks.json, draw.json], style.css, preview
src/ui/preset-settings.js      generated controls: author settings (groups, visibleIf) + advanced editor from the schema
src/features/background.js     background layer: wallpaper (`applyWallpaper`), track cover/video from the sidecar, effect start/stop
src/ui/views/presets.js        Themes view: gallery cards + Customize panel
sidecar/presets.js             install, list, delete, serve preset files (sandboxed path/ext/size checks, companion JSON validation)
```

Flow: `initPresets()` loads the core pack and every preset folder (`loader.js` reads `preset.json`, then the files it names) → `buildPreset()` validates everything → `applyPreset()` loads/sanitizes CSS,
resolves the configuration (precedence above) and **emits it through the preset's own schema** → `onPresetChange` listeners re-render the UI. `hooks.js` then evaluates `hooks.json` continuously: bindings are written
straight to `<html>`; when the set of matching `rules` changes it calls `setRuleSets()` and the runtime re-resolves.

**Extending the app** — three levels, from cheapest:
1. *New parameter / module / enum value*: only `modules.json` (+ `style.css` or `draw.json` to give it meaning) — no app change.
2. *New live value*: `registerHook(...)` in `hooks.js` (+ `hook-catalog.js` docs) — every preset can read it.
3. *New drawing primitive or expression function*: `draw.js` / `expr.js` (add tests in `scripts/*.test.mjs`).

Sidecar API endpoints: `GET /presets` · `POST /presets/import {path}` · `POST /presets/remove {id}` (bearer token) and
`GET /presets/file?id=&path=&token=` (token as query parameter so `<img>`/`<link>`/`<video>` and `fetch` of the JSON companions can load files; supports `Range` for video).

## App Behavior (Independent of Presets)

- **Minimal view toggle (`H` key / eye icon)**: when hidden, selecting any sidebar tab (Search, Queue, Lyrics…) or clicking the Lyrics button in the player bar automatically restores the view. The state is persisted.
- The **Now Playing** item is always pinned at the top of the sidebar.
- The **Background panel** (blur / opacity / dimming / bass bounce / cover fallback) is a user-level setting that applies on top of any preset (see `background`).
- `prefers-reduced-motion` is honored for the aurora blobs, spinning artwork, title marquee and the music-reactive **scenes**. Presets can read it as `system.reducedMotion` (and `system.lowPower`) to adapt, e.g. with a `rule`.

## Known Limitations (Current State)

- Presets can't run arbitrary logic: only the hooks, functions and drawing operations listed here. Draw programs are stateless per frame (use `time`, `rand(i)`, `smooth()`…): no particle physics or per-object memory.
- Rules re-resolve the whole configuration (~5×/s at most, ≥ 350 ms between changes) — use `bind` for anything that changes continuously.
- The 4 `shell` arrangements and the DOM structure are fixed; order and position of cover / info / visualizer / lyrics can only be changed through `style.css` (CSS can read any parameter and hook value).
- Hook values are read-only, and presets cannot trigger actions (play, seek, navigate).
- Preset folders must be imported from disk (no zip import, sharing/registry, in-app editor or "duplicate preset" yet); users customise through settings, rules-aware overrides and the advanced editor.
- Users cannot add their own background image/video yet (source 4, see [User-added backgrounds](#user-added-backgrounds-planned)); the preset wallpaper video is not synchronised with the music.
- Sanitizer notes are not displayed in the app; there is no published JSON Schema for editor autocomplete.

## What's Next

Natural follow-ups, now that schema, logic and drawing are data:

1. **User-added backgrounds** (source 4) with a "My backgrounds" picker, then **duplicate / export preset** from the app (write the current folder + overrides as a new user preset through the sidecar) and zip import.
2. **JSON Schema files** generated from `core.json`, `hook-catalog.js` and the draw ops, for editor autocomplete (`$schema`).
3. **More hooks and ops**: `playlist.*`, `discord.*` state, image/gradient mesh and particle-emitter ops, per-element CSS bindings with an allow-listed selector set.
4. **Layout slots**: declare the stage as an ordered list of blocks (`cover`, `info`, `viz`, `lyrics`) in `modules.json` so structure no longer needs `style.css`.
5. **Preset inheritance** between user presets (`extends: "<preset-id>"`), not only from the core pack.

### Security checklist for every new capability

- Keep all inputs inside closed vocabularies (enums, clamped numbers, hex colours, preset-relative paths); never evaluate strings as code — expressions go through `expr.js` only.
- File references (`style`, `modules`, `hooks`, `draw`, `fonts`, `asset` parameters, CSS `url()`) only resolve **inside the preset folder**, using the existing path / extension allow-list / `realpath` checks.
- Presets must not leak data off-device: no network access, `url(` and `@import` never reach emitted CSS values.
- Everything has hard caps (characters, nodes, operations, primitives per frame, file sizes) and degrades to its default with a warning, never an error, so older or hostile presets cannot freeze or break the app.
