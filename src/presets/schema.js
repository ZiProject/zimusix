/**
 * Preset Schema + registry of "modules" presets can select.
 *
 * This file is PURE (no DOM/localStorage) for shared use by:
 *   - in-app runtime (src/presets/runtime.js)
 *   - preset validator tool (scripts/presets.mjs)
 *
 * Presets are strictly DECLARATIVE: "which module to use, with what parameters".
 * Execution code lives in the app (CSS + JS of each module), so presets (even user-added)
 * cannot execute arbitrary code.
 */

export const SCHEMA_VERSION = 1;
export const MANIFEST_FILE = "preset.json";
export const DEFAULT_PREVIEW = "preview.png";
export const PREVIEW_EXTS = ["png", "jpg", "jpeg", "webp", "svg", "avif"];
export const ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
export const SETTING_KEY_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
export const CSS_VAR_RE = /^--preset-[a-z][a-z0-9-]{0,40}$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_RE = /^[\w\s,'"\-.]{1,120}$/u;

/* ---------------------------------------------------------------- param types */

const enumOf = (values, def, doc) => ({ type: "enum", values, default: def, doc });
const num = (def, min, max, doc, step = 1) => ({
  type: "number",
  default: def,
  min,
  max,
  step,
  doc,
});
const bool = (def, doc) => ({ type: "boolean", default: def, doc });
const color = (def, doc) => ({ type: "color", default: def, doc });
const list = (values, def, max, doc) => ({
  type: "list",
  values,
  default: def,
  max,
  doc,
});
const colors = (max, doc) => ({ type: "colors", default: [], max, doc });

/**
 * Each section is a preset "module". `default` values of all parameters
 * match the original Zimusix look (the `classic` preset).
 */
export const MODULES = {
  layout: {
    doc: "Overall layout of the web interface (sidebar, player bar, content width).",
    params: {
      shell: enumOf(
        ["classic", "stage", "focus", "split"],
        "classic",
        "classic: list | stage: center stage | focus: lyrics focus | split: split stage + content",
      ),
      sidebar: enumOf(
        ["left", "right", "rail", "hidden"],
        "left",
        "Sidebar position: left, right, rail (icons only), or hidden",
      ),
      player: enumOf(
        ["bottom", "floating", "top", "minimal"],
        "bottom",
        "Player bar: bottom, floating, top, or minimal",
      ),
      density: enumOf(["comfortable", "compact"], "comfortable", "Spacing density"),
      defaultView: enumOf(
        [
          "keep",
          "search",
          "library",
          "queue",
          "related",
          "lyrics",
          "nowplaying",
          "presets",
          "discord",
        ],
        "keep",
        'Default tab when preset is selected ("keep" = keep current tab)',
      ),
      contentWidth: num(880, 560, 1400, "Maximum content width (px)"),
      radius: num(12, 0, 28, "Panel corner radius (px)"),
    },
  },

  controls: {
    doc: "Appearance of buttons, toolbars, navigation, and panels.",
    params: {
      buttons: enumOf(
        ["soft", "pill", "square", "ghost", "outline"],
        "soft",
        "Button style: soft (default) | pill | square | ghost | outline",
      ),
      playButton: enumOf(["circle", "square", "accent"], "circle", "Play/Pause button: circle | square | accent"),
      nav: enumOf(["soft", "pill", "bar"], "soft", "Sidebar navigation item: soft | pill | bar"),
      toolbar: enumOf(
        ["docked", "floating", "transparent", "autohide"],
        "docked",
        "Top toolbar: docked | floating | transparent | autohide",
      ),
      panels: enumOf(["solid", "glass", "flat"], "solid", "Panel background: solid | glass | flat (transparent)"),
      iconSize: num(18, 14, 26, "Button and navigation icon size (px)"),
    },
  },

  artwork: {
    doc: "Artwork presentation (player bar + Now Playing stage).",
    params: {
      style: enumOf(
        ["square", "rounded", "circle", "vinyl", "polaroid", "none"],
        "rounded",
        "Artwork frame style",
      ),
      size: num(56, 32, 96, "Artwork size in player bar (px)"),
      stageSize: num(320, 160, 560, "Artwork size in Now Playing stage (px)"),
      react: bool(true, "Artwork bounces with bass"),
      reactAmount: num(8, 0, 20, "Bounce amount (%)"),
      glow: bool(true, "Glow ring pulses with bass"),
      spin: bool(false, "Spin while playing (best with circle/vinyl)"),
      spinSpeed: num(18, 4, 60, "Seconds per full revolution"),
      shadow: bool(false, "Fixed shadow beneath artwork"),
    },
  },

  info: {
    doc: "Track info display style.",
    params: {
      style: enumOf(
        ["inline", "stacked", "centered", "huge"],
        "inline",
        "inline: compact | stacked: large title | centered: center aligned | huge: extra large text",
      ),
      show: list(["title", "artist", "source", "duration"], ["title", "artist", "source"], 4),
      marquee: bool(true, "Automatically scroll long titles"),
      titleScale: num(1, 0.7, 2, "Title font size scale factor", 0.05),
    },
  },

  background: {
    doc: "Background visual effect.",
    params: {
      effect: enumOf(
        ["media", "aurora", "gradient", "solid", "particles"],
        "media",
        "media: artwork/video | aurora | gradient | solid | particles",
      ),
      media: enumOf(
        ["auto", "on", "off"],
        "auto",
        "Overlay cover art/video (auto: only when effect = media)",
      ),
      colors: colors(4, "Up to 4 hex colors; leave empty to use accent color"),
      speed: num(1, 0.2, 3, "Effect animation speed", 0.1),
      intensity: num(0.6, 0, 1, "Effect intensity/opacity", 0.05),
      angle: num(135, 0, 360, "Gradient angle (degrees)"),
      count: num(70, 10, 200, "Particle count"),
      react: bool(true, "Background reacts to audio bass/energy"),
    },
  },

  visualizer: {
    doc: "Audio visualizer.",
    params: {
      type: enumOf(
        ["bars", "mirror", "wave", "circle", "dots", "none"],
        "bars",
        "Visualizer draw style",
      ),
      placement: list(["player", "stage", "background"], ["player"], 3, "Where to render (can specify multiple placements)"),
      bars: num(32, 8, 96, "Bar / point count"),
      colorMode: enumOf(["gradient", "accent", "solid"], "gradient", "Coloring mode"),
      color: color("#a78bfa", "Color when colorMode = solid"),
      thickness: num(2, 1, 10, "Bar thickness / spacing (px)"),
      smoothing: num(0, 0, 0.95, "Smoothing factor between frames", 0.05),
      opacity: num(1, 0.1, 1, "Visualizer opacity", 0.05),
      height: num(120, 60, 420, "Draw height in Now Playing stage (px)"),
    },
  },

  lyrics: {
    doc: "Lyrics display style.",
    params: {
      mode: enumOf(
        ["list", "karaoke", "focus", "compact"],
        "list",
        "list: full lyrics | karaoke: active line large, fading | focus: nearby lines only | compact: compact",
      ),
      placement: enumOf(
        ["view", "stage"],
        "view",
        "view: Lyrics tab | stage: embedded in Now Playing stage",
      ),
      align: enumOf(["left", "center", "right"], "left", "Text alignment"),
      showTime: bool(true, "Show timestamp per line"),
      size: num(22, 14, 48, "Regular line font size (px)"),
      activeScale: num(1.27, 1, 1.8, "Active line scale factor", 0.01),
      glow: bool(true, "Active line glows with audio energy"),
    },
  },

  theme: {
    doc: "Colors & fonts. `colors` accepts hex color codes.",
    params: {
      colorScheme: enumOf(["dark", "light"], "dark", "Base controls color scheme (scrollbar, inputs)"),
      fontFamily: { type: "font", default: "", doc: "CSS font family list (safe, no special characters)" },
    },
    colorKeys: ["accent", "accent2", "bg", "panel", "panel2", "line", "text", "muted", "ok", "danger"],
  },
};

export const SECTIONS = Object.keys(MODULES);

/** Color token names → CSS variables. */
export const COLOR_VARS = {
  accent: "--accent",
  accent2: "--accent-2",
  bg: "--bg",
  panel: "--panel",
  panel2: "--panel-2",
  line: "--line",
  text: "--text",
  muted: "--muted",
  ok: "--ok",
  danger: "--danger",
};

/* ------------------------------------------------------------------- helpers */

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

export const isHexColor = (v) => typeof v === "string" && HEX_RE.test(v);

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

const extOf = (p) => (p.includes(".") ? p.split(".").pop().toLowerCase() : "");

/** Coerce value to parameter type. Returns `{ok, value}`. */
export function coerceParam(spec, raw) {
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
      let v = Math.min(spec.max, Math.max(spec.min, n));
      if (spec.step && spec.step < 1) {
        const decimals = String(spec.step).split(".")[1]?.length ?? 2;
        v = Number(v.toFixed(decimals));
      } else v = Math.round(v);
      return { ok: true, value: v };
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
      const out = [...new Set(arr.filter((x) => spec.values.includes(x)))].slice(0, spec.max);
      return { ok: true, value: out };
    }
    case "colors": {
      if (!Array.isArray(raw)) return { ok: false };
      return { ok: true, value: raw.filter(isHexColor).slice(0, spec.max) };
    }
    case "font":
      return typeof raw === "string" && (raw === "" || FONT_RE.test(raw))
        ? { ok: true, value: raw }
        : { ok: false };
    default:
      return { ok: false };
  }
}

