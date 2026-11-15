/**
 * Làm sạch CSS của preset trước khi chèn vào trang (thuần, không đụng DOM).
 *
 *  - bỏ `@import` (không cho preset kéo CSS từ nơi khác)
 *  - `url(...)` chỉ nhận: đường dẫn tương đối trong thư mục preset (được đổi sang URL
 *    thật qua `resolve`) hoặc `data:`. Mọi URL ngoài (http, https, //…) bị vô hiệu →
 *    preset chạy offline và không "gọi về nhà".
 *  - bỏ `expression(...)` / `behavior:` / `-moz-binding` (di sản IE/Gecko)
 */
import { isSafeRelPath } from "./schema.js";

const BLANK = 'url("about:blank")';

/**
 * @param {string} text  nội dung style.css
 * @param {(rel: string) => string} resolve  đổi đường dẫn tương đối → URL phục vụ file
 * @param {string} [baseDir]  thư mục chứa file css, tương đối so với thư mục preset ("" = gốc)
 * @returns {{ css: string, notes: string[] }}
 */
export function sanitizePresetCss(text, resolve, baseDir = "") {
  const notes = [];
  let css = String(text ?? "").replace(/^\uFEFF/, "");

  // bỏ comment trước để regex không bị đánh lừa bởi nội dung trong comment
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");

  css = css.replace(/@import\b[^;]*;?/gi, () => {
    notes.push("Đã bỏ @import (không được hỗ trợ)");
    return "";
  });

  css = css.replace(/expression\s*\([^)]*\)/gi, () => {
    notes.push("Đã bỏ expression()");
    return "none";
  });
  css = css.replace(/(?:-moz-binding|behavior)\s*:[^;}]*/gi, () => {
    notes.push("Đã bỏ thuộc tính binding/behavior");
    return "";
  });

  css = css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (_m, dq, sq, bare) => {
    const raw = (dq ?? sq ?? bare ?? "").trim();
    if (/^data:/i.test(raw)) return `url("${raw.replace(/"/g, "%22")}")`;
    if (/^#/.test(raw)) return `url("${raw}")`; // tham chiếu fragment (filter SVG nội tuyến)
    const joined = baseDir ? `${baseDir}/${raw}` : raw;
    const cleaned = joined.replace(/^\.\//, "").replace(/\/\.\//g, "/");
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || !isSafeRelPath(cleaned)) {
      notes.push(`Đã chặn url(${raw.slice(0, 60)})`);
      return BLANK;
    }
    return `url("${resolve(cleaned)}")`;
  });

  return { css: css.trim(), notes };
}
