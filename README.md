# Zimusix

Desktop music player (Tauri v2) built on **ZiPlayer**. Play music in-app **or** stream into voice channels via a **Discord bot**. Audio sources: search via plugins (YouTube, SoundCloud, Spotify) or local audio files on your machine.

## Architecture

```
┌──────────────────────── Tauri (Rust) ────────────────────────┐
│  assigns random port + token → spawns `node sidecar/server.js` │
│  `backend_info` command returns port/token to frontend         │
└───────────────┬───────────────────────────────┬────────────────┘
                │ WebView (Vite, vanilla JS)    │ stdin pipe: closing app → sidecar auto-exits
                │                               ▼
  HTTP + SSE (Bearer token)        ┌──────── sidecar (Node.js) ────────┐
  /search /play /control …  ─────► │ ZiPlayer PlayerManager            │
                │                  │  • plugins: YouTube/SoundCloud/   │
  WS /listen (Opus, ZI v1) ◄────── │    Spotify/Attachments (files)    │
  @ziplayer/client decodes         │  • WebAudioConnection → WS relay  │
  Opus → AudioWorklet              │  • discord.js → @discordjs/voice  │
                                   └───────────────────────────────────┘
```

- Each playback target is a ZiPlayer `Player`: `local` (in-app) or `guildId` (Discord).
- Both outputs share a single `AudioPlayer`, so when the bot is streaming into Discord you can still enable **Listen in-app** (headphone button) without extra transcoding.
- Local files route through `AttachmentsPlugin`; the sidecar parses tags/duration/embedded covers using `music-metadata` (plugins return `duration = 0` so seeking requires this step).

## Prerequisites

- Node.js **>= 20.3** for development (the packaged release bundles Node; override with `ZIMUSIX_NODE=/path/to/node`)
- Rust + [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)
- For Discord: a bot token, with the bot invited to your server (View Channels, Connect, Speak permissions)

## Getting Started

```sh
npm run setup      # install frontend + sidecar dependencies
npm run dev        # launch Tauri app (dev mode)
```

Run preset verification (no Rust/ffmpeg required): `npm run test:presets`; check preset directory: `npm run presets:check`.

Test backend only (no Rust required): `npm test` (generates test mp3, streams via sidecar, verifies Opus frames over WebSocket, tests queue/seek/volume).

Run frontend in browser for debugging: `npm run sidecar` (outputs `ZIMUSIX_READY {port, token}`), then `npm run web` and open `http://localhost:1420/?port=<port>&token=<token>`. (Stand-alone sidecar prints token if `ZIMUSIX_TOKEN` is unset.)

## Usage

| Task | Action |
| --- | --- |
| Search music | **Search** tab, select source (All/YouTube/SoundCloud/Spotify) or paste a URL / local file path. ▶ plays now, ⏭ plays next, ＋ appends to queue |
| Local files | **Local Files** tab: select files, select folders (scans up to 3 levels deep, max 1000 files), or **drag and drop** into the window |
| Stream to Discord | **Discord** tab: paste token → Login → click a voice channel. The sidebar **Playing to** switches to that server, and controls apply to the bot |
| In-app monitor during Discord stream | Headphone button in the bottom player bar |
| Voice wiring / output routing | Wiring button in the player bar: choose source, drag wire to **This App** and/or Discord channels. One source can route to multiple outputs simultaneously (in-app + one channel per server), all playing in sync without restarting or re-seeking. A single bot cannot join two channels in the same server concurrently |
| Disconnect | Click/drag back to a connected port, or click **Disconnect from #channel / This App**. Disconnecting a voice channel makes the bot leave that channel while the source and remaining outputs continue playing; disconnecting from This App only silences local speaker playback. If the bot is kicked or loses voice, wires disconnect automatically with a notification |
| Playback controls | Play/pause (Space), previous/next, seek, volume, loop (off → queue → track), autoplay related tracks, shuffle, reorder/remove queued tracks |
| Change theme (Preset) | **Themes** tab: select preset, click **Add preset folder** to install custom presets, configure available preset settings. Details: [docs/PRESETS.md](docs/PRESETS.md) |
| Minimal / Media view | Eye button in top toolbar or press **H**: hides tab contents (search, files, queue…) to showcase background artwork/video; toolbar remains accessible to toggle back. Preference is persisted across sessions |
| Fullscreen | Fullscreen button or press **F11** (requires `core:window:allow-set-fullscreen` permission in `src-tauri/capabilities/default.json`) |

## Frontend Structure (`src/`)

