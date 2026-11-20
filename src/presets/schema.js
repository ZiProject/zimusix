/**
 * Preset schema ENGINE (pure: no DOM / localStorage — shared by the app, scripts/ and tests).
 *
 * The app no longer hard-codes which modules/parameters exist. A preset owns its schema:
 *
 *   my-preset/modules.json   sections → parameters (type, range, enum values, default, docs, `emit` rules)
 *   my-preset/preset.json    the VALUES of those parameters + user-facing `settings`
 *   my-preset/hooks.json     live signals, bindings, rules   (see logic.js)
 *   my-preset/draw.json      custom visualizers / backgrounds (see draw.js)
 *
 * `modules.json` may start from the shipped base pack (`public/schema/core.json`, `"extends": "core"`) and
 * add / change / remove sections and parameters, or be a complete standalone copy (all built-in presets are).
 * A preset without `modules.json` is interpreted with the core pack (this is what schema-1 presets get).
 *
 * What the engine does with a schema:
 *   • validates/clamps every value (`coerceParam`), falling back to defaults with a warning, never crashing;
 *   • turns the resolved configuration into `data-*` attributes, CSS variables and classes on <html>
 *     using each parameter's `emit` (`emitConfig`) — presets can invent new parameters and style them in CSS;
 *   • generates the Customize UI from `settings`, and an advanced editor from the schema itself.
 *
 * Only a tiny CONTRACT (ENGINE_CONTRACT) stays in code: fallback values for the few keys JavaScript reads
 * directly, so a preset that drops a section can never break the app.
 */
import { ExprError, compile, tryCompile } from "./expr.js";

