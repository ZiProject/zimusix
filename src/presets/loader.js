/**
 * Load preset list:
 *   - built-in: public/presets/<id>/ (served statically by Vite/Tauri), listed in public/presets/index.json
 *   - user presets: stored by sidecar in <DATA_DIR>/presets/<id>/ (GET /presets)
 * Both sources share the SAME directory conventions (docs/PRESETS.md).
 */
import * as api from "../api.js";
import { sanitizePresetCss } from "./css.js";
import { normalizeManifest } from "./schema.js";

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
 * @property {object|null} manifest   normalized manifest
 * @property {(rel: string) => string} fileUrl
 * @property {string|null} previewUrl
 */

function fileUrlFor(source, dirName) {
  if (source === "builtin") return (rel) => `${BUILTIN_BASE}/${enc(dirName)}/${rel.split("/").map(enc).join("/")}`;
  return (rel) =>
    `${api.httpBase()}/presets/file?id=${enc(dirName)}&path=${enc(rel)}&token=${enc(api.token())}`;
}

function makeEntry(source, dirName, raw, loadError) {
  const key = source === "builtin" ? dirName : `user:${dirName}`;
  const fileUrl = fileUrlFor(source, dirName);
  if (loadError) {
    return { key, id: dirName, source, valid: false, errors: [loadError], warnings: [], manifest: null, fileUrl, previewUrl: null };
  }
  const result = normalizeManifest(raw);
  if (!result.ok) {
    return {
      key,
      id: typeof raw?.id === "string" ? raw.id : dirName,
      source,
      valid: false,
      errors: result.errors,
      warnings: result.warnings,
      manifest: null,
      fileUrl,
      previewUrl: null,
    };
  }
  // Directory name must match id for file serving
  const warnings = [...result.warnings];
  if (result.manifest.id !== dirName)
    warnings.push(`Directory name "${dirName}" differs from id "${result.manifest.id}"`);
  return {
    key,
    id: result.manifest.id,
    source,
    valid: true,
    errors: [],
    warnings,
    manifest: result.manifest,
    fileUrl,
    previewUrl: fileUrl(result.manifest.preview),
  };
}

export async function loadBuiltinEntries() {
  let ids = [];
  try {
    const res = await fetch(`${BUILTIN_BASE}/index.json`, { cache: "no-cache" });
    if (res.ok) ids = (await res.json()).presets ?? [];
  } catch (error) {
    console.warn("[presets] failed to read built-in index:", error);
  }
  const entries = await Promise.all(
    ids
      .filter((id) => typeof id === "string")
      .map(async (id) => {
        try {
          const res = await fetch(`${BUILTIN_BASE}/${enc(id)}/preset.json`, { cache: "no-cache" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return makeEntry("builtin", id, await res.json());
        } catch (error) {
          return makeEntry("builtin", id, null, `Could not read preset.json: ${error.message}`);
        }
      }),
  );
  return entries;
}

export async function loadUserEntries() {
  try {
    const res = await api.get("/presets");
    return {
      dir: res.dir ?? "",
      entries: (res.presets ?? []).map((item) =>
        item.error ? makeEntry("user", item.id, null, item.error) : makeEntry("user", item.id, item.manifest),
      ),
    };
  } catch (error) {
    console.warn("[presets] failed to read user presets:", error);
    return { dir: "", entries: [] };
  }
}

/** Read + sanitize preset style.css. Returns CSS string (empty if missing/error). */
export async function loadPresetCss(entry) {
  const style = entry.manifest?.style;
  if (!style) return { css: "", notes: [] };
  try {
    const res = await fetch(entry.fileUrl(style));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const baseDir = style.includes("/") ? style.slice(0, style.lastIndexOf("/")) : "";
    return sanitizePresetCss(await res.text(), entry.fileUrl, baseDir);
  } catch (error) {
    console.warn(`[presets] ${entry.key}: failed to load ${style}:`, error);
    return { css: "", notes: [`Failed to load ${style}`] };
  }
}
