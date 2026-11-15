/**
 * Nạp danh sách preset:
 *   - built-in: public/presets/<id>/ (phục vụ tĩnh bởi Vite/Tauri), liệt kê trong public/presets/index.json
 *   - của người dùng: do sidecar giữ trong <DATA_DIR>/presets/<id>/ (GET /presets)
 * Hai nguồn dùng CÙNG quy ước thư mục (docs/PRESETS.md).
 */
import * as api from "../api.js";
import { sanitizePresetCss } from "./css.js";
import { normalizeManifest } from "./schema.js";

const BUILTIN_BASE = "/presets";
const enc = encodeURIComponent;

/**
 * @typedef {Object} PresetEntry
 * @property {string} key        "classic" (built-in) hoặc "user:<id>"
 * @property {string} id         id trong manifest
 * @property {"builtin"|"user"} source
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {object|null} manifest   manifest đã chuẩn hoá
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
  // thư mục phải trùng id để file phục vụ đúng chỗ
  const warnings = [...result.warnings];
  if (result.manifest.id !== dirName)
    warnings.push(`Tên thư mục "${dirName}" khác id "${result.manifest.id}"`);
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
    console.warn("[presets] không đọc được index built-in:", error);
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
          return makeEntry("builtin", id, null, `Không đọc được preset.json: ${error.message}`);
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
    console.warn("[presets] không đọc được preset của người dùng:", error);
    return { dir: "", entries: [] };
  }
}

/** Đọc + làm sạch style.css của preset. Trả chuỗi CSS (rỗng nếu không có/lỗi). */
export async function loadPresetCss(entry) {
  const style = entry.manifest?.style;
  if (!style) return { css: "", notes: [] };
  try {
    const res = await fetch(entry.fileUrl(style));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const baseDir = style.includes("/") ? style.slice(0, style.lastIndexOf("/")) : "";
    return sanitizePresetCss(await res.text(), entry.fileUrl, baseDir);
  } catch (error) {
    console.warn(`[presets] ${entry.key}: không nạp được ${style}:`, error);
    return { css: "", notes: [`Không nạp được ${style}`] };
  }
}
