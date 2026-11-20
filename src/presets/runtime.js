/**
 * Preset Runtime — select presets, merge user choices, and "apply":
 *
 *   • emits the preset's configuration to <html> (data-* attributes, CSS variables, x-* classes) through the
 *     PRESET'S OWN schema (modules.json `emit` rules) — the runtime itself knows no module or parameter names
 *   • injects sanitized style.css (+ @font-face for `fonts`)
 *   • layers: schema default < manifest < setting default < rules (hooks.json) < user setting < user override
 *   • notifies UI components to re-render (onPresetChange)
 *
 * Runtime does not import UI to avoid circular dependencies; main.js wires events. hooks.js (live signals,
 * bindings, rules) subscribes to this module and calls back through `setRuleSets`.
 */
import { app } from "../state.js";
import { loadBuiltinEntries, loadCore, loadPresetCss, loadUserEntries } from "./loader.js";
import { coerceSetting, emitConfig, fallbackConfig, resolveConfig, resolveBind, coerceParam, isHexColor } from "./schema.js";
import { DEFAULT_PRESET_KEY, loadPrefs, savePrefs } from "./store.js";

/** @type {import("./loader.js").PresetEntry[]} */
let entries = [];
let userDir = "";
let prefs = loadPrefs();
let current = { entry: null, config: fallbackConfig(), ruleSets: [], ruleKey: "" };

const listeners = new Set();
let applied = { attrs: new Set(), css: new Set(), classes: new Set() };
let applyToken = 0;

/* --------------------------------------------------------------- access */

/** Current active configuration (always complete: contract fallbacks fill anything a schema omits). */
export const cfg = () => current.config;
export const activeEntry = () => current.entry;
export const activeKey = () => current.entry?.key ?? DEFAULT_PRESET_KEY;
export const listEntries = () => entries;
export const presetsDir = () => userDir;
export const userValuesOf = (key) => ({ ...(prefs.values[key] ?? {}) });
export const overridesOf = (key) => ({ ...(prefs.overrides[key] ?? {}) });

/** URL of a file inside the ACTIVE preset's folder (for `asset` parameters such as background.image). */
export const assetUrl = (rel) => (rel && current.entry ? current.entry.fileUrl(rel) : "");

/** Compiled draw program of the ACTIVE preset (`kind`: "visualizers" | "backgrounds"), or null. */
export function programFor(kind, id) {
  const programs = current.entry?.draw?.[kind];
  return programs && Object.prototype.hasOwnProperty.call(programs, id) ? programs[id] : null;
}

/** Call `fn(config, {reason})` whenever configuration changes. Returns unsubscribe function. */
export function onPresetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (reason) => {
  for (const fn of listeners)
    try {
      fn(current.config, { reason });
    } catch (error) {
      console.error("[presets] listener error:", error);
    }
};

/* ---------------------------------------------------------------- apply */

/** Write what the schema emits, removing whatever the previous state set but the new one doesn't. */
function applyEmit() {
  const html = document.documentElement;
  const out = current.entry
    ? emitConfig(current.config, current.entry.manifest.modules, { fileUrl: current.entry.fileUrl })
    : { attrs: {}, css: {}, classes: [] };

  for (const name of applied.attrs) if (!(name in out.attrs)) html.removeAttribute(`data-${name}`);
  for (const [name, value] of Object.entries(out.attrs)) html.setAttribute(`data-${name}`, value);
  applied.attrs = new Set(Object.keys(out.attrs));

  for (const name of applied.css) if (!(name in out.css)) html.style.removeProperty(name);
  for (const [name, value] of Object.entries(out.css)) html.style.setProperty(name, value);
  applied.css = new Set(Object.keys(out.css));

  const classes = new Set(out.classes);
  for (const c of applied.classes) if (!classes.has(c)) html.classList.remove(c);
  for (const c of classes) html.classList.add(c);
  applied.classes = classes;

  html.dataset.preset = current.entry?.id ?? "classic";
}

function setPresetStyle(css) {
  let el = document.getElementById("preset-style");
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = "preset-style";
    document.head.append(el);
  }
  el.textContent = css;
}

function applyConfig(reason, prevSidebar) {
  const { config } = current;
  if (prevSidebar !== undefined && prevSidebar !== config.layout.sidebar) app.sidebarHidden = config.layout.sidebar === "hidden";
  applyEmit();
  emit(reason);
}

function reresolve() {
  const entry = current.entry;
  if (!entry) {
    current.config = fallbackConfig();
    return;
  }
  current.config = resolveConfig(entry.manifest, prefs.values[entry.key], {
    overrides: prefs.overrides[entry.key],
    ruleSets: current.ruleSets,
  });
}