export const SCHEMA_VERSION = 2;
export const SUPPORTED_SCHEMAS = [1, 2];
export const MANIFEST_FILE = "preset.json";
export const DEFAULT_PREVIEW = "preview.png";
export const PREVIEW_EXTS = ["png", "jpg", "jpeg", "webp", "svg", "avif"];
export const ASSET_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "mp4", "webm", "woff", "woff2", "ttf", "otf"];
export const FONT_EXTS = ["woff", "woff2", "ttf", "otf"];
export const ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
export const SETTING_KEY_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
export const CSS_VAR_RE = /^--preset-[a-z][a-z0-9-]{0,40}$/;
const NAME_RE = /^[a-z][A-Za-z0-9]{0,23}$/;
const ATTR_RE = /^[a-z][a-z0-9-]{0,31}$/;
const CLASS_RE = /^[a-z][a-z0-9-]{0,31}$/;
const EMIT_CSS_RE = /^(?:--[a-z][a-z0-9-]{0,48}|font-family|color-scheme|font-size|font-weight|letter-spacing|opacity|filter|backdrop-filter)$/;
const ENUM_VALUE_RE = /^[A-Za-z0-9_.:+-]{1,40}$/;
const UNIT_RE = /^[a-z%]{0,4}$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_RE = /^[\w\s,'"\-.]{1,120}$/u;
export const RESERVED_ATTRS = new Set(["preset"]);
export const MAX = { sections: 32, paramsPerSection: 64, params: 400, settings: 64, emit: 120, enumValues: 64 };

/** Renderers the APP implements. Presets may select these or provide their own through draw.json. */
export const ENGINE = {
  visualizers: ["bars", "mirror", "wave", "circle", "dots", "none"],
  backgrounds: ["media", "aurora", "gradient", "solid", "particles", "glyphs", "hearts", "fireworks", "rain", "sakura"],
};

/**
 * Values that JavaScript in the app reads directly (everything else is CSS-driven via `emit`).
 * Used ONLY as fallback when a preset's schema doesn't define the key. No types/ranges/enums live here.
 */
export const ENGINE_CONTRACT = {
  layout: { sidebar: "left", defaultView: "keep" },
  artwork: { style: "rounded", size: 56, stageSize: 320 },
  info: { show: ["title", "artist", "source"], marquee: true },
  background: { effect: "media", media: "auto", colors: [], speed: 1, intensity: 0.6, angle: 135, count: 70, react: true, sensitivity: 1 },
  visualizer: { type: "bars", placement: ["player"], bars: 32, colorMode: "gradient", color: "#a78bfa", thickness: 2, smoothing: 0, opacity: 1, height: 120 },
  lyrics: { mode: "list", placement: "view", glow: true },
  theme: { colors: {} },
};

/* ------------------------------------------------------------------- helpers */

export const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
export const isHexColor = (v) => typeof v === "string" && HEX_RE.test(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const extOf = (p) => (p.includes(".") ? p.split(".").pop().toLowerCase() : "");

export function isSafeRelPath(p) {
  return (
    typeof p === "string" &&
    p.length > 0 &&
    p.length <= 120 &&
    !p.startsWith("/") &&
    !p.includes("\\") &&
    !p.includes(":") &&
    !p.includes("\0") &&
    !p.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

/** Values bound to CSS custom properties from expressions must not be able to load anything. */
export function safeCssValue(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.length > 200) return null;
  if (/[;{}<>\\]|url\s*\(|@import|expression\s*\(|javascript:/i.test(s)) return null;
  return s;
}

/* ---------------------------------------------------------------- param specs */

const stepOf = (spec) => {
  if (Number.isFinite(spec.step) && spec.step > 0) return spec.step;
  const range = spec.max - spec.min;
  return range <= 2 ? 0.01 : range <= 20 ? 0.1 : 1;
};

/** Validate one parameter definition from modules.json. Returns normalized spec or null (+warning). */
function normalizeParamSpec(where, raw, warn) {
  if (!isObject(raw)) return warn(`${where}: must be an object`), null;
  const type = raw.type;
  const doc = typeof raw.doc === "string" ? raw.doc.slice(0, 300) : "";
  const spec = { type, doc };
  switch (type) {
    case "number": {
      if (!Number.isFinite(raw.min) || !Number.isFinite(raw.max) || raw.min >= raw.max)
        return warn(`${where}: number needs numeric "min" < "max"`), null;
      spec.min = raw.min;
      spec.max = raw.max;
      spec.step = stepOf(raw);
      spec.default = Number.isFinite(raw.default) ? Math.min(raw.max, Math.max(raw.min, raw.default)) : raw.min;
      break;
    }
    case "boolean":
      spec.default = raw.default === true;
      break;
    case "enum": {
      if (!Array.isArray(raw.values) || !raw.values.length || raw.values.length > MAX.enumValues)
        return warn(`${where}: enum needs "values" (1–${MAX.enumValues} strings)`), null;
      const values = [...new Set(raw.values.filter((v) => typeof v === "string" && ENUM_VALUE_RE.test(v)))];
      if (!values.length) return warn(`${where}: enum has no valid values (letters, digits, _ . : + -)`), null;
      spec.values = values;
      spec.default = values.includes(raw.default) ? raw.default : values[0];
      break;
    }
    case "color":
      spec.default = isHexColor(raw.default) ? raw.default : "#7c5cff";
      break;
    case "list": {
      if (!Array.isArray(raw.values) || !raw.values.length) return warn(`${where}: list needs "values"`), null;
      spec.values = [...new Set(raw.values.filter((v) => typeof v === "string" && ENUM_VALUE_RE.test(v)))].slice(0, MAX.enumValues);
      spec.max = Number.isInteger(raw.max) && raw.max > 0 ? Math.min(raw.max, spec.values.length) : spec.values.length;
      spec.default = Array.isArray(raw.default) ? [...new Set(raw.default.filter((v) => spec.values.includes(v)))].slice(0, spec.max) : [];
      break;
    }
    case "colors": {
      spec.max = Number.isInteger(raw.max) && raw.max > 0 ? Math.min(raw.max, 16) : 4;
      spec.default = Array.isArray(raw.default) ? raw.default.filter(isHexColor).slice(0, spec.max) : [];
      break;
    }
    case "font":
      spec.default = typeof raw.default === "string" && (raw.default === "" || FONT_RE.test(raw.default)) ? raw.default : "";
      break;
    case "string":
      spec.maxLen = Number.isInteger(raw.maxLen) ? Math.min(Math.max(raw.maxLen, 1), 200) : 80;
      spec.default = typeof raw.default === "string" ? raw.default.slice(0, spec.maxLen) : "";
      break;
    case "asset": {
      const accept = Array.isArray(raw.accept) ? raw.accept.filter((e) => ASSET_EXTS.includes(e)) : ASSET_EXTS.filter((e) => !FONT_EXTS.includes(e));
      spec.accept = accept;
      spec.default = typeof raw.default === "string" && raw.default && isSafeRelPath(raw.default) && accept.includes(extOf(raw.default)) ? raw.default : "";
      break;
    }
    case "colormap": {
      if (!isObject(raw.keys) || !Object.keys(raw.keys).length) return warn(`${where}: colormap needs "keys": { name: "--css-var" }`), null;
      spec.keys = {};
      for (const [k, v] of Object.entries(raw.keys)) {
        if (!NAME_RE.test(k) || typeof v !== "string" || !EMIT_CSS_RE.test(v)) warn(`${where}: invalid colormap key "${k}"`);
        else spec.keys[k] = v;
      }
      spec.rgb = {};
      if (isObject(raw.rgb))
        for (const [k, v] of Object.entries(raw.rgb)) if (spec.keys[k] && typeof v === "string" && EMIT_CSS_RE.test(v)) spec.rgb[k] = v;
      spec.default = {};
      break;
    }
    default:
      return warn(`${where}: unknown type ${JSON.stringify(type)} (number, boolean, enum, color, list, colors, font, string, asset, colormap)`), null;
  }
  if (raw.emit !== undefined && raw.emit !== null) {
    const emit = normalizeEmitTargets(`${where}.emit`, raw.emit, warn);
    if (emit) spec.emit = emit;
  }
  return spec;
}

function normalizeEmitTargets(where, raw, warn) {
  if (!isObject(raw)) return warn(`${where}: must be an object`), null;
  const out = {};
  if (raw.attr !== undefined) {
    if (typeof raw.attr === "string" && ATTR_RE.test(raw.attr) && !RESERVED_ATTRS.has(raw.attr)) out.attr = raw.attr;
    else warn(`${where}.attr: invalid attribute name`);
  }
  if (raw.css !== undefined) {
    if (typeof raw.css === "string" && EMIT_CSS_RE.test(raw.css)) out.css = raw.css;
    else warn(`${where}.css: must be a --custom-property or one of font-family, color-scheme, font-size, font-weight, letter-spacing, opacity, filter, backdrop-filter`);
  }
  if (raw.class !== undefined) {
    if (typeof raw.class === "string" && CLASS_RE.test(raw.class)) out.class = raw.class;
    else warn(`${where}.class: invalid class name`);
  }
  if (raw.unit !== undefined) {
    if (typeof raw.unit === "string" && UNIT_RE.test(raw.unit)) out.unit = raw.unit;
    else warn(`${where}.unit: invalid unit`);
  }
  return Object.keys(out).length ? out : null;
}

/* ---------------------------------------------------------------------- modules */

const isPlainKey = (k) => k !== "__proto__" && k !== "constructor" && k !== "prototype";

/** Deep merge for `extends` (null deletes, arrays/scalars replace, objects merge). */
function mergeDeep(base, ext) {
  if (!isObject(base) || !isObject(ext)) return clone(ext);
  const out = clone(base);
  for (const [k, v] of Object.entries(ext)) {
    if (!isPlainKey(k)) continue;
    if (v === null) delete out[k];
    else if (isObject(v) && isObject(out[k])) out[k] = mergeDeep(out[k], v);
    else out[k] = clone(v);
  }
  return out;
}

/**
 * Build the preset's module registry from modules.json (+ core for `extends`).
 * @returns {{ ok:boolean, modules:object|null, errors:string[], warnings:string[] }}
 */
export function buildModules(rawModules, core) {
  const errors = [];
  const warnings = [];
  const warn = (m) => warnings.push(m);
  let raw = rawModules;
  if (raw === undefined || raw === null) {
    if (!core) return { ok: false, modules: null, errors: ["No modules.json and the core pack is unavailable"], warnings };
    raw = { extends: "core" };
  }
  if (!isObject(raw)) return { ok: false, modules: null, errors: ["modules.json must be a JSON object"], warnings };

  let source = raw;
  if (raw.extends !== undefined) {
    if (raw.extends !== "core") warn(`modules.json: "extends" can only be "core" — ignored`);
    else if (!core) return { ok: false, modules: null, errors: ['modules.json extends "core" but the core pack is unavailable'], warnings };
    else {
      source = {
        pack: raw.pack ?? core.pack,
        sections: mergeDeep(core.sections ?? {}, isObject(raw.sections) ? raw.sections : {}),
        emit: [...(core.emit ?? []), ...(Array.isArray(raw.emit) ? raw.emit : [])],
      };
    }
  }
  if (!isObject(source.sections)) return { ok: false, modules: null, errors: ['modules.json needs a "sections" object'], warnings };

  const sections = {};
  const names = Object.keys(source.sections);
  if (names.length > MAX.sections) warn(`modules.json: more than ${MAX.sections} sections — extra ignored`);
  let total = 0;
  for (const name of names.slice(0, MAX.sections)) {
    const sec = source.sections[name];
    if (!NAME_RE.test(name) || !isPlainKey(name)) {
      warn(`section "${name}": invalid name (camelCase, ≤ 24 chars)`);
      continue;
    }
    if (!isObject(sec) || !isObject(sec.params)) {
      warn(`section "${name}": needs "params"`);
      continue;
    }
    const params = {};
    for (const [key, rawSpec] of Object.entries(sec.params).slice(0, MAX.paramsPerSection)) {
      if (!NAME_RE.test(key) || !isPlainKey(key)) {
        warn(`${name}.${key}: invalid parameter name`);
        continue;
      }
      if (++total > MAX.params) break;
      const spec = normalizeParamSpec(`${name}.${key}`, rawSpec, warn);
      if (spec) params[key] = spec;
    }
    sections[name] = { doc: typeof sec.doc === "string" ? sec.doc.slice(0, 300) : "", params };
  }

  const modules = { pack: typeof source.pack === "string" ? source.pack.slice(0, 40) : "custom", sections, emitRules: [] };

  const rules = new Map();
  const addRule = (rule) => rules.set(`${rule.kind}:${rule.name}`, rule);
  // param-level emit rules
  for (const [sname, sec] of Object.entries(sections))
    for (const [key, spec] of Object.entries(sec.params)) {
      if (!spec.emit) continue;
      for (const kind of ["attr", "css", "class"])
        if (spec.emit[kind]) addRule({ kind, name: spec.emit[kind], path: `${sname}.${key}`, unit: spec.emit.unit ?? "" });
    }
  // expression-level rules (derived values)
  const extra = Array.isArray(source.emit) ? source.emit : [];
  for (const [i, item] of extra.slice(0, MAX.emit).entries()) {
    const at = `emit[${i}]`;
    const targets = isObject(item) ? normalizeEmitTargets(at, item, warn) : null;
    if (!targets || typeof item.expr !== "string") {
      warn(`${at}: needs one of attr/css/class and an "expr"`);
      continue;
    }
    const res = tryCompile(item.expr, { roots: ["p"] });
    if (!res.ok) {
      warn(`${at}: ${res.error}`);
      continue;
    }
    for (const kind of ["attr", "css", "class"])
      if (targets[kind]) addRule({ kind, name: targets[kind], expr: res.expr, src: item.expr, unit: targets.unit ?? "" });
  }
  modules.emitRules = [...rules.values()];
  return { ok: true, modules, errors, warnings };
}

export const sectionNames = (modules) => Object.keys(modules.sections);

/* -------------------------------------------------------------------- coercion */

/** Coerce a raw value to a parameter type. Returns `{ok, value}`. */
export function coerceParam(spec, raw) {
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
      let v = Math.min(spec.max, Math.max(spec.min, n));
      const step = spec.step ?? 1;
      if (step < 1) v = Number(v.toFixed(String(step).split(".")[1]?.length ?? 2));
      else v = Math.round(v / step) * step;
      return { ok: true, value: Math.min(spec.max, Math.max(spec.min, v)) };
    }
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
    case "enum":
      return spec.values.includes(raw) ? { ok: true, value: raw } : { ok: false };
    case "color":
      return isHexColor(raw) ? { ok: true, value: raw } : { ok: false };
    case "list": {
      const arr = typeof raw === "string" ? [raw] : raw;
      if (!Array.isArray(arr)) return { ok: false };
      return { ok: true, value: [...new Set(arr.filter((x) => spec.values.includes(x)))].slice(0, spec.max) };
    }
    case "colors":
      return Array.isArray(raw) ? { ok: true, value: raw.filter(isHexColor).slice(0, spec.max) } : { ok: false };
    case "font":
      return typeof raw === "string" && (raw === "" || FONT_RE.test(raw)) ? { ok: true, value: raw } : { ok: false };
    case "string":
      return typeof raw === "string" && raw.length <= spec.maxLen && !/[\u0000-\u001f]/.test(raw) ? { ok: true, value: raw } : { ok: false };
    case "asset":
      return typeof raw === "string" && (raw === "" || (isSafeRelPath(raw) && spec.accept.includes(extOf(raw)))) ? { ok: true, value: raw } : { ok: false };
    case "colormap": {
      if (!isObject(raw)) return { ok: false };
      const out = {};
      for (const [k, v] of Object.entries(raw)) if (spec.keys[k] && isHexColor(v)) out[k] = v;
      return { ok: true, value: out };
    }
    default:
      return { ok: false };
  }
}

const cloneDefault = (v) => (Array.isArray(v) ? [...v] : isObject(v) ? { ...v } : v);

export function defaultSection(modules, name) {
  const out = {};
  for (const [key, spec] of Object.entries(modules.sections[name].params)) out[key] = cloneDefault(spec.default);
  return out;
}

function normalizeSection(modules, name, raw, warn) {
  const out = defaultSection(modules, name);
  if (raw === undefined) return out;
  if (!isObject(raw)) {
    warn(`"${name}" must be an object — using defaults`);
    return out;
  }
  const specs = modules.sections[name].params;
  for (const [key, value] of Object.entries(raw)) {
    const spec = isPlainKey(key) && Object.prototype.hasOwnProperty.call(specs, key) ? specs[key] : null;
    if (!spec) {
      warn(`${name}.${key}: unknown parameter (declare it in modules.json) — ignored`);
      continue;
    }
    if (spec.type === "colormap") {
      if (!isObject(value)) {
        warn(`${name}.${key}: must be an object`);
        continue;
      }
      for (const [ck, cv] of Object.entries(value)) {
        if (!spec.keys[ck]) warn(`${name}.${key}.${ck}: unknown color name (valid: ${Object.keys(spec.keys).join(", ")})`);
        else if (!isHexColor(cv)) warn(`${name}.${key}.${ck}: requires hex code (#rgb, #rrggbb, #rrggbbaa)`);
        else out[key][ck] = cv;
      }
      continue;
    }
    const res = coerceParam(spec, value);
    if (res.ok) out[key] = res.value;
    else warn(`${name}.${key}: invalid value ${JSON.stringify(value)} — using default`);
  }
  return out;
}

/* ------------------------------------------------------------------- paths/bind */

/** Resolve a "section.param" / "section.colormap.key" / "css:--preset-x" bind string. */
export function resolveBind(bind, modules) {
  if (typeof bind !== "string") return null;
  if (bind.startsWith("css:")) {
    const name = bind.slice(4);
    return CSS_VAR_RE.test(name) ? { kind: "cssVar", name } : null;
  }
  const parts = bind.split(".");
  if (parts.length < 2 || parts.length > 3 || !parts.every(isPlainKey)) return null;
  const specs = modules.sections[parts[0]]?.params;
  const spec = specs && Object.prototype.hasOwnProperty.call(specs, parts[1]) ? specs[parts[1]] : null;
  if (!spec) return null;
  if (parts.length === 3) {
    if (spec.type !== "colormap" || !spec.keys[parts[2]]) return null;
    return { kind: "colorKey", section: parts[0], key: parts[1], color: parts[2], spec };
  }
  return { kind: "param", section: parts[0], key: parts[1], spec };
}

export function getPath(config, path) {
  let cur = config;
  for (const part of String(path).split(".")) {
    if (!isObject(cur) || !isPlainKey(part) || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Write a validated value into `config` at `path`. Returns true when applied. */
export function setPath(config, modules, path, value) {
  const bind = resolveBind(path, modules);
  if (!bind || bind.kind === "cssVar") return false;
  if (bind.kind === "colorKey") {
    if (!isHexColor(value)) return false;
    config[bind.section][bind.key][bind.color] = value;
    return true;
  }
  const res = coerceParam(bind.spec, value);
  if (!res.ok) return false;
  config[bind.section][bind.key] = res.value;
  return true;
}

/* ------------------------------------------------------------ settings (UI) */

const SETTING_TYPES = ["range", "toggle", "select", "color", "multiselect", "palette", "text"];

function currentBoundValue(bind, sections) {
  if (bind.kind === "param") return sections[bind.section]?.[bind.key];
  if (bind.kind === "colorKey") return sections[bind.section]?.[bind.key]?.[bind.color];
  return undefined;
}

function fallbackSettingValue(setting) {
  switch (setting.type) {
    case "range":
      return setting.min;
    case "toggle":
      return false;
    case "select":
      return setting.options[0].value;
    case "multiselect":
    case "palette":
      return [];
    case "text":
      return "";
    default:
      return "#7c5cff";
  }
}

function normalizeSettings(raw, sections, modules, warn) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return warn('"settings" must be an array'), [];
  const out = [];
  const seen = new Set();
  if (raw.length > MAX.settings) warn(`more than ${MAX.settings} settings — extra ignored`);
  for (const [i, item] of raw.slice(0, MAX.settings).entries()) {
    const at = `settings[${i}]`;
    if (!isObject(item)) {
      warn(`${at}: must be an object`);
      continue;
    }
    if (!SETTING_KEY_RE.test(item.key ?? "")) {
      warn(`${at}: "key" must be camelCase, starting with lowercase letter (max 32 chars)`);
      continue;
    }
    if (seen.has(item.key)) {
      warn(`${at}: duplicate key "${item.key}"`);
      continue;
    }
    if (!SETTING_TYPES.includes(item.type)) {
      warn(`${at} (${item.key}): "type" must be ${SETTING_TYPES.join(" | ")}`);
      continue;
    }
    const bind = resolveBind(item.bind, modules);
    if (!bind) {
      warn(`${at} (${item.key}): invalid "bind" ("section.param", "section.colormap.key" or "css:--preset-<n>")`);
      continue;
    }
    const setting = {
      key: item.key,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 60) : item.key,
      description: typeof item.description === "string" ? item.description.slice(0, 160) : "",
      type: item.type,
      bind: item.bind,
      group: typeof item.group === "string" && item.group.trim() ? item.group.trim().slice(0, 40) : "",
    };
    if (item.visibleIf !== undefined) {
      const res = typeof item.visibleIf === "string" ? tryCompile(item.visibleIf, { roots: ["p"] }) : { ok: false, error: "must be an expression string" };
      if (res.ok) setting.visibleIf = item.visibleIf;
      else warn(`${at} (${item.key}): visibleIf ${res.error} — ignored`);
    }
    const spec = bind.kind === "param" ? bind.spec : null;
    const bad = (msg) => (warn(`${at} (${item.key}): ${msg}`), true);

    if (item.type === "range") {
      if (bind.kind === "param" && spec.type !== "number" && bad("range can only bind to a number parameter")) continue;
      if (bind.kind === "colorKey" && bad("range cannot bind to a color")) continue;
      const min = Number.isFinite(item.min) ? item.min : (spec?.min ?? 0);
      const max = Number.isFinite(item.max) ? item.max : (spec?.max ?? 100);
      if (min >= max && bad("min must be smaller than max")) continue;
      setting.min = spec ? Math.max(min, spec.min) : min;
      setting.max = spec ? Math.min(max, spec.max) : max;
      setting.step = Number.isFinite(item.step) && item.step > 0 ? item.step : spec ? stepOf(spec) : 1;
      setting.unit = typeof item.unit === "string" && UNIT_RE.test(item.unit) ? item.unit : "";
    } else if (item.type === "toggle") {
      if (!(bind.kind === "cssVar" || spec?.type === "boolean") && bad("toggle can only bind to a boolean parameter or css:--preset-*")) continue;
    } else if (item.type === "select") {
      const okType = bind.kind === "cssVar" || (spec && (spec.type === "enum" || spec.type === "font" || spec.type === "string"));
      if (!okType && bad("select can only bind to enum, font, string parameters or css:--preset-*")) continue;
      let rawOptions = item.options;
      if (rawOptions === undefined && spec?.type === "enum") rawOptions = spec.values;
      if (!Array.isArray(rawOptions) || !rawOptions.length) {
        warn(`${at} (${item.key}): select requires "options"`);
        continue;
      }
      const options = [];
      for (const opt of rawOptions.slice(0, 16)) {
        const value = isObject(opt) ? opt.value : opt;
        const label = isObject(opt) && opt.label ? String(opt.label) : String(value);
        if (typeof value !== "string") continue;
        if (spec && !coerceParam(spec, value).ok) {
          warn(`${at} (${item.key}): option "${value}" is not a valid value for ${item.bind}`);
          continue;
        }
        if (bind.kind === "cssVar" && safeCssValue(value) === null) continue;
        options.push({ value, label: label.slice(0, 40) });
      }
      if (!options.length) {
        warn(`${at} (${item.key}): no valid options found`);
        continue;
      }
      setting.options = options;
    } else if (item.type === "color") {
      const ok = bind.kind === "colorKey" || bind.kind === "cssVar" || spec?.type === "color";
      if (!ok && bad("color can only bind to a color parameter, a colormap key or css:--preset-*")) continue;
    } else if (item.type === "multiselect") {
      if (spec?.type !== "list" && bad("multiselect can only bind to a list parameter")) continue;
      const rawOptions = Array.isArray(item.options) ? item.options : spec.values;
      const options = [];
      for (const opt of rawOptions.slice(0, 16)) {
        const value = isObject(opt) ? opt.value : opt;
        if (typeof value === "string" && spec.values.includes(value))
          options.push({ value, label: String(isObject(opt) && opt.label ? opt.label : value).slice(0, 40) });
      }
      if (!options.length && bad("no valid options")) continue;
      setting.options = options;
      setting.max = spec.max;
    } else if (item.type === "palette") {
      if (spec?.type !== "colors" && bad("palette can only bind to a colors parameter")) continue;
      setting.max = spec.max;
      setting.count = Number.isInteger(item.count) ? Math.min(Math.max(item.count, 1), spec.max) : spec.max;
    } else if (item.type === "text") {
      if (!(spec?.type === "string" || spec?.type === "font") && bad("text can only bind to a string or font parameter")) continue;
      setting.maxLen = spec.type === "font" ? 120 : spec.maxLen;
    }

    let def = item.default;
    if (def === undefined) def = currentBoundValue(bind, sections);
    const coerced = coerceSetting(setting, def);
    setting.default = coerced.ok ? coerced.value : fallbackSettingValue(setting);
    if (item.default !== undefined && !coerced.ok)
      warn(`${at} (${item.key}): invalid "default" — using ${JSON.stringify(setting.default)}`);
    seen.add(item.key);
    out.push(setting);
  }
  return out;
}

/** Coerce a user-selected value to what the setting permits. */
export function coerceSetting(setting, raw) {
  switch (setting.type) {
    case "range": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
      const clamped = Math.min(setting.max, Math.max(setting.min, n));
      const decimals = String(setting.step).split(".")[1]?.length ?? 0;
      return { ok: true, value: Number(clamped.toFixed(decimals)) };
    }
    case "toggle":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
    case "select":
      return setting.options.some((o) => o.value === raw) ? { ok: true, value: raw } : { ok: false };
    case "color":
      return isHexColor(raw) ? { ok: true, value: raw } : { ok: false };
    case "multiselect": {
      if (!Array.isArray(raw)) return { ok: false };
      const allowed = new Set(setting.options.map((o) => o.value));
      return { ok: true, value: [...new Set(raw.filter((v) => allowed.has(v)))].slice(0, setting.max) };
    }
    case "palette":
      return Array.isArray(raw) ? { ok: true, value: raw.filter(isHexColor).slice(0, setting.count) } : { ok: false };
    case "text":
      return typeof raw === "string" && raw.length <= setting.maxLen && !/[\u0000-\u001f]/.test(raw) ? { ok: true, value: raw } : { ok: false };
    default:
      return { ok: false };
  }
}

/* ------------------------------------------------------------------- manifest */

const FIXED_KEYS = ["$schema", "schema", "id", "name", "version", "author", "description", "tags", "preview", "style", "settings", "modules", "hooks", "draw", "fonts"];

function fileField(raw, key, exts, warn) {
  const v = raw[key];
  if (v === undefined) return null;
  if (!isSafeRelPath(v) || !exts.includes(extOf(v))) {
    warn(`"${key}" must be a relative path to a .${exts.join("/.")} file — ignored`);
    return null;
  }
  return v;
}

function normalizeFonts(raw, warn) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return warn('"fonts" must be an array'), [];
  const out = [];
  for (const [i, f] of raw.slice(0, 8).entries()) {
    if (!isObject(f) || typeof f.family !== "string" || !/^[\w -]{1,40}$/u.test(f.family) || !isSafeRelPath(f.file) || !FONT_EXTS.includes(extOf(f.file))) {
      warn(`fonts[${i}]: needs "family" (letters/digits/space) and "file" (relative .woff2/.woff/.ttf/.otf)`);
      continue;
    }
    out.push({
      family: f.family,
      file: f.file,
      weight: typeof f.weight === "string" && /^(?:normal|bold|[1-9]00)$/.test(f.weight) ? f.weight : "normal",
      style: f.style === "italic" ? "italic" : "normal",
    });
  }
  return out;
}

/**
 * Validate & normalize preset.json against an (already built) module registry. Never throws:
 *   { ok, manifest, errors[], warnings[] }
 * - `errors`: preset CANNOT be used (bad id/name, schema too new…)
 * - `warnings`: preset is still usable, invalid values were replaced by defaults
 */
export function normalizeManifest(raw, { modules } = {}) {
  const errors = [];
  const warnings = [];
  const warn = (m) => warnings.push(m);

  if (!isObject(raw)) return { ok: false, manifest: null, errors: ["preset.json must be a JSON object"], warnings };
  if (!modules) return { ok: false, manifest: null, errors: ["Module registry missing (internal error)"], warnings };
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id))
    errors.push('"id" must consist of lowercase letters, numbers, "-" or "_" (2–48 characters, starting with letter/number)');
  if (typeof raw.name !== "string" || !raw.name.trim()) errors.push('Missing "name"');
  const schema = raw.schema ?? SCHEMA_VERSION;
  if (!Number.isInteger(schema) || schema < 1) errors.push('"schema" must be an integer ≥ 1');
  else if (schema > SCHEMA_VERSION)
    errors.push(`Preset uses schema ${schema}; this app only supports up to ${SCHEMA_VERSION}. Please update Zimusix.`);

  const sectionKeys = sectionNames(modules);
  const known = new Set([...FIXED_KEYS, ...sectionKeys]);
  for (const key of Object.keys(raw))
    if (!known.has(key)) warn(`Field "${key}" is not supported — ignored (declare a section "${key}" in modules.json to use it)`);

  if (errors.length) return { ok: false, manifest: null, errors, warnings };

  const sections = {};
  for (const name of sectionKeys) sections[name] = normalizeSection(modules, name, raw[name], warn);

  let preview = raw.preview;
  if (preview !== undefined && (!isSafeRelPath(preview) || !PREVIEW_EXTS.includes(extOf(preview)))) {
    warn(`"preview" must be a relative path to an image (${PREVIEW_EXTS.join(", ")}) — using ${DEFAULT_PREVIEW}`);
    preview = undefined;
  }
  const style = fileField(raw, "style", ["css"], warn);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 24)).slice(0, 8)
    : [];

  const manifest = {
    schema,
    id: raw.id,
    name: raw.name.trim().slice(0, 60),
    version: typeof raw.version === "string" ? raw.version.slice(0, 20) : "0.0.0",
    author: typeof raw.author === "string" ? raw.author.slice(0, 60) : "",
    description: typeof raw.description === "string" ? raw.description.slice(0, 300) : "",
    tags,
    preview: preview ?? DEFAULT_PREVIEW,
    previewDeclared: preview !== undefined,
    style: style ?? null,
    files: {
      modules: fileField(raw, "modules", ["json"], warn),
      hooks: fileField(raw, "hooks", ["json"], warn),
      draw: fileField(raw, "draw", ["json"], warn),
    },
    fonts: normalizeFonts(raw.fonts, warn),
    modules,
    sections,
    settings: normalizeSettings(raw.settings, sections, modules, warn),
  };
  return { ok: true, manifest, errors, warnings };
}