const cloneDefault = (v) => (Array.isArray(v) ? [...v] : v);

/** Complete default values of a section. */
export function defaultSection(name) {
  const out = {};
  for (const [key, spec] of Object.entries(MODULES[name].params))
    out[key] = cloneDefault(spec.default);
  if (name === "theme") out.colors = {};
  return out;
}

function normalizeSection(name, raw, warn) {
  const out = defaultSection(name);
  if (raw === undefined) return out;
  if (!isObject(raw)) {
    warn(`"${name}" must be an object — using defaults`);
    return out;
  }
  const specs = MODULES[name].params;
  for (const [key, value] of Object.entries(raw)) {
    if (name === "theme" && key === "colors") {
      if (!isObject(value)) {
        warn('"theme.colors" must be an object');
        continue;
      }
      for (const [ck, cv] of Object.entries(value)) {
        if (!MODULES.theme.colorKeys.includes(ck))
          warn(`theme.colors.${ck}: unknown color name (valid: ${MODULES.theme.colorKeys.join(", ")})`);
        else if (!isHexColor(cv)) warn(`theme.colors.${ck}: requires hex code (#rgb, #rrggbb, #rrggbbaa)`);
        else out.colors[ck] = cv;
      }
      continue;
    }
    const spec = specs[key];
    if (!spec) {
      warn(`${name}.${key}: unknown parameter — ignored`);
      continue;
    }
    const res = coerceParam(spec, value);
    if (res.ok) out[key] = res.value;
    else warn(`${name}.${key}: invalid value ${JSON.stringify(value)} — using default`);
  }
  return out;
}