/* ------------------------------------------------------------- actions */

/** Select preset by key. Returns `false` if preset cannot be used. */
export async function applyPreset(key, { persist = true } = {}) {
  const entry = entries.find((e) => e.key === key);
  if (!entry?.valid) return false;
  const token = ++applyToken;
  const { css } = await loadPresetCss(entry);
  if (token !== applyToken) return true; // newer selection in flight
  current.entry = entry;
  current.ruleSets = [];
  current.ruleKey = "";
  reresolve();
  setPresetStyle(css);

  const { layout } = current.config;
  app.sidebarHidden = layout.sidebar === "hidden";
  if (layout.defaultView !== "keep") app.view = layout.defaultView;

  if (persist) {
    prefs.active = entry.key;
    savePrefs(prefs);
  }
  applyConfig("preset");
  return true;
}

function change(reason) {
  const prevSidebar = current.config.layout.sidebar;
  reresolve();
  applyConfig(reason, prevSidebar);
}

/** Change a single setting of current preset (applies immediately, no CSS reload). */
export function setPresetSetting(settingKey, rawValue) {
  const entry = current.entry;
  const setting = entry?.manifest?.settings.find((s) => s.key === settingKey);
  if (!setting) return;
  const coerced = coerceSetting(setting, rawValue);
  if (!coerced.ok) return;
  prefs.values[entry.key] = { ...(prefs.values[entry.key] ?? {}), [settingKey]: coerced.value };
  savePrefs(prefs);
  change("setting");
}

/** Advanced editor: override ANY parameter of the preset's schema (`"section.param"` or `"section.colormap.key"`). */
export function setPresetOverride(path, rawValue) {
  const entry = current.entry;
  if (!entry) return false;
  const bind = resolveBind(path, entry.manifest.modules);
  if (!bind || bind.kind === "cssVar") return false;
  let value = rawValue;
  if (bind.kind === "colorKey") {
    if (!isHexColor(rawValue)) return false;
  } else {
    const res = coerceParam(bind.spec, rawValue);
    if (!res.ok) return false;
    value = res.value;
  }
  prefs.overrides[entry.key] = { ...(prefs.overrides[entry.key] ?? {}), [path]: value };
  savePrefs(prefs);
  change("setting");
  return true;
}

export function clearPresetOverride(path) {
  const entry = current.entry;
  if (!entry || !prefs.overrides[entry.key]) return;
  delete prefs.overrides[entry.key][path];
  if (!Object.keys(prefs.overrides[entry.key]).length) delete prefs.overrides[entry.key];
  savePrefs(prefs);
  change("setting");
}

/** Reset everything the user customised for the current preset (settings + advanced overrides). */
export function resetPresetSettings() {
  const entry = current.entry;
  if (!entry) return;
  delete prefs.values[entry.key];
  delete prefs.overrides[entry.key];
  savePrefs(prefs);
  change("setting");
}

/** Called by hooks.js when the set of matching `rules` changes. */
export function setRuleSets(key, sets) {
  if (key === current.ruleKey) return;
  current.ruleKey = key;
  current.ruleSets = sets;
  change("rule");
}

/** Reload preset list (after adding/removing folders). */
export async function reloadEntries() {
  const [builtin, user] = await Promise.all([loadBuiltinEntries(), loadUserEntries()]);
  userDir = user.dir;
  entries = [...builtin, ...user.entries];
  // Active preset was deleted or corrupted → fall back to default
  if (current.entry && !entries.some((e) => e.key === current.entry.key && e.valid)) {
    await applyPreset(DEFAULT_PRESET_KEY, { persist: true });
  } else if (current.entry) {
    // Files may have changed (overwrite import): refresh reference
    const fresh = entries.find((e) => e.key === current.entry.key);
    if (fresh) {
      current.entry = fresh;
      reresolve();
      const { css } = await loadPresetCss(fresh);
      setPresetStyle(css);
      applyConfig("reload");
    }
  }
}

/** Startup: load entries + apply saved preset (falls back to `classic`, then hard default). */
export async function initPresets() {
  prefs = loadPrefs();
  await loadCore();
  const [builtin, user] = await Promise.all([loadBuiltinEntries(), loadUserEntries()]);
  userDir = user.dir;
  entries = [...builtin, ...user.entries];
  const order = [prefs.active, DEFAULT_PRESET_KEY];
  for (const key of order) if (await applyPreset(key, { persist: false })) return;
  // No usable presets: contract defaults only (CSS defaults apply)
  current = { entry: null, config: fallbackConfig(), ruleSets: [], ruleKey: "" };
  applyConfig("init");
}