```
src/
├─ main.js            app boot, error / FFmpeg diagnostic screen
├─ events.js          global shortcuts & listeners (Space, H, F11, outside click)
├─ state.js           `app` (shared state), `root`, `refs`
├─ api.js             sidecar client (HTTP/SSE)
├─ lib/               utilities: dom.js (h, fmtTime…), icons.js, constants.js, toast.js, storage.js
├─ features/          business logic, non-DOM rendering
│   ├─ audio.js       in-app audio client (WebAudioClient)
│   ├─ playback.js    setState / watch / setTarget / control / playTrack
│   ├─ background.js  video background + cover artwork
│   ├─ lyrics.js  voice.js  related.js  files.js  search.js  discord.js
│   ├─ layout.js      view routing, sidebar toggle, content toggle
│   └─ window.js      fullscreen control
├─ ui/                UI components & views
│   ├─ main-view.js   main frame + top toolbar
│   │   views/nowplaying.js  "Now Playing" stage (large cover, info, visualizer, embedded lyrics)
│   │   views/presets.js     "Themes" page: preset gallery + settings
│   ├─ sidebar.js  player.js  wiring.js  visualizer.js  bg-panel.js  shared.js
│   ├─ mascot.js      mascot states (images in public/mascot/): loading, empty, error, no-results…
│   └─ views/         search, library, queue, related, lyrics, discord
├─ presets/           Preset Runtime: schema.js (modules + parameters + validation), loader.js, runtime.js,
│                     store.js, css.js (style.css sanitizer), visualizers.js, bg-fx.js, bg-scenes.js (music-reactive scenes)
└─ styles/            index.css imports base, layout, search, library, player,
                      toast, background, wiring, lyrics, related, effects,
                      preset-layout, preset-modules, preset-gallery

public/presets/<id>/  built-in presets (preset.json, preview.png, style.css…) + index.json
docs/PRESETS.md       preset specification, module options, authoring guide
docs/preset-template/ starter template for creating new presets
```

## Security

- Sidecar binds to `127.0.0.1` only; all HTTP/SSE/WS requests require a random token generated on each app launch, and CORS permits only Tauri/localhost origins.
- Discord bot token is stored in plaintext in `settings.json` within the app data directory (mode 0600 on Unix). Use the **Log out bot** button to remove it.
- CSP in `tauri.conf.json` allows `'wasm-unsafe-eval'` and `blob:` because `opus-decoder` (WASM) and AudioWorklet require them.

## FFmpeg

Local audio files, seeking, and audio filters require FFmpeg. The sidecar searches in order: `FFMPEG_PATH` → `ffmpeg-static` → `ffmpeg` in PATH.

The `FFmpeg/avconv not found!` error typically occurs when **modern npm blocks install scripts** for `ffmpeg-static` (binary is not downloaded). `sidecar/package.json` declares `allowScripts` for this package; if you still encounter this error:

```sh
npm install --prefix sidecar          # re-download
node sidecar/node_modules/ffmpeg-static/install.js   # manually run binary download script
```

or install system FFmpeg / set `FFMPEG_PATH`. On launch, if the binary is missing the sidecar attempts an automatic download once; if it still cannot be found, `/health` reports `ffmpeg.ok = false`, the app displays a warning screen, and playback errors are reported in the UI (not just logged to console).

## Debugging & Logging

- Sidecar enables `debugLevel: "time"` in `PlayerManager` and logs all `debug` events (configurable via `ZIMUSIX_DEBUG_LEVEL=off|error|warn|info|debug|verbose|time`).
- Release builds write sidecar stdout/stderr to `sidecar.log` in the app data directory (Windows: `%APPDATA%\app.zimusix.desktop`, macOS: `~/Library/Application Support/app.zimusix.desktop`, Linux: `~/.local/share/app.zimusix.desktop`). If the sidecar exits prematurely, the app error screen shows the last 15 lines of this log.

## Packaging (`npm run build`)

`npm run build` triggers `scripts/bundle.mjs` first: copies `sidecar/`, installs production-only `node_modules` (including FFmpeg binary), and **copies the currently running Node.js binary** into `src-tauri/resources/`. End users do not need Node.js installed. Output size is around ~300 MB uncompressed (Node ~120 MB, FFmpeg ~80 MB, modules ~100 MB).

- Network access is required during build (npm + GitHub for FFmpeg); the script exits with an informative error if the FFmpeg binary is missing.
- Builds must run on each target OS and architecture (Node, FFmpeg, and native modules are platform-specific).
- Rust searches for Node in order: `ZIMUSIX_NODE` → bundled binary → PATH → standard locations (Homebrew, nvm, Volta, Program Files…).

## Known Limitations

- Online sources (YouTube/SoundCloud/Spotify) depend on third-party libraries (`youtubei.js`, `@zibot/scdl`, `spotify-url-info`) and may break when platforms update their APIs. Failures on specific sources are reported via toasts; results from healthy sources are preserved.
- Streaming to Discord requires Discord voice encryption libraries; if voice connection fails, check channel permissions and versions of `@discordjs/voice`/`@snazzah/davey`.
- If voice connection times out with `AbortError`, the bot did not complete the voice handshake. Check **Connect/Speak** permissions, allow Node/Zimusix through firewall, and ensure UDP is not blocked by VPN/network. The UI only marks connections as active once the voice connection enters the ready state.
- Sidecar caches recent search `Track` objects to replay the exact object (preserving metadata and parsed local tags) without re-fetching over the network.
- Development builds of `ziplayer`/`@ziplayer/plugin` (`dev` tag) are currently used as `WebAudioConnection` is not yet available in `latest`.