/* ------------------------------------------------------------ settings (UI customizer) */

const SETTING_TYPES = ["range", "toggle", "select", "color"];

/** Resolve parameter pointed to by `bind`. Returns `{kind:'param'|'themeColor'|'cssVar', ...}` or null. */
export function resolveBind(bind) {
  if (typeof bind !== "string") return null;
  if (bind.startsWith("css:")) {
    const name = bind.slice(4);
    return CSS_VAR_RE.test(name) ? { kind: "cssVar", name } : null;
  }
  const parts = bind.split(".");
  if (parts[0] === "theme" && parts[1] === "colors" && parts.length === 3) {
    return MODULES.theme.colorKeys.includes(parts[2])
      ? { kind: "themeColor", color: parts[2] }
      : null;
  }
  if (parts.length !== 2 || parts[0] === "theme") {
    if (parts.length === 2 && parts[0] === "theme" && MODULES.theme.params[parts[1]])
      return { kind: "param", section: "theme", key: parts[1], spec: MODULES.theme.params[parts[1]] };
    return null;
  }
  const spec = MODULES[parts[0]]?.params[parts[1]];
  return spec ? { kind: "param", section: parts[0], key: parts[1], spec } : null;
}

function normalizeSettings(raw, sections, warn) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warn('"settings" must be an array');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const [i, item] of raw.slice(0, 24).entries()) {
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
    const bind = resolveBind(item.bind);
    if (!bind) {
      warn(
        `${at} (${item.key}): invalid "bind" ("section.param", "theme.colors.<name>" or "css:--preset-<name>")`,
      );
      continue;
    }
    const setting = {
      key: item.key,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 60) : item.key,
      description: typeof item.description === "string" ? item.description.slice(0, 160) : "",
      type: item.type,
      bind: item.bind,
    };

    if (item.type === "range") {
      const spec = bind.kind === "param" && bind.spec.type === "number" ? bind.spec : null;
      if (bind.kind === "param" && !spec) {
        warn(`${at} (${item.key}): range can only bind to numeric parameter`);
        continue;
      }
      const min = Number.isFinite(item.min) ? item.min : (spec?.min ?? 0);
      const max = Number.isFinite(item.max) ? item.max : (spec?.max ?? 100);
      if (min >= max) {
        warn(`${at} (${item.key}): min must be smaller than max`);
        continue;
      }
      // allowed range cannot be wider than spec range
      setting.min = spec ? Math.max(min, spec.min) : min;
      setting.max = spec ? Math.min(max, spec.max) : max;
      setting.step = Number.isFinite(item.step) && item.step > 0 ? item.step : (spec?.step ?? 1);
      setting.unit = typeof item.unit === "string" ? item.unit.slice(0, 6) : "";
    } else if (item.type === "toggle") {
      if (bind.kind !== "param" || bind.spec.type !== "boolean") {
        warn(`${at} (${item.key}): toggle can only bind to boolean parameter`);
        continue;
      }
    } else if (item.type === "select") {
      if (!Array.isArray(item.options) || !item.options.length) {
        warn(`${at} (${item.key}): select requires "options"`);
        continue;
      }
      const spec = bind.kind === "param" && bind.spec.type === "enum" ? bind.spec : null;
      if (bind.kind === "param" && !spec) {
        warn(`${at} (${item.key}): select can only bind to enum parameter`);
        continue;
      }
      const options = [];
      for (const opt of item.options.slice(0, 12)) {
        const value = isObject(opt) ? opt.value : opt;
        const label = isObject(opt) && opt.label ? String(opt.label) : String(value);
        if (typeof value !== "string") continue;
        if (spec && !spec.values.includes(value)) {
          warn(`${at} (${item.key}): option "${value}" is not a valid value for ${item.bind}`);
          continue;
        }
        options.push({ value, label: label.slice(0, 40) });
      }
      if (!options.length) {
        warn(`${at} (${item.key}): no valid options found`);
        continue;
      }
      setting.options = options;
    } else if (item.type === "color") {
      const ok =
        bind.kind === "themeColor" ||
        bind.kind === "cssVar" ||
        (bind.kind === "param" && bind.spec.type === "color");
      if (!ok) {
        warn(`${at} (${item.key}): color can only bind to color (theme.colors.*, color param, css:--preset-*)`);
        continue;
      }
    }

    // default: get from manifest if provided, else from currently bound parameter value
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

