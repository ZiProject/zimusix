/**
 * Sanitize preset CSS before injecting into page (pure, no DOM).
 *
 *  - Strips `@import` (prevents preset from fetching external CSS)
 *  - `url(...)` only accepts: relative paths inside preset folder (resolved
 *    via `resolve`) or `data:`. Any external URLs (http, https, //…) are disabled →
 *    presets run offline and never call home.
 *  - Strips `expression(...)` / `behavior:` / `-moz-binding` (legacy IE/Gecko vectors)
 */
import { isSafeRelPath } from "./schema.js";

const BLANK = 'url("about:blank")';

/**
 * @param {string} text  style.css content
 * @param {(rel: string) => string} resolve  resolve relative path → served file URL
 * @param {string} [baseDir]  directory of css file, relative to preset root ("" = root)
 * @returns {{ css: string, notes: string[] }}
 */
export function sanitizePresetCss(text, resolve, baseDir = "") {
  const notes = [];
  let css = String(text ?? "").replace(/^\uFEFF/, "");

  // Strip comments first so regexes aren't tricked by content inside comments
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  css = css.replace(/@import\b[^;]*;?/gi, () => {
    notes.push("Removed @import (unsupported)");
    return "";
  });

  css = css.replace(/expression\s*\([^)]*\)/gi, () => {
    notes.push("Removed expression()");
    return "none";
  });
  css = css.replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, () => {
    notes.push("Removed binding/behavior property");
    return "";
  });

  css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (_m, dq, sq, bare) => {
    const raw = (dq ?? sq ?? bare ?? "").trim();
    if (/^data:/i.test(raw)) return `url("${raw.replace(/"/g, "%22")}")`;
    if (/^#/.test(raw)) return `url("${raw}")`; // fragment reference (inline SVG filters)
    const joined = baseDir ? `${baseDir}/${raw}` : raw;
    const cleaned = joined.replace(/^\.\//, "").replace(/\/\.\//g, "/");
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || !isSafeRelPath(cleaned)) {
      notes.push(`Blocked url(${raw.slice(0, 60)})`);
      return BLANK;
    }
    return `url("${resolve(cleaned)}")`;
  });

  return { css: css.trim(), notes };
}
