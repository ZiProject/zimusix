/**
 * Hooks — the live values the app hands to presets (see hook-catalog.js for the documented list) and the
 * loop that runs the active preset's hooks.json (signals → bindings → rules).
 *
 * Presets never get code access: they only write expressions that READ these values. Add your own with
 * `registerHook("name", { cost, fields, doc }, () => ({ … }))` — it becomes available to every preset
 * (`name.field` in expressions) and to the validator.
 *
 * One shared requestAnimationFrame loop owns the snapshot: audio is refreshed every frame, slow values
 * (player, track, clock…) ~5×/second, events (view, viewport…) on the same tick.
 */
import { app } from "../state.js";
import { createBeatDetector } from "./beat.js";
import { createRunner } from "./logic.js";
import { HOOK_ROOTS } from "./hook-catalog.js";
import { reactive } from "./reactive.js";
import { activeEntry, cfg, onPresetChange, setRuleSets } from "./runtime.js";

const html = document.documentElement;
const TICK_MS = 200;
const RULE_MIN_INTERVAL_MS = 350;

/* ------------------------------------------------------------ providers */

/** @type {Map<string, () => any>} root name → function returning its current value */
const providers = new Map();

/**
 * Add a hook root. `spec` = `{ cost: "frame"|"tick"|"event", doc, fields?, scalar? }` as in hook-catalog.js.
 * `get()` is called at the root's cadence and must be cheap and side-effect free.
 */
export function registerHook(name, spec, get) {
  if (!/^[a-z][A-Za-z0-9]{0,23}$/.test(name) || Object.prototype.hasOwnProperty.call(HOOK_ROOTS, name))
    throw new Error(`Hook "${name}": invalid or already registered`);
  HOOK_ROOTS[name] = spec;
  providers.set(name, get);
}

const beat = createBeatDetector();
const audioHook = {
  active: false,
  bass: 0,
  energy: 0,
  punch: 0,
  low: 0,
  mid: 0,
  high: 0,
  beat: 0,
  hit: false,
  strength: 0,
  bands: reactive.bands,
};

function refreshAudio(nowMs, dt) {
  const b = reactive.bands;
  const avg = (from, to) => {
    let s = 0;
    for (let i = from; i < to; i++) s += b[i] || 0;
    return s / Math.max(1, to - from);
  };
  const out = beat.update(nowMs, dt, reactive.bass, reactive.active);
  audioHook.active = reactive.active;
  audioHook.bass = reactive.bass;
  audioHook.energy = reactive.energy;
  audioHook.punch = reactive.punch;
  audioHook.low = avg(0, 11);
  audioHook.mid = avg(11, 22);
  audioHook.high = avg(22, 32);
  audioHook.beat = out.beat;
  audioHook.hit = out.hit;
  audioHook.strength = out.strength;
  audioHook.bands = reactive.bands;
}

function trackSeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Playback position in ms (same rule as ui/player.js `currentPosition`; duplicated to avoid an import cycle). */
function currentPosition() {
  const s = app.state;
  if (!s) return 0;
  const running = s.isPlaying && !s.isPaused;
  const pos = s.position + (running ? performance.now() - app.receivedAt : 0);
  return s.duration ? Math.min(pos, s.duration) : pos;
}

const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

const builtins = {
  player() {
    const s = app.state;
    const duration = (s?.duration ?? 0) / 1000;
    const position = s ? currentPosition() / 1000 : 0;
    return {
      playing: Boolean(s?.isPlaying && !s.isPaused),
      paused: Boolean(s?.isPaused),
      position,
      duration,
      progress: duration > 0 ? Math.min(1, position / duration) : 0,
      volume: Math.min(100, s?.volume ?? 80) / 100,
      loop: s?.loop ?? "off",
      autoplay: Boolean(s?.autoPlay),
    };
  },
  track() {
    const t = app.state?.currentTrack;
    return {
      has: Boolean(t),
      title: t?.title ?? "",
      artist: t?.author ?? "",
      source: t?.source ?? "",
      live: Boolean(t?.isLive),
      seed: t?.key ? trackSeed(String(t.key)) : 0,
      hasCover: Boolean(t?.thumbnail),
    };
  },
  lyrics() {
    const lines = app.lyrics?.lines;
    let index = -1;
    if (lines?.length) {
      const pos = currentPosition();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].timeMs <= pos) index = i;
        else break;
      }
    }
    return { has: Boolean(lines?.length), loading: Boolean(app.lyricsLoading), count: lines?.length ?? 0, index };
  },
  view: () => app.view,
  target: () => (app.target === "local" ? "local" : "discord"),
  viewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { w, h, aspect: h ? w / h : 1, dpr: window.devicePixelRatio || 1, landscape: w >= h, fullscreen: Boolean(document.fullscreenElement) };
  },
  clock() {
    const d = new Date();
    return { hour: d.getHours() + d.getMinutes() / 60, minute: d.getMinutes() + d.getSeconds() / 60, weekday: d.getDay(), month: d.getMonth() + 1 };
  },
  ui: () => ({
    sidebarHidden: Boolean(app.sidebarHidden),
    contentHidden: Boolean(app.contentHidden),
    discordConnected: app.discord?.status === "ready",
  }),
};