/* ------------------------------------------------------------- resolve config */

/**
 * Merge manifest + user input → final config used by the runtime.
 *
 * Precedence (lowest → highest):
 *   schema default < manifest value < setting default < active rules (hooks.json) < user setting < user override
 *
 * @param {object} manifest
 * @param {Record<string, any>} [userValues]  `{ [settingKey]: value }` the user changed
 * @param {{ overrides?: Record<string, any>, ruleSets?: Array<Record<string, any>> }} [extra]
 */
export function resolveConfig(manifest, userValues = {}, extra = {}) {
  const { modules } = manifest;
  const config = clone(manifest.sections);
  config.cssVars = {};

  const apply = (setting, value) => {
    const bind = resolveBind(setting.bind, modules);
    if (!bind) return;
    if (bind.kind === "param") {
      const final = coerceParam(bind.spec, value);
      if (final.ok) config[bind.section][bind.key] = final.value;
    } else if (bind.kind === "colorKey") config[bind.section][bind.key][bind.color] = value;
    else if (bind.kind === "cssVar") {
      const text =
        setting.type === "range" ? `${value}${setting.unit ?? ""}` : setting.type === "toggle" ? (value ? "1" : "0") : Array.isArray(value) ? value.join(",") : String(value);
      const safe = safeCssValue(text);
      if (safe !== null) config.cssVars[bind.name] = safe;
    }
  };

  const chosen = new Map();
  for (const setting of manifest.settings) {
    const raw = userValues[setting.key];
    const coerced = raw === undefined ? { ok: false } : coerceSetting(setting, raw);
    if (coerced.ok) chosen.set(setting.key, coerced.value);
    apply(setting, coerced.ok ? coerced.value : setting.default);
  }
  for (const set of extra.ruleSets ?? []) for (const [path, value] of Object.entries(set)) setPath(config, modules, path, value);
  // explicit user choices beat rules
  for (const setting of manifest.settings) if (chosen.has(setting.key)) apply(setting, chosen.get(setting.key));
  for (const [path, value] of Object.entries(extra.overrides ?? {})) setPath(config, modules, path, value);
  return withContract(config);
}

