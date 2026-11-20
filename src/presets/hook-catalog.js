/**
 * Catalogue of HOOKS: live values the app offers to presets (pure data — no DOM, shared with scripts/).
 *
 * A preset reads a hook by name inside an expression: `audio.bass`, `player.progress`, `viewport.w` …
 * The app implements each root in src/presets/hooks.js (`providers`); apps/features can add roots at runtime
 * with `registerHook()`. The validator (`npm run presets:check`) uses this catalogue to flag unknown names.
 *
 * cost:
 *   "frame" — changes every animation frame (audio, time). Bindings that read it run every frame.
 *   "tick"  — changes a few times per second at most (player, track, clock…). Evaluated at ~5 Hz.
 *   "event" — changes on discrete events (view, viewport…). Evaluated at ~5 Hz as well, cheap.
 */
export const HOOK_ROOTS = {
  audio: {
    cost: "frame",
    doc: "Live audio analysis of the playing track.",
    fields: {
      active: "true while audio is playing and analysed",
      bass: "0..1 kick / sub-bass energy (fast attack, smoothed fall-off)",
      energy: "0..1 overall loudness",
      punch: "0..1 bass with extra punch (same value as --music-punch)",
      low: "0..1 average of the low third of the spectrum",
      mid: "0..1 average of the middle third",
      high: "0..1 average of the top third",
      beat: "1 at every detected beat, then decays to 0 in ~0.33 s",
      hit: "true for exactly one frame when a beat is detected",
      strength: "0..1.2 how hard the last beat was",
      bands: "array of 32 values 0..1 (log-spaced spectrum, 28 Hz – 16 kHz)",
    },
  },
  player: {
    cost: "tick",
    doc: "Playback state of the current target (this app or a Discord server).",
    fields: {
      playing: "true while a track is playing (not paused)",
      paused: "true when paused",
      position: "seconds elapsed",
      duration: "track length in seconds (0 for live streams)",
      progress: "0..1 position / duration",
      volume: "0..1",
      loop: "'off' | 'queue' | 'track'",
      autoplay: "true when autoplay-related is on",
    },
  },
  track: {
    cost: "tick",
    doc: "The current track.",
    fields: {
      has: "true when a track is loaded",
      title: "title text",
      artist: "artist / channel",
      source: "'youtube' | 'soundcloud' | 'spotify' | 'attachments' | ''",
      live: "true for live streams",
      seed: "0..1 number derived from the track id — stable per track, handy for per-song colours",
      hasCover: "true when the track has artwork",
    },
  },
  lyrics: {
    cost: "tick",
    doc: "Synchronised lyrics of the current track.",
    fields: {
      has: "true when synced lyrics are loaded",
      loading: "true while lyrics are being fetched",
      count: "number of lines",
      index: "index of the active line (-1 before the first line)",
    },
  },
  view: { cost: "event", doc: "Name of the active tab: search · library · queue · related · lyrics · nowplaying · presets · discord.", scalar: true },
  target: { cost: "event", doc: "Playback target: 'local' (this app) or 'discord'.", scalar: true },
  viewport: {
    cost: "event",
    doc: "Window geometry.",
    fields: {
      w: "width in CSS px",
      h: "height in CSS px",
      aspect: "w / h",
      dpr: "device pixel ratio",
      landscape: "true when w >= h",
      fullscreen: "true when the window is fullscreen",
    },
  },
  clock: {
    cost: "tick",
    doc: "Local wall clock.",
    fields: { hour: "0..24 (fractional)", minute: "0..60", weekday: "0 (Sunday) .. 6", month: "1..12" },
  },
  system: {
    cost: "tick",
    doc: "Environment.",
    fields: {
      reducedMotion: "true when the OS asks for reduced motion",
      fps: "measured frame rate (updated every second)",
      lowPower: "true when fps stays below 30",
    },
  },
  ui: {
    cost: "event",
    doc: "State of the app chrome.",
    fields: {
      sidebarHidden: "true when the sidebar is hidden",
      contentHidden: "true in minimal/media view (tab content hidden)",
      discordConnected: "true when the Discord bot is logged in",
    },
  },
  time: { cost: "frame", doc: "Seconds since the preset was applied.", scalar: true },
  dt: { cost: "frame", doc: "Seconds since the previous evaluation.", scalar: true },
  preset: { cost: "event", doc: "Identity of the active preset.", fields: { id: "preset id", name: "display name" } },
};

/** Roots available in every preset expression besides hooks: `p` (resolved parameters) and `s` (preset signals). */
export const PRESET_ROOTS = ["p", "s"];

export const costRank = { event: 0, tick: 1, frame: 2 };

/** Every top-level name a hook expression may use. `extra` = additional roots registered by the host. */
export const hookRootNames = (extra = []) => new Set([...Object.keys(HOOK_ROOTS), ...PRESET_ROOTS, ...extra]);

/** `[unknownPath, …]` for dotted paths whose root is a known hook but whose field is not in the catalogue. */
export function unknownHookFields(paths, catalog = HOOK_ROOTS) {
  const bad = [];
  for (const path of paths) {
    const [root, field] = path.split(".");
    const spec = catalog[root];
    if (!spec || !field || spec.scalar) continue;
    if (spec.fields && !Object.prototype.hasOwnProperty.call(spec.fields, field)) bad.push(path);
  }
  return bad;
}