/* ----------------------------------------------------------- shared scope */

const system = { reducedMotion: Boolean(mq?.matches), fps: 60, lowPower: false };
const presetHook = { id: "", name: "" };
let t0 = performance.now();

/** The live snapshot presets read. Same object every call; fields refresh as described above. */
const scope = {
  audio: audioHook,
  time: 0,
  dt: 1 / 60,
  system,
  preset: presetHook,
  p: cfg(),
  s: {},
};

function refreshSlow() {
  scope.p = cfg();
  for (const [name, get] of providers) scope[name] = get();
  for (const [name, spec] of Object.entries(HOOK_ROOTS)) {
    if (name === "audio" || name === "time" || name === "dt" || name === "system" || name === "preset") continue;
    if (spec.cost === "frame") continue;
    const get = builtins[name];
    if (get) scope[name] = get();
  }
}

/**
 * Scope for draw programs and other host code: hooks + `p` + `s`. Callers copy it (`{ ...getScope(), w, h }`).
 */
export function getScope() {
  return scope;
}

/* ------------------------------------------------------------- the loop */

let runner = null;
let logic = null;
let lastTick = 0;
let lastFrame = performance.now();
let frames = 0;
let fpsT = lastFrame;
let lastRuleFlip = 0;
let sentRuleKey = "";
let applied = { css: new Set(), attrs: new Set(), classes: new Set() };

function clearOutputs() {
  for (const name of applied.css) html.style.removeProperty(name);
  for (const name of applied.attrs) html.removeAttribute(`data-${name}`);
  for (const c of applied.classes) html.classList.remove(c);
  applied = { css: new Set(), attrs: new Set(), classes: new Set() };
}

function applyOutputs(out) {
  for (const [name, value] of Object.entries(out.css)) {
    if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name, value);
  }
  for (const name of applied.css) if (!(name in out.css)) html.style.removeProperty(name);
  applied.css = new Set(Object.keys(out.css));

  for (const [name, value] of Object.entries(out.attrs)) if (html.getAttribute(`data-${name}`) !== value) html.setAttribute(`data-${name}`, value);
  for (const name of applied.attrs) if (!(name in out.attrs)) html.removeAttribute(`data-${name}`);
  applied.attrs = new Set(Object.keys(out.attrs));

  for (const c of out.classes) html.classList.add(c);
  for (const c of applied.classes) if (!out.classes.has(c)) html.classList.remove(c);
  applied.classes = new Set(out.classes);
}

function bindEntry(entry, reason) {
  presetHook.id = entry?.id ?? "";
  presetHook.name = entry?.manifest?.name ?? "";
  if (reason === "setting" || reason === "rule") return; // same preset, keep signal state
  clearOutputs();
  logic = entry?.logic && (entry.logic.signals.length || entry.logic.binds.length || entry.logic.rules.length) ? entry.logic : null;
  runner = logic ? createRunner(logic) : null;
  scope.s = runner ? runner.signals : {};
  t0 = performance.now();
  sentRuleKey = "";
  lastTick = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(0.25, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  scope.time = (now - t0) / 1000;
  scope.dt = dt;
  refreshAudio(now, dt);

  frames++;
  if (now - fpsT >= 1000) {
    system.fps = Math.round((frames * 1000) / (now - fpsT));
    system.lowPower = system.fps < 30;
    system.reducedMotion = Boolean(mq?.matches);
    frames = 0;
    fpsT = now;
  }

  const tick = now - lastTick >= TICK_MS;
  const tickDt = lastTick ? Math.min(1, (now - lastTick) / 1000) : dt;
  if (tick) refreshSlow();
  if (!runner) {
    if (tick) lastTick = now;
    return;
  }
  runner.step(scope, { tick, dt: tick ? tickDt : dt });
  applyOutputs(runner.output);
  if (tick) {
    lastTick = now;
    const { key, sets } = runner.rules();
    if (key !== sentRuleKey && now - lastRuleFlip >= RULE_MIN_INTERVAL_MS) {
      sentRuleKey = key;
      lastRuleFlip = now;
      setRuleSets(key, sets);
    }
  }
}

let started = false;
/** Start the hook loop (call once at boot, AFTER the visualizer loop so audio values are fresh). */
export function startHooks() {
  if (started) return;
  started = true;
  onPresetChange((_config, { reason }) => bindEntry(activeEntry(), reason));
  bindEntry(activeEntry(), "init");
  refreshSlow();
  requestAnimationFrame(frame);
}