/** Fill keys JavaScript reads directly when the preset's schema doesn't define them. */
export function withContract(config) {
  for (const [section, params] of Object.entries(ENGINE_CONTRACT)) {
    config[section] = isObject(config[section]) ? config[section] : {};
    for (const [key, value] of Object.entries(params)) if (config[section][key] === undefined) config[section][key] = cloneDefault(value);
  }
  config.cssVars ??= {};
  return config;
}

/** Config used when no preset can be loaded at all (CSS defaults apply; nothing is emitted). */
export function fallbackConfig() {
  return withContract({ cssVars: {} });
}

/* ----------------------------------------------------------------------- emit */

const hexToRgbTriplet = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

function formatValue(spec, value, rule, ctx) {
  if (value === null || value === undefined) return null;
  switch (spec.type) {
    case "boolean":
      return value ? "1" : "0";
    case "number":
      return `${value}${rule.unit}`;
    case "list":
      return value.length ? value.join(rule.kind === "attr" ? " " : ",") : null;
    case "colors":
      return value.length ? value.join(",") : null;
    case "asset":
      if (!value) return null;
      return rule.kind === "css" ? { url: ctx.fileUrl ? ctx.fileUrl(value) : value } : value;
    case "colormap":
      return null;
    default:
      return value === "" ? null : String(value);
  }
}