function currentBoundValue(bind, sections) {
  if (bind.kind === "param") return sections[bind.section]?.[bind.key];
  if (bind.kind === "themeColor") return sections.theme.colors[bind.color];
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
    default:
      return "#7c5cff";
  }
}

/** Coerce user-selected value to range/option permitted by setting. */
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
    default:
      return { ok: false };
  }
}

/* ------------------------------------------------------------------ manifest */

/**
 * Validate & normalize manifest. Does not throw errors:
 *   { ok, manifest, errors[], warnings[] }
 * - `errors`: preset CANNOT be used (missing id/name, schema too new…)
 * - `warnings`: preset is still usable, invalid values replaced by defaults
 */
export function normalizeManifest(raw) {
  const errors = [];
  const warnings = [];
  const warn = (m) => warnings.push(m);

  if (!isObject(raw)) {
    return { ok: false, manifest: null, errors: ["preset.json must be a JSON object"], warnings };
  }
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id))
    errors.push('"id" must consist of lowercase letters, numbers, "-" or "_" (2–48 characters, starting with letter/number)');
  if (typeof raw.name !== "string" || !raw.name.trim()) errors.push('Missing "name"');
  const schema = raw.schema ?? SCHEMA_VERSION;
  if (!Number.isInteger(schema) || schema < 1) errors.push('"schema" must be an integer ≥ 1');
  else if (schema > SCHEMA_VERSION)
    errors.push(`Preset uses schema ${schema}; this app only supports up to ${SCHEMA_VERSION}. Please update Zimusix.`);

  const known = new Set([
    "$schema",
    "schema",
    "id",
    "name",
    "version",
    "author",
    "description",
    "tags",
    "preview",
    "style",
    "settings",
    ...SECTIONS,
  ]);
  for (const key of Object.keys(raw)) if (!known.has(key)) warn(`Field "${key}" is not supported — ignored`);

  if (errors.length) return { ok: false, manifest: null, errors, warnings };

  const sections = {};
  for (const name of SECTIONS) sections[name] = normalizeSection(name, raw[name], warn);

  let preview = raw.preview;
  if (preview !== undefined && (!isSafeRelPath(preview) || !PREVIEW_EXTS.includes(extOf(preview)))) {
    warn(`"preview" must be a relative path to an image (${PREVIEW_EXTS.join(", ")}) — using ${DEFAULT_PREVIEW}`);
    preview = undefined;
  }
  let style = raw.style;
  if (style !== undefined && (!isSafeRelPath(style) || extOf(style) !== "css")) {
    warn('"style" must be a relative path to a .css file — ignored');
    style = undefined;
  }
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
    ...sections,
    settings: normalizeSettings(raw.settings, sections, warn),
  };
  return { ok: true, manifest, errors, warnings };
}

