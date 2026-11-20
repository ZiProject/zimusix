/**
 * Load preset list:
 *   - built-in: public/presets/<id>/ (served statically by Vite/Tauri), listed in public/presets/index.json
 *   - user presets: stored by sidecar in <DATA_DIR>/presets/<id>/ (GET /presets)
 * Both sources share the SAME directory conventions (docs/PRESETS.md). Everything a preset needs — schema
 * (modules.json), values (preset.json), logic (hooks.json), drawing (draw.json), CSS, assets — is read from
 * its own folder; the only file outside is the optional base pack public/schema/core.json (`extends: "core"`).
 */
import * as api from "../api.js";
import { buildPreset } from "./build.js";
import { sanitizePresetCss } from "./css.js";

const BUILTIN_BASE = "/presets";
const enc = encodeURIComponent;

/**
 * @typedef {Object} PresetEntry
 * @property {string} key        "classic" (built-in) or "user:<id>"
 * @property {string} id         id in manifest
 * @property {"builtin"|"user"} source
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {object|null} manifest   normalized manifest (includes `.modules`)
 * @property {object|null} logic      compiled hooks.json
 * @property {{visualizers:object, backgrounds:object}|null} draw  compiled draw.json
 * @property {(rel: string) => string} fileUrl
 * @property {string|null} previewUrl
 */

let corePack = null;
let coreTried = false;

/** Base schema pack (public/schema/core.json). Cached; `null` when unavailable. */
export async function loadCore() {
  if (corePack || coreTried) return corePack;
  coreTried = true;
  try {
    const res = await fetch("/schema/core.json", { cache: "no-cache" });
    if (res.ok) corePack = await res.json();
  } catch (error) {
    console.warn("[presets] core schema pack unavailable:", error);
  }
  return corePack;
}

function fileUrlFor(source, dirName) {
  if (source === "builtin") return (rel) => `${BUILTIN_BASE}/${enc(dirName)}/${rel.split("/").map(enc).join("/")}`;
  return (rel) => `${api.httpBase()}/presets/file?id=${enc(dirName)}&path=${enc(rel)}&token=${enc(api.token())}`;
}

async function fetchJson(fileUrl, rel) {
  const res = await fetch(fileUrl(rel), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.json();
}

async function makeEntry(source, dirName, raw, loadError) {
  const key = source === "builtin" ? dirName : `user:${dirName}`;
  const fileUrl = fileUrlFor(source, dirName);
  const base = { key, id: dirName, source, fileUrl, previewUrl: null, manifest: null, logic: null, draw: null };
  if (loadError) return { ...base, valid: false, errors: [loadError], warnings: [] };

  // The manifest names its companion files; read them from the same folder.
  const files = { manifest: raw };
  const problems = [];
  for (const [field, slot] of [["modules", "modules"], ["hooks", "hooks"], ["draw", "draw"]]) {
    const rel = raw?.[field];
    if (typeof rel !== "string") continue;
    try {
      files[slot] = await fetchJson(fileUrl, rel);
    } catch (error) {
      problems.push(`Could not read ${rel}: ${error.message}`);
    }
  }
  const core = await loadCore();
  const result = buildPreset(files, { core });
  if (!result.ok) {
    return { ...base, id: typeof raw?.id === "string" ? raw.id : dirName, valid: false, errors: [...problems, ...result.errors], warnings: result.warnings };
  }
  const warnings = [...problems, ...result.warnings];
  const m = result.manifest;
  if (m.id !== dirName) warnings.push(`Directory name "${dirName}" differs from id "${m.id}"`);
  return { ...base, id: m.id, valid: true, errors: [], warnings, manifest: m, logic: result.logic, draw: result.draw, previewUrl: fileUrl(m.preview) };
}

export async function loadBuiltinEntries() {
  let ids = [];
  try {
    const res = await fetch(`${BUILTIN_BASE}/index.json`, { cache: "no-cache" });
    if (res.ok) ids = (await res.json()).presets ?? [];
  } catch (error) {
    console.warn("[presets] failed to read built-in index:", error);
  }
  return Promise.all(
    ids
      .filter((id) => typeof id === "string")
      .map(async (id) => {
        try {
          const res = await fetch(`${BUILTIN_BASE}/${enc(id)}/preset.json`, { cache: "no-cache" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await makeEntry("builtin", id, await res.json());
        } catch (error) {
          return makeEntry("builtin", id, null, `Could not read preset.json: ${error.message}`);
        }
      }),
  );
}

export async function loadUserEntries() {
  try {
    const res = await api.get("/presets");
    const entries = await Promise.all(
      (res.presets ?? []).map((item) => (item.error ? makeEntry("user", item.id, null, item.error) : makeEntry("user", item.id, item.manifest))),
    );
    return { dir: res.dir ?? "", entries };
  } catch (error) {
    console.warn("[presets] failed to read user presets:", error);
    return { dir: "", entries: [] };
  }
}

const FONT_FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

/** `@font-face` rules for `manifest.fonts` (family/file/weight/style were validated by the schema). */
export function fontFaceCss(entry) {
  return (entry.manifest?.fonts ?? [])
    .map((f) => {
      const ext = f.file.split(".").pop().toLowerCase();
      return `@font-face{font-family:"${f.family}";src:url("${entry.fileUrl(f.file)}") format("${FONT_FORMAT[ext]}");font-weight:${f.weight};font-style:${f.style};font-display:swap}`;
    })
    .join("\n");
}

/** Read + sanitize preset style.css (plus generated @font-face rules). Returns CSS string (empty if missing/error). */
export async function loadPresetCss(entry) {
  const fonts = fontFaceCss(entry);
  const style = entry.manifest?.style;
  if (!style) return { css: fonts, notes: [] };
  try {
    const res = await fetch(entry.fileUrl(style));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const baseDir = style.includes("/") ? style.slice(0, style.lastIndexOf("/")) : "";
    const out = sanitizePresetCss(await res.text(), entry.fileUrl, baseDir);
    return { css: `${fonts}\n${out.css}`.trim(), notes: out.notes };
  } catch (error) {
    console.warn(`[presets] ${entry.key}: failed to load ${style}:`, error);
    return { css: fonts, notes: [`Failed to load ${style}`] };
  }
}