/**
 * Turn a resolved config into DOM-level output (pure). The runtime diffs it against what it applied before.
 * @returns {{ attrs: Record<string,string>, css: Record<string,string>, classes: string[] }}
 */
export function emitConfig(config, modules, ctx = {}) {
  const attrs = {};
  const css = {};
  const classes = [];
  const put = (rule, text) => {
    if (text === null || text === undefined) return;
    if (rule.kind === "attr") attrs[rule.name] = typeof text === "object" ? text.url : text;
    else if (rule.kind === "css") {
      if (typeof text === "object") css[rule.name] = `url("${String(text.url).replace(/["\\\n]/g, "")}")`; // internal asset URL
      else {
        const safe = safeCssValue(text);
        if (safe !== null) css[rule.name] = safe;
      }
    } else if (rule.kind === "class" && text !== "0" && text !== "") classes.push(`x-${rule.name}`);
  };
  const scope = { p: config, s: {} };
  for (const rule of modules.emitRules) {
    if (rule.expr) {
      let v;
      try {
        v = rule.expr.run(scope, undefined);
      } catch {
        continue;
      }
      if (typeof v === "boolean") v = v ? "1" : "0";
      else if (typeof v === "number") v = Number.isFinite(v) ? `${v}${rule.unit}` : null;
      else v = v == null || v === "" ? null : String(v);
      put(rule, v);
      continue;
    }
    const [section, key] = rule.path.split(".");
    const spec = modules.sections[section]?.params[key];
    if (spec) put(rule, formatValue(spec, config[section]?.[key], rule, ctx));
  }
  // colormap params: one CSS var per key (+ rgb triplets)
  for (const [section, sec] of Object.entries(modules.sections))
    for (const [key, spec] of Object.entries(sec.params)) {
      if (spec.type !== "colormap") continue;
      for (const [token, hex] of Object.entries(config[section]?.[key] ?? {})) {
        if (!spec.keys[token] || !isHexColor(hex)) continue;
        css[spec.keys[token]] = hex;
        if (spec.rgb[token]) css[spec.rgb[token]] = hexToRgbTriplet(hex);
      }
    }
  for (const [name, value] of Object.entries(config.cssVars ?? {})) css[name] = value;
  return { attrs, css, classes };
}

export { compile, ExprError };