/* ------------------------------------------------------------- resolve config */

/**
 * Merge manifest + user customized values → final config used by runtime.
 * `userValues` = { [settingKey]: value }.
 */
export function resolveConfig(manifest, userValues = {}) {
  const config = {};
  for (const name of SECTIONS) {
    config[name] = structuredCloneSafe(manifest[name]);
  }
  config.cssVars = {};
  for (const setting of manifest.settings) {
    const raw = userValues[setting.key];
    const coerced = coerceSetting(setting, raw === undefined ? setting.default : raw);
    const value = coerced.ok ? coerced.value : setting.default;
    const bind = resolveBind(setting.bind);
    if (!bind) continue;
    if (bind.kind === "param") {
      const final = coerceParam(bind.spec, value);
      if (final.ok) config[bind.section][bind.key] = final.value;
    } else if (bind.kind === "themeColor") {
      config.theme.colors[bind.color] = value;
    } else if (bind.kind === "cssVar") {
      config.cssVars[bind.name] = setting.type === "range" ? `${value}${setting.unit ?? ""}` : String(value);
    }
  }
  return config;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Default manifest (equivalent to `classic` preset) — fallback when no preset can be loaded. */
export function defaultManifest() {
  return normalizeManifest({
    schema: SCHEMA_VERSION,
    id: "classic",
    name: "Classic",
    version: "1.0.0",
    author: "Zimusix",
    description: "Default Zimusix interface.",
  }).manifest;
}
